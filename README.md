# 00_demo01

這個專案採用「開發分離、部署整合」模式：

- 後端：`backend.ts`，提供 `Elysia` API
- 前端：`frontend/`，使用 `React + Vite`
- 共享契約：`shared/contracts.ts`
- 部署時：前端 build 產物輸出到 `public/`，由 Elysia 直接提供靜態檔案

## 安裝

在專案根目錄執行一次即可，`bun workspaces` 會一起安裝 `frontend` 依賴：

```bash
bun install
```

## 環境變數

先建立環境變數：

```bash
cp .env.example .env
```

可依需要調整：

```env
PORT=3000
HOST=localhost
API_ALLOWED_ORIGIN=
DATABASE_URL=
DATABASE_URL_MIGRATION=
STORE_DRIVER=postgres
``` 

## PostgreSQL（Drizzle + Neon）

若要進入 V8 的資料庫升級流程，可在 `.env` 中設定：

```env
DATABASE_URL=你的_neon_pooled_url
DATABASE_URL_MIGRATION=你的_neon_direct_url
STORE_DRIVER=postgres
```

V8 分支建議明確使用：

- `STORE_DRIVER=postgres`：走 PostgreSQL / Drizzle
- `STORE_DRIVER=json`：回退到 JSON store

可先做連線檢查：

```bash
bun run db:check
```

接著建立 migration 並套用：

```bash
bun run db:generate
bun run db:migrate
```

若暫時仍要使用 JSON store，可把 `STORE_DRIVER` 改成 `json`。

若要把 `data/store.json` 匯入 PostgreSQL，可執行：

```bash
bun run db:migrate-json --reset
```

`--reset` 會在開發環境清空既有資料表，再重新匯入 JSON 資料。

## 開發

同時啟動前後端：

```bash
bun run dev
```

- 前端：`http://localhost:5173`
- 後端 API：`http://localhost:3000`
- Vite 會將 `/api` 代理到後端
- 這個階段仍是前後端分離開發

如果只想單獨啟動：

```bash
bun run dev:frontend
bun run dev:backend
```

## 建置

```bash
bun run build
```

- 前端輸出：`public/`
- 後端輸出：`dist/backend.js`
- 後端會在部署時直接提供 `public/` 內的靜態資產
- `public/` 目前不追蹤 Git，因此 clone 下來後若要執行整合版，請先跑一次 build

## 執行後端

```bash
bun run start
```

若是剛 clone 下來，請先確認已執行：

```bash
bun run build
```

啟動後，Elysia 會同時提供：

- Web App：`http://localhost:3000`
- API：`http://localhost:3000/api/*`
 

## 前端獨立部署

若你之後要改成前端獨立部署，建置前請設定：

```bash
cp frontend/.env.example frontend/.env
```

並依實際 API 位址調整 `VITE_API_BASE_URL`。

若後端要接受跨網域請求，可設定：

```bash
API_ALLOWED_ORIGIN=https://your-frontend.example.com bun run start
```
