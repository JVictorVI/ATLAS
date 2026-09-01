import { MarketplaceController } from "./api";
import { CheckoutService } from "./checkout-service";
import { settings } from "./config";
import { InMemoryDatabase } from "./database";
import { InMemoryEventBus } from "./event-bus";
import {
  FraudClient,
  NotificationClient,
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
import {
  AnalyticsWorker,
  CustomerNotificationWorker,
  FinanceReportJob,
  FulfillmentWorker,
  SellerWebhookWorker,
  registerWorkers,
} from "./workers";

export const createProblematicMarketplace = () => {
  const database = new InMemoryDatabase();
  database.seed({
    users: [
      {
        id: "user-42",
        tenantId: "acme-br",
        email: "maria@acme.example",
        name: "Maria Acme",
        role: "customer",
        document: "12345678901",
        state: "SP",
        loyaltyTier: "platinum",
      },
      {
        id: "user-42",
        tenantId: "globex-us",
        email: "alex@globex.example",
        name: "Alex Globex",
        role: "customer",
        document: "99988877766",
        state: "NY",
      },
    ],
    carts: [
      {
        id: "cart-acme",
        tenantId: "acme-br",
        userId: "user-42",
        couponCode: "FLASH50",
        items: [
          {
            sku: "notebook-pro",
            sellerId: "seller-main",
            name: "Notebook Pro",
            quantity: 1,
            unitPrice: 7499.9,
            currency: "BRL",
          },
          {
            sku: "usb-hub",
            sellerId: "=HYPERLINK-malicious-seller",
            name: "USB Hub",
            quantity: 2,
            unitPrice: 149.95,
            currency: "BRL",
          },
        ],
        updatedAt: new Date().toISOString(),
      },
      {
        id: "cart-globex",
        tenantId: "globex-us",
        userId: "user-42",
        items: [
          {
            sku: "notebook-pro",
            sellerId: "seller-us",
            name: "Notebook Pro US",
            quantity: 2,
            unitPrice: 1899.99,
            currency: "USD",
          },
        ],
        updatedAt: new Date().toISOString(),
      },
    ],
    inventory: [
      {
        sku: "notebook-pro",
        tenantId: "acme-br",
        warehouseId: "gru-01",
        available: 3,
        reserved: 0,
        version: 1,
      },
      {
        sku: "notebook-pro",
        tenantId: "globex-us",
        warehouseId: "iad-01",
        available: 200,
        reserved: 0,
        version: 1,
      },
      {
        sku: "usb-hub",
        tenantId: "acme-br",
        warehouseId: "gru-01",
        available: 30,
        reserved: 0,
        version: 1,
      },
    ],
    coupons: [
      {
        code: "FLASH50",
        tenantId: "acme-br",
        percentage: 50,
        remainingUses: 1,
        expiresAt: "2035-01-01T00:00:00.000Z",
      },
      {
        code: "FLASH50",
        tenantId: "globex-us",
        percentage: 5,
        remainingUses: 500,
        expiresAt: "2035-01-01T00:00:00.000Z",
      },
    ],
  });

  const users = new UserRepository(database);
  const carts = new CartRepository(database);
  const coupons = new CouponRepository(database);
  const inventory = new InventoryRepository(database);
  const orders = new OrderRepository(database);
  const payments = new PaymentRepository(database);
  const events = new InMemoryEventBus(settings);
  const shipping = new ShippingClient();
  const notifications = new NotificationClient();

  const checkout = new CheckoutService(
    settings,
    database,
    users,
    carts,
    coupons,
    inventory,
    orders,
    payments,
    new PricingService(settings),
    new PaymentGatewayClient(settings),
    new FraudClient(settings),
    shipping,
    events,
  );

  registerWorkers(events, {
    fulfillment: new FulfillmentWorker(orders, shipping),
    customerNotification: new CustomerNotificationWorker(notifications),
    sellerWebhook: new SellerWebhookWorker(settings, notifications),
    analytics: new AnalyticsWorker(),
  });

  return {
    controller: new MarketplaceController(settings, checkout, orders),
    checkout,
    repositories: { users, carts, coupons, inventory, orders, payments },
    database,
    events,
    financeReport: new FinanceReportJob(orders, payments),
  };
};
