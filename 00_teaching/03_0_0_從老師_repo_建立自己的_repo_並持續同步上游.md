# 從老師 repo 建立自己的 repo，並持續同步上游

這份文件的目的，是讓學生學會一個很實務的開發起手式：

1. 先把老師的專案 clone 下來
2. 再建立自己的空 GitHub repo
3. 把本機專案改接到自己的 repo
4. 後續一邊獨立開發，一邊保留同步老師更新的能力

如果這個流程沒學會，學生通常只會：

- clone 老師 repo 來看
- 但不知道怎麼變成自己的長期作品
- 也不知道老師後續更新時，自己該怎麼同步

---

## 1. 先建立正確觀念

建議固定使用這個 remote 分工：

- `upstream`：老師的 repo，代表教學主線來源
- `origin`：學生自己的 repo，代表自己真正要 push 的地方

這樣做的好處是：

- 不會把老師的 repo 當成自己要 push 的目標
- 後續老師有新教材或新版本時，可以很清楚地從 `upstream` 抓更新
- 自己的開發進度則推到 `origin`

簡化理解如下：

```text
upstream = 老師
origin   = 我自己
```

---

## 2. 最建議的起手式

### 步驟 1：先 clone 老師的 repo

```bash
git clone <老師-repo-url>
cd <專案資料夾>
```

此時先確認：

```bash
git remote -v
```

你通常會看到：

```text
origin  <老師-repo-url> (fetch)
origin  <老師-repo-url> (push)
```

這只是因為你剛 clone 下來，Git 預設把來源 repo 叫做 `origin`。

### 步驟 2：把老師的 repo 從 `origin` 改名成 `upstream`

```bash
git remote rename origin upstream
git remote -v
```

此時預期會變成：

```text
upstream  <老師-repo-url> (fetch)
upstream  <老師-repo-url> (push)
```

看到 `(push)` 不代表你之後應該往老師 repo 推。這只是 Git 顯示該 remote 目前具備的預設 push URL；課堂實務上，學生真正要 push 的目標應該是後面加上的 `origin`。

### 步驟 3：到 GitHub 建立自己的空 repo

建議：

1. repo 先建立成空的
2. 不要先勾 `README`
3. 不要先勾 `.gitignore`
4. 不要先勾 license

原因很簡單：你本機已經有完整專案了，不需要讓 GitHub 先幫你塞一份初始 commit。

### 步驟 4：把自己的 repo 加成新的 `origin`

```bash
git remote add origin <自己的-repo-url>
git remote -v
```

現在預期應該看到：

```text
origin    <自己的-repo-url> (fetch)
origin    <自己的-repo-url> (push)
upstream  <老師-repo-url> (fetch)
upstream  <老師-repo-url> (push)
```

### 步驟 5：把目前的 `main` 推到自己的 repo

```bash
git push -u origin main
```

`-u` 的作用是建立追蹤關係。之後你在本機 `main` 上執行 `git push` / `git pull`，Git 就知道預設要對應 `origin/main`。

完成後，學生就同時擁有：

- 本機完整專案
- 自己的 GitHub repo
- 老師 repo 的同步來源

---

## 3. 之後如何獨立開發

不建議長期直接在 `main` 上亂改。比較穩的做法是：

1. `main` 盡量保留成「跟老師主線接近」的同步基線
2. 自己的實作另外切 branch

例如：

```bash
git switch -c feat/my-menu-redesign
```

或：

```bash
git switch -c feat/v8-student-custom
```

之後平常開發就是：

```bash
git status
git add .
git commit -m "feat: customize menu flow"
git push -u origin feat/my-menu-redesign
```

這樣的好處是：

- `main` 還保留乾淨基線
- 自己的改造在 feature branch
- 後續要跟老師新版本對照時比較容易

---

## 4. 老師之後有更新時，學生要怎麼同步

這是整份文件最重要的部分。

### 情境 A：學生只是想把老師最新主線同步到自己本機 `main`

```bash
git switch main
git fetch upstream
git merge upstream/main
git push origin main
```

這四步分別代表：

1. 切回自己的本機 `main`
2. 從老師 repo 抓最新資料
3. 把老師的 `main` 合進自己的 `main`
4. 再把更新後的 `main` 推到自己的 GitHub repo

教學初期，先教 `merge upstream/main` 就夠，因為最直觀。

補充提醒：

