# Drizzle + Neon 註冊與升級實作步驟清單（V8 前置講義）

這份文件是 V8（Drizzle + Neon 資料庫升級版）的實作型講義。
目標是帶學生從目前的 JSON store 架構，平順升級到 PostgreSQL + Drizzle，並先把 Neon 必要資訊準備完整。

建議前置閱讀：

- [00_專案迭代講義.md](/root/00_nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/00_專案迭代講義.md:1)
- [02_2_導入 OpenAPI ／ Swagger 輸出.md](/root/00_nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/02_2_導入 OpenAPI ／ Swagger 輸出.md:1)
- [03_為什麼這個專案選 Drizzle + Neon.md](/root/00_nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/03_為什麼這個專案選 Drizzle + Neon.md:1)

---

## 0. 本階段要完成的三件事

1. 註冊並建立 Neon 專案，拿到可用的連線資訊
2. 理解 Drizzle 在本專案中的架構角色與核心觀念
3. 依照步驟，把現有 JSON store 升級為 Drizzle + Neon

本講義的重點不是一次把資料層、auth、部署全部重做，而是先完成「JSON store -> PostgreSQL + Drizzle」這條主線。

---

## 使用方式

本講義建議依照章節順序閱讀與實作，不建議跳步。

建議節奏如下：

1. 先完成第 1 節，確保 Neon 專案與連線資訊準備完整
2. 再閱讀第 2 節，先理解這一版為什麼這樣設計
3. 最後再進入第 3 節，依序完成實作與 migration

若在第 3 節過程中遇到問題，可回到第 1.5 節與第 4 節做排查。

---

## 1. Neon 註冊與必要資料準備（詳細步驟）

### 1.1 建立 Neon 帳號

1. 開啟 https://neon.com/
2. 點選 Sign up（可用 GitHub / Google / Email）
3. 完成 email 驗證（若有）
4. 首次登入後，進入 Neon Console

登入方式建議：

- 若開發流程本來就是 GitHub + Vercel，優先使用 GitHub 登入，整體工作流會比較一致
- 若主要以公司 Google Workspace 做帳號管理，也可以用 Google 登入
- 和 Vercel 不太一樣，Neon 後續的部署、自動化與整合，主要還是看 project 設定、connection string、API key 與 GitHub Actions，不是當初用哪種社群帳號登入

建議：教學與正式專案用不同 Neon project，避免資料互相污染。

---

### 1.2 建立 Neon Project

1. 點選 New Project
2. 填寫專案名稱（例如 breakfast-demo-v8）
3. 選擇 Region（建議選離主要使用者最近的區域）
4. 建立完成後，Neon 會提供預設 database 與角色

建議：把 project 名稱、用途、建立日期記錄到課堂筆記。

---

### 1.3 取得連線資訊（最重要）

在 Project Dashboard 的 Connection Details / Connection String 區塊，請確認以下資訊都能取得：

1. Pooled connection URL（給 API runtime）
2. Direct 或 Non-pooled connection URL（給 migration）
3. Host
4. Database name
5. User
6. Password
7. SSL 參數（通常為 sslmode=require）

建議同時保存兩條 URL：

- DATABASE_URL：給後端執行期查詢使用（通常 pooled）
- DATABASE_URL_MIGRATION：給 drizzle-kit migration 使用（通常 direct / non-pooled）

原因：migration 需要更穩定、可控的連線行為，和執行期流量池用途不同。

---

### 1.4 本機環境變數落地

在專案根目錄建立或更新 .env：

```env
DATABASE_URL=請填入_pooled_url
DATABASE_URL_MIGRATION=請填入_direct_or_non_pooled_url
```

另外建立 .env.example（不要放真密碼）：

```env
DATABASE_URL=
DATABASE_URL_MIGRATION=
```

安全注意：

1. .env 不要提交到 git
2. 若連線字串外洩，立即在 Neon 重設密碼並更新 URL
3. CI/CD 平台（例如 Vercel、Render）也要設定同名環境變數

---

### 1.5 先做一個連線健康檢查

在正式導入 Drizzle 前，先確認 Neon 連線可用。

檢查目標：

1. 後端能讀到 DATABASE_URL
2. 能成功執行最小查詢（例如 select now()）
3. 若失敗，先排查 URL、密碼、SSL、環境變數名稱是否正確

本專案可直接使用以下指令進行檢查：

```bash
bun run db:check
```

這個檢查會確認：

