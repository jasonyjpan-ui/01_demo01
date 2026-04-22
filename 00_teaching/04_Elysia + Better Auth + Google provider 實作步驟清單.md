# Elysia + Better Auth + Google provider 實作步驟清單

建議前置閱讀：

- [03_為什麼這個專案選 Drizzle + Neon.md](/root/00_nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/03_為什麼這個專案選 Drizzle + Neon.md:1)
- [03_1_Drizzle+Neon_註冊與升級實作步驟清單.md](/root/00_nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/03_1_Drizzle+Neon_註冊與升級實作步驟清單.md:1)

這份清單現在的前提已經改變。

它不再假設專案會先走 `Better Auth + SQLite`，而是建立在新的教學順序上：

1. 先補 `API contract truth`
2. 先把資料層從 `JSON + JsonFileStore` 升級到 `PostgreSQL + Drizzle + Neon`
3. 再導入 `Better Auth + Google provider`

因此，這份文件應該被理解成：

在 `API contract truth` 與資料庫升級完成之後，下一步如何把 auth 系統正式接進來。

補充教學節奏：

- V7 結尾先做第一次完整部署
- V8 完成後補資料庫版部署調整
- 這份 V9 講義完成後，也應再補一次 auth 版部署調整，而不是把部署獨立拖到最後才講

---

## 1. 這一版要達成的功能

這次 auth 升級要達成的目標是：

1. 使用者可透過 Google 帳號登入
2. 登入後由 Better Auth 建立與驗證 session
3. 前端不再把 `localStorage user` 當成登入憑證
4. 後端 API 不再信任前端傳來的 `userId`
5. 訂單歸屬改成由 server session 判定

這代表整體責任分工會變成：

- Google：提供第三方身分驗證
- Better Auth：處理 OAuth、callback、session、登出
- PostgreSQL：保存 auth tables 與業務 tables
- Elysia：處理業務 API 與權限判定
- React：觸發登入、取得 session、顯示登入狀態

---

## 2. 前置假設與決策

在開始這份清單前，先把兩個前提固定下來。

### 前提一：沿用同一套 PostgreSQL，而不是另外開 SQLite

建議做法：

- `Better Auth` 的 `user / account / session` tables 直接放在既有 PostgreSQL
- 與 `menu / orders / order_items` 共用同一套資料庫

這樣做的原因：

- 資料層前一步已經升級成正式資料庫
- 不需要再為 auth 額外補一套 SQLite
- migration 與部署流程會更一致

### 前提二：訂單的 `userId` 直接綁 Better Auth 的 `user.id`

建議做法：

- `Order.userId` 使用 `string`
- 後端從 session 拿到 `session.user.id` 後，直接作為訂單歸屬依據

這樣做的原因：

- 不需要再建立一套本地使用者 id 對照表
- 業務資料與 auth 資料的關聯更直接
- 權限判定時，Elysia 可以直接比對訂單 `userId` 與 session user id

---

## 3. 實作順序總覽

建議依這個順序做：

1. 先把 Better Auth 依賴與環境變數補齊
2. 再把 auth schema 接進既有 PostgreSQL / Drizzle
3. 再建立 `auth.ts`
4. 再把 Better Auth 掛進 Elysia
5. 再改前端登入狀態管理
6. 最後把訂單 API 改成從 session 取 user

這個順序的好處是：

- 可以先驗證 auth 本身是否正常
- 不會在 session 還沒通之前就同時改壞業務 API
- 每一步都能分開測試

---

## 4. 逐步清單

## 步驟 1：補齊 Better Auth 依賴與環境變數

要達成的功能：

- 專案具備 Better Auth server / client 端依賴
- 本機與部署環境有完整 auth 設定

需要新增或修改的檔案：

- `package.json`
- `frontend/package.json`
- `.env`
- `.env.example`

各檔案要改的部位：

### `package.json`

要改的地方：

- 新增 `better-auth`
- 新增 auth schema / migration 相關 script

建議加入的腳本方向：

- `db:generate`
- `db:migrate`
- `auth:generate`

背後邏輯：

- 這個階段 auth 已經不再是獨立 SQLite 流程，而是要接進既有資料庫工作流

### `frontend/package.json`

要改的地方：

- 新增 `better-auth`

背後邏輯：

- 前端需要 `createAuthClient`

### `.env`

要改的地方：

- 保留既有 `DATABASE_URL`
- 保留既有 `STORE_DRIVER=postgres`
- 新增 `BETTER_AUTH_SECRET`
- 新增 `BETTER_AUTH_URL`
- 新增 `GOOGLE_CLIENT_ID`
- 新增 `GOOGLE_CLIENT_SECRET`

背後邏輯：

