export type UserRole = "customer" | "merchant";

export interface MenuItem {
  id: number;
  logicalId?: number;
  entityId?: string;
  name: string;
  price: number;
  category: string;
  description: string;
  image_url: string;
  version: number;
  isCurrentVersion?: boolean;
  supersedes?: number;
  changeReason?: string;
  previousPrice?: number;
  createdAt?: string;
  changedAt?: string;
}

export interface MenuItemHistory {
  id: number;
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
}

export interface User {
  id: string;
  email: string;
  name: string;
  role?: UserRole;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role?: UserRole;
}

export interface OrderItem {
  item: MenuItem;
  qty: number;
}

export interface Order {
  id: number;
  userId: string;
  items: OrderItem[];
  total: number;
  status: "pending" | "submitted";
  createdAt: string;
  submittedAt?: string;
}

export interface OrderResponse extends Order {
  createdAtTaipei: string;
}

export interface ApiDataResponse<T> {
  data: T;
}

export interface ApiErrorResponse {
  error: string;
  message?: string;
}
