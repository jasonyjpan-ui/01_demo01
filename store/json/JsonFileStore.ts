import { mkdir, rename } from "node:fs/promises";
import type {
  MenuItem,
  Order,
  OrderItem,
  OrderStatus,
  UserRole,
} from "../../shared/contracts.ts";
import type { Store } from "../Store.ts";

interface StoredUser {
  id: string;
  email: string;
  name: string;
  password: string;
  role?: UserRole;
}

interface DataStore {
  users: StoredUser[];
  menu: MenuItem[];
  orders: Order[];
  userIdCounter: number;
  menuIdCounter: number;
  orderIdCounter: number;
}

interface JsonFileStoreOptions {
  dataFilePath: string;
}

const defaultMenu: MenuItem[] = [
  {
    id: 1,
    name: "火腿蛋吐司",
    price: 40,
    category: "餐點",
    description: "現煎雞蛋搭配火腿與生菜，使用微烤白吐司，口感清爽不油膩。",
    image_url: "/imgs/menu/ham-egg-toast.webp",
    version: 1,
  },
  {
    id: 2,
    name: "起司豬排堡",
    price: 65,
    category: "餐點",
    description: "厚切豬排搭配起司與生菜，外酥內嫩，適合喜歡有咬勁的你。",
    image_url: "/imgs/menu/cheese-pork-burger.webp",
    version: 1,
  },
  {
    id: 3,
    name: "鮪魚蛋吐司",
    price: 45,
    category: "餐點",
    description: "自調鮪魚沙拉配上煎蛋與生菜，口味濃郁但不會太鹹。",
    image_url: "/imgs/menu/tuna-egg-toast.webp",
    version: 1,
  },
  {
    id: 4,
    name: "培根蛋餅",
    price: 45,
    category: "餐點",
    description: "煎到微酥的蛋餅皮包裹煙燻培根與雞蛋，是經典台式早餐選擇。",
    image_url: "/imgs/menu/bacon-egg-roll.webp",
    version: 1,
  },
];

function cloneDefaultMenu(): MenuItem[] {
  return defaultMenu.map((item) => normalizeMenuItem(item));
}

function calculateOrderTotal(items: OrderItem[]): number {
  return items.reduce((sum, orderItem) => {
    return sum + orderItem.item.price * orderItem.qty;
  }, 0);
}

function normalizeMenuItem(item: Partial<MenuItem>): MenuItem {
  const id = item.id ?? 0;
  const logicalId = item.logicalId ?? id;

  return {
    id,
    logicalId,
    entityId: item.entityId ?? `menu-${logicalId}`,
    name: item.name ?? "",
    price: item.price ?? 0,
    category: item.category ?? "",
    description: item.description ?? "",
    image_url: item.image_url ?? "",
    sortOrder: item.sortOrder ?? id,
    version: item.version ?? 1,
    isCurrentVersion: item.isCurrentVersion ?? true,
    supersedes: item.supersedes,
    changeReason: item.changeReason,
    previousPrice: item.previousPrice,
    createdAt: item.createdAt,
    changedAt: item.changedAt,
  };
}