- 資料庫連線由前一步已經建立
- 這一步只補 auth 需要的設定

### `.env.example`

要改的地方：

- 把上述 auth 相關環境變數補進去

背後邏輯：

- 之後協作者與開發者才知道要準備哪些值

---

## 步驟 2：把 Better Auth schema 接進既有 PostgreSQL / Drizzle

要達成的功能：

- 資料庫不只保存業務資料，也開始保存 auth 資料

需要新增或修改的檔案：

- `drizzle.config.ts`
- `db/schema.ts`
- `db/index.ts`

若前一步資料庫升級時採用不同目錄名稱，對應調整即可；重點不是檔名本身，而是這三個責任一定要落地：

- schema
- db connection
- migration config

各檔案要改的部位：

### `db/schema.ts`

要改的地方：

- 保留既有 `menu / orders / order_items`
- 新增 Better Auth 需要的 `user / account / session` tables
- 若有 verification 或 plugin 相關 table，也在這裡定義

背後邏輯：

- 現在 auth table 與業務 table 共享同一套資料庫
- schema 定義應集中，不要分散到多個不一致的地方

### `db/index.ts`

要改的地方：

- 匯出 Drizzle client / db instance

背後邏輯：

- `backend.ts` 與 `auth.ts` 之後都會共用這個 db 入口

### `drizzle.config.ts`

要改的地方：

- 確保 auth table 與既有業務 table 都會被 migration 管理

背後邏輯：

- 不要讓 auth schema 成為 migration 流程外的例外

---

## 步驟 3：建立 `auth.ts`

要達成的功能：

- Better Auth 有單一設定入口

需要新增或修改的檔案：

- `auth.ts` 新增

### `auth.ts`

要改的地方：

- 建立 `betterAuth({...})`
- 指向既有 PostgreSQL / Drizzle database
- 設定 `socialProviders.google`
- 設定 `baseURL`
- 匯出 `auth`

背後邏輯：

- 這個檔案會是 auth 系統的單一入口
- 不要把 Better Auth 設定散寫進 `backend.ts`

---

## 步驟 4：設定 Google OAuth 應用

要達成的功能：

- Google 接受本專案的 OAuth login 與 callback

需要處理的地方：

- Google Cloud Console

要設定的重點：

- Authorized redirect URI
- 本機開發可用 `http://localhost:3000/api/auth/callback/google`

背後邏輯：

- Better Auth 會處理 callback 流程
- 但 Google 端仍必須先註冊合法 redirect URI

---

## 步驟 5：把 Better Auth 掛進 Elysia

要達成的功能：

- 後端具備 `/api/auth/*` 路由
- Elysia 可以在業務 API 內讀取目前 session

需要新增或修改的檔案：

- `backend.ts`
- 可視需要新增 `lib/get-session.ts`

各檔案要改的部位：

### `backend.ts`

要改的地方：

- 匯入 `auth`
- 在 app 初始化時掛入 Better Auth handler
- 保留既有菜單與訂單 API
- 移除舊的 `/api/auth/login`
- 加入讀取目前 session 的 helper

這一段要改的區域：

- `const app = new Elysia();` 之後
- 目前 `/api/auth/login` 路由整段
- 所有需要保護的訂單 API

背後邏輯：

- 導入 Better Auth 後，登入入口應交給 Better Auth
- 真正的關鍵不是 route 名稱，而是後端是否以 session 判定目前使用者

### `lib/get-session.ts`

要改的地方：

- 封裝「從 request headers 取得 Better Auth session」
- 封裝「未登入時回 401」

背後邏輯：

- 不要把同一段 session 驗證邏輯重複寫在每個 route 裡

---

## 步驟 6：重構共享型別

要達成的功能：

- 前後端共享型別不再夾帶舊示範型帳密資料

需要新增或修改的檔案：

- `shared/contracts.ts`

### `shared/contracts.ts`

要改的地方：

- `User` 型別不要再保留 `password`
- 視需要新增 `CurrentUser` 或 `SessionUser`
- `Order.userId` 改成 `string`

背後邏輯：

- `password` 不應再出現在前後端共用契約中
- 之後真正的登入者來源是 Better Auth session

---

## 步驟 7：重整前端登入狀態管理

要達成的功能：

- 前端透過 Better Auth client 觸發登入與登出
- 前端以 session 判斷使用者狀態

需要新增或修改的檔案：

- `frontend/src/lib/auth-client.ts` 新增
- `frontend/src/App.tsx`
- `frontend/src/main.tsx`

各檔案要改的部位：

### `frontend/src/lib/auth-client.ts`

要改的地方：

- 建立 `createAuthClient(...)`
- 匯出 `signIn`、`signOut`、`getSession` 或 `useSession`

背後邏輯：