1. STORE_DRIVER 是否為 postgres
2. DATABASE_URL 是否存在且可連線
3. DATABASE_URL_MIGRATION 是否存在且可連線
4. 資料庫是否能成功執行最小查詢

若成功，終端機應看到類似：

```text
Neon connection check:
STORE_DRIVER: postgres
DATABASE_URL: set
DATABASE_URL_MIGRATION: set
Runtime connection (DATABASE_URL): OK
Migration connection (DATABASE_URL_MIGRATION): OK
```

若失敗，優先檢查：

1. .env 是否真的有載入到目前執行環境
2. DATABASE_URL / DATABASE_URL_MIGRATION 是否貼錯、缺字或密碼過期
3. Neon 專案是否仍存在，且該 database user 仍可用
4. 網路環境是否擋到 Neon 連線

這一步先過，後面 migration 才不會浪費時間在環境問題。

---

### 1.6 本教學專案不需要啟用 Neon Auth

若本教學專案後續要使用 Better Auth.js 搭配 Google / GitHub 等第三方登入，則 Neon 在此階段只扮演 PostgreSQL 資料庫角色，不需要額外啟用 Neon Auth。

請把兩者分清楚：

- Better Auth.js：在專案內自行設定與管理的認證方案
- Neon Auth：Neon 提供的代管式 authentication 服務

本課程若要學的是 Better Auth.js 整合流程，就不要再另外打開 Neon Auth，否則會變成兩套 auth 機制重疊，讓教學、資料表責任與後續除錯都變得混亂。

一句話記住：

- 本專案是 Better Auth.js + Neon Database
- 不是 Neon Auth

---

## 2. Drizzle 架構與核心觀念（本專案版本）

### 2.1 Drizzle 在架構裡扮演什麼角色

可把 Drizzle 拆成兩個部分理解：

1. drizzle-orm（執行期）
2. drizzle-kit（開發期 migration 工具）

在本專案責任分工：

1. schema.ts：資料表與欄位定義（資料結構真相）
2. drizzle-kit：根據 schema 產生 migration
3. migrate 指令：把 migration 套到 Neon
4. db client：提供後端 route / store 可呼叫的查詢入口
5. store 層：封裝業務查詢，讓 backend route 不直接綁死 SQL 細節

---

### 2.2 本階段要掌握的 5 個觀念

1. Schema is source of truth

- 表結構以程式中的 schema 定義為準

2. Migration is explicit history

- 每次結構變更都留下可追蹤的 migration 檔

3. Runtime 與 Migration 連線分離

- 執行期和 migration 可用不同 URL

4. Store abstraction 要保留

- route 呼叫 store，store 再呼叫 Drizzle，降低耦合

5. 先結構、再資料、最後切換流量

- 先建表，再搬資料，再切正式路由

---

### 2.3 與目前專案的對應

目前專案已有：

1. backend.ts（API 入口）
2. store/Store.ts（介面）
3. store/json/JsonFileStore.ts（JSON 實作）
4. data/store.json（既有資料）

升級後建議變成：

1. db/schema.ts（資料表定義）
2. db/client.ts（Drizzle + Neon 連線）
3. db/migrate.ts（migration 執行入口）
4. store/pg/PgStore.ts（PostgreSQL 實作）
5. store/index.ts（依環境切換 JSON 或 PostgreSQL 實作）

重點：保留 store 介面，讓 route 層不用大改。

---

### 2.4 為什麼這一版 schema 先採一對一對應

以目前這個教學階段來說，主目標不是重做整個資料模型，而是先把既有 JSON store 平順搬到 PostgreSQL + Drizzle。因此這一版 schema 建議盡量和目前的 JSON 結構、shared contract、store 介面維持一對一對應。

這樣做的教學好處是：

1. 學生可以直接對照 data/store.json、shared/contracts.ts、db/schema.ts
2. 若 migration 或資料讀寫失敗，比較容易判斷問題是在資料庫導入，還是在資料模型重構
3. 可以把這一版的學習目標聚焦在持久化升級，而不是 auth 架構升級

這也代表：這一版可能會刻意保留一些「現在合理、但未必是最終產品形態」的欄位設計。例如目前若仍沿用舊登入流程，users 表保留 password 欄位是合理的；但當後續導入 Better Auth.js 與第三方登入時，使用者、session、provider/account 等資料表通常會需要重新調整。

