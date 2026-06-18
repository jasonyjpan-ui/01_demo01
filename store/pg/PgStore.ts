import { and, asc, desc, eq, leftJoin, sql } from "drizzle-orm";
import type {
  MenuItem,
  Order,
  OrderItem,
  OrderStatus,
  User,
} from "../../shared/contracts.ts";
import { getDb } from "../../db/client.ts";
import {
  menuItemsTable,
  orderItemsTable,
  ordersTable,
  usersTable,
} from "../../db/schema.ts";
import { MenuRepository } from "./MenuRepository.ts";
import type { Store } from "../Store.ts";

interface PgStoreOptions {
  dataFilePath?: string;
}

interface SeedStore {
  users?: User[];
  menu?: MenuItem[];
  orders?: Array<{
    id: number;
    userId: number;
    status: OrderStatus;
    total: number;
    createdAt: string;
    submittedAt?: string;
    items: Array<{ item: MenuItem; qty: number }>;
  }>;
}

function toSafeUser(user: User): Omit<User, "password"> {
  const { password: _password, ...safeUser } = user;
  return safeUser;
}

function calculateTotal(items: ReadonlyArray<OrderItem>): number {
  return items.reduce((sum, item) => sum + item.item.price * item.qty, 0);
}

function parseUserId(userId: string): number | undefined {
  const parsed = Number(userId);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeUserId(userId: string): string {
  const numericId = parseUserId(userId);
  if (numericId !== undefined) {
    return String(numericId).padStart(4, "0");
  }

  return userId.trim();
}

function normalizeSeedData(seed: SeedStore): Required<SeedStore> {
  return {
    users: Array.isArray(seed.users) ? seed.users : [],
    menu: Array.isArray(seed.menu) ? seed.menu : [],
    orders: Array.isArray(seed.orders) ? seed.orders : [],
  };
}

const managedOrderStatuses: OrderStatus[] = [
  "submitted",
  "preparing",
  "ready",
  "completed",
  "cancelled",
];

function normalizeOrderStatus(status: unknown): OrderStatus {
  return status === "submitted" ||
    status === "preparing" ||
    status === "ready" ||
    status === "completed" ||
    status === "cancelled"
    ? status
    : "pending";
}

function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  if (from === "pending") {
    return false;
  }

  if (from === "completed" || from === "cancelled") {
    return false;
  }

  return managedOrderStatuses.includes(to) && to !== "pending";
}

export class PgStore implements Store {
  private readonly dataFilePath: string;
  private readonly menuRepository = new MenuRepository();

  private users: User[] = [];
  private menu: MenuItem[] = [];
  private orders: Order[] = [];

  constructor(options: PgStoreOptions = {}) {
    this.dataFilePath = options.dataFilePath ?? "./data/store.json";
  }

  async init(): Promise<void> {
    await getDb().execute(sql`select 1`);

    await this.seedFromJsonIfEmpty();
    await this.reloadFromDatabase();
  }

  login(input: {
    email: string;
    password: string;
  }):
    | { ok: true; user: Omit<User, "password"> }
    | { ok: false; code: "INVALID_CREDENTIALS" } {
    const matchedUser = this.users.find(
      (user) => user.email === input.email && user.password === input.password,
    );

    if (!matchedUser) {
      return { ok: false, code: "INVALID_CREDENTIALS" };
    }

    return {
      ok: true,
      user: toSafeUser(matchedUser),
    };
  }

  getUserById(userId: string): Omit<User, "password"> | undefined {
    const normalizedUserId = normalizeUserId(userId);
    const user = this.users.find((targetUser) => targetUser.id === normalizedUserId);
    if (!user) {
      return undefined;
    }

    return toSafeUser(user);
  }

  getMenu(): ReadonlyArray<MenuItem> {
    return this.menu;
  }

  async createMenuItem(input: {
    name: string;
    price: number;
    category: string;
    description: string;
    image_url: string;
  }): Promise<MenuItem> {
    const createdItem = await this.menuRepository.createMenuItem(input);
    this.menu.push(createdItem);
    return createdItem;
  }

