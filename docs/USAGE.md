# 智能專案助理 Agent 產品使用教學

這份文件給產品 Demo、內部試點與企業導入使用。目標流程是：人類貼上會議逐字稿並審核高風險任務，其餘由 AI agent 自動拆解、派工、建立 GitLab issue、推送 Slack 與依期限催繳。

## 1. 產品能做什麼

智能專案助理會把一段不一定明確指定責任人的會議內容，轉成可追蹤的工作流。

核心能力：

- 逐字稿貼上：使用者直接貼上會議逐字稿或整理後會議記錄。
- AI 拆任務：從討論中抽出工作項目、期限、風險、優先級、依賴與可能 owner。
- 職責表派工：依公司內部人員職責表補足 owner、GitLab 帳號、Slack mention 與備援人。
- 分級自動化：低與中風險任務可自動送 GitLab / Slack；高風險任務保留人工審核。
- GitLab 監工：建立 issue，寫入摘要、任務依據、owner、期限、priority、risk level。
- Slack 推播：在公司大群發布派工摘要、mention 負責人，並支援依 due date 催繳。
- 整合狀態檢查：管理台會提示 AI、GitLab、Slack 哪些設定還缺。

## 2. 啟動本機產品

在專案根目錄執行：

```powershell
cd C:\Users\yeee3642\Documents\Playground\meeting-agent
npm install
npm run dev
```

打開：

```text
http://127.0.0.1:5173
```

產品簡報：

```text
http://127.0.0.1:5173/docs/product-deck/index.html
```

公開部署教學請看：

```text
docs/DEPLOYMENT.md
```

## 3. 第一次設定

所有 API key 都由使用者自己在 Web 管理台輸入。專案不內建任何 key，也不應把 key 寫入 README、程式碼、GitLab issue 或 Slack 訊息。

### 3.1 AI Provider

在管理台的 AI 設定區填入：

- Provider：選擇 Anthropic compatible 或 OpenAI compatible。
- Base URL：若使用公司 gateway，填 gateway endpoint；若使用官方服務則依 UI 預設。
- API Key / Auth Token：貼使用者自己的 token。
- Model：填部署可用的模型名稱。

如果沒有填 AI key，產品可以用 local demo parser 做展示，但正式派工應使用真實模型。

### 3.2 GitLab

在 GitLab 設定區填入：

- GitLab Base URL：通常是 `https://gitlab.com`。
- Project path：例如 `group-name/project-name`。
- Access token：建議使用 project access token 或 personal access token。

建議權限：

- `api`：最簡單，足以建立 issue 與查使用者。
- 若企業要最小權限，請依 GitLab 版本確認 issue 建立與 user lookup 所需 scope。

人員職責表中的 GitLab 帳號要能對應到專案成員。若 assignee 解析失敗，系統仍會在 issue body 寫入建議 owner 與 GitLab username，方便人工修正。

### 3.3 Slack

在 Slack 設定區填入：

- Bot token：Slack app 的 bot user OAuth token。
- Channel ID：目標大群或測試頻道 ID。

Slack app 建議設定：

- OAuth scope：`chat:write`。
- Bot 必須加入目標 channel。
- 若要真正 tag 人，職責表中的 Slack mention 應使用 `<@U...>` 格式。

測試時先使用測試頻道。確定格式、mention 與催繳規則正確後，再改到公司大群。

## 4. 人員職責表 XLSX 格式

管理台支援匯入 `.xlsx` / `.xls` 第一個 sheet。建議欄位如下：

| 欄位 | 必填 | 範例 | 用途 |
| --- | --- | --- | --- |
| `姓名` 或 `name` | 是 | `王筠萱` | 任務 owner 顯示名稱 |
| `GitLab 帳號` 或 `gitlabUsername` | 是 | `yuxuan` | GitLab assignee / issue body |
| `Slack Mention` 或 `slackMention` | 否 | `<@U012ABCDEF>` | Slack 真正 tag 人 |
| `職能` 或 `role` | 否 | `Frontend` | 顯示角色與備援判斷 |
| `負責模組` 或 `modules` | 否 | `dashboard, UI` | 模組路由 |
| `關鍵字` 或 `keywords` | 否 | `React, 管理台, 前端` | 關鍵字路由 |
| `備援人` 或 `backupName` | 否 | `定岳` | owner 缺席或衝突時參考 |

`modules` 與 `keywords` 可用逗號、分號、頓號或換行分隔。

## 5. 完整操作流程

### Step 1：貼上會議逐字稿

在主畫面貼上完整逐字稿。會議不需要明確寫「誰做什麼」，AI 會從語意推理任務。

範例：

```text
PM：今天測試整套智能專案助理，不使用真實客戶資料。
前端今天確認管理台任務卡和自動化狀態。
後端明天確認 GitLab issue 建立和 Slack 推播格式。
PM 下週整理企業版權限與稽核清單。
資安風險項目需要人工審核，不要自動送。
```

