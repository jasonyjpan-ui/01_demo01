import type { MenuItem, Order, SafeUser } from "../contracts.ts";

export interface StoreV8 {
  init(): Promise<void>;

  login(input: {
    email: string;
    password: string;
  }): Promise<{ ok: true; user: SafeUser } | { ok: false }>;

  getUserById(userId: number): Promise<SafeUser | null>;

  getMenu(): Promise<ReadonlyArray<MenuItem>>;

  getCurrentOrderByUserId(userId: number): Promise<Order | undefined>;

  getOrderHistoryByUserId(userId: number): Promise<ReadonlyArray<Order>>;

  getOrderById(orderId: number): Promise<Order | undefined>;

  createOrder(input: { userId: number }): Promise<Order>;

  updateOrderItem(
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
  >;

  submitOrder(
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
  >;
}
