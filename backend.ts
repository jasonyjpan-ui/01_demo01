import { Elysia, t } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { staticPlugin } from "@elysiajs/static";
import { existsSync } from "node:fs";
import toTaipeiDateTime from "./util.ts";
import type { Order, OrderResponse } from "./shared/contracts.ts";
import { createStore } from "./store/index.ts";
import { createAuth } from "./auth/index.ts";

function toOrderResponse(order: Order): OrderResponse {
  return {
    ...order,
    createdAtTaipei: toTaipeiDateTime(order.createdAt),
  };
}

// 從環境變量獲取配置
const port = parseInt(process.env.PORT || "3000", 10);
const host = process.env.HOST || "localhost";
const allowedOrigin = process.env.API_ALLOWED_ORIGIN || "*";
// 根據環境變數自動決定要用 JSON 還是 PostgreSQL
const store = createStore(
  process.env.STORE_DRIVER === "postgres"
    ? { connectionString: process.env.DATABASE_URL }
    : { dataFilePath: "./data/store.json" }
);

const auth = createAuth(
  process.env.STORE_DRIVER === "postgres"
    ? { connectionString: process.env.DATABASE_URL }
    : { dataFilePath: "./data/store.json" }
);
const hasPublicAssets =
  existsSync("./public") && existsSync("./public/index.html");
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleRedirectUri =
  process.env.GOOGLE_REDIRECT_URI ??
  `http://${host}:${port}/api/auth/google/callback`;
const googleLoginRedirectUrl =
  process.env.GOOGLE_LOGIN_REDIRECT_URL ??
  process.env.FRONTEND_URL ??
  `http://${host}:5173`;

const googleOAuthStates = new Map<string, number>();
const googleOAuthStateTtlMs = 10 * 60 * 1000;

const apiErrorResponseSchema = t.Object({
  error: t.String(),
  message: t.Optional(t.String()),
});

const safeUserSchema = t.Object({
  id: t.String({ minLength: 1 }),
  email: t.String({ minLength: 3 }),
  name: t.String({ minLength: 1 }),
});

const menuItemSchema = t.Object({
  id: t.Number({ minimum: 1 }),
  logicalId: t.Optional(t.Number({ minimum: 1 })),
  entityId: t.Optional(t.String()),
  name: t.String({ minLength: 1 }),
  price: t.Number({ minimum: 0 }),
  category: t.String({ minLength: 1 }),
  description: t.String(),
  image_url: t.String({ minLength: 1 }),
  version: t.Number({ minimum: 1 }),
  isCurrentVersion: t.Optional(t.Boolean()),
  supersedes: t.Optional(t.Number({ minimum: 1 })),
  changeReason: t.Optional(t.String()),
  previousPrice: t.Optional(t.Number({ minimum: 0 })),
  createdAt: t.Optional(t.String()),
  changedAt: t.Optional(t.String()),
});

const menuVersionMismatchResponseSchema = t.Object({
  error: t.String(),
  details: t.Optional(
    t.Object({
      staleItems: t.Array(
        t.Object({
          id: t.Number({ minimum: 1 }),
          name: t.String(),
          orderedPrice: t.Number({ minimum: 0 }),
          currentPrice: t.Optional(t.Number({ minimum: 0 })),
          reason: t.String(),
        }),
      ),
      message: t.String(),
    }),
  ),
});

const orderItemSchema = t.Object({
  item: menuItemSchema,
  qty: t.Number({ minimum: 0 }),
});

const orderResponseSchema = t.Object({
  id: t.Number({ minimum: 1 }),
  userId: t.String({ minLength: 1 }),
  items: t.Array(orderItemSchema),
  total: t.Number({ minimum: 0 }),
  status: t.Union([t.Literal("pending"), t.Literal("submitted")]),
  createdAt: t.String({ minLength: 1 }),
  submittedAt: t.Optional(t.String({ minLength: 1 })),
  createdAtTaipei: t.String({ minLength: 1 }),
});