這種調整不是失敗，而是版本升級中的必要負荷。它剛好能讓學生看見兩件事：

1. 先做等價搬遷，能降低升級風險
2. 當新需求進來時，schema 重構就是必須承擔的技術成本

也可以延伸討論：如果在這個階段就預先把 schema 調整成更接近 Better Auth.js 的形狀，優點是未來改動可能較少；缺點是會把本來單純的 JSON -> DB 遷移，變成「資料遷移 + auth 模型重構」雙重任務，明顯提高理解門檻。

因此本講義主線建議是：

1. 先做一對一對應，完成 JSON -> PostgreSQL 的遷移
2. 下一版再說明為何要為 Better Auth.js 付出 schema 調整成本
3. 把這個成本視為架構演進與技術債顯性化的一部分

---

## 3. 升級成 Drizzle 的詳細過程（實作順序）

下面的步驟請依序完成。這一段的設計原則是：

1. 先建立保護線
2. 再建立 schema 與 migration
3. 接著實作 PostgreSQL store
4. 最後才切換主流量與完成定版

### 3.1 Step A：建立保護線（分支與備份）

1. 建立一個獨立的升級工作線（優先用 git 分支；若尚未用 git，可先用檔名加序號保留版本）
2. 備份 backend.ts 與 store 相關檔（符合目前開發習慣）
3. 設定可回滾點（優先用 commit；若尚未用 git，至少保留一份可執行版本）

這 3 步的意思是：

1. 建立一個獨立的升級工作線

- 核心概念是：不要直接在目前穩定可用的主版本上硬改，而是要先留出一條專門拿來升級 `Drizzle + Neon` 的工作線
- 若已有 git，最推薦的做法是先開新分支，例如 `feat/v8-drizzle-neon`
- 若目前還沒有使用 git，也可以先用檔名加序號的方式保留版本，例如 `backend_01.ts`、`backend_02.ts`、`store_01.ts`
- 這樣做的好處是：如果升級途中失敗、做到一半想重來、或想回頭比較 JSON 版本與 PostgreSQL 版本差異，都比較安全
- 但要知道，檔名加序號比較接近人工備份，不等於真正的版本控制；等專案變大後，仍建議改用 git

2. 備份 backend.ts 與 store 相關檔

- 這一步不是一定要另外複製出一堆檔案，而是要確保手上保留「升級前還能正常運作」的版本
- 因為後面會開始新增 `db/schema.ts`、`db/client.ts`、`store/pg/PgStore.ts`，也可能修改 `store/index.ts` 或 `backend.ts`
- 若沒有先保留目前可運作的版本，等到程式壞掉時，會很難分辨問題是出在 schema、migration、db client，還是 route/store 的切換
- 備份方式可依個人習慣，例如：
- 先確認 git 工作樹乾淨
- 或先做一個暫存 commit
- 或另外保留重要檔案版本供對照
- 或用檔名加序號方式保留升級前版本

3. 設定可回滾點

- 所謂可回滾點，就是手上要有一個「目前可編譯、可啟動、功能正常」的明確基準點
- 若已有 git，最常見做法就是先留下一次 commit，代表這是升級前的安全起點
- 若目前沒有用 git，至少也要保留一份自己確認過「真的能跑」的版本，作為手動回退基準
- 這樣後面如果 `db:generate`、`db:migrate`、`PgStore` 導入或資料搬移出現問題，就可以很快回到這個穩定狀態，而不是從一堆半完成修改裡慢慢救
- 重點不是一定要很多 commit，而是至少要有一個自己敢信任的起點

目的：任何一步失敗都能快速回到可運作狀態。

---

### Git 最小工作流（本階段夠用版）

若課堂決定在這個階段開始導入 git，建議只先掌握這次升級實作真正需要的最小工作流，不必一次學完整套 git。

先記住一個核心觀念：

- `commit` 解決的是「我有沒有可回到的安全版本」
- `branch` 解決的是「我是不是在獨立工作線上安全試做，而不是直接污染主線」

也就是說，若只有 commit，雖然有基本回退能力，但仍可能把半完成版本直接堆在主線上；若有 branch + commit，才比較符合這次「建立保護線」的目的。

### 補充理解：切換 branch 時，本地目錄會不會變？

會。

在同一個本地專案目錄裡，當你執行：

```bash
git switch main
```

Git 不只是把「目前分支名稱」切到 `main`，也會把你硬碟上的工作目錄，調整成 `main` 這個分支對應的檔案狀態。

