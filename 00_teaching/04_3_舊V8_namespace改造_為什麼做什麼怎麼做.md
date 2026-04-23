# 舊 V8 namespace 改造：為什麼、做什麼、怎麼做

> 目的：讓「舊 V8（Drizzle + Neon + userId:number）」在資料庫已被舊 V9 改動後，仍能獨立運作。

---

## 1. 為什麼要做（Why）

當前現況是：

1. `main` 的程式邏輯仍偏舊 V8。
2. 但資料庫表已被舊 V9/Better Auth 部分改動。
3. 舊 V8 預期的表結構與目前 DB 不一致，導致舊 V8 直接連線時容易壞掉。

問題本質不是「舊 V8 程式寫錯」，而是「程式版本與資料庫版本不同步」。

因此需要一個隔離方案，讓舊 V8 有自己的資料空間，不干擾 V9 線。

---

## 2. 做了什麼（What）

這次採用 PostgreSQL schema（命名空間）隔離，核心做法如下：

1. 為舊 V8 建立專用 namespace（預設 `v8_legacy`）。
2. 在該 namespace 建立舊 V8 需要的表：
   - `users`
   - `menu_items`
   - `orders`
   - `order_items`
3. 舊 V8 backend 改走獨立入口與獨立 store：
   - `backend.v8.ts`
   - `legacy/v8/store/PgStoreV8.ts`
4. 舊 V8 的資料契約維持 `userId:number`，避免混入新 V7/V9 的 string 身分策略。
5. 補上初始化腳本，確保任何環境都可快速建好舊 V8 表。

一句話：用「DB namespace 隔離 + 程式入口隔離」來恢復舊 V8 可運作性。

---

## 3. 怎麼做（How）

### A. 建立舊 V8 專用表

使用初始化腳本：

```bash
bun run v8:db:setup
```

它會在 `V8_DB_SCHEMA`（預設 `v8_legacy`）下建立必要資料表與索引。

### B. 啟動舊 V8 入口

```bash
PORT=3010 V8_DB_SCHEMA=v8_legacy bun run dev:v8
```

說明：

1. 使用 3010，避免與主線 3000 互相干擾。
2. 透過 `V8_DB_SCHEMA` 指定舊 V8 專用命名空間。

### C. 最小 smoke test

```bash
curl -s http://localhost:3010/health
curl -s -X POST http://localhost:3010/api/auth/login -H "Content-Type: application/json" -d '{"email":"demo@example.com","password":"1234"}'
curl -s "http://localhost:3010/api/menu"
curl -s -X POST http://localhost:3010/api/orders -H "Content-Type: application/json" -d '{"userId":1}'
curl -s "http://localhost:3010/api/orders/current?userId=1"
```

---

## 4. 設計決策重點

1. 不回滾現有 V9 DB 變更

- 以隔離方式兼容，而不是破壞目前主線資料。

2. 不把舊 V8 強行改成 string userId

- 舊 V8 保持教學對照價值（number 身分模型）。

3. 把相容成本留在邊界

- 用獨立 backend/store/schema 吸收差異，避免污染新主線。

---

## 5. 教學用途與收益

這份改造非常適合教學示範三件事：

1. 「版本與資料庫不同步」時，如何用最小破壞恢復可運行。
2. PostgreSQL namespace 在多版本並行中的實務價值。
3. 為什麼架構分層（入口、store、contract）能降低升級風險。

---

## 6. 常見誤區

1. 直接用舊 V8 程式連現有 V9 表。
2. 在同一個 port 同時跑多個版本後端。
3. 以為 `ENOENT` 或執行中斷碼（137/143）一定是業務邏輯錯誤。

建議口訣：

`先隔離（schema/port）再驗證（smoke test），最後才談邏輯修補。`
