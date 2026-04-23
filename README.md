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

若要啟用 PostgreSQL，可在 `.env` 中設定：

```env
DATABASE_URL=你的_neon_pooled_url
DATABASE_URL_MIGRATION=你的_neon_direct_url
STORE_DRIVER=postgres
```

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

### 常見混淆（請先看這段）

1. `bun run dev` 時，前端主入口是 `http://localhost:5173`，不是 `http://localhost:3000`。
2. `http://localhost:3000` 在開發階段主要是 API 服務（例如 `/api/menu`、`/health`）。
3. 只有在前端 build 產物存在（`public/index.html`）時，`3000` 才會同時提供前端頁面。
4. 若你想直接用 `http://localhost:3000` 看完整網站，先執行：

```bash
bun run build:frontend
```

然後再啟動 backend（`bun run dev:backend` 或 `bun run start`）。

### 常見故障排查（本次實戰紀錄）

1. 症狀：`ENOENT: ./public/index.html` 或 `ENOENT: .../public`

- 常見原因：
  - 在「沒有 `public/` 的目錄」啟動 backend（例如舊 worktree）。
  - 尚未執行 `bun run build:frontend`，整合模式缺少前端產物。
- 解法：
  - 確認目前工作目錄是專案主目錄（本專案請固定在 `00_demo01`）。
  - 先執行 `bun run build:frontend`，再啟動 backend。

2. 症狀：前端顯示「加入購物車失敗」，但看起來 API 又偶爾正常

- 常見原因：
  - 3000 同時被多個舊 backend 行程佔用，請求被不同版本程式接到。
- 解法：
  - 先清掉舊行程，只保留一個 backend：

```bash
fuser -k 3000/tcp || true
pkill -f "bun backend.ts" || true
pkill -f "bun run dev" || true
```

    - 再於正確目錄啟動：

```bash
bun --watch backend.ts
```

3. 症狀：終端顯示 `exit code 137` / `143` 或 `Terminated`

- 說明：
  - 這通常代表行程被外部中止（例如手動 kill、終端回收），不等於業務 API 邏輯錯誤。
- 解法：
  - 重新確認只有一個 backend 監聽 3000，並重跑最小 smoke test：

```bash
curl -s http://localhost:3000/health
curl -s -X POST http://localhost:3000/api/auth/login \
	-H "Content-Type: application/json" \
	-d '{"email":"demo@example.com","password":"1234"}'
curl -s "http://localhost:3000/api/orders/current?userId=0001"
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

補充：若尚未 build 前端，`3000` 仍可正常提供 API，但首頁不一定有前端畫面。

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