可先用一張簡化圖理解：

```text
main --------------------> commit A
feat/v8-drizzle-neon ----> commit B

working directory = 目前被展開在本機硬碟上的檔案
```

若你現在站在：

```text
feat/v8-drizzle-neon -> commit B
```

那本機目錄裡看到的檔案，就是 `commit B` 的樣子。

當你切回：

```bash
git switch main
```

本機目錄就會改成 `commit A` 的樣子。

### 用專案情境理解

例如：

1. `feat/v8-drizzle-neon` 新增了 `db/schema.ts`
2. `main` 還沒有這個檔案

那麼：

1. 當你在 `feat/v8-drizzle-neon` 時，本地目錄會看到 `db/schema.ts`
2. 當你切回 `main` 時，若 `main` 沒有這個檔案，本地目錄中的 `db/schema.ts` 通常就會消失

反過來也一樣：

1. 若 `main` 多了一份新版講義
2. `feat/v8-drizzle-neon` 還沒合併這個更新
3. 那切換分支時，本地目錄中的講義內容也會跟著改變

### 為什麼學生容易混淆

因為很多人會把 branch 想成：

- 只是 Git 裡的一個標籤

但實際上在日常操作裡，branch 會直接影響：

1. 你現在看到哪些檔案
2. 你現在編輯的是哪個版本
3. 你下一個 commit 會接在哪條工作線上

所以 branch 不只是「名義上不同」，而是會實際改變本地工作目錄的內容。

### 兩個重要例外

1. 尚未提交的修改可能阻止切換

- 若你目前有未提交修改，而且這些修改會和目標 branch 衝突，Git 可能不讓你切換

2. 未被 Git 追蹤的檔案不一定會自動消失

- 例如某些暫存檔、build 產物、自己手動建立但尚未 `git add` 的檔案，切 branch 時不一定會被清掉

一句話記住：

- branch 決定你現在站在哪條版本線上
- working directory 是這條版本線目前展開在本機的樣子
- 所以切 branch，通常也會讓本地目錄跟著變

### 先把目前 JSON 版本提交到主線

在切出 `Drizzle + Neon` 升級分支之前，建議先把目前「還沒導入 Drizzle + Neon 的 JSON 版本」提交到 git 主線，當作升級前基準。

這個基準的作用是：

1. 保留一個明確的穩定版本
2. 之後切升級分支時，有乾淨的起點可依附
3. 如果後面升級失敗，可以回頭對照主線版本

如果專案還沒初始化 git，可先執行：

```bash
git init
git branch -M main
git status
git add .
git commit -m "chore: baseline json store version"
```

如果專案已經是 git repo，但還沒留下這個基準 commit，則至少執行：

```bash
git switch main
git status
git add .
git commit -m "chore: baseline json store version"
```

### 若本專案還沒連到遠端 git repo

要注意：`git init` 只是在本機建立 git repository，還不代表它已經連到 GitHub 或其他遠端 repo。

若要讓這份專案能同步到遠端，建議接著做以下步驟：

1. 先到 GitHub 建立一個新的空 repo
2. 不要先在 GitHub 勾選自動建立 `README`、`.gitignore` 或 license
3. 建立完成後，複製該 repo 的 URL

接著在本機專案根目錄執行：

```bash
git remote add origin <遠端-repo-url>
git remote -v
git push -u origin main
```

說明：

1. `git remote add origin <遠端-repo-url>`

- 把本機專案綁定到遠端 repo
- `origin` 只是慣例名稱，通常代表主要遠端倉庫

2. `git remote -v`

- 檢查目前本機到底連到哪個遠端 repo
- 若連錯 repo，應先修正再 push

3. `git push -u origin main`

- 把本機 `main` 分支第一次推上遠端
- `-u` 的作用是建立追蹤關係，之後再 push / pull 會比較方便

若後來發現 `origin` 設錯了，可改用：

```bash
git remote set-url origin <正確的-repo-url>
```

完成這一步後，再從 `main` 切出 `feat/v8-drizzle-neon`，開始做資料庫升級。

### 建議做法：教學環境優先用 HTTPS，不先教 SSH

若學生的環境有：

1. Windows
2. WSL
3. VS Code
4. GitHub Desktop

通常最穩的起步方式不是 SSH，而是：

- remote 用 `https://github.com/...`
- 認證交給瀏覽器登入或 Git Credential Manager

這樣的好處是：

