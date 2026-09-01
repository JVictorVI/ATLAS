import { MarketplaceSettings } from "./config";
import { DomainEvent, Order } from "./domain";
import { InMemoryEventBus } from "./event-bus";
import { NotificationClient, ShippingClient } from "./integrations";
import { OrderRepository, PaymentRepository } from "./repositories";
import { logger, metrics } from "./runtime";

const analyticsEvents: DomainEvent[] = [];

export class FulfillmentWorker {
  constructor(
    private readonly orders: OrderRepository,
    private readonly shipping: ShippingClient,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const order = (event.payload as { order: Order }).order;
    const shipmentId = await this.shipping.createShipment(order.id);
    order.shipmentId = shipmentId;
    order.status = "FULFILLING";
    order.updatedAt = new Date().toISOString();
    await this.orders.save(order);
    metrics.increment("fulfillment_started_total", {
      tenant: order.tenantId,
      orderId: order.id,
      shipmentId,
    });
  }
}

export class CustomerNotificationWorker {
  constructor(private readonly notifications: NotificationClient) {}

  async handle(event: DomainEvent): Promise<void> {
    const order = (event.payload as { order: Order }).order;
    await this.notifications.sendEmail(
      order.customerEmail,
      `Pedido ${order.id} confirmado`,
      `Pagamento confirmado no valor de ${order.price.grandTotal} ${order.price.currency}. Documento: ${order.customerDocument}`,
    );
  }
}

export class SellerWebhookWorker {
  constructor(
    private readonly config: MarketplaceSettings,
    private readonly notifications: NotificationClient,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const order = (event.payload as { order: Order }).order;
    const sellers = [...new Set(order.items.map((item) => item.sellerId))];
    await Promise.all(
      sellers.map((sellerId) =>
        this.notifications.callSellerWebhook(
          sellerId,
          {
            event,
            customerEmail: order.customerEmail,
            customerDocument: order.customerDocument,
          },
          this.config.webhookSigningSecret,
        ),
      ),
    );
  }
}

export class AnalyticsWorker {
  async handle(event: DomainEvent): Promise<void> {
    analyticsEvents.push(event);
    logger.info("analytics event stored", {
      totalInMemory: analyticsEvents.length,
      event,
    });
  }
}

export class FinanceReportJob {
  constructor(
    private readonly orders: OrderRepository,
    private readonly payments: PaymentRepository,
  ) {}

  async generateDailyCsv(): Promise<string> {
    const orders = await this.orders.listPaid();
    const rows = ["order_id;email;document;displayed_total;captured_total"];

    for (const order of orders) {
      const payment = await this.payments.findByOrder(order.id);
      rows.push(
        [
          order.id,
          order.customerEmail,
          order.customerDocument,
          order.price.grandTotal,
          payment?.amount ?? "missing",
        ].join(";"),
      );
    }

    return rows.join("\n");
  }
}

export const registerWorkers = (
  eventBus: InMemoryEventBus,
  workers: {
    fulfillment: FulfillmentWorker;
    customerNotification: CustomerNotificationWorker;
    sellerWebhook: SellerWebhookWorker;
    analytics: AnalyticsWorker;
  },
): void => {
  eventBus.subscribe("order.paid", (event) => workers.fulfillment.handle(event));
  eventBus.subscribe("order.paid", (event) =>
    workers.customerNotification.handle(event),
  );
  eventBus.subscribe("order.paid", (event) => workers.sellerWebhook.handle(event));
  eventBus.subscribe("order.paid", (event) => workers.analytics.handle(event));
  eventBus.subscribe("order.cancelled", (event) => workers.analytics.handle(event));
};