  async updateMenuItem(
    menuId: number,
    patch: {
      name?: string;
      price?: number;
      category?: string;
      description?: string;
      image_url?: string;
      version?: number;
      changeReason?: string;
    },
  ): Promise<MenuItem | null> {
    const nextItem = await this.menuRepository.updateMenuItem(menuId, patch);
    if (!nextItem) {
      return null;
    }

    const targetIndex = this.menu.findIndex((item) => item.id === menuId);
    if (targetIndex !== -1) {
      this.menu.splice(targetIndex, 1, nextItem);
    } else {
      this.menu.push(nextItem);
    }

    return nextItem;
  }

  async getMenuItemHistory(menuId: number): Promise<Array<{
    id?: number;
    logicalId?: number;
    entityId?: string;
    version: number;
    name: string;
    price: number;
    previousPrice?: number;
    changeReason?: string;
    isCurrentVersion?: boolean;
    supersedes?: number;
    createdAt?: string;
    changedAt?: string;
  }>> {
    const [target] = await getDb()
      .select()
      .from(menuItemsTable)
      .where(eq(menuItemsTable.id, menuId));

    if (!target) {
      return [];
    }

    const rows = await getDb()
      .select()
      .from(menuItemsTable)
      .where(eq(menuItemsTable.logicalId, target.logicalId))
      .orderBy(desc(menuItemsTable.version));

    return rows.map((row) => ({
      id: row.id,
      logicalId: row.logicalId,
      entityId: row.entityId,
      version: row.version,
      name: row.name,
      price: row.price,
      previousPrice: row.previousPrice || undefined,
      changeReason: row.changeReason || undefined,
      isCurrentVersion: row.isCurrentVersion,
      supersedes: row.supersedes || undefined,
      createdAt: row.createdAt?.toISOString(),
      changedAt: row.changedAt?.toISOString(),
    }));
  }

  async getMenuItemHistoryLegacy(menuId: number): Promise<Array<{
    version: number;
    name: string;
    price: number;
    previousPrice?: number;
    changeReason?: string;
    changedAt?: string;
  }>> {
    // 方案：由於 PostgreSQL 中沒有版本歷史表，我們使用簡化方案
    // 僅返回當前項目的版本和變更資訊
    // 在生產環境中應該有單獨的歷史表
    const item = await getDb()
      .select()
      .from(menuItemsTable)
      .where(eq(menuItemsTable.id, menuId));

    if (item.length === 0) {
      return [];
    }

    const current = item[0];
    return [{
      version: current.version,
      name: current.name,
      price: current.price,
      previousPrice: current.previousPrice || undefined,
      changeReason: current.changeReason || undefined,
      changedAt: current.changedAt?.toISOString(),
    }];
  }

  async deleteMenuItem(menuId: number): Promise<MenuItem | null> {
    const removedItem = await this.menuRepository.deleteMenuItem(menuId);

    if (!removedItem) {
      return null;
    }

    const targetIndex = this.menu.findIndex((item) => item.id === menuId);
    if (targetIndex !== -1) {
      this.menu.splice(targetIndex, 1);
    }

    return removedItem;
  }

  async restoreMenuItem(
    menuId: number,
    input: { changeReason?: string } = {},
  ): Promise<MenuItem | null> {
    const restoredItem = await this.menuRepository.restoreMenuItem(menuId, input);

    if (!restoredItem) {
      return null;
    }

    this.menu = this.menu.filter(
      (item) => (item.logicalId ?? item.id) !== restoredItem.logicalId,
    );
    this.menu.push(restoredItem);

    return restoredItem;
  }

  async getArchivedMenuItems(): Promise<MenuItem[]> {
    return await this.menuRepository.getArchivedMenuItems();
  }

  getOrders(): ReadonlyArray<Order> {
    return this.orders;
  }

  getCurrentOrderByUserId(userId: string): Order | undefined {
    const normalizedUserId = normalizeUserId(userId);
    return this.orders.find(
      (order) => order.userId === normalizedUserId && order.status === "pending",
    );
  }

