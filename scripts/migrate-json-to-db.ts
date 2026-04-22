import { sql } from "drizzle-orm";
import type { MenuItem, Order, User } from "../shared/contracts.ts";
import { db } from "../db/client.ts";
import {
  menuItemsTable,
  orderItemsTable,
  ordersTable,
  usersTable,
} from "../db/schema.ts";

interface SeedData {
  users: User[];
  menu: MenuItem[];
  orders: Order[];
}

function isResetMode() {
  return Bun.argv.includes("--reset");
}

function calculateTotal(order: Order) {
  return order.items.reduce(
    (sum, orderItem) => sum + orderItem.item.price * orderItem.qty,
    0,
  );
}

function normalizeSeedData(raw: Partial<SeedData>): SeedData {
  return {
    users: Array.isArray(raw.users) ? raw.users : [],
    menu: Array.isArray(raw.menu) ? raw.menu : [],
    orders: Array.isArray(raw.orders) ? raw.orders : [],
  };
}

async function ensureSafeToImport(resetMode: boolean) {
  const [usersCountRow] = await db
    .select({ value: sql<number>`count(*)` })
    .from(usersTable);

  const [menuCountRow] = await db
    .select({ value: sql<number>`count(*)` })
    .from(menuItemsTable);

  const [ordersCountRow] = await db
    .select({ value: sql<number>`count(*)` })
    .from(ordersTable);

  const hasExistingData =
    Number(usersCountRow?.value ?? 0) > 0 ||
    Number(menuCountRow?.value ?? 0) > 0 ||
    Number(ordersCountRow?.value ?? 0) > 0;

  if (hasExistingData && !resetMode) {
    throw new Error(
      "Database already contains data. Re-run with --reset if you want to replace it.",
    );
  }

  if (resetMode) {
    await db.execute(
      sql`truncate table order_items, orders, menu_items, users restart identity cascade`,
    );
  }
}

async function importSeedData(seed: SeedData) {
  if (seed.users.length > 0) {
    await db.insert(usersTable).values(
      seed.users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        password: user.password,
      })),
    );
  }

  if (seed.menu.length > 0) {
    await db.insert(menuItemsTable).values(
      seed.menu.map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        category: item.category,
        description: item.description,
        imageUrl: item.image_url,
      })),
    );
  }

  for (const order of seed.orders) {
    const computedTotal = calculateTotal(order);

    await db.insert(ordersTable).values({
      id: order.id,
      userId: order.userId,
      total: computedTotal,
      status: order.status,
      createdAt: new Date(order.createdAt),
      submittedAt: order.submittedAt ? new Date(order.submittedAt) : null,
    });

    if (order.items.length > 0) {
      await db.insert(orderItemsTable).values(
        order.items.map((orderItem) => ({
          orderId: order.id,
          itemId: orderItem.item.id,
          name: orderItem.item.name,
          price: orderItem.item.price,
          category: orderItem.item.category,
          description: orderItem.item.description,
          imageUrl: orderItem.item.image_url,
          qty: orderItem.qty,
        })),
      );
    }
  }

  await db.execute(
    sql`select setval('users_id_seq', coalesce((select max(id) from users), 1), true)`,
  );
  await db.execute(
    sql`select setval('menu_items_id_seq', coalesce((select max(id) from menu_items), 1), true)`,
  );
  await db.execute(
    sql`select setval('orders_id_seq', coalesce((select max(id) from orders), 1), true)`,
  );
  await db.execute(
    sql`select setval('order_items_id_seq', coalesce((select max(id) from order_items), 1), true)`,
  );
}

async function verifyImport(seed: SeedData) {
  const [usersCountRow] = await db
    .select({ value: sql<number>`count(*)` })
    .from(usersTable);
  const [menuCountRow] = await db
    .select({ value: sql<number>`count(*)` })
    .from(menuItemsTable);
  const [ordersCountRow] = await db
    .select({ value: sql<number>`count(*)` })
    .from(ordersTable);
  const [orderItemsCountRow] = await db
    .select({ value: sql<number>`count(*)` })
    .from(orderItemsTable);

  const jsonOrderItemsCount = seed.orders.reduce(
    (sum, order) => sum + order.items.length,
    0,
  );

  console.log("JSON -> PostgreSQL migration summary:");
  console.log(`users: ${seed.users.length} -> ${Number(usersCountRow?.value ?? 0)}`);
  console.log(`menu: ${seed.menu.length} -> ${Number(menuCountRow?.value ?? 0)}`);
  console.log(
    `orders: ${seed.orders.length} -> ${Number(ordersCountRow?.value ?? 0)}`,
  );
  console.log(
    `order_items: ${jsonOrderItemsCount} -> ${Number(orderItemsCountRow?.value ?? 0)}`,
  );

  const sampleOrders = seed.orders.slice(0, 3);
  for (const order of sampleOrders) {
    const [row] = await db
      .select({
        total: ordersTable.total,
        status: ordersTable.status,
        submittedAt: ordersTable.submittedAt,
        itemCount: sql<number>`(
          select count(*)
          from ${orderItemsTable}
          where ${orderItemsTable.orderId} = ${order.id}
        )`,
      })
      .from(ordersTable)
      .where(sql`${ordersTable.id} = ${order.id}`);

    console.log(
      `order ${order.id}: total=${row?.total ?? "missing"} itemCount=${Number(row?.itemCount ?? 0)} status=${row?.status ?? "missing"} submittedAt=${row?.submittedAt ? "set" : "null"}`,
    );
  }
}

async function main() {
  if (process.env.STORE_DRIVER !== "postgres") {
    throw new Error(
      `STORE_DRIVER must be "postgres" to run this script. Received: ${process.env.STORE_DRIVER ?? "(missing)"}`,
    );
  }

  const file = Bun.file("./data/store.json");
  if (!(await file.exists())) {
    throw new Error("data/store.json not found.");
  }

  const raw = JSON.parse(await file.text()) as Partial<SeedData>;
  const seed = normalizeSeedData(raw);

  await ensureSafeToImport(isResetMode());
  await importSeedData(seed);
  await verifyImport(seed);
}

main().catch((error) => {
  console.error("JSON -> PostgreSQL migration: FAILED");
  console.error(error);
  process.exit(1);
});
