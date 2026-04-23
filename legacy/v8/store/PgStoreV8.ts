import { and, asc, desc, eq, sql } from "drizzle-orm";
import { dbV8 } from "../db/client.ts";
import {
  menuItemsTable,
  orderItemsTable,
  ordersTable,
  usersTable,
  V8_DB_SCHEMA,
} from "../db/schema.ts";
import type { MenuItem, Order, OrderItem, SafeUser } from "../contracts.ts";
import type { StoreV8 } from "./StoreV8.ts";

const seedMenu: Array<{
  name: string;
  price: number;
  category: string;
  description: string;
  imageUrl: string;
}> = [
  {
    name: "火腿蛋吐司",
    price: 40,
    category: "餐點",
    description: "現煎雞蛋搭配火腿與生菜，使用微烤白吐司。",
    imageUrl: "/imgs/menu/ham-egg-toast.webp",
  },
  {
    name: "奶茶",
    price: 30,
    category: "飲料",
    description: "紅茶搭配奶精調和，香濃順口。",
    imageUrl: "/imgs/menu/milk-tea.webp",
  },
  {
    name: "紅茶",
    price: 25,
    category: "飲料",
    description: "古早味紅茶，早餐基本配備。",
    imageUrl: "/imgs/menu/black-tea.webp",
  },
];

function toMenuItem(row: typeof menuItemsTable.$inferSelect): MenuItem {
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    category: row.category,
    description: row.description,
    image_url: row.imageUrl,
  };
}

function toOrder(rows: {
  order: typeof ordersTable.$inferSelect;
  items: Array<typeof orderItemsTable.$inferSelect>;
}): Order {
  const items: OrderItem[] = rows.items.map((item) => ({
    item: {
      id: item.itemId,
      name: item.name,
      price: item.price,
      category: item.category,
      description: item.description,
      image_url: item.imageUrl,
    },
    qty: item.qty,
  }));

  return {
    id: rows.order.id,
    userId: rows.order.userId,
    items,
    total: rows.order.total,
    status: rows.order.status === "submitted" ? "submitted" : "pending",
    createdAt:
      rows.order.createdAt instanceof Date
        ? rows.order.createdAt.toISOString()
        : new Date(rows.order.createdAt).toISOString(),
    submittedAt: rows.order.submittedAt
      ? rows.order.submittedAt instanceof Date
        ? rows.order.submittedAt.toISOString()
        : new Date(rows.order.submittedAt).toISOString()
      : undefined,
  };
}

function calculateTotal(items: ReadonlyArray<OrderItem>): number {
  return items.reduce((sum, item) => sum + item.item.price * item.qty, 0);
}

export class PgStoreV8 implements StoreV8 {
  async init(): Promise<void> {
    await this.ensureSchemaAndTables();
    await this.seedInitialData();
  }