const loginResponseSchema = t.Object({
  data: safeUserSchema,
});

const menuListResponseSchema = t.Object({
  data: t.Array(menuItemSchema),
});

const menuItemResponseSchema = t.Object({
  data: menuItemSchema,
});

const orderListResponseSchema = t.Object({
  data: t.Array(orderResponseSchema),
});

const orderResponseEnvelopeSchema = t.Object({
  data: orderResponseSchema,
});

const nullableOrderResponseEnvelopeSchema = t.Object({
  data: t.Union([orderResponseSchema, t.Null()]),
});

const healthResponseSchema = t.Object({
  status: t.String(),
});

const app = new Elysia();

function redirect(location: string, status = 302) {
  return new Response(null, {
    status,
    headers: { Location: location },
  });
}

function cleanupGoogleOAuthStates() {
  const now = Date.now();
  for (const [state, expiresAt] of googleOAuthStates) {
    if (expiresAt <= now) {
      googleOAuthStates.delete(state);
    }
  }
}

function buildGoogleLoginResultUrl(
  result:
    | { ok: true; user: { id: string; email: string; name: string } }
    | { ok: false; error: string },
) {
  const target = new URL(googleLoginRedirectUrl);
  if (result.ok) {
    target.searchParams.set("googleLogin", "success");
    target.searchParams.set(
      "user",
      Buffer.from(JSON.stringify(result.user), "utf8").toString("base64url"),
    );
  } else {
    target.searchParams.set("googleLogin", "error");
    target.searchParams.set("message", result.error);
  }

  return target.toString();
}

if (hasPublicAssets) {
  app.use(
    staticPlugin({
      assets: "public",
      prefix: "",
    }),
  );
}

app.use(
  openapi({
    path: "/openapi",
    specPath: "/openapi/json",
    documentation: {
      info: {
        title: "Breakfast Demo API",
        version: "0.2.2",
        description:
          "Breakfast ordering demo API for teaching route schema, contract-first design, and future database/auth upgrades.",
      },
      tags: [
        { name: "auth", description: "Authentication endpoints" },
        { name: "menu", description: "Menu management endpoints" },
        { name: "orders", description: "Order query and mutation endpoints" },
        { name: "system", description: "System and health check endpoints" },
      ],
    },
    exclude: {
      staticFile: true,
      paths: ["/openapi", "/openapi/json"],
    },
  }),
);

// 請求記錄中間件
app.onRequest(({ request }) => {
  console.log(
    `[${toTaipeiDateTime(new Date().toISOString())}] ${request.method} ${new URL(request.url).pathname}`,
  );
});

app.options(
  "*",
  ({ set }) => {
    set.status = 204;
    return "";
  },
  {
    detail: {
      hide: true,
    },
  },
);

app.onAfterHandle(({ request, set }) => {
  const requestOrigin = request.headers.get("origin");

  if (allowedOrigin === "*") {
    set.headers["access-control-allow-origin"] = requestOrigin || "*";
  } else if (requestOrigin === allowedOrigin) {
    set.headers["access-control-allow-origin"] = allowedOrigin;
  } else {
    return;
  }

  set.headers.vary = "Origin";
  set.headers["access-control-allow-methods"] = "GET,POST,PATCH,DELETE,OPTIONS";
  set.headers["access-control-allow-headers"] = "Content-Type, Authorization";
});

// API 路由

// 使用者登入
app.post(
  "/api/auth/login",
  ({ body, set }) => {
    const result = auth.login({
      email: body.email,
      password: body.password,
    });

    if (!result.ok) {
      set.status = 401;
      return { error: "Invalid credentials" };
    }

    return { data: result.user };
  },
  {
    body: t.Object({
      email: t.String({ minLength: 3 }),
      password: t.String({ minLength: 1 }),
    }),
    detail: {
      tags: ["auth"],
      summary: "Login with demo credentials",
      description:
        "Validate a demo user account and return the safe user profile.",
    },
    response: {
      200: loginResponseSchema,
      401: apiErrorResponseSchema,
    },
  },
);