1. 比較接近多數學生日常使用情境
2. 不必先理解 SSH key、public key、private key
3. 在 Windows 與 VS Code 裡比較容易完成第一次 push

### 第 1 步：確認 remote 使用 HTTPS URL

在專案根目錄執行：

```bash
git remote -v
```

若看到像這樣，就代表目前是 HTTPS：

```text
origin  https://github.com/你的帳號/你的repo.git (fetch)
origin  https://github.com/你的帳號/你的repo.git (push)
```

若看到的是 SSH：

```text
git@github.com:你的帳號/你的repo.git
```

請改回 HTTPS：

```bash
git remote set-url origin https://github.com/你的帳號/你的repo.git
```

例如本專案：

```bash
git remote set-url origin https://github.com/nschou/bf1042.git
```

再執行一次：

```bash
git remote -v
```

確認 fetch / push 都已經是 `https://github.com/...`。

### 第 2 步：先確認本機 Git 身分

建議先確認：

```bash
git config --global user.name
git config --global user.email
```

若還沒設定，可補上：

```bash
git config --global user.name "你的名字"
git config --global user.email "你的 GitHub Email"
```

這一步不是登入 GitHub，而是設定 commit 作者資訊。

### 第 3 步：在 Windows 或 VS Code 先完成 GitHub 登入

這一步的目的是讓本機之後執行 `git push` 時，可以透過已登入的 GitHub 身分完成授權。

最常見的做法有兩種，擇一即可。

#### 作法 A：在 VS Code 內登入 GitHub

1. 打開 VS Code
2. 點左下角帳號圖示，或 `Accounts`
3. 選 `Sign in with GitHub`
4. 瀏覽器會跳出 GitHub 授權頁
5. 完成授權後回到 VS Code

這個方式特別適合：

1. 學生主要都在 VS Code 裡操作 source control
2. 需要減少命令列認證細節

#### 作法 B：在 Windows 安裝 Git for Windows，使用 Git Credential Manager

若學生是在 Windows 本機或 WSL 開發，建議安裝：

1. Git for Windows
2. 安裝時保留 Git Credential Manager 相關選項

安裝完成後，可確認：

```bash
git config --global credential.helper
```

常見正常值會類似：

```text
manager
```

或：

```text
manager-core
```

這代表之後第一次 `git push` 時，Git 會透過瀏覽器或視窗要求你登入 GitHub，登入成功後會把憑證安全保存起來。

### 第 4 步：第一次 push

當 remote 已是 HTTPS，且 VS Code / Windows 的 GitHub 登入已完成後，就可以在專案根目錄執行：

```bash
git push -u origin main
```

如果這是第一次 push，常見情況是：

1. 會跳出瀏覽器登入 GitHub
2. 或跳出 GitHub 授權視窗
3. 或要求輸入 personal access token

只要授權成功，之後同一台機器通常就不需要每次重複登入。

若還有標記版號，也可一起推：

```bash
git push origin v7-baseline
```

若之後已從 `main` 切出 V8 分支，則再推分支：

```bash
git push -u origin feat/v8-drizzle-neon
```

### 第 5 步：若出現帳密相關錯誤

若 `git push` 失敗，不要再嘗試輸入 GitHub 網站密碼。

GitHub 的 HTTPS push 現在通常不接受帳號密碼直推，常見正確作法是：

1. 用瀏覽器登入授權
2. 用 Git Credential Manager
3. 或使用 personal access token

也就是說：

- 不能把 GitHub 網站登入密碼直接當成 `git push` 密碼

### 第 6 步：WSL 使用者的建議

若學生在 WSL 裡開發，但希望認證流程簡單，最建議的方向是：

1. Windows 先安裝 Git for Windows
2. Windows 先完成 GitHub 登入
3. WSL 內的 repo 也維持 HTTPS remote
4. 盡量讓憑證管理走 Windows 那一套，而不是另外教一套 SSH

教學上要先知道一件事：

- WSL 與 Windows 雖然能一起工作，但不保證每台電腦都自動共用同一套 Git 憑證設定

所以若學生在 WSL 仍 push 失敗，最穩的排查順序是：

1. `git remote -v` 確認是不是 HTTPS
2. `git config --global credential.helper` 確認有沒有 credential helper
3. 在 Windows 版 VS Code 或 Windows terminal 先做一次 GitHub 登入
4. 再回 WSL 重試 `git push`

### 第 7 步：若一定要用 token

