import { useEffect, useMemo, useState } from "react";
import "./App.css";
import type {
  ApiDataResponse,
  MenuItem,
  Order,
  User,
} from "../../shared/contracts.ts";
import { CartValidation } from "./CartValidation";
import { OrderSubmitError } from "./OrderSubmitError";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const USER_STORAGE_KEY = "breakfast.user";

type SafeUser = Omit<User, "password">;

function buildApiUrl(path: string) {
  return `${apiBaseUrl}${path}`;
}

function normalizeUserId(rawId: unknown): string | null {
  if (typeof rawId === "string" && rawId.trim() !== "") {
    const trimmed = rawId.trim();
    if (/^\d+$/.test(trimmed)) {
      return trimmed.padStart(4, "0");
    }
    return trimmed;
  }

  if (typeof rawId === "number" && Number.isInteger(rawId) && rawId > 0) {
    return String(rawId).padStart(4, "0");
  }

  return null;
}

function sameLogicalItem(a: MenuItem, b: MenuItem): boolean {
  return (
    a.id === b.id ||
    (a.logicalId !== undefined &&
      b.logicalId !== undefined &&
      a.logicalId === b.logicalId)
  );
}

function formatDateTime(value?: string) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("zh-TW");
}

function decodeGoogleLoginUser(rawUser: string): SafeUser | null {
  try {
    const base64 = rawUser.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - base64.length % 4) % 4), "=");
    const decoded = decodeURIComponent(
      Array.from(atob(padded), (char) =>
        `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`,
      ).join(""),
    );
    const parsed = JSON.parse(decoded) as Partial<SafeUser>;

    if (
      typeof parsed.id === "string" &&
      typeof parsed.email === "string" &&
      typeof parsed.name === "string"
    ) {
      return {
        id: parsed.id,
        email: parsed.email,
        name: parsed.name,
      };
    }
  } catch (error) {
    console.error(error);
  }

  return null;
}

