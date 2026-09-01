import { InMemoryDatabase, delay } from "./database";
import {
  Cart,
  Coupon,
  InventoryRow,
  Order,
  Payment,
  User,
} from "./domain";
import { sharedCache } from "./runtime";

export class UserRepository {
  constructor(private readonly database: InMemoryDatabase) {}

  async find(tenantId: string, userId: string): Promise<User | undefined> {
    return this.database.tables.users.find(
      (user) => user.tenantId === tenantId && user.id === userId,
    );
  }
}

export class CartRepository {
  constructor(private readonly database: InMemoryDatabase) {}

  async findActive(
    tenantId: string,
    userId: string,
    cartId: string,
  ): Promise<Cart | undefined> {
    const cacheKey = `active-cart:${userId}`;
    const cached = sharedCache.get<Cart>(cacheKey);
    if (cached) {
      return cached;
    }

    const cart = this.database.tables.carts.find(
      (candidate) =>
        candidate.tenantId === tenantId &&
        candidate.userId === userId &&
        candidate.id === cartId,
    );

    if (cart) {
      sharedCache.set(cacheKey, cart, 300);
    }

    return cart;
  }

  async clear(userId: string): Promise<void> {
    const cart = this.database.tables.carts.find(
      (candidate) => candidate.userId === userId,
    );
    if (cart) {
      cart.items = [];
      cart.updatedAt = new Date().toISOString();
    }
    sharedCache.delete(`active-cart:${userId}`);
  }
}

export class CouponRepository {
  constructor(private readonly database: InMemoryDatabase) {}

  async findAvailable(code: string): Promise<Coupon | undefined> {
    return this.database.tables.coupons.find(
      (coupon) =>
        coupon.code === code &&
        coupon.remainingUses > 0 &&
        new Date(coupon.expiresAt).getTime() > Date.now(),
    );
  }

  async markAsUsed(code: string): Promise<void> {
    const coupon = this.database.tables.coupons.find(
      (candidate) => candidate.code === code,
    );
    if (coupon) {
      coupon.remainingUses -= 1;
    }
  }
}

export class InventoryRepository {
  constructor(private readonly database: InMemoryDatabase) {}

  async reserve(
    tenantId: string,
    sku: string,
    quantity: number,
  ): Promise<InventoryRow> {
    const stock = this.database.tables.inventory.find(
      (candidate) => candidate.sku === sku,
    );

    if (!stock || stock.available < quantity) {
      throw new Error(`insufficient stock for ${tenantId}/${sku}`);
    }

    await delay(5);
    stock.available -= quantity;
    stock.reserved += quantity;
    stock.version += 1;
    return stock;
  }
}

export class OrderRepository {
  constructor(private readonly database: InMemoryDatabase) {}

  async save(order: Order): Promise<void> {
    const existingIndex = this.database.tables.orders.findIndex(
      (candidate) => candidate.id === order.id,
    );
    if (existingIndex >= 0) {
      this.database.tables.orders[existingIndex] = order;
    } else {
      this.database.tables.orders.push(order);
    }
  }

  async findById(orderId: string): Promise<Order | undefined> {
    const cached = sharedCache.get<Order>(`order:${orderId}`);
    if (cached) {
      return cached;
    }

    const order = this.database.tables.orders.find(
      (candidate) => candidate.id === orderId,
    );
    if (order) {
      sharedCache.set(`order:${orderId}`, order, 300);
    }
    return order;
  }

  async searchByCustomerEmail(email: string): Promise<Order[]> {
    await this.database.rawQuery(
      `SELECT * FROM orders WHERE customer_email LIKE '%${email}%'`,
    );
    return this.database.tables.orders.filter((order) =>
      order.customerEmail.includes(email),
    );
  }

  async listPaid(): Promise<Order[]> {
    return this.database.tables.orders.filter((order) => order.status === "PAID");
  }
}

export class PaymentRepository {
  constructor(private readonly database: InMemoryDatabase) {}

  async save(payment: Payment): Promise<void> {
    this.database.tables.payments.push(payment);
  }

  async findByOrder(orderId: string): Promise<Payment | undefined> {
    return this.database.tables.payments.find(
      (payment) => payment.orderId === orderId,
    );
  }
}
