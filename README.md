# 📅 每日值日生自動輪播網站 (GitHub Pages 部署版)

本專案是一個無後端依賴、純靜態的「每日值日生自動輪播網站」。專為 GitHub Pages 託管設計，支援自動根據工作日計算當日值日生、預覽下個月值班表，以及方便維護名單與放假補假設定。

---

## 📁 檔案結構說明

```text
.
├── index.html        # 網站主要 UI 頁面
├── style.css         # 響應式視覺樣式表
├── app.js            # 工作日輪換與動態計算核心邏輯
├── config.json       # 值日生名單、基準日與國定假日設定檔
└── image011.png      # 原始對照圖（參考用）
```

---

## 💡 我應該用 Firebase 還是用 JSON 寫死？

**【強烈建議：直接使用 `config.json` 寫死檔】**

1. **零成本與零複雜度**：GitHub Pages 為免費靜態網站託管，使用純 JSON 不需設定 Firebase 金鑰、無 API 配額限制、無跨域 CORS 問題。
2. **異動維護極其簡單**：
   - 當有**新進員工**、**離職員工**或**組別調整**時，只需要直接在 GitHub 上點選修改 `config.json` 檔案並 Commit，網站就會**自動即時更新**。
   - 不需要懂複雜的資料庫邏輯。

---

## ⚙️ 如何修改與維護 `config.json`？

`config.json` 範例內容：

```json
{
  "anchorDate": "2026-09-01",
  "anchorGroupIndex": 0,
  "holidays": [
    "2026-09-25",
    "2026-09-28",
    "2026-10-10"
  ],
  "groups": [
    { "id": 1, "members": ["廖錦龍", "李麗蓉"] },
    { "id": 2, "members": ["潘孟鑫", "簡孟泓"] },
    { "id": 3, "members": ["鍾坤晨", "陳志順"] },
    { "id": 4, "members": ["張正宇", "林聖淳"] },
    { "id": 5, "members": ["藍之廷", "洪螢阡"] },
    { "id": 6, "members": ["施政宏", "黃凱謙"] },
    { "id": 7, "members": ["林彥名", "閻語麟"] },
    { "id": 8, "members": ["高樹源", "鄭家興"] },
    { "id": 9, "members": ["趙若石", "蘇綻勝"] }
  ]
}
```

### 欄位與調整情境說明：

1. **`groups`（輪值組別名單）**：
   - **調整名單/換人**：直接修改 `members` 裡的名字（如 `["鍾坤晨", "新員工"]`）。
   - **新增組別**：在陣列末端補上一組 `{"id": 10, "members": ["A", "B"]}`。
   - **刪除組別**：直接刪除該項目。

2. **`anchorDate` 與 `anchorGroupIndex`（基準設定）**：
   - `anchorDate`：指定一個起算基準日期（如 `2026-09-01`）。
   - `anchorGroupIndex`：指定基準當天對應到 `groups` 的哪一組（`0` 代表第 1 組）。
   - **當人員發生重大異動時**：只需設定一個新的生效日期為 `anchorDate`，並設定當天為第 0 組即可重新起算。

3. **`holidays`（不排班放休日）**：
   - 包含國定假日、彈性放假日。網站計算時會自動排除週末（週六、週日）與此清單中的日期。

---

## 🏖️ JavaScript 如何知道哪些天是國定假日？

網頁系統已原生整合 **[政府資料開放平臺 Dataset 123662](https://data.gov.tw/dataset/123662)**（中華民國行政院人事行政總處 - 政府行政機關辦公日曆表）與 **ruyut/TaiwanCalendar** 開放資料，採用 **「雙管道備援機制」**：

1. **第一層：政府開放資料集 123662 (API / JSON 串接)**
   - 網頁載入時，`app.js` 會自動讀取政府官方 123662 資料集與 Daily 鏡像。
   - **完全精準包含**：國定假日（元旦、春節、清明、端午、中秋、國慶日）、彈性放假日，以及**週六補班日**（補班日也會自動被算為工作日進行排班）。

2. **第二層：週六與週日 (JS 原生判斷保底)**
   - 如果遇到無網路或 API 載入失敗，瀏覽器的 `Date.getDay()` 會自動判斷每週六、週日並排除排班。

3. **第三層：`config.json` 公司特有假 (自訂補充)**
   - 如果遇到「公司內部的自訂放休日/員工旅遊」，可以在 `config.json` 的 `holidays` 陣列中寫入日期（例如 `["2026-09-25", "2026-09-28"]`）補充備援！




1. 在 GitHub 上建立一個新的 Repository（儲存庫），例如 `duty-schedule`。
2. 將本資料夾內的所有檔案推送到 GitHub：
   ```bash
   git init
   git add .
   git commit -m "Initial commit for duty schedule"
   git branch -M main
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/duty-schedule.git
   git push -u origin main
   ```
3. 進入 GitHub Repository 的 **Settings** -> **Pages**。
4. 在 **Build and deployment** > **Branch** 選擇 `main` 分支並點擊 **Save**。
5. 等待 1-2 分鐘後，即可透過 `https://YOUR_GITHUB_USERNAME.github.io/duty-schedule/` 免費存取您的值日生自動輪撥網站！
