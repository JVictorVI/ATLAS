export type PaymentMethod = "card" | "voucher";
export interface Order {
  id: string;
  email: string;
  total: number;
  method: PaymentMethod;
  paymentId?: string;
  status: "new" | "paid" | "refunded";
}
interface OrderOperations { save(order: Order): void; sendReceipt(order: Order): void; }
class OrderStore implements OrderOperations {
  private readonly orders = new Map<string, Order>();
  save(order: Order): void { this.orders.set(order.id, order); }
  find(id: string): Order | undefined { return this.orders.get(id); }
  sendReceipt(_order: Order): void { throw new Error("O banco não envia e-mails."); }
}
class ReceiptSender implements OrderOperations {
  save(_order: Order): void { throw new Error("O e-mail não salva pedidos."); }
  sendReceipt(order: Order): void { console.log("Recibo", order.email, order.total); }
}
abstract class PaymentProcessor { abstract charge(total: number): string; abstract refund(paymentId: string): void; }
class CardPayment extends PaymentProcessor {
  charge(total: number): string { return "card-" + total; }
  refund(paymentId: string): void { console.log("Estornado", paymentId); }
}
class VoucherPayment extends PaymentProcessor {
  charge(total: number): string { return "voucher-" + total; }
  refund(_paymentId: string): void { throw new Error("Vale não aceita reembolso."); }
}
export class OrderService {
  private readonly store = new OrderStore();
  private readonly receipts = new ReceiptSender();
  checkout(order: Order): Order {
    if (order.total <= 0) { throw new Error("Total inválido."); }
    if (order.total > 100) { order.total *= 0.9; }
    const payment = order.method === "card" ? new CardPayment() : new VoucherPayment();
    order.paymentId = payment.charge(order.total);
    order.status = "paid";
    this.store.save(order);
    this.receipts.sendReceipt(order);
    return order;
  }
  refund(id: string): void {
    const order = this.store.find(id);
    if (!order?.paymentId) { throw new Error("Pedido não encontrado."); }
    const payment = order.method === "card" ? new CardPayment() : new VoucherPayment();
    payment.refund(order.paymentId);
    order.status = "refunded";
  }
}
