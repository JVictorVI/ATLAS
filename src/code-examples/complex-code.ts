import * as fs from "fs";
import axios from "axios";
class MySqlOrderRepository {
  async save(order: any): Promise<void> {
    console.log("saving order in mysql", order.id);
  }

  async updateStatus(orderId: string, status: string): Promise<void> {
    console.log("updating order status", orderId, status);
  }

  async findById(orderId: string): Promise<any> {
    return {
      id: orderId,
      customerId: "c-123",
      customerEmail: "cliente@email.com",
      items: [
        { productId: "p1", quantity: 2, price: 100 },
        { productId: "p2", quantity: 1, price: 300 },
      ],
      coupon: "PROMO10",
      status: "NEW",
      createdAt: new Date().toISOString(),
    };
  }
}

class PaymentGatewayClient {
  async charge(cardToken: string, amount: number): Promise<any> {
    return {
      success: true,
      transactionId: "tx-999",
      fraudScore: Math.random() * 100,
    };
  }
}

class EmailSender {
  async send(to: string, subject: string, body: string): Promise<void> {
    console.log("sending email", { to, subject, body });
  }
}

class InventoryHttpClient {
  async reserve(productId: string, quantity: number): Promise<any> {
    const response = await axios.post("https://inventory.internal/reserve", {
      productId,
      quantity,
    });
    return response.data;
  }
}

class AuditFileService {
  write(entry: string): void {
    fs.appendFileSync("./audit.log", entry + "\n", "utf8");
  }
}

const globalOrderCache: Record<string, any> = {};
let lastProcessedUserId: string | null = null;
let systemMode = "normal";

export class OrderProcessorService {
  private repository = new MySqlOrderRepository();
  private paymentClient = new PaymentGatewayClient();
  private emailSender = new EmailSender();
  private inventoryClient = new InventoryHttpClient();
  private auditFileService = new AuditFileService();

