# Legacy V8 PostgreSQL 運行說明

這組檔案提供「舊 V8（userId:number）」可在 PostgreSQL 上獨立運作的方案。

## 目標

1. 不碰現行 V9/Better Auth 主線資料表。
2. 使用 PostgreSQL schema（命名空間）隔離舊 V8 表。
3. 讓舊 V8 程式與資料庫結構重新同步。

## 預設 schema

- `v8_legacy`
- 可透過環境變數覆寫：`V8_DB_SCHEMA=your_schema_name`

## 一次初始化

```bash
bun run v8:db:setup
```

## 啟動舊 V8 backend

```bash
PORT=3010 bun run dev:v8
```

## 快速驗證

```bash
curl -s http://localhost:3010/health
curl -s -X POST http://localhost:3010/api/auth/login -H "Content-Type: application/json" -d '{"email":"demo@example.com","password":"1234"}'
curl -s "http://localhost:3010/api/orders/current?userId=1"
```