  async login(input: {
    email: string;
    password: string;
  }): Promise<{ ok: true; user: SafeUser } | { ok: false }> {
    const [found] = await dbV8
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.email, input.email),
          eq(usersTable.password, input.password),
        ),
      )
      .limit(1);

    if (!found) {
      return { ok: false };
    }

    return {
      ok: true,
      user: { id: found.id, email: found.email, name: found.name },
    };
  }

  async getUserById(userId: number): Promise<SafeUser | null> {
    const [found] = await dbV8
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!found) {
      return null;
    }

    return { id: found.id, email: found.email, name: found.name };
  }

  async getMenu(): Promise<ReadonlyArray<MenuItem>> {
    const rows = await dbV8
      .select()
      .from(menuItemsTable)
      .orderBy(asc(menuItemsTable.id));
    return rows.map(toMenuItem);
  }

  async getCurrentOrderByUserId(userId: number): Promise<Order | undefined> {
    const [order] = await dbV8
      .select()
      .from(ordersTable)
      .where(
        and(eq(ordersTable.userId, userId), eq(ordersTable.status, "pending")),
      )
      .orderBy(desc(ordersTable.id))
      .limit(1);

    if (!order) {
      return undefined;
    }

    return this.getOrderById(order.id);
  }

  async getOrderHistoryByUserId(userId: number): Promise<ReadonlyArray<Order>> {
    const rows = await dbV8
      .select()
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.userId, userId),
          eq(ordersTable.status, "submitted"),
        ),
      )
      .orderBy(desc(ordersTable.createdAt));

    const orders = await Promise.all(
      rows.map((row) => this.getOrderById(row.id)),
    );
    return orders.filter((order): order is Order => !!order);
  }

  async getOrderById(orderId: number): Promise<Order | undefined> {
    const [order] = await dbV8
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .limit(1);

    if (!order) {
      return undefined;
    }

    const items = await dbV8
      .select()
      .from(orderItemsTable)
      .where(eq(orderItemsTable.orderId, order.id))
      .orderBy(asc(orderItemsTable.id));

    return toOrder({ order, items });
  }

  async createOrder(input: { userId: number }): Promise<Order> {
    const [inserted] = await dbV8
      .insert(ordersTable)
      .values({
        userId: input.userId,
        total: 0,
        status: "pending",
        createdAt: new Date(),
      })
      .returning();

    if (!inserted) {
      throw new Error("Failed to create order");
    }

    return toOrder({ order: inserted, items: [] });
  }

  async updateOrderItem(
    orderId: number,
    input: {
      userId: number;
      itemId: number;
      qty: number;
    },
  ): Promise<
    | { ok: true; order: Order }
    | {
        ok: false;
        code:
          | "ORDER_NOT_FOUND"
          | "MENU_ITEM_NOT_FOUND"
          | "ORDER_NOT_OWNED"
          | "ORDER_NOT_EDITABLE";
      }
  > {
    const order = await this.getOrderById(orderId);
    if (!order) {
      return { ok: false, code: "ORDER_NOT_FOUND" };
    }

    if (order.userId !== input.userId) {
      return { ok: false, code: "ORDER_NOT_OWNED" };
    }

    if (order.status !== "pending") {
      return { ok: false, code: "ORDER_NOT_EDITABLE" };
    }

    const [menuItem] = await dbV8
      .select()
      .from(menuItemsTable)
      .where(eq(menuItemsTable.id, input.itemId))
      .limit(1);

    if (!menuItem) {
      return { ok: false, code: "MENU_ITEM_NOT_FOUND" };
    }

    const [existing] = await dbV8
      .select()
      .from(orderItemsTable)
      .where(
        and(
          eq(orderItemsTable.orderId, orderId),
          eq(orderItemsTable.itemId, input.itemId),
        ),
      )
      .limit(1);

    if (existing) {
      if (input.qty <= 0) {
        await dbV8
          .delete(orderItemsTable)
          .where(eq(orderItemsTable.id, existing.id));
      } else {
        await dbV8
          .update(orderItemsTable)
          .set({ qty: input.qty })
          .where(eq(orderItemsTable.id, existing.id));
      }
    } else if (input.qty > 0) {
      await dbV8.insert(orderItemsTable).values({
        orderId,
        itemId: menuItem.id,
        name: menuItem.name,
        price: menuItem.price,
        category: menuItem.category,
        description: menuItem.description,
        imageUrl: menuItem.imageUrl,
        qty: input.qty,
      });
    }

    const nextOrder = await this.getOrderById(orderId);
    if (!nextOrder) {
      return { ok: false, code: "ORDER_NOT_FOUND" };
    }

    const total = calculateTotal(nextOrder.items);

    await dbV8
      .update(ordersTable)
      .set({ total })
      .where(eq(ordersTable.id, orderId));

    const refreshed = await this.getOrderById(orderId);
    if (!refreshed) {
      return { ok: false, code: "ORDER_NOT_FOUND" };
    }

    return { ok: true, order: refreshed };
  }

  async submitOrder(
    orderId: number,
    input: { userId: number },
  ): Promise<
    | { ok: true; order: Order }
    | {
        ok: false;
        code:
          | "ORDER_NOT_FOUND"
          | "ORDER_NOT_OWNED"
          | "ORDER_NOT_EDITABLE"
          | "EMPTY_ORDER";
      }
  > {
    const order = await this.getOrderById(orderId);
    if (!order) {
      return { ok: false, code: "ORDER_NOT_FOUND" };
    }

    if (order.userId !== input.userId) {
      return { ok: false, code: "ORDER_NOT_OWNED" };
    }

    if (order.status !== "pending") {
      return { ok: false, code: "ORDER_NOT_EDITABLE" };
    }

    if (order.items.length === 0) {
      return { ok: false, code: "EMPTY_ORDER" };
    }

    const submittedAt = new Date();

    await dbV8
      .update(ordersTable)
      .set({
        status: "submitted",
        submittedAt,
      })
      .where(eq(ordersTable.id, orderId));

    const nextOrder = await this.getOrderById(orderId);
    if (!nextOrder) {
      return { ok: false, code: "ORDER_NOT_FOUND" };
    }

    return { ok: true, order: nextOrder };
  }

  private async ensureSchemaAndTables(): Promise<void> {
    const schemaName = V8_DB_SCHEMA.replace(/"/g, "");

    await dbV8.execute(sql.raw(`create schema if not exists "${schemaName}"`));

    await dbV8.execute(
      sql.raw(`
      create table if not exists "${schemaName}"."users" (
        "id" integer generated by default as identity primary key,
        "email" text not null,
        "name" text not null,
        "password" text not null,
        "created_at" timestamptz not null default now()
      );
    `),
    );

    await dbV8.execute(
      sql.raw(`
      create unique index if not exists "v8_users_email_idx" on "${schemaName}"."users"("email");
    `),
    );

    await dbV8.execute(
      sql.raw(`
      create table if not exists "${schemaName}"."menu_items" (
        "id" integer generated by default as identity primary key,
        "name" text not null,
        "price" integer not null,
        "category" text not null,
        "description" text not null,
        "image_url" text not null
      );
    `),
    );

    await dbV8.execute(
      sql.raw(`
      create table if not exists "${schemaName}"."orders" (
        "id" integer generated by default as identity primary key,
        "user_id" integer not null references "${schemaName}"."users"("id"),
        "total" integer not null default 0,
        "status" text not null default 'pending',
        "created_at" timestamptz not null default now(),
        "submitted_at" timestamptz
      );
    `),
    );

    await dbV8.execute(
      sql.raw(`
      create index if not exists "v8_orders_user_id_idx" on "${schemaName}"."orders"("user_id");
    `),
    );

    await dbV8.execute(
      sql.raw(`
      create table if not exists "${schemaName}"."order_items" (
        "id" integer generated by default as identity primary key,
        "order_id" integer not null references "${schemaName}"."orders"("id") on delete cascade,
        "item_id" integer not null,
        "name" text not null,
        "price" integer not null,
        "category" text not null,
        "description" text not null,
        "image_url" text not null,
        "qty" integer not null
      );
    `),
    );

    await dbV8.execute(
      sql.raw(`
      create unique index if not exists "v8_order_items_order_item_idx"
      on "${schemaName}"."order_items"("order_id", "item_id");
    `),
    );
  }

  private async seedInitialData(): Promise<void> {
    const [userCount] = await dbV8
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable);

    if ((userCount?.count ?? 0) === 0) {
      await dbV8.insert(usersTable).values([
        { email: "demo@example.com", name: "示範使用者", password: "1234" },
        { email: "amy@example.com", name: "Amy", password: "1234" },
      ]);
    }

    const [menuCount] = await dbV8
      .select({ count: sql<number>`count(*)::int` })
      .from(menuItemsTable);

    if ((menuCount?.count ?? 0) === 0) {
      await dbV8.insert(menuItemsTable).values(seedMenu);
    }
  }
}
