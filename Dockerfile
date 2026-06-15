# 1. 使用官方最新的 Bun 鏡像
FROM oven/bun:latest

# 2. 設定容器內的工作目錄
WORKDIR /app

# 3. 複製所有檔案到容器中
COPY . .

# 4. 安裝後端與前端的套件
RUN bun install
RUN cd frontend && bun install && bun run build && cd ..

# 5. 開放 Render 預設的 10000 通訊埠
EXPOSE 10000

# 6. 一鍵開機啟動後端
CMD ["bun", "backend.ts"]