### Step 2：執行 AI 拆解

按下 AI 拆解或 Demo Parse。

系統會輸出任務卡，通常包含：

- 任務標題
- 任務摘要
- owner
- 派工依據
- due date
- priority
- risk level
- 是否需要人工審核
- GitLab / Slack 狀態

### Step 3：檢查派工依據

任務 owner 來源優先順序：

1. 逐字稿真正提到的人。
2. 職責表的模組與關鍵字匹配。
3. 角色或備援規則。
4. 無法判斷時標記 owner missing，要求人工補上。

### Step 4：審核高風險任務

目前策略：

- 低風險：可自動建立 issue 與 Slack 派工。
- 中風險：可自動建立 issue 與 Slack 派工。
- 高風險：保留人工審核，不直接送 Slack，也不應無審核建立外部任務。

常見高風險：

- 客戶資料、個資、法務、資安事件。
- 對外公告、跨部門發布、權限異動。
- 缺 owner、缺 due date 或任務描述不完整。

### Step 5：建立 GitLab issue

確認 GitLab 設定完整後，按建立 GitLab issue。

每個 issue 建議包含：

- 任務標題
- 會議摘要
- owner 與 GitLab username
- due date
- priority
- risk level
- 派工依據
- 原始會議片段或 AI 推理摘要

建立完成後，管理台會顯示 GitLab issue number 與同步狀態。

### Step 6：送 Slack 派工摘要

確認 Slack token、channel 與 mention 設定後送出。

低與中風險訊息可以直接發送。高風險任務應留在人工審核區，避免未確認內容被推到公司大群。

建議 Slack 訊息包含：

- 會議名稱與日期
- 本次派工數量
- 每個任務的 owner mention
- due date
- GitLab issue link
- 高風險待審核提醒

### Step 7：開啟自動催繳

自動催繳依 due date 判斷提醒時機。

目前 MVP 是瀏覽器 session 內的自動化：

- 可由 UI 開關啟用或停用。
- 會避免同一批任務重複發送。
- 測試外部整合時建議先關閉，避免重複推播。

正式企業部署需要：

- 後端排程器
- 資料庫
- 發送紀錄
- retry / backoff
- audit log
- 管理員可見的排程狀態

## 6. Demo 建議腳本

1. 打開 `http://127.0.0.1:5173`。
2. 匯入或確認人員職責表。
3. 貼上範例逐字稿。
4. 執行 AI 拆解。
5. 說明 owner 來源：逐字稿提及優先，否則用職責表。
6. 說明風險閘門：低/中風險自動，高風險人工審核。
7. 建立 GitLab issue。
8. 同步 GitLab issue 狀態。
9. 發送 Slack 派工摘要到測試頻道。
10. 展示自動催繳開關與排程說明。

## 7. 驗證與測試

開發者驗證：

```powershell
npm test
npm run typecheck
npm run build
```

目前測試覆蓋重點：

- AI / demo parser 任務輸出格式
- 職責表路由
- XLSX 匯入
- GitLab / Slack 設定檢查
- 低與中風險自動派工政策
- 高風險人工審核政策
- Slack reminder 與自動化規則

## 8. 常見問題

### AI 顯示 local demo parser

代表沒有填真實 AI API key，或 provider 設定不完整。Demo parser 可以展示流程，但正式派工請接真實模型。

### GitLab 401 / 403

通常是 token 錯誤、scope 不足、專案權限不足，或 project path 填錯。

### GitLab 建 issue 成功但沒有 assignee

代表 GitLab username 無法解析成 project member。請確認人員職責表 GitLab 帳號、專案成員權限與 token 是否能查 users。

### Slack `channel_not_found`

通常是 channel ID 錯誤，或 bot 沒有加入該 channel。

### Slack 有送出但沒有真正 tag 人

請確認職責表 `Slack Mention` 欄位使用 `<@U...>` 格式，而不是顯示名稱。

### 自動催繳沒有發送

請檢查：

- 任務是否有 due date。
- 任務是否不是高風險。
- Slack 設定是否完整。
- 排程開關是否啟用。
- 是否已經發送過同一批 reminder。

## 9. 安全與企業導入注意事項

- 不要把 AI、GitLab、Slack token commit 到 repo。
- 不要把 token 寫進 GitLab issue 或 Slack 訊息。
- 測試先用測試 channel 與測試 project。
- 高風險任務預設人工審核。
- 正式版應加入 SSO、RBAC、DB、audit log、長期排程器與 token vault。
- 職責表可能含公司人員資料，請用內部安全儲存與權限控管。

## 10. 產品簡報

產品簡報是單一 HTML 橫向翻頁 deck：

```text
docs/product-deck/index.html
```

啟動 dev server 後可開：

```text
http://127.0.0.1:5173/docs/product-deck/index.html
```