- 若你前面沒有做 `upstream = 老師 / origin = 自己` 這個分工，那同步命令才會長得像 `merge origin/main`
- 但一旦開始獨立開發，建議就固定改用本文件這套命名，之後比較不會混淆

### 情境 B：學生正在自己的 feature branch 開發，但老師主線更新了

建議先更新自己的 `main`，再把新的 `main` 合進目前開發分支：

```bash
git switch main
git fetch upstream
git merge upstream/main
git push origin main

git switch feat/my-menu-redesign
git merge main
```

這樣的流程最容易理解：

```text
先更新 main
再把 main 合進自己的開發分支
```

### 情境 C：學生已經比較熟悉 Git，想讓歷史更乾淨

可以把最後一步改成：

```bash
git switch feat/my-menu-redesign
git rebase main
```

但這不是初學者的標準教法。課堂上建議先教 `merge`，等學生對 branch 與 commit 更熟後，再介紹 `rebase`。

### 情境 D：同步時出現 conflict 怎麼辦

這不代表 Git 壞掉，而是：

- 老師更新了某些地方
- 學生自己也改了同一段
- Git 不知道應該保留哪一版

此時應做的事是：

1. 先打開衝突檔案
2. 看清楚哪些是老師版本、哪些是自己版本
3. 手動整理成真正要保留的結果
4. 再 `git add <衝突檔案>`
5. 若你是 `merge` 流程，就再 `git commit`

所以 conflict 的本質不是失敗，而是「需要人來做最後判斷」。

---

## 5. 若學生已經 clone 老師 repo，但還沒建立自己的 repo

這是很常見的中途狀況。

假設學生現在本機已經有資料夾，也能正常開發，但還沒把它接到自己的 GitHub repo，則直接做下面這組修正即可：

```bash
git remote rename origin upstream
git remote add origin <自己的-repo-url>
git remote -v
git push -u origin main
```

若學生已經先切了自己的 branch，也可以再補推：

```bash
git push -u origin feat/my-menu-redesign
```

所以重點不是「一定要重 clone」，而是：

- 先把老師 repo 正名成 `upstream`
- 再把自己的 repo 加成 `origin`

---

## 6. 常見錯誤

### 錯誤 1：clone 老師 repo 後，直接把老師 repo 當成自己要 push 的地方

這樣很容易搞不清楚自己到底在推哪個遠端。

正確做法是：

- 老師 repo 改名成 `upstream`
- 自己 repo 才叫 `origin`

### 錯誤 2：在 GitHub 建 repo 時先讓平台自動建立 README

這會讓遠端比本機多一個初始 commit，第一次 push 容易多出不必要的處理。

### 錯誤 3：只會 `git pull origin main`，但不知道老師更新其實在 `upstream`

如果學生的 `origin` 是自己的 repo，那老師後續更新不會自己出現在 `origin`。

一定要先：

```bash
git fetch upstream
```

### 錯誤 4：把 `.env`、密碼、金鑰一起推上 GitHub

一定要確認：

- `.env` 不要 commit
- 只提交 `.env.example`
- push 前先看一次：

```bash
git status
```

### 錯誤 5：永遠只在 `main` 上改

短期看起來省事，但之後：

- 不好回看基線
- 不好同步老師更新
- 不好區分哪些是自己改的

---

## 7. 建議學生固定會的檢查指令

### 看目前分支

```bash
git branch --show-current
```

### 看目前連到哪些遠端

```bash
git remote -v
```

### 看本機是否有未提交修改

```bash
git status
```

### 看最近幾筆 commit

```bash
git log --oneline --decorate -n 5
```

---

## 8. 課堂建議口訣

可以讓學生固定記這三句：

```text
clone 下來只是起點
upstream 是老師
origin 是自己
```

以及同步更新時固定記：

```text
先更新 main
再更新自己的 branch
```

---

## 9. 最小標準流程總結

### 第一次建立自己的開發基線

```bash
git clone <老師-repo-url>
cd <專案資料夾>
git remote rename origin upstream
git remote add origin <自己的-repo-url>
git push -u origin main
```

### 老師主線有新更新時

```bash
git switch main
git fetch upstream
git merge upstream/main
git push origin main
```

### 自己正在 feature branch 開發時

```bash
git switch feat/my-menu-redesign
git merge main
```

---

## 10. 搭配閱讀

- `00_專案迭代講義.md`
- `03_2_V8_合併主線與_Render_最小部署_CI_CD_教案手冊.md`
- `03_3_GitHub_PR_模板與審查清單.md`
