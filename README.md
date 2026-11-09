# 伊迪亞大陸 RPG

階段 0：純 HTML / CSS / 原生 ES Modules 的共用底層與網站外殼，尚無遊戲玩法。

## 本機使用

在專案根目錄啟動任意靜態 HTTP 伺服器，例如 `python3 -m http.server 8000`，然後開啟 `http://localhost:8000/`。請勿直接用 `file://` 開啟，ES Modules 與設定檔需要 HTTP。

執行測試：`node --test`（Node.js 22.7+ 或 24，使用原生 ES Modules 語法偵測，不需安裝依賴或建置）。

## GitHub Pages

將專案推送到 GitHub，在 Settings → Pages 選擇「Deploy from a branch」，指定分支的 `/ (root)`。所有路徑均相對於專案，支援 `/<repository>/` 子路徑；頁面使用 `#/adventure` 等 hash 路由。無需建置或套件設定。

## 共用介面

檔案與對外函式摘要見 `docs/PROGRESS.md`。存檔只使用 `edia-rpg-v1` 前綴，不會讀取舊前綴。

存檔降級到記憶體時，頁面會持續顯示提示。請在關閉前匯出 JSON；記憶體資料無法在重新整理後保留。損毀或未支援版本的原始內容會先備份到同前綴的 `:corrupt:<timestamp>` key；若瀏覽器連備份也無法寫入，會保留原始主 key 並暫存於記憶體備份。

`balance.json` 以 `null` 表示待設定；`exp.dailyCap: null` 表示依 PLAN 不設每日上限。`getBalance()` 對 null 每個路徑僅警告一次；未設定的遊戲功能在後續階段處理，不會在程式內補預設數字。

Huninn 2.1 字型由 justfont 提供，隨專案自行託管；授權見 `assets/fonts/OFL.txt`。
