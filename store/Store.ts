import type { MenuItem, Order, OrderStatus } from "../shared/contracts.ts";

export type UpdateOrderItemErrorCode =
  | "ORDER_NOT_FOUND"
  | "MENU_ITEM_NOT_FOUND"
  | "ORDER_NOT_OWNED"
  | "ORDER_NOT_EDITABLE";

export type SubmitOrderErrorCode =
  | "ORDER_NOT_FOUND"
  | "ORDER_NOT_OWNED"
  | "ORDER_NOT_EDITABLE"
  | "EMPTY_ORDER"
  | "MENU_VERSION_MISMATCH";

export type UpdateOrderStatusErrorCode =
  | "ORDER_NOT_FOUND"
  | "INVALID_STATUS_TRANSITION";

export interface Store {
  init(): Promise<void>;

  getMenu(): ReadonlyArray<MenuItem>;
  createMenuItem(input: {
    name: string;
    price: number;
    category: string;
    description: string;
    image_url: string;
  }): Promise<MenuItem>;
  updateMenuItem(
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
  ): Promise<MenuItem | null>;
  deleteMenuItem(menuId: number): Promise<MenuItem | null>;
  restoreMenuItem?(
    menuId: number,
    input?: { changeReason?: string },
  ): Promise<MenuItem | null>;
  getArchivedMenuItems?(): Promise<MenuItem[]>;
  getMenuItemHistory?(menuId: number): Promise<Array<{
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
  }>>;

  getOrders(): ReadonlyArray<Order>;
  getCurrentOrderByUserId(userId: string): Order | undefined;
  getOrderHistoryByUserId(userId: string): ReadonlyArray<Order>;
  getOrderById(orderId: number): Order | undefined;
  createOrder(input: { userId: string }): Promise<Order>;
  updateOrderItem(
    orderId: number,
    input: {
      userId: string;
      itemId: number;
      qty: number;
    },
  ): Promise<
    { ok: true; order: Order } | { ok: false; code: UpdateOrderItemErrorCode }
  >;
  submitOrder(
    orderId: number,
    input: { userId: string },
  ): Promise<
    { ok: true; order: Order } | { ok: false; code: SubmitOrderErrorCode }
  >;
  updateOrderStatus?(
    orderId: number,
    input: { status: OrderStatus },
  ): Promise<
    | { ok: true; order: Order }
    | { ok: false; code: UpdateOrderStatusErrorCode }
  >;
}