若學校電腦、公司環境、或某些 WSL 設定導致瀏覽器授權不順，也可以改用 personal access token。

做法是：

1. 到 GitHub 建立 personal access token
2. push 時輸入 GitHub username
3. 密碼欄位不要填 GitHub 網站密碼
4. 密碼欄位改貼 personal access token

但教學上我不建議一開始就教 token，因為：

1. 學生容易把 token 與密碼混淆
2. 也比較容易誤存到不該存的地方

### 常見排查

1. remote 還是 SSH

- 若 remote 是 `git@github.com:...`，就會走 SSH，不會走你想像中的 HTTPS 登入流程

2. 把 GitHub 網站密碼直接拿來 push

- 現在通常不行，要改用瀏覽器授權、credential manager 或 token

3. Windows 跟 WSL 的 Git 設定不同步

- 在 Windows 能 push，不代表在 WSL 內也一定已經設好

4. VS Code 登入了，但 terminal 用的是另一套 Git

- 要確認目前 push 的那個 terminal，實際使用的是哪一套 Git 與憑證設定

5. credential helper 沒有啟用

- 若沒有 helper，HTTPS push 常會卡在反覆登入或沒有地方保存憑證

一句話總結：

- 若教學目標是讓 Windows / WSL / VS Code 使用者先穩定 push，優先教 HTTPS + 瀏覽器登入 / Credential Manager，通常比先教 SSH 更適合

### 補充情境：`main` 的教材更新，怎麼同步到 `feat/v8-drizzle-neon`

這是很常見的教學情境：

1. `main` 上先修了教材
2. 但實際功能開發還在 `feat/v8-drizzle-neon`
3. 這時就會想問：V8 分支上的教材會不會自動更新？

答案是：不會自動更新。

原因很簡單：

- `main` 和 `feat/v8-drizzle-neon` 是兩條不同分支
- `main` 新增的 commit，不會自動跑到 `feat/v8-drizzle-neon`
- 所以若想讓 V8 分支也看到同一份教材更新，就要把 `main` 的新 commit 同步過去

### 最直觀的做法：把 `main` merge 進 `feat/v8-drizzle-neon`

這是教學初期最推薦的方式，因為概念比較直觀，也比較好說明：

- `main` 有新內容
- 切到 `feat/v8-drizzle-neon`
- 把 `main` 合進來

可直接執行：

```bash
git switch feat/v8-drizzle-neon
git merge main
```

如果沒有衝突，完成後再推上遠端：

```bash
git push -u origin feat/v8-drizzle-neon
```

這樣 V8 分支就會拿到 `main` 上最新的教材更新。

### 這個過程本質上發生了什麼事

可以這樣理解：

```text
main
  A --- B --- C

feat/v8-drizzle-neon
  A --- B
```

若 `main` 的教材更新是在 `C`：

當你執行：

```bash
git switch feat/v8-drizzle-neon
git merge main
```

就等於把 `C` 這個 commit 帶到 V8 分支：

```text
main
  A --- B --- C

feat/v8-drizzle-neon
  A --- B ------- M
           \     /
             C
```

教學上不必一開始就強調 merge graph 細節，只要先讓學生知道：

- `merge main` 的目的，就是把 `main` 的最新修改帶進目前分支

### 建議學生操作時的安全順序

建議照這個順序做：

```bash
git switch main
git pull
git switch feat/v8-drizzle-neon
git merge main
git push -u origin feat/v8-drizzle-neon
```

說明：

1. `git switch main`

- 先回到主線

2. `git pull`

- 先把遠端最新的 `main` 拉回本機，避免你拿舊版 `main` 去同步

3. `git switch feat/v8-drizzle-neon`

- 回到 V8 開發分支

4. `git merge main`

- 把最新主線內容合進 V8 分支

5. `git push -u origin feat/v8-drizzle-neon`

- 把同步後的結果推上遠端

### 若只有教材更新，通常很容易 merge

若 `main` 只是補教材，而 `feat/v8-drizzle-neon` 主要在改功能程式碼，通常 merge 會很平順。

例如：

1. `main` 改的是 `00_teaching/...md`
2. `feat/v8-drizzle-neon` 改的是 `db/`、`store/`、`backend.ts`

這種情況通常不會衝突。

### 什麼情況可能衝突

若兩個分支同時改了同一個檔案，而且還改到相近位置，就可能產生 merge conflict。

例如：

