# 開發進度紀錄

每階段完成後追加一段（15 行內）。最新一段放在最下方。
格式：完成內容／新增檔案與對外函式（名稱、參數、回傳）／測試結果／與計畫書不同的地方／下一階段注意事項。

---

## 階段 0：骨架、存檔、設定與 UI（2026-11-09）
- 完成內容：GitHub Pages 外殼、hash 路由、手機底部五分頁／桌面側欄、更多清單、施工占位頁；設定支援四檔字級與 JSON 匯出入，未加入玩法。
- 新增檔案與對外函式：`index.html`、`js/app.js`、`css/{tokens,base,components}.css`、`js/pages/*.js` 的 `render(context) → Element`；Huninn 2.1 與授權自託管。
- `js/core/storage.js`：`createStorage({backend?,notify?,migrationSteps?}) → {load(),save(save),exportSave(),importSave(json),mode,notices,backupKeys(),getMemoryBackup(key)}`；load/save/import 回傳存檔副本，export 回傳 JSON 字串。
- 同模組：`createDefaultSave() → save`、`validateSave(save) → save`、`migrateSave(save,steps?) → save`、`getStorage() → singleton`、`exportSave() → string`、`importSave(json) → save`；匯出 `PREFIX/SAVE_KEY/SCHEMA_VERSION/migrations`，遷移項目為 `{from,to,migrate}`。
- IndexedDB：`createIndexedDB({indexedDB?}) → {open(),get(store,key),put(store,key,value),delete(store,key)}`，皆回傳 Promise；`contentDB` 為預設實例，stores 為 questions/images，交易完成才 resolve；本階段不開庫或建立題目。
- `js/core/store.js`：`createStore(storage?) / getStore() → {get(path?),set(path,value),subscribe(fn),importSave(json)}`；get/set/import 回傳副本，subscribe 回傳解除函式；另匯出 `get/set/subscribe`，同步存檔後通知 `(state,path)`。
- `js/core/config.js`：`loadBalance({fetcher?,url?}?) → Promise<config>`、`createConfig(data,{warn?}?) → {getBalance(path)}`、`getBalance(path) → value`；缺 key 拋錯、null 每 path 警告一次、底線欄位不可讀且排除驗證；唯一新增 JSON 為 data/balance.json。
- `js/core/rng.js`：`createRng(seed?) → () => number`、`shuffle(items,rng?) → 新陣列`、`weightedPick([{value,weight}],rng?) → value`；`js/core/events.js`：`createEventBus() → {on,off,emit}` 與預設 `events/on/off/emit`，`on(event,fn) → unsubscribe`、`off(event,fn)`、`emit(event,payload)`。
- `js/ui/`：`modal({title,message,confirmLabel?,cancelLabel?}) → Promise<boolean>`、`toast(message,{type?,duration?}?) → close()`、`mountCurrency(container,store) → unsubscribe`、`createImage({src?,alt?,className?}?) → Element`（缺圖自動占位）。
- 測試結果：`node --test` 18/18 通過，涵蓋前綴、損毀備份、讀寫失敗、v0→v1、匯入保護、狀態訂閱、事件、亂數與設定；git diff --check 通過。瀏覽器預覽 relay port 4173 逾時，重試仍失敗，手機畫面／字級重整／下載再匯入的瀏覽器驗收尚未完成。
- 與計畫書不同的地方：依本次 Prompt，前綴使用 edia-rpg-v1（PLAN／AGENTS 為 idea-rpg-v1）；備份操作統一放設定頁；未決數值維持 null，exp.dailyCap 的 null 表示依 PLAN 不設上限；無額外 JSON 套件或部署設定。
- 下一階段注意事項：階段 1 依賴 contentDB、store、config、rng 與缺圖／提示 UI；階段 2 依賴 store、config、rng、events、modal 與貨幣列。UI 匯入應走 `getStore().importSave(json)` 以同步狀態與訂閱；新增 schema 欄位時維護驗證與 migrations；後續獎勵仍須集中走 grant()。