app.get(
  "/api/auth/google/status",
  () => ({
    data: {
      configured: Boolean(
        googleClientId && googleClientSecret && auth.upsertGoogleUser,
      ),
      redirectUri: googleRedirectUri,
    },
  }),
  {
    detail: {
      tags: ["auth"],
      summary: "Get Google login configuration status",
      description:
        "Return whether Google OAuth login has enough environment configuration to start.",
    },
    response: {
      200: t.Object({
        data: t.Object({
          configured: t.Boolean(),
          redirectUri: t.String(),
        }),
      }),
    },
  },
);

app.get(
  "/api/auth/google/start",
  ({ set }) => {
    if (!googleClientId || !googleClientSecret || !auth.upsertGoogleUser) {
      set.status = 503;
      return {
        error:
          "Google login is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
      };
    }

    cleanupGoogleOAuthStates();
    const state = crypto.randomUUID();
    googleOAuthStates.set(state, Date.now() + googleOAuthStateTtlMs);

    const authorizationUrl = new URL(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    authorizationUrl.searchParams.set("client_id", googleClientId);
    authorizationUrl.searchParams.set("redirect_uri", googleRedirectUri);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("scope", "openid profile email");
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("prompt", "select_account");

    return redirect(authorizationUrl.toString());
  },
  {
    detail: {
      tags: ["auth"],
      summary: "Start Google OAuth login",
      description: "Redirect the browser to Google OAuth authorization.",
    },
    response: {
      302: t.Void(),
      503: apiErrorResponseSchema,
    },
  },
);

app.get(
  "/api/auth/google/callback",
  async ({ query }) => {
    if (!googleClientId || !googleClientSecret || !auth.upsertGoogleUser) {
      return redirect(
        buildGoogleLoginResultUrl({
          ok: false,
          error: "Google login is not configured.",
        }),
      );
    }

    const state = query.state;
    const code = query.code;
    cleanupGoogleOAuthStates();

    if (
      typeof state !== "string" ||
      typeof code !== "string" ||
      !googleOAuthStates.has(state)
    ) {
      return redirect(
        buildGoogleLoginResultUrl({
          ok: false,
          error: "Google login state is invalid or expired.",
        }),
      );
    }

    googleOAuthStates.delete(state);

    try {
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: googleClientId,
          client_secret: googleClientSecret,
          redirect_uri: googleRedirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error(`Token exchange failed: HTTP ${tokenResponse.status}`);
      }

      const tokenPayload = (await tokenResponse.json()) as {
        access_token?: string;
      };

      if (!tokenPayload.access_token) {
        throw new Error("Google token response did not include access_token.");
      }

      const userInfoResponse = await fetch(
        "https://openidconnect.googleapis.com/v1/userinfo",
        {
          headers: {
            Authorization: `Bearer ${tokenPayload.access_token}`,
          },
        },
      );

      if (!userInfoResponse.ok) {
        throw new Error(`Userinfo failed: HTTP ${userInfoResponse.status}`);
      }

      const profile = (await userInfoResponse.json()) as {
        sub?: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
      };

      if (!profile.sub || !profile.email || profile.email_verified === false) {
        throw new Error("Google account email is unavailable or unverified.");
      }

      const user = await auth.upsertGoogleUser({
        email: profile.email,
        name: profile.name ?? profile.email,
        googleSub: profile.sub,
      });

      return redirect(buildGoogleLoginResultUrl({ ok: true, user }));
    } catch (error) {
      console.error(error);
      return redirect(
        buildGoogleLoginResultUrl({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Google login failed.",
        }),
      );
    }
  },
  {
    query: t.Object({
      code: t.Optional(t.String()),
      state: t.Optional(t.String()),
      error: t.Optional(t.String()),
    }),
    detail: {
      tags: ["auth"],
      summary: "Handle Google OAuth callback",
      description:
        "Exchange Google OAuth code for user info, upsert a local account, and redirect back to the app.",
    },
  },
);