- 不要把 Better Auth client 呼叫散寫在 `App.tsx`

### `frontend/src/App.tsx`

要改的地方：

- 刪除 `USER_STORAGE_KEY`
- 刪除 email/password 輸入欄位
- 刪除原本 POST `/api/auth/login` 的流程
- 刪除登出時清 `localStorage` 的流程
- 改成使用 Better Auth client：
  - `signIn.social({ provider: "google" })`
  - `getSession()` 或 `useSession()`
  - `signOut()`

背後邏輯：

- 前端不再保存登入憑證
- 前端只保存「目前 session 對應的 user 顯示狀態」

### `frontend/src/main.tsx`

要改的地方：

- 多半不用大改
- 若後續要包 auth context，可在這裡接入

---

## 步驟 8：把訂單 API 改成從 session 判定目前使用者

要達成的功能：

- 目前登入者只能查自己的訂單
- 前端不必再傳 `userId`

需要新增或修改的檔案：

- `backend.ts`
- `frontend/src/App.tsx`

### `backend.ts`

要改的地方：

- `GET /api/orders/current`
  - 不再讀 `query.userId`
  - 改成從 session 取 `user.id`

- `GET /api/orders/history`
  - 不再讀 `query.userId`
  - 改成從 session 取 `user.id`

- `POST /api/orders`
  - 不再讀 `body.userId`
  - 改成從 session 取 `user.id`

- `GET /api/orders/:id`
  - 不再讀 `query.userId`
  - 改成檢查 `order.userId === session.user.id`

- `PATCH /api/orders/:id`
  - 不再讀 `body.userId`
  - 改成把 `session.user.id` 傳進資料層

- `POST /api/orders/:id/submit`
  - 不再讀 `body.userId`
  - 改成把 `session.user.id` 傳進資料層

背後邏輯：

- 這一步才是 auth 真正落地的關鍵
- 如果 API 還是相信前端傳來的 `userId`，那就只是換了登入方式，並沒有真正升級權限模型

### `frontend/src/App.tsx`

要改的地方：

- `loadCurrentOrder()` 不再傳 `?userId=...`
- `loadOrderHistory()` 不再傳 `?userId=...`
- `ensureOrder()` 不再送 `body.userId`
- `addToCart()` 不再送 `body.userId`
- `clearCart()` 不再送 `body.userId`
- `submitOrder()` 不再送 `body.userId`

背後邏輯：

- 使用者身份應由 cookie session 自動帶入
- 前端不需要自己宣告「我是誰」

---

## 步驟 9：清掉舊示範型登入殘留

要達成的功能：

- 專案內不再同時存在兩套 auth 模型

需要新增或修改的檔案：

- `backend.ts`
- `shared/contracts.ts`
- 若仍存在舊 `store` 介面或示範帳密資料，也要一併清理

要清掉的內容：

- `/api/auth/login`
- `User.password`
- `breakfast.user` localStorage 流程
- 舊的 demo email/password 提示

背後邏輯：

- 不應讓 Better Auth 與自製示範登入長期共存

---

## 步驟 10：補文件與操作說明

要達成的功能：

- 協作者與開發者可依文件完成設定與操作

需要新增或修改的檔案：

- `README.md`
- `00_teaching/00_專案迭代講義.md`
- 本檔案

要補的內容：

- 需要設定哪些環境變數
- Google Cloud Console 要填什麼 redirect URI
- auth migration / db migration 要怎麼跑
- 前提是資料庫版專案已先就緒

---

## 5. 這次改版最容易踩雷的地方

### 雷點一：以為換成 Google 按鈕就完成 auth 升級

真正的升級點不是按鈕，而是：

- session 是否由 server 驗證
- API 是否不再信任前端傳來的 `userId`

### 雷點二：導入 Better Auth，卻另外再開一套 SQLite

如果資料庫層前一步已經升級完成，這時再為 auth 另外補一套 SQLite，通常只會增加：

- migration 分裂
- 部署分裂
- 資料遷移成本

### 雷點三：保留舊示範登入與新 auth 並存

那樣會讓搞不清楚：

- 現在到底哪一套才是真正的登入系統
- 權限應該相信哪個 user id

### 雷點四：忽略 `Order.userId` 型別轉換

如果改成直接綁 Better Auth 的 `user.id`，那 `Order.userId` 就不能再維持原本的 numeric 型別。

---

## 6. 一句話總結

這份清單的本質不是「把登入方式改成 Google」，而是：

`在正式資料庫已經到位之後，把整個系統從示範型登入，升級成真正由 session 驗證的 auth 架構。`

延伸閱讀：

- [91_V5_V6_差異與決策說明.md](/root/00_nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/91_V5_V6_差異與決策說明.md:1)
