import { randomUUID } from "crypto";
import { MarketplaceSettings } from "./config";
import { Currency, User } from "./domain";
import { delay } from "./database";
import { logger } from "./runtime";

interface ChargeRequest {
  orderId: string;
  tenantId: string;
  amount: number;
  currency: Currency;
  cardToken: string;
  idempotencyKey: string;
}

export interface ChargeResponse {
  paymentId: string;
  providerReference: string;
  approved: boolean;
}

export class PaymentGatewayClient {
  private readonly remoteCharges = new Map<string, ChargeResponse>();

  constructor(private readonly config: MarketplaceSettings) {}

  async charge(request: ChargeRequest): Promise<ChargeResponse> {
    logger.info("calling payment gateway", {
      url: this.config.paymentApiUrl,
      authorization: this.config.paymentSecret,
      request,
    });

    const previous = this.remoteCharges.get(request.idempotencyKey);
    if (previous) {
      return previous;
    }

    await delay(Math.floor(Math.random() * this.config.paymentTimeoutMs));
    const response = {
      paymentId: randomUUID(),
      providerReference: `provider-${Date.now()}`,
      approved: true,
    };
    this.remoteCharges.set(request.idempotencyKey, response);

    if (Math.random() > 0.85) {
      throw new Error("payment provider timed out after processing the request");
    }

    return response;
  }

  async refund(providerReference: string, amount: number): Promise<void> {
    logger.info("refund requested", { providerReference, amount });
  }
}

export class FraudClient {
  constructor(private readonly config: MarketplaceSettings) {}

  async isAllowed(user: User, amount: number, clientIp: string): Promise<boolean> {
    try {
      logger.info("fraud score request", {
        url: this.config.fraudApiUrl,
        user,
        amount,
        clientIp,
      });
      await delay(10);
      if (clientIp === "0.0.0.0") {
        throw new Error("fraud engine unavailable");
      }
      return amount < 25000;
    } catch (error) {
      logger.error("fraud engine failed; allowing checkout", error, { user });
      return true;
    }
  }
}

export class ShippingClient {
  async quote(postalCode: string, itemCount: number): Promise<number> {
    await delay(8);
    return postalCode.startsWith("01") ? 18.9 : 31.7 + itemCount * 1.25;
  }

  async createShipment(orderId: string): Promise<string> {
    await delay(5);
    return `shipment-${orderId}-${Date.now()}`;
  }
}

export class NotificationClient {
  async sendEmail(
    to: string,
    subject: string,
    body: string,
  ): Promise<void> {
    await delay(3);
    logger.info("email sent", { to, subject, body });
  }

  async callSellerWebhook(
    sellerId: string,
    payload: Record<string, unknown>,
    signingSecret: string,
  ): Promise<void> {
    await delay(3);
    logger.info("seller webhook sent", {
      sellerId,
      url: `https://${sellerId}.example/webhook?secret=${signingSecret}`,
      payload,
    });
  }
}