1. `main` 改了 V8 講義同一段內容
2. `feat/v8-drizzle-neon` 也改了同一段內容

這時 Git 可能無法自動判斷要保留哪一版，就需要人工處理。

### 教學初期怎麼講就夠了

學生先理解下面這句話就夠：

- `main` 不會自動同步到 feature branch
- 若要同步，就切到 feature branch 後執行 `git merge main`

一句話總結：

- `main` 上的新教材 commit，只有在你明確合進 `feat/v8-drizzle-neon` 後，V8 分支才會看到同樣更新

### 這次實作建議的最小指令

```bash
git switch -c feat/v8-drizzle-neon
git status
git add .
git commit -m "chore: checkpoint before drizzle migration"
```

這幾個指令的用途是：

1. `git switch -c feat/v8-drizzle-neon`

- 建立並切換到一條新的升級分支
- 之後對 `Drizzle + Neon` 的修改，都先在這條分支上進行
- 好處是：主線保留穩定版本，升級線用來試做與修改

2. `git status`

- 檢查目前有哪些檔案被修改、哪些檔案還沒加入 commit
- 每次準備提交前都先看一次，避免把不該一起提交的東西混進去

3. `git add .`

- 把目前想保留下來的修改加入暫存區
- 在教學初期可先這樣用，但之後專案變大，會更建議精準挑檔案加入

4. `git commit -m "chore: checkpoint before drizzle migration"`

- 留下一個明確的安全點
- 這個 commit 的意義不是「功能全部做完」，而是「到這裡為止，專案仍在可接受狀態」
- 之後如果 migration、資料搬移、或 store 切換失敗，就知道可以回看這個 checkpoint

### 本階段怎麼理解「回滾」

在這一版教材裡，先把回滾理解成以下兩種最安全的情境：

1. 切回穩定工作線

- 若發現目前升級分支已經改亂了，可以先切回原本穩定分支或穩定版本，讓自己重新站回安全位置

2. 回到先前的 checkpoint 觀察與重做

- 若先前已經留下 commit，就能回頭查看「哪一個版本還是正常的」
- 教學初期先建立這個觀念就夠，不必急著把所有高風險 git 指令一次教完

所以這一階段真正要學生學會的，不是完整 git，而是：

1. 不要直接在主線硬改
2. 升級前先開一條工作線
3. 在關鍵節點留下 checkpoint commit
4. 出錯時知道自己有地方可以退回去

---

### 3.2 Step B：安裝套件

在專案根目錄：

```bash
bun add drizzle-orm
bun add -d drizzle-kit
```

備註：目前專案以 Bun 為主，請用 bun 指令。

---

### 3.3 Step C：建立 Drizzle 基礎檔案

建議新增：

1. drizzle.config.ts
2. db/schema.ts
3. db/client.ts
4. db/migrate.ts

### drizzle.config.ts 概念

1. 指定 schema 檔案路徑
2. 指定 migration 輸出目錄
3. dialect 使用 postgresql
4. 連線用 DATABASE_URL_MIGRATION

### schema.ts 第一版建議表

最小可用集合：

1. users（若沿用目前登入邏輯可先建簡版）
2. menu_items
3. orders
4. order_items

欄位設計原則：

1. 每表有主鍵
2. 訂單與項目表有外鍵
3. created_at / updated_at 一開始就納入
4. 狀態欄位用 enum 或受限字串

---

### 3.4 Step D：產生與套用 migration

1. 產生 migration
2. 套用 migration 到 Neon
3. 在 Neon Console 確認資料表已建立

這一步的正確順序一定是：

1. 先 `db:generate`
2. 再 `db:migrate`

原因是兩者責任不同：

- `db:generate`：把 `db/schema.ts` 中定義的表結構，轉成實際可執行的 migration SQL 檔，輸出到 `drizzle/` 目錄
- `db:migrate`：把已經產生好的 migration SQL，真正套用到 Neon 資料庫

可這樣理解：

- `schema.ts` 是預期的資料庫結構
- `db:generate` 是把這個結構編譯成變更腳本
- `db:migrate` 是把變更腳本正式施工到資料庫

所以只有寫好 `schema.ts` 還不夠，因為 schema 定義本身不會自動改動資料庫；必須先產生 migration，再執行 migration，Neon 上才會真的建立對應資料表。