  getOrderHistoryByUserId(userId: string): ReadonlyArray<Order> {
    const normalizedUserId = normalizeUserId(userId);
    return this.orders
      .filter(
        (order) => order.userId === normalizedUserId && order.status !== "pending",
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getOrderById(orderId: number): Order | undefined {
    return this.orders.find((order) => order.id === orderId);
  }

  async createOrder(input: { userId: string }): Promise<Order> {
    const numericId = parseUserId(input.userId);
    if (numericId === undefined) {
      throw new Error("Invalid userId");
    }
    const createdAt = new Date();

    const [inserted] = await getDb()
      .insert(ordersTable)
      .values({
        userId: numericId,
        status: "pending",
        total: 0,
        createdAt,
      })
      .returning();

    if (!inserted) {
      throw new Error("Failed to create order");
    }

    const order: Order = {
      id: inserted.id,
      userId: normalizeUserId(input.userId),
      items: [],
      total: inserted.total,
      status: normalizeOrderStatus(inserted.status),
      createdAt:
        inserted.createdAt instanceof Date
          ? inserted.createdAt.toISOString()
          : new Date(inserted.createdAt).toISOString(),
      submittedAt: inserted.submittedAt
        ? inserted.submittedAt instanceof Date
          ? inserted.submittedAt.toISOString()
          : new Date(inserted.submittedAt).toISOString()
        : undefined,
    };

    this.orders.push(order);
    return order;
  }

  async updateOrderItem(
    orderId: number,
    input: {
      userId: string;
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
    const order = this.orders.find((targetOrder) => targetOrder.id === orderId);
    if (!order) {
      return { ok: false, code: "ORDER_NOT_FOUND" };
    }

    const normalizedInputUserId = normalizeUserId(input.userId);
    if (order.userId !== normalizedInputUserId) {
      return { ok: false, code: "ORDER_NOT_OWNED" };
    }

    if (order.status !== "pending") {
      return { ok: false, code: "ORDER_NOT_EDITABLE" };
    }

    const existingOrderItemIndex = order.items.findIndex(
      (item) => item.item.id === input.itemId,
    );

    if (input.qty === 0) {
      if (existingOrderItemIndex !== -1) {
        await getDb()
          .delete(orderItemsTable)
          .where(
            and(
              eq(orderItemsTable.orderId, orderId),
              eq(orderItemsTable.itemId, input.itemId),
            ),
          );
        order.items.splice(existingOrderItemIndex, 1);
      }

      order.total = calculateTotal(order.items);

      await getDb()
        .update(ordersTable)
        .set({ total: order.total })
        .where(eq(ordersTable.id, orderId));

      return { ok: true, order };
    }

    const menuItem = this.menu.find((item) => item.id === input.itemId);
    if (!menuItem) {
      return { ok: false, code: "MENU_ITEM_NOT_FOUND" };
    }

    if (existingOrderItemIndex !== -1) {
        await getDb()
          .update(orderItemsTable)
          .set({ qty: input.qty, version: menuItem.version })
          .where(
            and(
              eq(orderItemsTable.orderId, orderId),
              eq(orderItemsTable.itemId, input.itemId),
            ),
          );
        const target = order.items[existingOrderItemIndex];
        if (target) {
          target.qty = input.qty;
          target.item = { ...menuItem };
        }
    } else if (input.qty > 0) {
      await getDb().insert(orderItemsTable).values({
        orderId,
        itemId: menuItem.id,
        name: menuItem.name,
        price: menuItem.price,
        category: menuItem.category,
        description: menuItem.description,
        imageUrl: menuItem.image_url,
        qty: input.qty,
        version: menuItem.version,
      });

      order.items.push({
        item: {
          ...menuItem,
        },
        qty: input.qty,
      });
    }

    order.total = calculateTotal(order.items);

    await getDb()
      .update(ordersTable)
      .set({ total: order.total })
      .where(eq(ordersTable.id, orderId));

    return { ok: true, order };
  }

  async submitOrder(
    orderId: number,
    input: { userId: string },
  ): Promise<
    | { ok: true; order: Order }
    | {
        ok: false;
        code:
          | "ORDER_NOT_FOUND"
          | "ORDER_NOT_OWNED"
          | "ORDER_NOT_EDITABLE"
          | "EMPTY_ORDER"
          | "MENU_VERSION_MISMATCH";
      }
  > {
    const order = this.orders.find((targetOrder) => targetOrder.id === orderId);
    if (!order) {
      return { ok: false, code: "ORDER_NOT_FOUND" };
    }

    const normalizedInputUserId = normalizeUserId(input.userId);
    if (order.userId !== normalizedInputUserId) {
      return { ok: false, code: "ORDER_NOT_OWNED" };
    }

    if (order.status !== "pending") {
      return { ok: false, code: "ORDER_NOT_EDITABLE" };
    }

    if (order.items.length === 0) {
      return { ok: false, code: "EMPTY_ORDER" };
    }

    for (const orderItem of order.items) {
      const menuItem = this.menu.find(
        (item) =>
          item.id === orderItem.item.id ||
          (item.logicalId !== undefined &&
            item.logicalId === orderItem.item.logicalId),
      );
      if (!menuItem || menuItem.version !== orderItem.item.version) {
        return { ok: false, code: "MENU_VERSION_MISMATCH" };
      }
    }

    const submittedAt = new Date().toISOString();

    await getDb()
      .update(ordersTable)
      .set({
        status: "submitted",
        submittedAt: new Date(submittedAt),
      })
      .where(eq(ordersTable.id, orderId));

    order.status = "submitted";
    order.submittedAt = submittedAt;

    return { ok: true, order };
  }

  async updateOrderStatus(
    orderId: number,
    input: { status: OrderStatus },
  ): Promise<
    | { ok: true; order: Order }
    | { ok: false; code: "ORDER_NOT_FOUND" | "INVALID_STATUS_TRANSITION" }
  > {
    const order = this.orders.find((targetOrder) => targetOrder.id === orderId);
    if (!order) {
      return { ok: false, code: "ORDER_NOT_FOUND" };
    }

    const nextStatus = normalizeOrderStatus(input.status);
    if (!canTransitionOrderStatus(order.status, nextStatus)) {
      return { ok: false, code: "INVALID_STATUS_TRANSITION" };
    }

    await getDb()
      .update(ordersTable)
      .set({ status: nextStatus })
      .where(eq(ordersTable.id, orderId));

    order.status = nextStatus;

    return { ok: true, order };
  }

  private async seedFromJsonIfEmpty(): Promise<void> {
    const [usersCountRow] = await getDb()
      .select({ value: sql<number>`count(*)` })
      .from(usersTable);

    const usersCount = Number(usersCountRow?.value ?? 0);
    if (usersCount > 0) {
      return;
    }

    const file = Bun.file(this.dataFilePath);
    if (!(await file.exists())) {
      return;
    }

    const rawText = await file.text();
    const parsed = JSON.parse(rawText) as SeedStore;
    const normalized = normalizeSeedData(parsed);

    if (normalized.users.length > 0) {
      await getDb().insert(usersTable).values(
        normalized.users.map((user) => ({
          id: user.id,
          email: user.email,
          name: user.name,
          password: user.password,
        })),
      );
    }

    if (normalized.menu.length > 0) {
      await getDb().insert(menuItemsTable).values(
        normalized.menu.map((item) => ({
          id: item.id,
          logicalId: item.logicalId ?? item.id,
          entityId: item.entityId ?? `menu-${item.id}`,
          name: item.name,
          price: item.price,
          category: item.category,
          description: item.description,
          imageUrl: item.image_url,
          version: item.version,
          isCurrentVersion: item.isCurrentVersion ?? true,
          supersedes: item.supersedes,
          changeReason: item.changeReason,
          previousPrice: item.previousPrice,
          createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
          changedAt: item.changedAt ? new Date(item.changedAt) : null,
        })),
      );
    }

    if (normalized.orders.length > 0) {
      for (const order of normalized.orders) {
        await getDb().insert(ordersTable).values({
          id: order.id,
          userId: order.userId,
          total: order.total,
          status: order.status,
          createdAt: new Date(order.createdAt),
          submittedAt: order.submittedAt ? new Date(order.submittedAt) : null,
        });

        if (order.items.length > 0) {
          await getDb().insert(orderItemsTable).values(
            order.items.map((orderItem) => ({
              orderId: order.id,
              itemId: orderItem.item.id,
              name: orderItem.item.name,
              price: orderItem.item.price,
              category: orderItem.item.category,
              description: orderItem.item.description,
              imageUrl: orderItem.item.image_url,
              qty: orderItem.qty,
              version: orderItem.item.version,
            })),
          );
        }
      }
    }

    await getDb().execute(
      sql`select setval('users_id_seq', coalesce((select max(id) from users), 1), true)`,
    );
    await getDb().execute(
      sql`select setval('menu_items_id_seq', coalesce((select max(id) from menu_items), 1), true)`,
    );
    await getDb().execute(
      sql`select setval('orders_id_seq', coalesce((select max(id) from orders), 1), true)`,
    );
    await getDb().execute(
      sql`select setval('order_items_id_seq', coalesce((select max(id) from order_items), 1), true)`,
    );
  }

  private async reloadFromDatabase(): Promise<void> {
    const userRows = await getDb()
      .select()
      .from(usersTable)
      .orderBy(asc(usersTable.id));
    const menuRows = await getDb()
      .select()
      .from(menuItemsTable)
      .where(eq(menuItemsTable.isCurrentVersion, true))
      .orderBy(asc(menuItemsTable.id));
    const orderRows = await getDb()
      .select()
      .from(ordersTable)
      .orderBy(desc(ordersTable.createdAt), desc(ordersTable.id));
    const orderItemRows = await getDb()
      .select({
        id: orderItemsTable.id,
        orderId: orderItemsTable.orderId,
        itemId: orderItemsTable.itemId,
        name: orderItemsTable.name,
        price: orderItemsTable.price,
        category: orderItemsTable.category,
        description: orderItemsTable.description,
        imageUrl: orderItemsTable.imageUrl,
        qty: orderItemsTable.qty,
        version: orderItemsTable.version,
        logicalId: menuItemsTable.logicalId,
        entityId: menuItemsTable.entityId,
        isCurrentVersion: menuItemsTable.isCurrentVersion,
        currentMenuVersion: menuItemsTable.version,
      })
      .from(orderItemsTable)
      .leftJoin(menuItemsTable, eq(orderItemsTable.itemId, menuItemsTable.id))
      .orderBy(asc(orderItemsTable.id));

    this.users = userRows.map((row) => ({
      id: String(row.id).padStart(4, "0"),
      email: row.email,
      name: row.name,
      password: row.password,
    }));

    this.menu = menuRows.map((row) => ({
      id: row.id,
      logicalId: row.logicalId,
      entityId: row.entityId,
      name: row.name,
      price: row.price,
      category: row.category,
      description: row.description,
      image_url: row.imageUrl,
      version: row.version,
      isCurrentVersion: row.isCurrentVersion,
      supersedes: row.supersedes || undefined,
      changeReason: row.changeReason || undefined,
      previousPrice: row.previousPrice || undefined,
      createdAt: row.createdAt?.toISOString(),
      changedAt: row.changedAt?.toISOString(),
    }));

    const itemsByOrderId = new Map<number, OrderItem[]>();
    for (const row of orderItemRows) {
      const orderItems = itemsByOrderId.get(row.orderId) ?? [];
      orderItems.push({
        item: {
          id: row.itemId,
          logicalId: row.logicalId ?? row.itemId,
          entityId: row.entityId ?? `menu-${row.itemId}`,
          name: row.name,
          price: row.price,
          category: row.category,
          description: row.description,
          image_url: row.imageUrl,
          version: row.version,
          isCurrentVersion: row.isCurrentVersion ?? row.version === row.currentMenuVersion,
        },
        qty: row.qty,
      });
      itemsByOrderId.set(row.orderId, orderItems);
    }

    this.orders = orderRows.map((row) => ({
      id: row.id,
      userId: String(row.userId).padStart(4, "0"),
      items: itemsByOrderId.get(row.id) ?? [],
      total: row.total,
      status: normalizeOrderStatus(row.status),
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : new Date(row.createdAt).toISOString(),
      submittedAt: row.submittedAt
        ? row.submittedAt instanceof Date
          ? row.submittedAt.toISOString()
          : new Date(row.submittedAt).toISOString()
        : undefined,
    }));
  }
}
