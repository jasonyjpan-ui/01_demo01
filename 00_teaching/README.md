# `00_teaching` 講義閱讀索引

本資料夾收錄的是本專案的課堂講義、版本說明與補充文件。  
建議不要直接照檔名字面順序亂讀，而是依照下面的主線閱讀。

---

## 1. 主線閱讀順序

若是第一次閱讀這組教材，建議依序閱讀：

1. [00\_專案迭代講義.md](/root/00_nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/00_專案迭代講義.md:1)
   用來理解整個專案從 V1 到 V9 的版本脈絡與演進理由。

2. [01\_版本閱讀指南.md](/root/00_nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/01_版本閱讀指南.md:1)
   用來理解這個專案如何對照不同版本快照檔，避免讀 code 時迷路。

3. [01\_前端分離開發、整合進後端的作法.md](/root/00_nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/01_前端分離開發、整合進後端的作法.md:1)
   用來理解本專案目前的前後端開發與部署方式。

4. [02_0_API contract truth 的重要性與實作方式.md](/root/00_nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/02_0_API contract truth 的重要性與實作方式.md:1)
   進入 API contract 主題，理解為什麼要先固定 API 邊界。

5. [02_1_從目前 backend.ts 補齊 Elysia route schema 的實作步驟清單.md](/root/00*nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/02_1*從目前 backend.ts 補齊 Elysia route schema 的實作步驟清單.md:1)
   把 API contract truth 真正落到 route schema。

6. [02_2_導入 OpenAPI ／ Swagger 輸出.md](/root/00*nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/02_2*導入 OpenAPI ／ Swagger 輸出.md:1)
   把 route schema 輸出成可閱讀、可驗證的 API 文件。

7. [02*3_V7_Render*首次部署教案手冊.md](/root/00_nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/02_3_V7_Render_首次部署教案手冊.md:1)
   在 V7 結尾先完成第一次 Render 部署，建立平台操作感與驗證習慣。

8. [03_為什麼這個專案選 Drizzle + Neon.md](/root/00*nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/03*為什麼這個專案選 Drizzle + Neon.md:1)
   說明為什麼資料層升級選擇 `Drizzle + Neon`。

9. [03*0_0*從老師*repo*建立自己的*repo*並持續同步上游.md](/root/00_nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/03_0_0_從老師_repo_建立自己的_repo_並持續同步上游.md:1)
   用來教學生如何從老師的教學 repo 建立自己的長期開發基線，並保留同步上游更新的能力。

10. [03*0_1*老師版*repo*保護原則.md](/root/00_nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/03_0_1_老師版_repo_保護原則.md:1)
    用來補充老師端應如何保護教學主 repo，避免學生誤 push、共用憑證或直接污染主線。

11. [03*1_Drizzle+Neon*註冊與升級實作步驟清單.md](/root/00_nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/03_1_Drizzle+Neon_註冊與升級實作步驟清單.md:1)
    正式進入 V8 的資料庫升級實作。

12. [03*2_V8*合併主線與*Render*最小部署*CI_CD*教案手冊.md](/root/00_nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/03_2_V8_合併主線與_Render_最小部署_CI_CD_教案手冊.md:1)
    在 V8 完成後，補講「相對 V7 多了哪些部署調整」，並建立 V8 的主線治理與 CI/CD。

13. [03*3_GitHub_PR*模板與審查清單.md](/root/00_nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/03_3_GitHub_PR_模板與審查清單.md:1)
    提供課堂可直接套用的 PR 描述格式與審查流程。

14. [03*4_V8*合併與部署\_課堂評分Rubric.md](/root/00_nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/03_4_V8_合併與部署_課堂評分Rubric.md:1)
    提供助教評分標準，讓流程能力與 V8 的部署調整結果都可量化評估。

15. [04_Elysia + Better Auth + Google provider 實作步驟清單.md](/root/00_nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/04_Elysia + Better Auth + Google provider 實作步驟清單.md:1)
    當 V8 完成後，再進入 V9 的 auth 升級；完成後也應再補一次本版部署調整。

14. [04*2*新舊V7*設計詳解*為什麼做什麼怎麼做.md](/root/00_nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/04_2_新舊V7_設計詳解_為什麼做什麼怎麼做.md:1)
    對照舊 V7 與新 V7 的設計動機、責任切分與實作步驟，作為升級到 V8/V9 前的架構補課。

15. [04*3*舊V8*namespace改造*為什麼做什麼怎麼做.md](/root/00_nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/04_3_舊V8_namespace改造_為什麼做什麼怎麼做.md:1)
    說明舊 V8 在 PostgreSQL schema（namespace）隔離下如何恢復可運作，包含設計動機、改造內容與實作流程。

---

## 2. 補充閱讀

以下文件偏向特定版本或特定問題的補充說明：

- [90*V3_normalizeMenuItem*相容舊資料說明.md](/root/00_nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/90_V3_normalizeMenuItem_相容舊資料說明.md:1)
  補充 V3 中 `normalizeMenuItem()` 的相容舊資料設計。

- [91*V5_V6*差異與決策說明.md](/root/00_nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/91_V5_V6_差異與決策說明.md:1)
  補充 V5 與 V6 的差異與教學決策邏輯。

---

## 3. 封存與導向

- [02_2_導入 OpenAPI ／ Swagger 輸出_01.md](/root/00*nsPrj/01_backEnd/06_elysia/00_demo01/00_teaching/02_2*導入 OpenAPI ／ Swagger 輸出*01.md:1)
  這是舊副本保留用的封存導向頁，正式內容請以 `02_2*導入 OpenAPI ／ Swagger 輸出.md` 為準。

---

## 4. 使用建議

1. 若是第一次接觸本專案，先看「主線閱讀順序」。
2. 若是要回頭查某一版為什麼這樣改，再看補充閱讀。
3. 若是從舊連結跳到帶 `_01` 的檔案，先確認它是不是封存頁。
