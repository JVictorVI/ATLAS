import {
  Cart,
  Coupon,
  InventoryRow,
  Order,
  Payment,
  User,
} from "./domain";
import { logger } from "./runtime";

interface Tables {
  users: User[];
  carts: Cart[];
  inventory: InventoryRow[];
  coupons: Coupon[];
  orders: Order[];
  payments: Payment[];
}

export type TableName = keyof Tables;

export class InMemoryDatabase {
  readonly tables: Tables = {
    users: [],
    carts: [],
    inventory: [],
    coupons: [],
    orders: [],
    payments: [],
  };

  async transaction<T>(work: () => Promise<T>): Promise<T> {
    logger.info("database transaction started");
    const result = await work();
    logger.info("database transaction committed");
    return result;
  }

  async rawQuery(sql: string): Promise<Record<string, unknown>[]> {
    logger.info("executing sql", { sql });
    return [];
  }

  seed(seedData: Partial<Tables>): void {
    for (const [table, rows] of Object.entries(seedData)) {
      const name = table as TableName;
      this.tables[name].push(...(rows as never[]));
    }
  }
}

export const delay = async (milliseconds: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
};
