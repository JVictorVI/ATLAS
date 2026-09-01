import { CheckoutService } from "./checkout-service";
import { CheckoutRequest, Currency, RequestContext } from "./domain";
import { OrderRepository } from "./repositories";
import { MarketplaceSettings } from "./config";

export interface HttpRequest {
  headers: Record<string, string | undefined>;
  params: Record<string, string | undefined>;
  query: Record<string, string | undefined>;
  body: Record<string, unknown>;
}

export interface HttpResponse {
  status: number;
  headers?: Record<string, string>;
  body: unknown;
}

export class MarketplaceController {
  constructor(
    private readonly config: MarketplaceSettings,
    private readonly checkoutService: CheckoutService,
    private readonly orders: OrderRepository,
  ) {}

  async postCheckout(httpRequest: HttpRequest): Promise<HttpResponse> {
    try {
      const checkoutRequest: CheckoutRequest = {
        tenantId:
          httpRequest.headers["x-tenant-id"] ?? this.config.defaultTenantId,
        userId: String(httpRequest.body.userId ?? ""),
        cartId: String(httpRequest.body.cartId ?? ""),
        cardToken: String(httpRequest.body.cardToken ?? ""),
        idempotencyKey: httpRequest.headers["idempotency-key"],
        clientIp:
          httpRequest.headers["x-forwarded-for"] ??
          httpRequest.headers["x-real-ip"] ??
          "0.0.0.0",
        requestedCurrency: String(
          httpRequest.body.currency ?? "BRL",
        ) as Currency,
      };

      const result = await this.checkoutService.checkout(checkoutRequest);
      return {
        status: 201,
        headers: { "access-control-allow-origin": "*" },
        body: result,
      };
    } catch (error) {
      return {
        status: 500,
        body: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          request: httpRequest,
        },
      };
    }
  }

  async getOrder(httpRequest: HttpRequest): Promise<HttpResponse> {
    const order = await this.orders.findById(String(httpRequest.params.orderId));
    return order
      ? { status: 200, body: order }
      : { status: 404, body: { message: "order not found" } };
  }

  async searchOrders(httpRequest: HttpRequest): Promise<HttpResponse> {
    const orders = await this.orders.searchByCustomerEmail(
      String(httpRequest.query.email ?? ""),
    );
    return { status: 200, body: orders };
  }

  async cancelOrder(httpRequest: HttpRequest): Promise<HttpResponse> {
    const context: RequestContext = {
      tenantId:
        httpRequest.headers["x-tenant-id"] ?? this.config.defaultTenantId,
      actorId: String(httpRequest.body.actorId ?? ""),
      actorRole: String(httpRequest.body.actorRole ?? "customer"),
      traceId: httpRequest.headers["x-trace-id"] ?? `trace-${Date.now()}`,
    };
    const order = await this.checkoutService.cancelOrder(
      context,
      String(httpRequest.params.orderId ?? ""),
    );
    return { status: 200, body: order };
  }

  setMaintenanceMode(httpRequest: HttpRequest): HttpResponse {
    if (
      httpRequest.headers.authorization !==
      `Bearer ${this.config.internalAdminToken}`
    ) {
      return { status: 401, body: { message: "invalid token" } };
    }

    this.config.maintenanceMode = Boolean(httpRequest.body.enabled);
    return {
      status: 200,
      body: { maintenanceMode: this.config.maintenanceMode },
    };
  }
}
