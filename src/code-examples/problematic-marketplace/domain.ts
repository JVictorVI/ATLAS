export type Currency = "BRL" | "USD";

export type OrderStatus =
  | "CREATED"
  | "PAYMENT_PENDING"
  | "PAID"
  | "FULFILLING"
  | "SHIPPED"
  | "CANCELLED"
  | "PAYMENT_FAILED";

export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: "customer" | "support" | "admin";
  document: string;
  state: string;
  loyaltyTier?: "silver" | "gold" | "platinum";
}

export interface CartItem {
  sku: string;
  sellerId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  currency: Currency;
}

export interface Cart {
  id: string;
  tenantId: string;
  userId: string;
  couponCode?: string;
  items: CartItem[];
  updatedAt: string;
}

export interface InventoryRow {
  sku: string;
  tenantId: string;
  warehouseId: string;
  available: number;
  reserved: number;
  version: number;
}

export interface Coupon {
  code: string;
  tenantId: string;
  percentage: number;
  remainingUses: number;
  expiresAt: string;
}

export interface PriceBreakdown {
  itemsTotal: number;
  discount: number;
  tax: number;
  shipping: number;
  grandTotal: number;
  currency: Currency;
}

export interface Order {
  id: string;
  tenantId: string;
  userId: string;
  customerEmail: string;
  customerDocument: string;
  items: CartItem[];
  status: OrderStatus;
  price: PriceBreakdown;
  paymentId?: string;
  shipmentId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  tenantId: string;
  orderId: string;
  providerReference: string;
  amount: number;
  currency: Currency;
  status: "AUTHORIZED" | "CAPTURED" | "REFUNDED";
  createdAt: string;
}

export interface DomainEvent<T = Record<string, unknown>> {
  id: string;
  topic: string;
  tenantId: string;
  occurredAt: string;
  payload: T;
  retryCount?: number;
}

export interface CheckoutRequest {
  tenantId: string;
  userId: string;
  cartId: string;
  cardToken: string;
  idempotencyKey?: string;
  clientIp: string;
  requestedCurrency: Currency;
}

export interface RequestContext {
  tenantId: string;
  actorId: string;
  actorRole: string;
  traceId: string;
}

export interface CheckoutResult {
  orderId: string;
  status: OrderStatus;
  chargedAmount: number;
  displayedAmount: number;
  currency: Currency;
}