建議指令腳本（可放 package.json）：

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  }
}
```

執行：

```bash
bun run db:generate
bun run db:migrate
```

若 migrate 失敗，先檢查：

1. DATABASE_URL_MIGRATION 是否存在
2. URL 是否 direct/non-pooled
3. schema 語法是否有效

---

### 3.5 Step E：建立 PgStore，先不切主流量

目前使用的是 JsonFileStore。
建議先新增 PgStore，不要一開始就覆蓋 JSON 版本。

步驟：

1. 在 store/pg/PgStore.ts 實作與 Store.ts 相同介面
2. 先完成讀取類方法（getMenu、getOrders...）
3. 再完成寫入類方法（createOrder、updateOrder...）
4. 每做完一組方法就跑 API 測試

目的：分段驗證，避免一次性大改造成難除錯。

---

### 3.6 Step F：資料搬遷（JSON -> PostgreSQL）

新增一次性腳本（例如 scripts/migrate-json-to-db.ts）：

1. 讀取 data/store.json
2. 依表順序寫入（users -> menu_items -> orders -> order_items）
3. 寫入時維持關聯鍵一致
4. 寫入前可清空目標表（限開發環境）
5. 搬遷後做筆數比對與抽樣驗證

驗證清單：

1. menu 筆數一致
2. orders 筆數一致
3. 任選 3 筆訂單，總金額與項目數一致
4. 歷史訂單查詢結果一致

---

### 3.7 Step G：切換 store/index.ts 的實作來源

在 store/index.ts 加入環境切換：

1. 預設仍可回退 JSON
2. 設定 STORE_DRIVER=postgres 時使用 PgStore

好處：

1. 發生問題可快速切回 JSON
2. 教學示範可以對照兩種儲存實作

---

### 3.8 Step H：更新 API 與測試腳本

1. 原有 API 路由盡量不改 path 與 contract
2. 更新 test\_\*.rest，確認 CRUD 行為一致
3. 增加至少 1 組資料庫錯誤情境測試（例如 FK 不存在）

這一步目標是確保「資料層升級」不破壞既有 API 使用方式。

---

### 3.9 Step I：完成定版與文件同步

1. README 新增資料庫啟動與 migration 步驟
2. 講義新增「常見錯誤排查」段落
3. 提交一次乾淨 commit，訊息清楚標示 V8 升級內容

---

## 4. 常見錯誤與排查

### 錯誤 1：連線字串正確但仍連不上

檢查：

1. 是否把 pooled URL 用在 migration
2. 是否漏了 sslmode=require
3. 是否實際載入到 .env（不是只寫檔沒重啟）

### 錯誤 2：migration 成功但查不到資料表

檢查：

1. migrate 指向的 URL 是否和目前查看的 project 同一個
2. 是否跑在錯誤 database name

### 錯誤 3：JSON 搬遷後查詢結果不一致

檢查：

1. order_items 關聯鍵是否對齊
2. 金額是否重算規則不同
3. createdAt / submittedAt 時區處理是否一致

---

## 5. 升級完成的驗收標準

達到以下條件才算完成 V8 第一階段：

1. Neon project 可穩定連線
2. drizzle migration 可重複執行
3. PgStore 能覆蓋既有主要 API 流程
4. 測試腳本結果與 JSON 版本一致（或差異可解釋）
5. 文件已更新，隊友可在 30 分鐘內重現環境

---

## 6. 下一步（接 V9）

當 V8 完成後，就可以進入 Better Auth + Google provider。
此時資料庫已就位，auth tables 與業務 tables 能在同一套 PostgreSQL 內整合，後續權限與 session 設計會更乾淨。

建議接著閱讀：

- [04_Elysia + Better Auth + Google provider 實作步驟清單.md](/root/00_nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/04_Elysia + Better Auth + Google provider 實作步驟清單.md:1)

---

## 附錄：建議的最小目錄調整

```text
.
├─ db/
│  ├─ schema.ts
│  ├─ client.ts
│  └─ migrate.ts
├─ drizzle/
│  └─ 0001_*.sql
├─ scripts/
│  └─ migrate-json-to-db.ts
├─ store/
│  ├─ Store.ts
│  ├─ index.ts
│  ├─ json/
│  │  └─ JsonFileStore.ts
│  └─ pg/
│     └─ PgStore.ts
└─ .env
```

這個結構的重點不是檔名固定，而是責任分層清楚：

1. schema/migration 屬於資料庫層
2. store 屬於業務資料存取層
3. backend route 只關注 API contract 與流程
