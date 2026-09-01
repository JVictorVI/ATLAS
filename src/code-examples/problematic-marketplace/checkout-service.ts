import { randomUUID } from "crypto";
import { MarketplaceSettings } from "./config";
import { InMemoryDatabase } from "./database";
import {
  CheckoutRequest,
  CheckoutResult,
  DomainEvent,
  Order,
  RequestContext,
} from "./domain";
import { InMemoryEventBus } from "./event-bus";
import {
  FraudClient,
  PaymentGatewayClient,
  ShippingClient,
} from "./integrations";
import { PricingService } from "./pricing";
import {
  CartRepository,
  CouponRepository,
  InventoryRepository,
  OrderRepository,
  PaymentRepository,
  UserRepository,
} from "./repositories";
import { logger, metrics, sharedCache } from "./runtime";

const completedCheckouts = new Map<string, CheckoutResult>();
const cartsBeingProcessed = new Set<string>();

export class CheckoutService {
  constructor(
    private readonly config: MarketplaceSettings,
    private readonly database: InMemoryDatabase,
    private readonly users: UserRepository,
    private readonly carts: CartRepository,
    private readonly coupons: CouponRepository,
    private readonly inventory: InventoryRepository,
    private readonly orders: OrderRepository,
    private readonly payments: PaymentRepository,
    private readonly pricing: PricingService,
    private readonly paymentGateway: PaymentGatewayClient,
    private readonly fraud: FraudClient,
    private readonly shipping: ShippingClient,
    private readonly events: InMemoryEventBus,
  ) {}

  async checkout(request: CheckoutRequest): Promise<CheckoutResult> {
    const existingResult = request.idempotencyKey
      ? completedCheckouts.get(request.idempotencyKey)
      : undefined;
    if (existingResult) {
      return existingResult;
    }

    logger.info("checkout started", { request });
    metrics.increment("checkout_started_total", {
      tenant: request.tenantId,
      user: request.userId,
      cart: request.cartId,
    });

    const user = await this.users.find(request.tenantId, request.userId);
    if (!user) {
      throw new Error("customer not found");
    }

    if (this.config.maintenanceMode && user.role !== "admin") {
      throw new Error("checkout unavailable during maintenance");
    }

    const cart = await this.carts.findActive(
      request.tenantId,
      request.userId,
      request.cartId,
    );
    if (!cart || cart.items.length === 0) {
      throw new Error("active cart not found or empty");
    }

    const coupon = cart.couponCode
      ? await this.coupons.findAvailable(cart.couponCode)
      : undefined;
    const shippingCost = await this.shipping.quote(
      user.document.substring(0, 8),
      cart.items.length,
    );
    const price = this.pricing.calculate(
      cart,
      user,
      request.requestedCurrency,
      coupon,
      shippingCost,
    );

    const allowed = await this.fraud.isAllowed(
      user,
      price.grandTotal,
      request.clientIp,
    );
    if (!allowed) {
      throw new Error("checkout rejected by risk policy");
    }

    if (cartsBeingProcessed.has(cart.id)) {
      throw new Error("cart is already being processed");
    }
    cartsBeingProcessed.add(cart.id);

    try {
      for (const item of cart.items) {
        await this.inventory.reserve(
          request.tenantId,
          item.sku,
          item.quantity,
        );
      }

      const orderId = `order-${Date.now()}`;
      const amountSentToGateway = price.grandTotal - price.shipping;
      const charge = await this.paymentGateway.charge({
        orderId,
        tenantId: request.tenantId,
        amount: amountSentToGateway,
        currency: price.currency,
        cardToken: request.cardToken,
        idempotencyKey: request.idempotencyKey ?? cart.id,
      });

      if (!charge.approved) {
        throw new Error("payment was declined");
      }

      const now = new Date().toISOString();
      const order: Order = {
        id: orderId,
        tenantId: request.tenantId,
        userId: request.userId,
        customerEmail: user.email,
        customerDocument: user.document,
        items: cart.items,
        status: "PAID",
        price,
        paymentId: charge.paymentId,
        metadata: {
          cardToken: request.cardToken,
          clientIp: request.clientIp,
          loyaltyTier: user.loyaltyTier,
        },
        createdAt: now,
        updatedAt: now,
      };

      await this.database.transaction(async () => {
        await this.orders.save(order);
        await this.payments.save({
          id: charge.paymentId,
          tenantId: request.tenantId,
          orderId,
          providerReference: charge.providerReference,
          amount: amountSentToGateway,
          currency: price.currency,
          status: "CAPTURED",
          createdAt: now,
        });

        if (coupon) {
          await this.coupons.markAsUsed(coupon.code);
        }

        const event: DomainEvent<{ order: Order; cardToken: string }> = {
          id: randomUUID(),
          topic: "order.paid",
          tenantId: request.tenantId,
          occurredAt: now,
          payload: { order, cardToken: request.cardToken },
        };
        await this.events.publish(event);
      });

      await this.carts.clear(request.userId);
      sharedCache.set(`order:${orderId}`, order, this.config.cacheTtlSeconds);

      const result: CheckoutResult = {
        orderId,
        status: "PAID",
        chargedAmount: amountSentToGateway,
        displayedAmount: price.grandTotal,
        currency: price.currency,
      };

      if (request.idempotencyKey) {
        completedCheckouts.set(request.idempotencyKey, result);
      }

      return result;
    } finally {
      cartsBeingProcessed.delete(cart.id);
    }
  }

  async cancelOrder(context: RequestContext, orderId: string): Promise<Order> {
    const order = await this.orders.findById(orderId);
    if (!order) {
      throw new Error("order not found");
    }

    if (context.actorRole !== "admin" && context.actorId !== order.userId) {
      throw new Error("forbidden");
    }

    order.status = "CANCELLED";
    order.updatedAt = new Date().toISOString();
    await this.orders.save(order);

    const payment = await this.payments.findByOrder(orderId);
    if (payment) {
      await this.paymentGateway.refund(
        payment.providerReference,
        order.price.grandTotal,
      );
    }

    await this.events.publish({
      id: randomUUID(),
      topic: "order.cancelled",
      tenantId: context.tenantId,
      occurredAt: new Date().toISOString(),
      payload: { orderId, actorId: context.actorId },
    });

    return order;
  }
}