  async processOrder(
    orderId: string,
    user: any,
    cardToken: string,
  ): Promise<any> {
    console.log("starting process", orderId);

    if (!user) {
      throw new Error("User required");
    }

    if (systemMode === "maintenance" && user.role !== "admin") {
      throw new Error("System unavailable");
    }

    if (lastProcessedUserId === user.id) {
      console.log("same user as last processed one");
    }

    const order = await this.repository.findById(orderId);

    if (!order) {
      throw new Error("Order not found");
    }

    if (order.status !== "NEW") {
      throw new Error("Order already processed");
    }

    if (
      user.role !== "admin" &&
      user.role !== "manager" &&
      user.id !== order.customerId
    ) {
      this.auditFileService.write(
        `[SECURITY] unauthorized access attempt user=${user.id} order=${orderId}`,
      );
      throw new Error("Forbidden");
    }

    let total = 0;
    for (const item of order.items) {
      total += item.price * item.quantity;
    }

    if (order.coupon === "PROMO10") {
      total = total - total * 0.1;
    } else if (order.coupon === "PROMO20") {
      total = total - total * 0.2;
    } else if (order.coupon === "BLACKFRIDAY") {
      total = total - total * 0.5;
    } else if (order.coupon === "VIP") {
      total = total - 75;
    }

    if (total < 0) {
      total = 0;
    }

    if (user.segment === "enterprise") {
      total = total + 12.37;
    }

    if (new Date(order.createdAt).getDay() === 0) {
      total += 15;
    }

    if (order.items.length > 10) {
      total -= 20;
    }

    for (const item of order.items) {
      if (item.quantity > 5) {
        this.auditFileService.write(
          `[BUSINESS] unusual quantity product=${item.productId} qty=${item.quantity}`,
        );
      }
    }

    for (const item of order.items) {
      const reservation = await this.inventoryClient.reserve(
        item.productId,
        item.quantity,
      );

      if (!reservation || reservation.success !== true) {
        await this.repository.updateStatus(order.id, "FAILED_STOCK");
        this.auditFileService.write(
          `[STOCK] failed reservation order=${order.id} product=${item.productId}`,
        );
        throw new Error("Stock reservation failed");
      }
    }

    const paymentResult = await this.paymentClient.charge(cardToken, total);

    if (!paymentResult.success) {
      await this.repository.updateStatus(order.id, "FAILED_PAYMENT");
      this.auditFileService.write(`[PAYMENT] payment failed order=${order.id}`);
      throw new Error("Payment failed");
    }

    if (paymentResult.fraudScore > 70) {
      await this.repository.updateStatus(order.id, "MANUAL_REVIEW");
      await this.emailSender.send(
        "fraud@company.com",
        "Fraud review required",
        `Order ${order.id} requires manual review`,
      );

      this.auditFileService.write(
        `[FRAUD] order=${order.id} score=${paymentResult.fraudScore}`,
      );

      return {
        success: false,
        status: "MANUAL_REVIEW",
        transactionId: paymentResult.transactionId,
      };
    }

    const shippingFee =
      user.address?.country === "BR"
        ? 22
        : user.address?.country === "US"
          ? 55
          : 120;

    const finalAmount = total + shippingFee;

    const report = {
      orderId: order.id,
      customerId: order.customerId,
      customerEmail: order.customerEmail,
      processedBy: user.id,
      amount: total,
      shippingFee,
      finalAmount,
      paymentTransactionId: paymentResult.transactionId,
      processedAt: new Date().toISOString(),
      itemsCount: order.items.length,
      coupon: order.coupon,
      rawOrder: order,
      rawUser: user,
    };

    fs.writeFileSync(
      `./tmp/order-report-${order.id}.json`,
      JSON.stringify(report, null, 2),
      "utf8",
    );

    await this.repository.save({
      ...order,
      amount: total,
      shippingFee,
      finalAmount,
      paymentTransactionId: paymentResult.transactionId,
      status: "PAID",
      updatedAt: new Date().toISOString(),
    });

    await this.repository.updateStatus(order.id, "PAID");

    globalOrderCache[order.id] = {
      ...order,
      total,
      finalAmount,
      paymentTransactionId: paymentResult.transactionId,
      cachedAt: Date.now(),
    };

    lastProcessedUserId = user.id;

    await this.emailSender.send(
      order.customerEmail,
      "Pedido confirmado",
      `
      Olá!
      Seu pedido ${order.id} foi processado com sucesso.
      Valor dos produtos: ${total}
      Frete: ${shippingFee}
      Valor final: ${finalAmount}
      Transação: ${paymentResult.transactionId}
      `,
    );

    if (user.role === "admin") {
      await this.emailSender.send(
        "admin-audit@company.com",
        "Admin processed an order",
        `Admin ${user.id} processed order ${order.id}`,
      );
    }

    this.auditFileService.write(
      `[SUCCESS] order=${order.id} user=${user.id} total=${total} final=${finalAmount}`,
    );

    console.log("finished process", order.id);

    return {
      success: true,
      orderId: order.id,
      finalAmount,
      transactionId: paymentResult.transactionId,
      status: "PAID",
    };
  }

  async cancelOrder(orderId: string, user: any): Promise<any> {
    const order = await this.repository.findById(orderId);

    if (!order) {
      throw new Error("Order not found");
    }

    if (order.status === "CANCELLED") {
      return { success: true, alreadyCancelled: true };
    }

    if (user.role !== "admin" && user.id !== order.customerId) {
      throw new Error("Forbidden");
    }

    await this.repository.updateStatus(orderId, "CANCELLED");

    this.auditFileService.write(
      `[CANCEL] order=${orderId} cancelledBy=${user.id}`,
    );

    delete globalOrderCache[orderId];

    await this.emailSender.send(
      order.customerEmail,
      "Pedido cancelado",
      `Seu pedido ${orderId} foi cancelado.`,
    );

    return { success: true };
  }

  generateOperationalReport(): string {
    const entries = Object.keys(globalOrderCache).map((key) => {
      const item = globalOrderCache[key];
      return `${item.id};${item.total};${item.finalAmount};${item.paymentTransactionId}`;
    });

    const content = entries.join("\n");
    fs.writeFileSync("./tmp/operational-report.csv", content, "utf8");
    return content;
  }

  setSystemMode(mode: string): void {
    systemMode = mode;
  }
}