function compareMenuItems(a: MenuItem, b: MenuItem): number {
  const categoryCompare = a.category.localeCompare(b.category, "zh-Hant");
  if (categoryCompare !== 0) {
    return categoryCompare;
  }

  const sortCompare = (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id);
  return sortCompare !== 0 ? sortCompare : a.id - b.id;
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

function normalizeUserId(rawId: unknown): string {
  if (typeof rawId === "number" && Number.isInteger(rawId) && rawId > 0) {
    return String(rawId).padStart(4, "0");
  }

  if (typeof rawId === "string" && rawId.trim() !== "") {
    const trimmed = rawId.trim();
    if (/^\d+$/.test(trimmed)) {
      return trimmed.padStart(4, "0");
    }
    return trimmed;
  }

  return "0001";
}

function normalizeUserRole(user: Partial<StoredUser>): UserRole {
  if (user.role === "merchant") {
    return "merchant";
  }

  return user.email === "amy@example.com" ? "merchant" : "customer";
}

function normalizeUser(user: Partial<StoredUser>): StoredUser {
  return {
    id: normalizeUserId(user.id),
    email: user.email ?? "",
    name: user.name ?? "",
    password: user.password ?? "",
    role: normalizeUserRole(user),
  };
}

const defaultUsers: StoredUser[] = [
  {
    id: "0001",
    email: "demo@example.com",
    name: "示範使用者",
    password: "1234",
    role: "customer",
  },
  {
    id: "0002",
    email: "amy@example.com",
    name: "Amy",
    password: "1234",
    role: "merchant",
  },
];

function cloneDefaultUsers(): StoredUser[] {
  return defaultUsers.map((user) => ({ ...user }));
}

export class JsonFileStore implements Store {
  private readonly dataFilePath: string;

  private users: StoredUser[] = [];
  private menu: MenuItem[] = [];
  private orders: Order[] = [];
  private userIdCounter = 0;
  private menuIdCounter = 0;
  private orderIdCounter = 0;
  private persistQueue: Promise<void> = Promise.resolve();

  constructor(options: JsonFileStoreOptions) {
    this.dataFilePath = options.dataFilePath;
  }

  async init(): Promise<void> {
    const file = Bun.file(this.dataFilePath);

    if (!(await file.exists())) {
      const initialStore = this.createInitialStore();
      this.applyStore(initialStore);
      await this.saveStore(initialStore);
      return;
    }

    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText) as Partial<DataStore>;

      if (!Array.isArray(parsed.menu) || !Array.isArray(parsed.orders)) {
        throw new Error("Invalid store schema");
      }

      const normalizedUsers = Array.isArray(parsed.users)
        ? parsed.users.map((user) => normalizeUser(user))
        : cloneDefaultUsers();

      const fallbackUserId = normalizedUsers[0]?.id ?? "0001";

      this.applyStore({
        users: normalizedUsers,
        menu: parsed.menu.map((item) => normalizeMenuItem(item)),
        orders: parsed.orders.map((order) => ({
          ...order,
          userId: normalizeUserId(order.userId ?? fallbackUserId),
          items: order.items.map((orderItem) => ({
            ...orderItem,
            item: normalizeMenuItem(orderItem.item),
          })),
          status: normalizeOrderStatus(order.status),
          submittedAt:
            normalizeOrderStatus(order.status) !== "pending"
              ? order.submittedAt
              : undefined,
        })),
        userIdCounter: parsed.userIdCounter ?? 0,
        menuIdCounter: parsed.menuIdCounter ?? 0,
        orderIdCounter: parsed.orderIdCounter ?? 0,
      });
    } catch (error) {
      console.warn("[store] load failed, fallback to initial store", error);
      const initialStore = this.createInitialStore();
      this.applyStore(initialStore);
      await this.saveStore(initialStore);
    }
  }

  getMenu(): ReadonlyArray<MenuItem> {
    return this.menu
      .filter((item) => item.isCurrentVersion !== false)
      .sort(compareMenuItems);
  }

  async createMenuItem(input: {
    name: string;
    price: number;
    category: string;
    description: string;
    image_url: string;
  }): Promise<MenuItem> {
    const id = ++this.menuIdCounter;
    const newMenuItem: MenuItem = {
      id,
      logicalId: id,
      entityId: crypto.randomUUID(),
      name: input.name,
      price: input.price,
      category: input.category,
      description: input.description,
      image_url: input.image_url,
      sortOrder: this.nextSortOrder(input.category),
      version: 1,
      isCurrentVersion: true,
      changeReason: "Initial creation",
      createdAt: new Date().toISOString(),
    };

    this.menu.push(newMenuItem);
    await this.persist();

    return newMenuItem;
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
    const menuItem = this.menu.find(
      (item) => item.id === menuId && item.isCurrentVersion !== false,
    );
    if (!menuItem) {
      return null;
    }

    if (patch.version !== undefined && patch.version !== menuItem.version) {
      return null;
    }

    const oldPrice = menuItem.price;
    const changedAt = new Date().toISOString();
    const newMenuItem: MenuItem = {
      ...menuItem,
      id: ++this.menuIdCounter,
      name: patch.name ?? menuItem.name,
      price: patch.price ?? menuItem.price,
      category: patch.category ?? menuItem.category,
      description: patch.description ?? menuItem.description,
      image_url: patch.image_url ?? menuItem.image_url,
      sortOrder:
        patch.category !== undefined && patch.category !== menuItem.category
          ? this.nextSortOrder(patch.category)
          : menuItem.sortOrder,
      version: menuItem.version + 1,
      isCurrentVersion: true,
      supersedes: menuItem.id,
      changeReason: patch.changeReason,
      previousPrice:
        patch.price !== undefined && patch.price !== oldPrice
          ? oldPrice
          : menuItem.previousPrice,
      createdAt: changedAt,
      changedAt,
    };

    menuItem.isCurrentVersion = false;
    menuItem.changedAt = changedAt;
    this.menu.push(newMenuItem);

    await this.persist();

    return newMenuItem;
  }

  async reorderMenuItem(
    menuId: number,
    input: { direction: "up" | "down" },
  ): Promise<ReadonlyArray<MenuItem> | null> {
    const currentItems = this.getMenu();
    const item = currentItems.find((target) => target.id === menuId);
    if (!item) {
      return null;
    }

    const categoryItems = currentItems.filter(
      (target) => target.category === item.category,
    );
    const itemIndex = categoryItems.findIndex((target) => target.id === menuId);
    const swapIndex = input.direction === "up" ? itemIndex - 1 : itemIndex + 1;
    const swapItem = categoryItems[swapIndex];

    if (!swapItem) {
      return currentItems;
    }

    const itemSortOrder = item.sortOrder ?? item.id;
    item.sortOrder = swapItem.sortOrder ?? swapItem.id;
    swapItem.sortOrder = itemSortOrder;

    await this.persist();
    return this.getMenu();
  }

  async getMenuItemHistory?(
    menuId: number,
  ): Promise<Array<{
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
    const menuItem = this.menu.find((item) => item.id === menuId);
    if (!menuItem) {
      return [];
    }

    const logicalId = menuItem.logicalId ?? menuItem.id;

    return this.menu
      .filter((item) => (item.logicalId ?? item.id) === logicalId)
      .sort((a, b) => b.version - a.version)
      .map((item) => ({
        id: item.id,
        logicalId: item.logicalId,
        entityId: item.entityId,
        version: item.version,
        name: item.name,
        price: item.price,
        previousPrice: item.previousPrice,
        changeReason: item.changeReason,
        isCurrentVersion: item.isCurrentVersion,
        supersedes: item.supersedes,
        createdAt: item.createdAt,
        changedAt: item.changedAt,
      }));
  }

  async getMenuItemHistoryLegacy(
    menuId: number,
  ): Promise<Array<{
    version: number;
    name: string;
    price: number;
    previousPrice?: number;
    changeReason?: string;
    changedAt?: string;
  }>> {
    const menuItem = this.menu.find((item) => item.id === menuId);
    if (!menuItem) {
      return [];
    }

    return [{
      version: menuItem.version,
      name: menuItem.name,
      price: menuItem.price,
      previousPrice: (menuItem as any).previousPrice,
      changeReason: (menuItem as any).changeReason,
      changedAt: undefined, // JSON store 不記錄時間戳
    }];
  }

  async deleteMenuItem(menuId: number): Promise<MenuItem | null> {
    const targetIndex = this.menu.findIndex(
      (item) => item.id === menuId && item.isCurrentVersion !== false,
    );
    if (targetIndex === -1) {
      return null;
    }

    const removedMenuItem = this.menu[targetIndex];
    if (removedMenuItem) {
      removedMenuItem.isCurrentVersion = false;
      removedMenuItem.changedAt = new Date().toISOString();
    }
    await this.persist();

    return removedMenuItem ?? null;
  }

  async restoreMenuItem(
    menuId: number,
    input: { changeReason?: string } = {},
  ): Promise<MenuItem | null> {
    const sourceItem = this.menu.find((item) => item.id === menuId);
    if (!sourceItem) {
      return null;
    }

    const logicalId = sourceItem.logicalId ?? sourceItem.id;
    const versions = this.menu.filter(
      (item) => (item.logicalId ?? item.id) === logicalId,
    );
    const currentItem = versions.find((item) => item.isCurrentVersion !== false);
    const latestVersion = Math.max(...versions.map((item) => item.version));
    const changedAt = new Date().toISOString();

    if (currentItem) {
      currentItem.isCurrentVersion = false;
      currentItem.changedAt = changedAt;
    }

    const restoredItem: MenuItem = {
      ...sourceItem,
      id: ++this.menuIdCounter,
      logicalId,
      version: latestVersion + 1,
      isCurrentVersion: true,
      supersedes: currentItem?.id ?? sourceItem.id,
      changeReason:
        input.changeReason ?? `Restore from version ${sourceItem.version}`,
      previousPrice:
        currentItem && currentItem.price !== sourceItem.price
          ? currentItem.price
          : sourceItem.previousPrice,
      createdAt: changedAt,
      changedAt,
    };

    this.menu.push(restoredItem);
    await this.persist();

    return restoredItem;
  }

  async getArchivedMenuItems(): Promise<MenuItem[]> {
    const byLogicalId = new Map<number, MenuItem[]>();

    for (const item of this.menu) {
      const logicalId = item.logicalId ?? item.id;
      byLogicalId.set(logicalId, [...(byLogicalId.get(logicalId) ?? []), item]);
    }

    return [...byLogicalId.values()]
      .filter((versions) =>
        versions.every((item) => item.isCurrentVersion === false),
      )
      .map((versions) =>
        versions.reduce((latest, item) =>
          item.version > latest.version ? item : latest,
        ),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
  }

  getOrders(): ReadonlyArray<Order> {
    return this.orders;
  }

  getCurrentOrderByUserId(userId: string): Order | undefined {
    const normalizedUserId = normalizeUserId(userId);

    return this.orders.find(
      (order) =>
        normalizeUserId(order.userId) === normalizedUserId &&
        order.status === "pending",
    );
  }

  getOrderHistoryByUserId(userId: string): ReadonlyArray<Order> {
    const normalizedUserId = normalizeUserId(userId);

    return this.orders
      .filter(
        (order) =>
          normalizeUserId(order.userId) === normalizedUserId &&
          order.status !== "pending",
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getOrderById(orderId: number): Order | undefined {
    return this.orders.find((order) => order.id === orderId);
  }

  async createOrder(input: { userId: string }): Promise<Order> {
    const normalizedUserId = normalizeUserId(input.userId);
    const newOrder: Order = {
      id: ++this.orderIdCounter,
      userId: normalizedUserId,
      items: [],
      total: 0,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    this.orders.push(newOrder);
    await this.persist();

    return newOrder;
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

    const normalizedOrderUserId = normalizeUserId(order.userId);
    const normalizedInputUserId = normalizeUserId(input.userId);

    if (normalizedOrderUserId !== normalizedInputUserId) {
      return { ok: false, code: "ORDER_NOT_OWNED" };
    }

    if (order.status !== "pending") {
      return { ok: false, code: "ORDER_NOT_EDITABLE" };
    }

    const existingItemIndex = order.items.findIndex(
      (orderItem) => orderItem.item.id === input.itemId,
    );

    if (input.qty === 0) {
      if (existingItemIndex !== -1) {
        order.items.splice(existingItemIndex, 1);
      }

      order.total = calculateOrderTotal(order.items);
      await this.persist();

      return { ok: true, order };
    }

    const menuItem = this.getMenu().find((item) => item.id === input.itemId);
    if (!menuItem) {
      return { ok: false, code: "MENU_ITEM_NOT_FOUND" };
    }

    if (existingItemIndex !== -1) {
      const existingOrderItem = order.items[existingItemIndex];

      if (existingOrderItem) {
        existingOrderItem.qty = input.qty;
        existingOrderItem.item = { ...menuItem };
      }
    } else if (input.qty > 0) {
      order.items.push({ item: { ...menuItem }, qty: input.qty });
    }

    order.total = calculateOrderTotal(order.items);
    await this.persist();

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

    const normalizedOrderUserId = normalizeUserId(order.userId);
    const normalizedInputUserId = normalizeUserId(input.userId);

    if (normalizedOrderUserId !== normalizedInputUserId) {
      return { ok: false, code: "ORDER_NOT_OWNED" };
    }

    if (order.status !== "pending") {
      return { ok: false, code: "ORDER_NOT_EDITABLE" };
    }

    if (order.items.length === 0) {
      return { ok: false, code: "EMPTY_ORDER" };
    }

    for (const orderItem of order.items) {
      const menuItem = this.getMenu().find(
        (item) => item.id === orderItem.item.id,
      );
      if (!menuItem || menuItem.version !== orderItem.item.version) {
        return { ok: false, code: "MENU_VERSION_MISMATCH" };
      }
    }

    order.status = "submitted";
    order.submittedAt = new Date().toISOString();
    await this.persist();

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

    order.status = nextStatus;
    await this.persist();

    return { ok: true, order };
  }

  private createInitialStore(): DataStore {
    return {
      users: cloneDefaultUsers(),
      menu: cloneDefaultMenu(),
      orders: [],
      userIdCounter: defaultUsers.length,
      menuIdCounter: defaultMenu.length,
      orderIdCounter: 0,
    };
  }

  private applyStore(store: DataStore): void {
    this.users = store.users;
    this.menu = this.normalizeSortOrders(store.menu);
    this.orders = store.orders;

    const maxUserId = this.users.reduce((max, user) => {
      const asNumber = Number.parseInt(user.id, 10);
      return Number.isFinite(asNumber) ? Math.max(max, asNumber) : max;
    }, 0);

    const maxMenuId = this.menu.reduce(
      (max, item) => Math.max(max, item.id),
      0,
    );
    const maxOrderId = this.orders.reduce(
      (max, order) => Math.max(max, order.id),
      0,
    );

    this.userIdCounter = Math.max(store.userIdCounter || 0, maxUserId);
    this.menuIdCounter = Math.max(store.menuIdCounter || 0, maxMenuId);
    this.orderIdCounter = Math.max(store.orderIdCounter || 0, maxOrderId);
  }

  private nextSortOrder(category: string): number {
    const maxSortOrder = this.menu
      .filter(
        (item) =>
          item.isCurrentVersion !== false && item.category === category,
      )
      .reduce(
        (max, item) => Math.max(max, item.sortOrder ?? item.id),
        0,
      );

    return maxSortOrder + 1;
  }

  private normalizeSortOrders(menu: MenuItem[]): MenuItem[] {
    const currentByCategory = new Map<string, MenuItem[]>();
    const normalized = menu.map((item) => ({ ...item }));

    for (const item of normalized) {
      if (item.isCurrentVersion === false) {
        continue;
      }

      currentByCategory.set(item.category, [
        ...(currentByCategory.get(item.category) ?? []),
        item,
      ]);
    }

    for (const categoryItems of currentByCategory.values()) {
      categoryItems
        .sort((a, b) => (a.sortOrder ?? a.id) - (b.sortOrder ?? b.id))
        .forEach((item, index) => {
          item.sortOrder = index + 1;
        });
    }

    return normalized;
  }

  private buildStoreSnapshot(): DataStore {
    return {
      users: this.users,
      menu: this.menu,
      orders: this.orders,
      userIdCounter: this.userIdCounter,
      menuIdCounter: this.menuIdCounter,
      orderIdCounter: this.orderIdCounter,
    };
  }

  private async saveStore(snapshot: DataStore): Promise<void> {
    await mkdir("./data", { recursive: true });
    const tmpPath = `${this.dataFilePath}.tmp`;
    await Bun.write(tmpPath, JSON.stringify(snapshot, null, 2));
    await rename(tmpPath, this.dataFilePath);
  }

  private async persist(): Promise<void> {
    const snapshot = this.buildStoreSnapshot();

    this.persistQueue = this.persistQueue.then(async () => {
      await this.saveStore(snapshot);
    });

    await this.persistQueue;
  }
}