// 菜單路由
app.get("/api/menu", () => ({ data: [...store.getMenu()] }), {
  detail: {
    tags: ["menu"],
    summary: "List menu items",
    description: "Return all available breakfast menu items.",
  },
  response: {
    200: menuListResponseSchema,
  },
});

app.post(
  "/api/menu",
  async ({ body, set }) => {
    const newMenuItem = await store.createMenuItem(body);
    set.status = 201;
    return { data: newMenuItem };
  },
  {
    body: t.Object({
      name: t.String({ minLength: 1 }),
      price: t.Integer({ minimum: 0 }),
      category: t.String({ minLength: 1 }),
      description: t.String({ minLength: 1 }),
      image_url: t.String({ minLength: 1 }),
    }),
    detail: {
      tags: ["menu"],
      summary: "Create a menu item",
      description: "Add a new menu item into the breakfast menu.",
    },
    response: {
      201: menuItemResponseSchema,
    },
  },
);

app.patch(
  "/api/menu/:id",
  async ({ params, body, set }) => {
    const menuId = parseInt(params.id);
    const existingMenuItem = store.getMenu().find((item) => item.id === menuId);

    if (!existingMenuItem) {
      set.status = 404;
      return { error: "Menu item not found" };
    }

    const menuItem = await store.updateMenuItem(menuId, body);

    if (!menuItem) {
      set.status = 409;
      return { error: "Menu item version mismatch" };
    }

    return { data: menuItem };
  },
  {
    params: t.Object({
      id: t.String({ pattern: "^[0-9]+$" }),
    }),
    body: t.Object({
      name: t.Optional(t.String({ minLength: 1 })),
      price: t.Optional(t.Integer({ minimum: 0 })),
      category: t.Optional(t.String({ minLength: 1 })),
      description: t.Optional(t.String({ minLength: 1 })),
      image_url: t.Optional(t.String({ minLength: 1 })),
      version: t.Optional(t.Integer({ minimum: 1 })),
      changeReason: t.Optional(t.String({ minLength: 1 })),
    }),
    detail: {
      tags: ["menu"],
      summary: "Update a menu item",
      description: "Update fields of an existing menu item.",
    },
    response: {
      200: menuItemResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

app.get(
  "/api/menu/current",
  () => ({ data: [...store.getMenu()] }),
  {
    detail: {
      tags: ["menu"],
      summary: "Get current menu",
      description: "Return the current menu with versioned menu items.",
    },
    response: {
      200: menuListResponseSchema,
    },
  },
);

app.get(
  "/api/menu/archived",
  async ({ set }) => {
    if (!store.getArchivedMenuItems) {
      set.status = 501;
      return { error: "Archived menu is not supported in this storage backend" };
    }

    return { data: await store.getArchivedMenuItems() };
  },
  {
    detail: {
      tags: ["menu"],
      summary: "List archived menu items",
      description:
        "Return the latest archived version for menu items that do not have a current version.",
    },
    response: {
      200: menuListResponseSchema,
      501: apiErrorResponseSchema,
    },
  },
);

// 版本歷史查詢 API
app.get(
  "/api/menu/:id/history",
  async ({ params, set }) => {
    const menuId = parseInt(params.id);
    
    if (store.getMenuItemHistory) {
      try {
        const history = await store.getMenuItemHistory(menuId);
        if (history.length === 0) {
          set.status = 404;
          return { error: "Menu item not found" };
        }
        return { data: history };
      } catch (error) {
        set.status = 500;
        return { error: "Failed to retrieve menu history" };
      }
    }

    set.status = 501;
    return { error: "Menu history not supported in this storage backend" };
  },
  {
    params: t.Object({
      id: t.String({ pattern: "^[0-9]+$" }),
    }),
    detail: {
      tags: ["menu"],
      summary: "Get menu item version history",
      description: "Return the version history of a menu item (for staff/admin).",
    },
    response: {
      200: t.Object({
        data: t.Array(t.Object({
          id: t.Optional(t.Number()),
          logicalId: t.Optional(t.Number()),
          entityId: t.Optional(t.String()),
          version: t.Number(),
          name: t.String(),
          price: t.Number(),
          previousPrice: t.Optional(t.Number()),
          changeReason: t.Optional(t.String()),
          isCurrentVersion: t.Optional(t.Boolean()),
          supersedes: t.Optional(t.Number()),
          createdAt: t.Optional(t.String()),
          changedAt: t.Optional(t.String()),
        })),
      }),
      404: apiErrorResponseSchema,
      501: apiErrorResponseSchema,
    },
  },
);

app.delete(
  "/api/menu/:id",
  async ({ params, set }) => {
    const menuId = parseInt(params.id);
    const removedMenuItem = await store.deleteMenuItem(menuId);

    if (!removedMenuItem) {
      set.status = 404;
      return { error: "Menu item not found" };
    }

    return { data: removedMenuItem };
  },
  {
    params: t.Object({
      id: t.String({ pattern: "^[0-9]+$" }),
    }),
    detail: {
      tags: ["menu"],
      summary: "Delete a menu item",
      description: "Remove a menu item by id.",
    },
    response: {
      200: menuItemResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

app.post(
  "/api/menu/:id/restore",
  async ({ params, body, set }) => {
    if (!store.restoreMenuItem) {
      set.status = 501;
      return { error: "Menu restore is not supported in this storage backend" };
    }

    const menuId = parseInt(params.id);
    const restoredMenuItem = await store.restoreMenuItem(menuId, {
      changeReason: body.changeReason,
    });

    if (!restoredMenuItem) {
      set.status = 404;
      return { error: "Menu item not found" };
    }

    return { data: restoredMenuItem };
  },
  {
    params: t.Object({
      id: t.String({ pattern: "^[0-9]+$" }),
    }),
    body: t.Object({
      changeReason: t.Optional(t.String({ minLength: 1 })),
    }),
    detail: {
      tags: ["menu"],
      summary: "Restore an archived menu item",
      description:
        "Create a new current version from a historical or archived menu item version.",
    },
    response: {
      200: menuItemResponseSchema,
      404: apiErrorResponseSchema,
      501: apiErrorResponseSchema,
    },
  },
);

// 訂單列表路由
app.get(
  "/api/orders",
  () => ({
    data: store.getOrders().map(toOrderResponse),
  }),
  {
    detail: {
      tags: ["orders"],
      summary: "List all orders",
      description: "Return all orders stored in the demo backend.",
    },
    response: {
      200: orderListResponseSchema,
    },
  },
);

// 取得使用者目前進行中的訂單
app.get(
  "/api/orders/current",
  ({ query, set }) => {
    const user = auth.getUserById(query.userId);

    if (!user) {
      set.status = 404;
      return { error: "User not found" };
    }

    const currentOrder = store.getCurrentOrderByUserId(query.userId);
    return { data: currentOrder ? toOrderResponse(currentOrder) : null };
  },
  {
    query: t.Object({
      userId: t.String({ minLength: 1 }),
    }),
    detail: {
      tags: ["orders"],
      summary: "Get current order",
      description:
        "Return the current pending order of a user, or null if none exists.",
    },
    response: {
      200: nullableOrderResponseEnvelopeSchema,
      404: apiErrorResponseSchema,
    },
  },
);

// 取得使用者歷史訂單
app.get(
  "/api/orders/history",
  ({ query, set }) => {
    const user = auth.getUserById(query.userId);

    if (!user) {
      set.status = 404;
      return { error: "User not found" };
    }

    return {
      data: store.getOrderHistoryByUserId(query.userId).map(toOrderResponse),
    };
  },
  {
    query: t.Object({
      userId: t.String({ minLength: 1 }),
    }),
    detail: {
      tags: ["orders"],
      summary: "Get order history",
      description: "Return submitted orders belonging to a user.",
    },
    response: {
      200: orderListResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

// 創建新訂單
app.post(
  "/api/orders",
  async ({ body, set }) => {
    console.log("[DEBUG] /api/orders body", body, typeof body.userId);
    const user = auth.getUserById(body.userId);
    if (!user) {
      set.status = 404;
      return { error: "User not found" };
    }

    const existingOrder = store.getCurrentOrderByUserId(body.userId);
    if (existingOrder) {
      console.log("[DEBUG] existingOrder", existingOrder);
      return { data: toOrderResponse(existingOrder) };
    }

    const newOrder = await store.createOrder({ userId: body.userId });
    console.log("[DEBUG] newOrder", newOrder);
    set.status = 201;
    return { data: toOrderResponse(newOrder) };
  },
  {
    body: t.Object({
      userId: t.String({ minLength: 1 }),
    }),
    detail: {
      tags: ["orders"],
      summary: "Create or reuse current order",
      description:
        "Create a new pending order, or return the existing pending order for the user.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      201: orderResponseEnvelopeSchema,
      404: apiErrorResponseSchema,
    },
  },
);

// 獲取單筆訂單
app.get(
  "/api/orders/:id",
  ({ params, query, set }) => {
    const orderId = parseInt(params.id, 10);
    const order = store.getOrderById(orderId);

    if (!order) {
      set.status = 404;
      return { error: "Order not found" };
    }

    if (order.userId !== query.userId) {
      set.status = 403;
      return { error: "Forbidden" };
    }

    return { data: toOrderResponse(order) };
  },
  {
    params: t.Object({
      id: t.String({ pattern: "^[0-9]+$" }),
    }),
    query: t.Object({
      userId: t.String({ minLength: 1 }),
    }),
    detail: {
      tags: ["orders"],
      summary: "Get order by id",
      description:
        "Return a single order when it belongs to the requested user.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

// 更新訂單項目
app.patch(
  "/api/orders/:id",
  async ({ params, body, set }) => {
    const orderId = parseInt(params.id);
    const result = await store.updateOrderItem(orderId, {
      userId: body.userId,
      itemId: body.itemId,
      qty: body.qty,
    });

    if (!result.ok && result.code === "ORDER_NOT_FOUND") {
      set.status = 404;
      return { error: "Order not found" };
    }

    if (!result.ok && result.code === "MENU_ITEM_NOT_FOUND") {
      set.status = 404;
      return { error: "Menu item not found" };
    }

    if (!result.ok && result.code === "ORDER_NOT_OWNED") {
      set.status = 403;
      return { error: "Forbidden" };
    }

    if (!result.ok && result.code === "ORDER_NOT_EDITABLE") {
      set.status = 409;
      return { error: "Order is not editable" };
    }

    if (!result.ok) {
      set.status = 500;
      return { error: "Unexpected store state" };
    }

    return { data: toOrderResponse(result.order) };
  },
  {
    params: t.Object({
      id: t.String({ pattern: "^[0-9]+$" }),
    }),
    body: t.Object({
      userId: t.String({ minLength: 1 }),
      itemId: t.Number({ minimum: 1 }),
      qty: t.Number({ minimum: 0 }),
    }),
    detail: {
      tags: ["orders"],
      summary: "Update order item quantity",
      description: "Set the quantity of a menu item within a pending order.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      409: apiErrorResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

// 送出訂單
app.post(
  "/api/orders/:id/submit",
  async ({ params, body, set }) => {
    const orderId = parseInt(params.id, 10);
    const result = await store.submitOrder(orderId, { userId: body.userId });

    if (!result.ok && result.code === "ORDER_NOT_FOUND") {
      set.status = 404;
      return { error: "Order not found" };
    }

    if (!result.ok && result.code === "ORDER_NOT_OWNED") {
      set.status = 403;
      return { error: "Forbidden" };
    }

    if (!result.ok && result.code === "ORDER_NOT_EDITABLE") {
      set.status = 409;
      return { error: "Order already submitted" };
    }

    if (!result.ok && result.code === "MENU_VERSION_MISMATCH") {
      set.status = 409;
      // 返回詳細的版本不匹配信息
      const order = store.getCurrentOrderByUserId(body.userId);
      if (order) {
        const currentMenuItems = store.getMenu();
        const staleItems = order.items
          .filter((orderItem) => {
            const currentMenu = currentMenuItems.find(
              (m) =>
                m.id === orderItem.item.id ||
                (m.logicalId !== undefined &&
                  m.logicalId === orderItem.item.logicalId),
            );
            return !currentMenu || currentMenu.version !== orderItem.item.version;
          })
          .map((oi) => ({
            id: oi.item.id,
            name: oi.item.name,
            orderedPrice: oi.item.price,
            currentPrice: currentMenuItems.find(
              (m) =>
                m.id === oi.item.id ||
                (m.logicalId !== undefined && m.logicalId === oi.item.logicalId),
            )?.price,
            reason: "菜單已更新",
          }));
        
        return {
          error: "Menu version mismatch: order contains stale item data",
          details: {
            staleItems,
            message: "以下項目價格或資訊已變動，請重新確認訂單",
          },
        };
      }
      return { error: "Menu version mismatch: order contains stale item data" };
    }

    if (!result.ok && result.code === "EMPTY_ORDER") {
      set.status = 400;
      return { error: "Empty order cannot be submitted" };
    }

    if (!result.ok) {
      set.status = 500;
      return { error: "Unexpected store state" };
    }

    return { data: toOrderResponse(result.order) };
  },
  {
    params: t.Object({
      id: t.String({ pattern: "^[0-9]+$" }),
    }),
    body: t.Object({
      userId: t.String({ minLength: 1 }),
    }),
    detail: {
      tags: ["orders"],
      summary: "Submit order",
      description: "Submit a pending order that belongs to the user.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      400: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      409: menuVersionMismatchResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

// 健康檢查路由
app.get("/health", () => ({ status: "ok" }), {
  detail: {
    tags: ["system"],
    summary: "Health check",
    description: "Return API health status.",
  },
  response: {
    200: healthResponseSchema,
  },
});

// SPA fallback，只有在前端 build 產物存在時才提供靜態頁面。
if (hasPublicAssets) {
  app.get(
    "*",
    async ({ request }) => {
      const pathname = new URL(request.url).pathname;
      const staticFile = Bun.file(`./public${pathname}`);

      if (pathname !== "/" && (await staticFile.exists())) {
        return staticFile;
      }

      return Bun.file("./public/index.html");
    },
    {
      detail: {
        hide: true,
      },
    },
  );
}

// 全局錯誤處理
app.onError(({ error, set, code }) => {
  if (code === "VALIDATION") {
    set.status = 400;
    return {
      error: "Validation failed",
      message: "Please check your request parameters",
    };
  }

  set.status = 500;
  return { error: "Internal server error" };
});

// 啟動服務器
await store.init();
await auth.init();

app.listen(port, () => {
  console.log(`🍳 早餐店 API 運行在 http://${host}:${port}`);
  console.log(`🌐 Web App: http://${host}:${port}`);
  console.log(`📋 菜單 API: http://${host}:${port}/api/menu`);
  console.log(`📦 訂單 API: http://${host}:${port}/api/orders`);
  console.log(`💚 健康檢查: http://${host}:${port}/health`);
  console.log(`🔐 CORS Origin: ${allowedOrigin}`);
  if (!hasPublicAssets) {
    console.log(
      "⚠️ public/ 不存在，目前只提供 API。若要提供前端頁面，先執行 bun run build:frontend",
    );
  }
});
