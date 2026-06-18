import {
  integer,
  boolean,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  password: text("password").notNull(),
});

export const menuItemsTable = pgTable("menu_items", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  logicalId: integer("logical_id").notNull(),
  entityId: text("entity_id").notNull(),
  name: text("name").notNull(),
  price: integer("price").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  imageUrl: text("image_url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  version: integer("version").notNull().default(1),
  isCurrentVersion: boolean("is_current_version").notNull().default(true),
  supersedes: integer("supersedes"),
  changeReason: text("change_reason"),
  previousPrice: integer("previous_price"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  changedAt: timestamp("changed_at", { withTimezone: true }),
}, (table) => ({
  menuEntityVersionIdx: uniqueIndex("menu_items_entity_version_idx").on(
    table.entityId,
    table.version,
  ),
  menuLogicalVersionIdx: uniqueIndex("menu_items_logical_version_idx").on(
    table.logicalId,
    table.version,
  ),
  menuCurrentVersionIdx: index("menu_items_current_version_idx").on(
    table.isCurrentVersion,
  ),
}));

export const ordersTable = pgTable("orders", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id),
  total: integer("total").notNull().default(0),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
});

export const orderItemsTable = pgTable(
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
    version: integer("version").notNull().default(1),
  },
  (table) => ({
    orderItemUniqueIdx: uniqueIndex("order_items_order_item_idx").on(
      table.orderId,
      table.itemId,
    ),
  }),
);