export default function App() {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [emailInput, setEmailInput] = useState("demo@example.com");
  const [passwordInput, setPasswordInput] = useState("1234");
  const [authError, setAuthError] = useState("");
  const [googleLoginConfigured, setGoogleLoginConfigured] = useState(false);
  const [googleRedirectUri, setGoogleRedirectUri] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [archivedItems, setArchivedItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [orderId, setOrderId] = useState<number | null>(null);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [cartQtyByItemId, setCartQtyByItemId] = useState<Record<number, number>>(
    {},
  );
  const [cartTotal, setCartTotal] = useState(0);
  const [activeItemId, setActiveItemId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isClearingCart, setIsClearingCart] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [submitError, setSubmitError] = useState<{
    error: string;
    details?: {
      staleItems?: Array<{
        id: number;
        name: string;
        orderedPrice: number;
        currentPrice?: number;
        reason: string;
      }>;
      message?: string;
    };
  } | null>(null);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [editingMenuItem, setEditingMenuItem] = useState<MenuItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editReason, setEditReason] = useState("");
  const [menuActionId, setMenuActionId] = useState<number | null>(null);
  const [menuHistoryItem, setMenuHistoryItem] = useState<MenuItem | null>(null);
  const [menuHistory, setMenuHistory] = useState<MenuItem[]>([]);
  const [menuHistoryLoading, setMenuHistoryLoading] = useState(false);

  function syncCartFromOrder(order: Order) {
    setCurrentOrder(order);
    const nextQtyByItemId = order.items.reduce(
      (acc, orderItem) => {
        acc[orderItem.item.id] = orderItem.qty;
        return acc;
      },
      {} as Record<number, number>,
    );

    setCartQtyByItemId(nextQtyByItemId);
    setCartTotal(order.total);
  }

  function resetCartState() {
    setOrderId(null);
    setCartQtyByItemId({});
    setCartTotal(0);
    setCurrentOrder(null);
  }

  async function loadMenu(): Promise<MenuItem[]> {
    const response = await fetch(buildApiUrl("/api/menu"));
    if (!response.ok) {
      throw new Error(`Load menu failed: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as ApiDataResponse<MenuItem[]>;
    const fetchedItems = Array.isArray(payload?.data) ? payload.data : [];
    setItems(fetchedItems);
    return fetchedItems;
  }

  async function loadArchivedMenu(): Promise<MenuItem[]> {
    const response = await fetch(buildApiUrl("/api/menu/archived"));
    if (!response.ok) {
      throw new Error(`Load archived menu failed: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as ApiDataResponse<MenuItem[]>;
    const fetchedItems = Array.isArray(payload?.data) ? payload.data : [];
    setArchivedItems(fetchedItems);
    return fetchedItems;
  }

  async function loadCurrentOrder(targetUserId: string): Promise<Order | null> {
    const response = await fetch(
      buildApiUrl(`/api/orders/current?userId=${targetUserId}`),
    );

    if (!response.ok) {
      throw new Error(`Load current order failed: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as ApiDataResponse<Order | null>;
    const activeOrder = payload?.data;

    if (!activeOrder) {
      resetCartState();
      return null;
    }

    setOrderId(activeOrder.id);
    syncCartFromOrder(activeOrder);
    return activeOrder;
  }

  async function loadOrderHistory(targetUserId: string): Promise<void> {
    setHistoryLoading(true);

    try {
      const response = await fetch(
        buildApiUrl(`/api/orders/history?userId=${targetUserId}`),
      );

      if (!response.ok) {
        throw new Error(`Load history failed: HTTP ${response.status}`);
      }

      const payload = (await response.json()) as ApiDataResponse<Order[]>;
      setHistoryOrders(Array.isArray(payload?.data) ? payload.data : []);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function refreshUserOrders(targetUserId: string): Promise<void> {
    await Promise.all([
      loadCurrentOrder(targetUserId),
      loadOrderHistory(targetUserId),
    ]);
  }

  useEffect(() => {
    let mounted = true;

    const currentUrl = new URL(window.location.href);
    const googleLoginResult = currentUrl.searchParams.get("googleLogin");
    const googleLoginUser = currentUrl.searchParams.get("user");
    const googleLoginMessage = currentUrl.searchParams.get("message");

    if (googleLoginResult) {
      currentUrl.searchParams.delete("googleLogin");
      currentUrl.searchParams.delete("user");
      currentUrl.searchParams.delete("message");
      window.history.replaceState({}, "", currentUrl.toString());

      if (googleLoginResult === "success" && googleLoginUser) {
        const decodedUser = decodeGoogleLoginUser(googleLoginUser);
        if (decodedUser) {
          setUser(decodedUser);
          window.localStorage.setItem(
            USER_STORAGE_KEY,
            JSON.stringify(decodedUser),
          );
        } else {
          setAuthError("Google 登入回傳資料無法解析。");
        }
      } else {
        setAuthError(googleLoginMessage || "Google 登入失敗。");
      }
    }

    const savedUser = window.localStorage.getItem(USER_STORAGE_KEY);
    if (!googleLoginResult && savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser) as Partial<SafeUser>;
        const normalizedUserId = normalizeUserId(parsedUser.id);
        if (
          normalizedUserId &&
          typeof parsedUser.email === "string" &&
          typeof parsedUser.name === "string"
        ) {
          setUser({
            id: normalizedUserId,
            email: parsedUser.email,
            name: parsedUser.name,
          });
        }
      } catch {
        window.localStorage.removeItem(USER_STORAGE_KEY);
      }
    }

    const loadGoogleStatus = async () => {
      const response = await fetch(buildApiUrl("/api/auth/google/status"));
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as ApiDataResponse<{
        configured: boolean;
        redirectUri: string;
      }>;

      if (mounted) {
        setGoogleLoginConfigured(Boolean(payload.data?.configured));
        setGoogleRedirectUri(payload.data?.redirectUri ?? "");
      }
    };

    Promise.all([loadMenu(), loadArchivedMenu(), loadGoogleStatus()])
      .catch((fetchError) => {
        if (mounted) {
          setError("菜單讀取失敗，請稍後再試。");
          console.error(fetchError);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setHistoryOrders([]);
      resetCartState();
      return;
    }

    void refreshUserOrders(user.id).catch((refreshError) => {
      setActionError("讀取使用者訂單失敗，請稍後再試。");
      console.error(refreshError);
    });
  }, [user]);

  const grouped = useMemo(() => {
    const groupedItems = items.reduce(
      (acc, item) => {
        const category = item?.category || "未分類";
        if (!acc[category]) {
          acc[category] = [];
        }
        acc[category].push(item);
        return acc;
      },
      {} as Record<string, MenuItem[]>,
    );

    const categories = Object.keys(groupedItems).sort((a, b) =>
      a.localeCompare(b, "zh-Hant"),
    );

    return { groupedItems, categories };
  }, [items]);

  const cartItemCount = useMemo(
    () => Object.values(cartQtyByItemId).reduce((sum, qty) => sum + qty, 0),
    [cartQtyByItemId],
  );

  const cartDetails = useMemo(() => {
    const itemById = new Map(items.map((item) => [item.id, item]));
    const orderItemById = new Map(
      (currentOrder?.items ?? []).map((orderItem) => [
        orderItem.item.id,
        orderItem.item,
      ]),
    );

    return Object.entries(cartQtyByItemId)
      .map(([itemIdText, qty]) => {
        const itemId = Number(itemIdText);
        const item = itemById.get(itemId) ?? orderItemById.get(itemId);
        if (!item || qty <= 0) {
          return null;
        }

        return {
          itemId,
          qty,
          item,
          subtotal: item.price * qty,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }, [cartQtyByItemId, currentOrder, items]);

  async function ensureOrder(): Promise<number> {
    if (!user) {
      throw new Error("Please login first");
    }

    if (orderId !== null) {
      return orderId;
    }

    const response = await fetch(buildApiUrl("/api/orders"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id }),
    });

    if (!response.ok) {
      if ([401, 403, 404].includes(response.status)) {
        window.localStorage.removeItem(USER_STORAGE_KEY);
        setUser(null);
        setAuthError("登入狀態已失效，請重新登入。");
        setActionError("登入狀態已失效，請重新登入。");
        setHistoryOrders([]);
        resetCartState();
        throw new Error(`Auth expired: HTTP ${response.status}`);
      }

      throw new Error(`Create order failed: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as ApiDataResponse<Order>;
    const createdOrderId = payload?.data?.id;

    if (!createdOrderId) {
      throw new Error("Create order failed: invalid payload");
    }

    setOrderId(createdOrderId);
    return createdOrderId;
  }

  async function handleLogin(): Promise<void> {
    setAuthError("");
    setActionError("");
    setIsLoggingIn(true);

    try {
      const response = await fetch(buildApiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailInput.trim(),
          password: passwordInput,
        }),
      });

      if (!response.ok) {
        throw new Error(`Login failed: HTTP ${response.status}`);
      }

      const payload = (await response.json()) as ApiDataResponse<SafeUser>;
      const loggedInUser = payload?.data;

      if (!loggedInUser) {
        throw new Error("Login failed: invalid payload");
      }

      setUser(loggedInUser);
      window.localStorage.setItem(
        USER_STORAGE_KEY,
        JSON.stringify(loggedInUser),
      );
    } catch (loginError) {
      setAuthError("登入失敗，請確認帳號與密碼。");
      console.error(loginError);
    } finally {
      setIsLoggingIn(false);
    }
  }

  function handleLogout() {
    window.localStorage.removeItem(USER_STORAGE_KEY);
    setUser(null);
    setAuthError("");
    setActionError("");
    resetCartState();
  }

  function handleGoogleLogin() {
    window.location.href = buildApiUrl("/api/auth/google/start");
  }

  async function addToCart(item: MenuItem): Promise<void> {
    setActionError("");
    setActiveItemId(item.id);

    try {
      if (!user) {
        throw new Error("Please login first");
      }

      const targetOrderId = await ensureOrder();
      const currentQty = cartQtyByItemId[item.id] ?? 0;
      const nextQty = currentQty + 1;

      const response = await fetch(buildApiUrl(`/api/orders/${targetOrderId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          itemId: item.id,
          qty: nextQty,
        }),
      });

      if (!response.ok) {
        throw new Error(`Update order failed: HTTP ${response.status}`);
      }

      const payload = (await response.json()) as ApiDataResponse<Order>;
      const updatedOrder = payload?.data;

      if (!updatedOrder) {
        throw new Error("Update order failed: invalid payload");
      }

      syncCartFromOrder(updatedOrder);
    } catch (cartError) {
      if (
        cartError instanceof Error &&
        cartError.message.startsWith("Auth expired:")
      ) {
        return;
      }

      if (user) {
        try {
          const recoveredOrder = await loadCurrentOrder(user.id);
          const recoveredQty = recoveredOrder?.items.find(
            (orderItem) => orderItem.item.id === item.id,
          )?.qty;

          if (typeof recoveredQty === "number" && recoveredQty > 0) {
            return;
          }
        } catch (recoveryError) {
          console.error(recoveryError);
        }
      }

      setActionError("加入購物車失敗，請稍後再試。");
      console.error(cartError);
    } finally {
      setActiveItemId(null);
    }
  }

  async function clearCart(): Promise<void> {
    if (!user || orderId === null || cartDetails.length === 0) {
      return;
    }

    setActionError("");
    setIsClearingCart(true);

    try {
      for (const detail of cartDetails) {
        const response = await fetch(buildApiUrl(`/api/orders/${orderId}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            itemId: detail.itemId,
            qty: 0,
          }),
        });

        if (!response.ok) {
          throw new Error(`Clear cart failed: HTTP ${response.status}`);
        }
      }

      resetCartState();
    } catch (clearError) {
      setActionError("清空購物車失敗，請稍後再試。");
      console.error(clearError);
    } finally {
      setIsClearingCart(false);
    }
  }

  async function submitOrder(): Promise<void> {
    if (!user || orderId === null || cartDetails.length === 0) {
      return;
    }

    setActionError("");
    setSubmitError(null);
    setIsSubmittingOrder(true);

    try {
      const response = await fetch(
        buildApiUrl(`/api/orders/${orderId}/submit`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id }),
        },
      );

      if (!response.ok) {
        const errorPayload = await response.json();
        if (response.status === 409 && errorPayload?.details) {
          setSubmitError({
            error:
              errorPayload.error ||
              "Menu version mismatch: order contains stale item data",
            details: errorPayload.details,
          });
          return;
        }

        if (response.status === 400 && errorPayload?.error) {
          setActionError(errorPayload.error);
          return;
        }

        throw new Error(`Submit order failed: HTTP ${response.status}`);
      }

      const payload = (await response.json()) as ApiDataResponse<Order>;
      if (payload?.data) {
        resetCartState();
        setIsCartOpen(false);
        await loadOrderHistory(user.id);
      }
    } catch (submitError) {
      console.error(submitError);
      setActionError("送出訂單失敗，請稍後再試。");
    } finally {
      setIsSubmittingOrder(false);
    }
  }

  async function handleRemoveStaleItems(): Promise<void> {
    if (!user || !currentOrder || orderId === null) {
      return;
    }

    const staleItemIds = new Set<number>();
    currentOrder.items.forEach((orderItem) => {
      const currentMenu = items.find((menuItem) =>
        sameLogicalItem(menuItem, orderItem.item),
      );
      if (!currentMenu || currentMenu.version !== orderItem.item.version) {
        staleItemIds.add(orderItem.item.id);
      }
    });

    for (const itemId of staleItemIds) {
      try {
        const response = await fetch(buildApiUrl(`/api/orders/${orderId}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            itemId,
            qty: 0,
          }),
        });

        if (!response.ok) {
          throw new Error(`Remove stale item failed: HTTP ${response.status}`);
        }

        const payload = (await response.json()) as ApiDataResponse<Order>;
        if (payload?.data) {
          syncCartFromOrder(payload.data);
        }
      } catch (removeError) {
        console.error(`Failed to remove item ${itemId}:`, removeError);
      }
    }

    setSubmitError(null);
  }

  async function handleApplyLatestCartItems(): Promise<void> {
    if (!user || !currentOrder || orderId === null) {
      return;
    }

    setActionError("");

    try {
      const latestMenu = await loadMenu();
      let latestOrder: Order | null = currentOrder;

      for (const orderItem of currentOrder.items) {
        const currentMenu = latestMenu.find((menuItem) =>
          sameLogicalItem(menuItem, orderItem.item),
        );

        if (!currentMenu || currentMenu.version === orderItem.item.version) {
          continue;
        }

        const removeResponse = await fetch(buildApiUrl(`/api/orders/${orderId}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            itemId: orderItem.item.id,
            qty: 0,
          }),
        });

        if (!removeResponse.ok) {
          throw new Error(`Remove stale item failed: HTTP ${removeResponse.status}`);
        }

        const addResponse = await fetch(buildApiUrl(`/api/orders/${orderId}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            itemId: currentMenu.id,
            qty: orderItem.qty,
          }),
        });

        if (!addResponse.ok) {
          throw new Error(`Apply latest item failed: HTTP ${addResponse.status}`);
        }

        const payload = (await addResponse.json()) as ApiDataResponse<Order>;
        latestOrder = payload.data;
      }

      if (latestOrder) {
        syncCartFromOrder(latestOrder);
      } else {
        await loadCurrentOrder(user.id);
      }

      setSubmitError(null);
    } catch (applyError) {
      console.error(applyError);
      setActionError("套用最新價格失敗，請稍後再試。");
    }
  }

  async function handleRefreshMenuFromError(): Promise<void> {
    if (!user) {
      return;
    }

    try {
      await loadMenu();
      await loadCurrentOrder(user.id);
      setSubmitError(null);
    } catch (refreshError) {
      console.error(refreshError);
      setActionError("重新整理菜單失敗，請稍後再試。");
    }
  }

  function startMenuEdit(item: MenuItem): void {
    setEditingMenuItem(item);
    setEditName(item.name);
    setEditPrice(String(item.price));
    setEditReason("");
  }

  async function submitMenuEdit(): Promise<void> {
    if (!editingMenuItem) {
      return;
    }

    const nextPrice = Number(editPrice);
    if (!Number.isFinite(nextPrice) || nextPrice < 0) {
      setActionError("請輸入有效價格。");
      return;
    }

    if (!editReason.trim()) {
      setActionError("請填寫本次變更原因。");
      return;
    }

    setActionError("");
    setMenuActionId(editingMenuItem.id);

    try {
      const response = await fetch(buildApiUrl(`/api/menu/${editingMenuItem.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          price: nextPrice,
          version: editingMenuItem.version,
          changeReason: editReason.trim(),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }

      await loadMenu();
      await loadArchivedMenu();
      if (user) {
        await loadCurrentOrder(user.id);
      }

      setEditingMenuItem(null);
      setEditReason("");
    } catch (editError) {
      console.error(editError);
      setActionError(
        editError instanceof Error
          ? `菜單更新失敗：${editError.message}`
          : "菜單更新失敗。",
      );
    } finally {
      setMenuActionId(null);
    }
  }

  async function openMenuHistory(item: MenuItem): Promise<void> {
    setMenuHistoryItem(item);
    setMenuHistory([]);
    setMenuHistoryLoading(true);

    try {
      const response = await fetch(buildApiUrl(`/api/menu/${item.id}/history`));
      const payload = (await response.json()) as ApiDataResponse<MenuItem[]>;
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setMenuHistory(Array.isArray(payload.data) ? payload.data : []);
    } catch (historyError) {
      console.error(historyError);
      setActionError("版本歷史讀取失敗。");
    } finally {
      setMenuHistoryLoading(false);
    }
  }

  async function archiveMenuItem(item: MenuItem): Promise<void> {
    setMenuActionId(item.id);
    setActionError("");

    try {
      const response = await fetch(buildApiUrl(`/api/menu/${item.id}`), {
        method: "DELETE",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }

      await loadMenu();
      await loadArchivedMenu();
      if (user) {
        await loadCurrentOrder(user.id);
      }
    } catch (deleteError) {
      console.error(deleteError);
      setActionError(
        deleteError instanceof Error
          ? `菜單下架失敗：${deleteError.message}`
          : "菜單下架失敗。",
      );
    } finally {
      setMenuActionId(null);
    }
  }

  async function restoreMenuItem(item: MenuItem): Promise<void> {
    setMenuActionId(item.id);
    setActionError("");

    try {
      const response = await fetch(buildApiUrl(`/api/menu/${item.id}/restore`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          changeReason: `重新上架：還原自 v${item.version}`,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }

      await loadMenu();
      await loadArchivedMenu();
      if (user) {
        await loadCurrentOrder(user.id);
      }

      if (menuHistoryItem) {
        await openMenuHistory(payload.data);
      }
    } catch (restoreError) {
      console.error(restoreError);
      setActionError(
        restoreError instanceof Error
          ? `菜單還原失敗：${restoreError.message}`
          : "菜單還原失敗。",
      );
    } finally {
      setMenuActionId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-error m-4">
        <span>{error}</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-200">
      <div className="navbar flex-col items-stretch gap-2 bg-base-100 shadow-lg md:flex-row md:items-center">
        <div className="flex-1">
          <a className="btn btn-ghost text-2xl normal-case">
            🌅 聯大資工早餐店
          </a>
        </div>
        <div className="flex-none">
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <div className="badge badge-outline">
              {user ? `已登入 ${user.name}` : "尚未登入"}
            </div>
            <div className="badge badge-primary">
              {items.length} 個品項・{grouped.categories.length} 類
            </div>
            <div className="badge badge-secondary">
              購物車 {cartItemCount} 份
            </div>
            <div className="badge badge-accent">總計 ${cartTotal}</div>
            <button
              className="btn btn-sm btn-outline"
              onClick={() => setIsCartOpen(true)}
              disabled={!user}
            >
              查看購物車
            </button>
            {user ? (
              <button className="btn btn-sm" onClick={handleLogout}>
                登出
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <main className="container mx-auto p-6">
        {!user ? (
          <section className="card mx-auto mb-8 max-w-xl bg-base-100 shadow-md">
            <div className="card-body">
              <h2 className="card-title">登入示範帳號</h2>
              <p className="text-sm opacity-70">
                可使用 demo@example.com 或 amy@example.com，密碼皆為 1234。
              </p>
              <label className="form-control w-full">
                <span className="label-text mb-1">Email</span>
                <input
                  className="input input-bordered"
                  value={emailInput}
                  onChange={(event) => setEmailInput(event.target.value)}
                />
              </label>
              <label className="form-control w-full">
                <span className="label-text mb-1">密碼</span>
                <input
                  type="password"
                  className="input input-bordered"
                  value={passwordInput}
                  onChange={(event) => setPasswordInput(event.target.value)}
                />
              </label>
              {authError ? (
                <div className="alert alert-error">
                  <span>{authError}</span>
                </div>
              ) : null}
              <button
                className="btn btn-primary"
                onClick={() => {
                  void handleLogin();
                }}
                disabled={isLoggingIn}
              >
                {isLoggingIn ? "登入中..." : "登入"}
              </button>
              <button
                className="btn btn-outline"
                onClick={handleGoogleLogin}
                disabled={!googleLoginConfigured}
                title={
                  googleLoginConfigured
                    ? "使用 Google/Gmail 帳號登入"
                    : `尚未設定 Google OAuth。Redirect URI：${googleRedirectUri}`
                }
              >
                使用 Google/Gmail 登入
              </button>
              {!googleLoginConfigured ? (
                <p className="text-xs opacity-70">
                  尚未設定 Google OAuth，請先在環境變數加入 Google client
                  ID/secret。Redirect URI：{googleRedirectUri || "未取得"}
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        {actionError ? (
          <div className="alert alert-warning mb-4">
            <span>{actionError}</span>
          </div>
        ) : null}

        {items.length === 0 ? (
          <div className="alert alert-info">
            <span>目前沒有菜單資料。</span>
          </div>
        ) : (
          grouped.categories.map((category) => (
            <section key={category} className="mb-8">
              <h2 className="mb-4 border-b-2 border-primary pb-2 text-3xl font-bold text-primary">
                {category}
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {(grouped.groupedItems[category] || []).map((item) => (
                  <article
                    key={item.id}
                    className="card bg-base-100 shadow-md transition-shadow hover:shadow-lg"
                  >
                    <figure className="h-44 overflow-hidden bg-base-300">
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.src =
                            "https://images.unsplash.com/photo-1526318896980-cf78c088247c?auto=format&fit=crop&w=800&q=80";
                        }}
                      />
                    </figure>
                    <div className="card-body">
                      <h3 className="card-title text-lg">{item.name}</h3>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="badge badge-outline">
                          v{item.version}
                        </span>
                        <span className="badge badge-ghost">
                          品項 #{item.logicalId ?? item.id}
                        </span>
                        {item.previousPrice !== undefined &&
                        item.previousPrice !== item.price ? (
                          <span className="badge badge-warning">
                            ${item.previousPrice} → ${item.price}
                          </span>
                        ) : null}
                      </div>
                      <p className="min-h-[2.75rem] text-sm opacity-80 line-clamp-2">
                        {item.description}
                      </p>
                      {item.changeReason ? (
                        <p className="rounded bg-warning/10 px-2 py-1 text-xs">
                          最近異動：{item.changeReason}
                        </p>
                      ) : null}
                      <div className="card-actions items-center justify-between">
                        <span className="text-xl font-bold text-success">
                          {item.previousPrice !== undefined &&
                          item.previousPrice !== item.price ? (
                            <span className="mr-2 text-sm text-base-content/50 line-through">
                              ${item.previousPrice}
                            </span>
                          ) : null}
                          ${item.price}
                        </span>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => {
                            void addToCart(item);
                          }}
                          disabled={activeItemId === item.id || !user}
                        >
                          {activeItemId === item.id
                            ? "加入中..."
                            : `加入購物車${
                                cartQtyByItemId[item.id]
                                  ? ` (${cartQtyByItemId[item.id]})`
                                  : ""
                              }`}
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          className="btn btn-xs btn-outline"
                          onClick={() => {
                            void openMenuHistory(item);
                          }}
                        >
                          版本
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs btn-outline"
                          onClick={() => startMenuEdit(item)}
                        >
                          編輯
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs btn-error btn-outline"
                          disabled={menuActionId === item.id}
                          onClick={() => {
                            void archiveMenuItem(item);
                          }}
                        >
                          下架
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))
        )}

        <section className="mt-10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-2xl font-bold">已下架品項</h2>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => {
                void loadArchivedMenu();
              }}
            >
              重新整理
            </button>
          </div>
          {archivedItems.length === 0 ? (
            <div className="alert alert-info">
              <span>目前沒有下架品項。</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {archivedItems.map((item) => (
                <article
                  key={item.id}
                  className="rounded border border-base-300 bg-base-100 p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{item.name}</h3>
                      <p className="text-sm opacity-70">
                        品項 #{item.logicalId ?? item.id}・最後版本 v{item.version}
                      </p>
                    </div>
                    <span className="badge badge-ghost">已下架</span>
                  </div>
                  <p className="mt-2 text-sm opacity-80">{item.description}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="font-bold text-success">${item.price}</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn btn-xs btn-outline"
                        onClick={() => {
                          void openMenuHistory(item);
                        }}
                      >
                        版本
                      </button>
                      <button
                        type="button"
                        className="btn btn-xs btn-primary"
                        disabled={menuActionId === item.id}
                        onClick={() => {
                          void restoreMenuItem(item);
                        }}
                      >
                        重新上架
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {user ? (
          <section className="mt-10">
            <h2 className="mb-4 text-2xl font-bold">我的訂單歷史</h2>
            {historyLoading ? (
              <div className="alert">
                <span>讀取中...</span>
              </div>
            ) : historyOrders.length === 0 ? (
              <div className="alert alert-info">
                <span>目前沒有歷史訂單。</span>
              </div>
            ) : (
              <div className="space-y-3">
                {historyOrders.map((order) => (
                  <article
                    key={order.id}
                    className="card border border-base-300 bg-base-100 shadow-sm"
                  >
                    <div className="card-body p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-semibold">訂單 #{order.id}</h3>
                        <span className="badge badge-success">已送出</span>
                      </div>
                      <p className="text-sm opacity-70">
                        建立時間：{formatDateTime(order.createdAt)}
                      </p>
                      <ul className="list-disc space-y-1 pl-5 text-sm">
                        {order.items.map((detail) => (
                          <li key={`${order.id}-${detail.item.id}`}>
                            {detail.item.name} x {detail.qty}
                          </li>
                        ))}
                      </ul>
                      <p className="text-right font-bold">總計 ${order.total}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </main>

      {isCartOpen ? (
        <>
          <button
            className="fixed inset-0 bg-black/35"
            aria-label="關閉購物車"
            onClick={() => setIsCartOpen(false)}
          />
          <aside className="fixed right-0 top-0 z-10 flex h-full w-full max-w-md flex-col bg-base-100 shadow-2xl">
            <div className="flex items-center justify-between border-b border-base-300 p-4">
              <h2 className="text-xl font-bold">購物車內容</h2>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => setIsCartOpen(false)}
              >
                關閉
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              {cartDetails.length === 0 ? (
                <div className="alert">
                  <span>購物車目前是空的。</span>
                </div>
              ) : (
                <>
                  <CartValidation
                    order={currentOrder}
                    menu={items}
                    onApplyLatestItems={handleApplyLatestCartItems}
                    onRemoveStaleItems={handleRemoveStaleItems}
                    onRefreshMenu={handleRefreshMenuFromError}
                  />
                  <ul className="space-y-3">
                    {cartDetails.map((detail) => (
                      <li
                        key={detail.itemId}
                        className="flex items-center justify-between rounded-lg bg-base-200 p-3"
                      >
                        <div>
                          <p className="font-semibold">{detail.item.name}</p>
                          <p className="text-sm opacity-70">
                            單價 ${detail.item.price} x {detail.qty}
                          </p>
                        </div>
                        <p className="font-bold">${detail.subtotal}</p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div className="space-y-3 border-t border-base-300 p-4">
              <div className="flex items-center justify-between font-semibold">
                <span>品項數量</span>
                <span>{cartItemCount}</span>
              </div>
              <div className="flex items-center justify-between text-lg font-bold">
                <span>總計</span>
                <span>${cartTotal}</span>
              </div>
              <button
                className="btn btn-error btn-outline w-full"
                onClick={() => {
                  void clearCart();
                }}
                disabled={cartDetails.length === 0 || isClearingCart}
              >
                {isClearingCart ? "清空中..." : "清空購物車"}
              </button>
              <button
                className="btn btn-primary w-full"
                onClick={() => {
                  void submitOrder();
                }}
                disabled={cartDetails.length === 0 || isSubmittingOrder}
              >
                {isSubmittingOrder ? "送出中..." : "送出訂單"}
              </button>
            </div>
          </aside>
        </>
      ) : null}

      {editingMenuItem ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="關閉菜單編輯"
            onClick={() => setEditingMenuItem(null)}
          />
          <section className="relative z-10 w-full max-w-lg rounded-lg bg-base-100 shadow-2xl">
            <div className="border-b border-base-300 px-5 py-4">
              <h2 className="text-lg font-bold">編輯菜單並建立新版本</h2>
              <p className="text-sm opacity-70">
                目前版本 v{editingMenuItem.version}，送出後會建立 v
                {editingMenuItem.version + 1}。
              </p>
            </div>
            <div className="space-y-3 px-5 py-4">
              <label className="form-control">
                <span className="label-text mb-1">品名</span>
                <input
                  className="input input-bordered"
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                />
              </label>
              <label className="form-control">
                <span className="label-text mb-1">價格</span>
                <input
                  className="input input-bordered"
                  type="number"
                  min="0"
                  value={editPrice}
                  onChange={(event) => setEditPrice(event.target.value)}
                />
              </label>
              <label className="form-control">
                <span className="label-text mb-1">變更原因</span>
                <textarea
                  className="textarea textarea-bordered"
                  value={editReason}
                  placeholder="例如：原物料上漲、菜單名稱調整"
                  onChange={(event) => setEditReason(event.target.value)}
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-base-300 px-5 py-4">
              <button className="btn" onClick={() => setEditingMenuItem(null)}>
                取消
              </button>
              <button
                className="btn btn-primary"
                disabled={menuActionId === editingMenuItem.id}
                onClick={() => {
                  void submitMenuEdit();
                }}
              >
                建立新版本
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {menuHistoryItem ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="關閉版本歷史"
            onClick={() => setMenuHistoryItem(null)}
          />
          <section className="relative z-10 max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-lg bg-base-100 shadow-2xl">
            <div className="border-b border-base-300 px-5 py-4">
              <h2 className="text-lg font-bold">版本歷史</h2>
              <p className="text-sm opacity-70">
                {menuHistoryItem.name}・品項 #
                {menuHistoryItem.logicalId ?? menuHistoryItem.id}
              </p>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
              {menuHistoryLoading ? (
                <div className="alert">
                  <span>讀取版本歷史中...</span>
                </div>
              ) : menuHistory.length === 0 ? (
                <div className="alert alert-info">
                  <span>沒有版本歷史。</span>
                </div>
              ) : (
                <ol className="space-y-3">
                  {menuHistory.map((historyItem) => (
                    <li
                      key={historyItem.id}
                      className="rounded border border-base-300 bg-base-200 px-4 py-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-semibold">
                          v{historyItem.version}・{historyItem.name}
                        </div>
                        <span
                          className={
                            historyItem.isCurrentVersion
                              ? "badge badge-success"
                              : "badge badge-ghost"
                          }
                        >
                          {historyItem.isCurrentVersion ? "目前版本" : "歷史版本"}
                        </span>
                      </div>
                      <div className="mt-2 grid gap-1 text-sm md:grid-cols-2">
                        <span>版本 ID：{historyItem.id}</span>
                        <span>取代：{historyItem.supersedes ?? "-"}</span>
                        <span>
                          價格：
                          {historyItem.previousPrice !== undefined &&
                          historyItem.previousPrice !== historyItem.price ? (
                            <>
                              <span className="mx-1 line-through opacity-60">
                                ${historyItem.previousPrice}
                              </span>
                              →
                            </>
                          ) : null}
                          <span className="ml-1 font-bold">
                            ${historyItem.price}
                          </span>
                        </span>
                        <span>時間：{formatDateTime(historyItem.createdAt)}</span>
                      </div>
                      {historyItem.changeReason ? (
                        <p className="mt-2 rounded bg-base-100 px-2 py-1 text-sm">
                          變更原因：{historyItem.changeReason}
                        </p>
                      ) : null}
                      {!historyItem.isCurrentVersion ? (
                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            className="btn btn-xs btn-primary btn-outline"
                            disabled={menuActionId === historyItem.id}
                            onClick={() => {
                              void restoreMenuItem(historyItem);
                            }}
                          >
                            還原此版本
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className="flex justify-end border-t border-base-300 px-5 py-4">
              <button className="btn" onClick={() => setMenuHistoryItem(null)}>
                關閉
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <OrderSubmitError
        error={submitError}
        onDismiss={() => setSubmitError(null)}
        onRetryRefresh={handleRefreshMenuFromError}
      />
    </div>
  );
}
