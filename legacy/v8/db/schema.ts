import {
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const V8_DB_SCHEMA = process.env.V8_DB_SCHEMA?.trim() || "v8_legacy";

const v8Schema = pgSchema(V8_DB_SCHEMA);

export const usersTable = v8Schema.table(
  "users",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    password: text("password").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    usersEmailUniqueIdx: uniqueIndex("v8_users_email_idx").on(table.email),
  }),
);

export const menuItemsTable = v8Schema.table("menu_items", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  name: text("name").notNull(),
  price: integer("price").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  imageUrl: text("image_url").notNull(),
});

export const ordersTable = v8Schema.table(
  "orders",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id),
    total: integer("total").notNull().default(0),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
  },
  (table) => ({
    ordersUserIdIdx: index("v8_orders_user_id_idx").on(table.userId),
  }),
);

export const orderItemsTable = v8Schema.table(
  "order_items",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    orderId: integer("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    itemId: integer("item_id").notNull(),
    name: text("name").notNull(),
    price: integer("price").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    imageUrl: text("image_url").notNull(),
    qty: integer("qty").notNull(),
  },
  (table) => ({
    orderItemUniqueIdx: uniqueIndex("v8_order_items_order_item_idx").on(
      table.orderId,
      table.itemId,
    ),
  }),
);
