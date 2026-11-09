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

## 階段 1：我的題庫與出題器（2026-11-09）
- 完成內容：四題型新增／編輯／刪除、篩選與計數、怪物門檻提示、圖片上傳／缺圖占位、JSON 合併匯入前驗證與確認；圖片與題目同交易，失敗 toast，不新增存檔欄位。
- 新增檔案與對外函式：`js/systems/questions.js`：`validateQuestion(q) → {ok,errors}`、`checkAnswer(q,input) → boolean`、`getPool(questions,mode) → Question[]`、`getMonsterAvailability(questions,config?) → {available,count,min,reason?}`。
- 同模組：`createQuestionPicker({rng?,recentWindow?}?) → {pick(pool),pickMany(pool,n)}`；空池 pick 回傳 undefined，pickMany 不超過池內唯一 id 數；近期紀錄只在記憶體。
- `js/systems/question-repo.js`：`createQuestionRepo({db?}?) / questionRepo → {list(),get(id),save(q,imageData?),remove(id),getImage(key),exportAll(),importAll(json)}`，皆 Promise；save 回題目、exportAll 回 JSON 字串、importAll 回 `{imported,skipped}`。
- 同模組：`parseQuestionImport(json) → {questions,images,skipped}`、`isImageDataURL(value) → boolean`；JSON 格式 `{version:1,questions:[],images:{imageKey:dataURL}}`，匯入圖片鍵衝突時重配以保護其他題目。
- 更新檔案：`js/pages/bank.js` 的 `render() → Element`；balance 新增 `questions.monsterMinPool:null`，沿用 `recentWindow:null` 並補 _note；未改共用底層與其他頁面。
- 測試結果：`node --test` 35/35（原有 18 個全通過）；`git diff --check` 通過；Chromium 驗證四題型 CRUD、篩選、圖片刪除、JSON 往返／略過／合併、重整保留、手機無水平溢出與寫入失敗提示，無 pageerror。
- 與計畫書不同的地方：補明未定義的序列化約定：createdAt／updatedAt 使用非負毫秒時間戳，圖片題 answer 為 null、自評輸入 boolean；recentWindow 待設定時只避免連續同題，未擅定視窗值。
- 下一階段注意事項：先載入 balance；monsterMinPool 為 null 時怪物不可用，仍須設定門檻／視窗；monster 題池必走 getPool，圖片自評用 true／false；題庫 JSON 與設定頁存檔 JSON 分開匯出。

## 階段 2：貨幣、物品、獎勵引擎、三選一元件（2026-11-10）
- 完成內容：共用獎勵包、六種核心獎勵、區域處理器介面、原子發放／grantId 冪等、來源限定修飾器；三選一與配件抽卡先存後顯示、重整還原、全收集補償、兌換券判斷。
- `js/systems/rewards.js`：`grant(state,bundle,ctx={grantId,items?,modifiers?,commit?}) → {ok,state,applied,errors}`；純計算後可用 commit 一次寫入；`registerRewardHandler(type,fn(draft,item,meta)) → unsubscribe`，處理器須同步且只修改 draft 或回傳新狀態。
- `js/systems/draw.js`：`drawThree(tableId,ctx={tables,balance,rng,regionId,storyEnabled}) → {ok,cards,errors}`；`loadDrawTables(fetcher?) → Promise<tables>`；資料由 loader 載入後注入純函式，null 回報「待設定」。
- 同模組：`drawAccessory(state,ctx={items,balance,rng}) → rewardItem`；`createDrawEngine(store,ctx) → {begin(drawId,tableId,options?),pickCard(drawId,index),restore()}`；begin 回傳 pendingDraw 或錯誤，pickCard 回傳 grant 結果；配件 tableId 為 accessory，options.source 為 boss／levelUp。
- `js/systems/catalog.js`：`getUnownedGeneralItems(items,owned,filter?) → items[]`（filter 為 predicate）、`loadCatalog(fetcher?) → Promise<items>`；`js/systems/inventory.js`：`canUseVoucher(state,items) → boolean`、`getInventory(items,owned) → [{...item,owned}]`。
- `js/ui/card-picker.js`：`mountCardPicker(container,{engine,store,cardBackSrc?}) → cleanup`；`currency-bar.js`：`mountCurrencyBar(container,store,regionId或函式) → unsubscribe`；`reward-feedback.js`：`presentGrant(result) → close`，統一 toast；新增獨立 CSS，未改既有頁面。
- 資料／存檔：新增 draw-tables.json 四表與 items.json 八件最小配件；balance 新增 drawTables、accessoryPool、accessoryFallbackStars；schema 1→2 遷移保留舊資料，新增 stars/shards/exp/vouchers/gems/ownedItems/grantedIds/pendingDraw，保留 currencies.stars 相容欄位。
- 測試結果：`node --test` 32/32 通過；Chromium 手機 viewport 實測缺圖占位、點選、toast、貨幣列及重整保留配件結果通過；`git diff --check` 通過。
- 與計畫書不同的地方：專案尚無階段 1 檔案／紀錄，本階段未依賴或補做題庫；依 Prompt 抽牌數量與未決權重維持 null，測試注入設定值；僅因 schema 升版修改階段 0 存檔層與遷移測試，store 等其餘底層不動。
- 下一階段注意事項：區域系統先註冊 progress/taskItem/magicStone 處理器；正式抽牌先補齊 null 數量／權重（通關前進度量依表為 ×1／×1、×1／×2）；頁面掛載新元件，所有 grant 結果交 presentGrant，後續技能只傳 modifiers，升等計算未實作。

## 階段 2：提交前驗證（2026-11-10）
- 完成內容：重新驗證階段 2，準備提交與目標 main 的 PR；遠端 main 已包含階段 1，本次以最新 main 為基底保留其全部變更。
- 新增對外函式：無；沿用上段所列階段 2 API。
- 測試結果：同步最新 main 後 node --test 49/49 通過（含階段 1）；Chromium 元件點選／重整還原與 git diff --check 通過。
- 與計畫書不同的地方：前段「尚無階段 1」僅指當時本地檢出狀態，遠端階段 1 已完成，現已納入。
- 下一階段注意事項：先設定 null 數值並註冊區域處理器；本 PR 不合併或部署。

## 題庫補強 A（2026-11-10）
- 完成內容：圖片題題幹選填與縮圖預覽；兩層資料夾、題數／聯合篩選、表單指定／勾選搬題、改名與確認刪除；四題型 CSV 空白範本、逐列驗證／確認匯入，失敗停止並提示成功筆數。
- 新增 `js/systems/question-folders.js`：`validateFolderName(name,siblings?) → {ok,name,errors}`、`buildFolderTree(folders,questions) → tree[]`（count 含子層、directCount 為本層）、`resolveFolderPath(path,folders) → {ok,folderId?,missing?,errors?}`、`getFolderQuestions(folderId,folders,questions) → Question[]`；null／孤兒 id 視為未分類。
- 新增 `js/systems/question-csv.js`：`buildTemplate(type) → BOM字串`、`parseCsv(text) → string[][]`（每列具非列舉 rowNumber）、`parseQuestionCsv(text,{imageFiles?,maxImageBytes?}?) → {type,rows,errors}`、`validateImageFile(file,maxImageBytes?) → void`（不合法拋錯）；匯出 CSV_HEADERS／DEFAULT_MAX_IMAGE_BYTES，純解析不寫 DB。
- `question-repo.js` 新增 Promise API：`listFolders() → Folder[]`、`saveFolder(folder) → Folder`、`removeFolder(id) → void`、`moveQuestions(ids,folderId) → void`；刪資料夾的搬題與刪除同交易，失敗全部回滾；JSON 加入 folders 並相同 id 合併，舊備份仍相容。
- contentDB 版本 1→2，匯出 `CONTENT_DB_VERSION=2`、`CONTENT_DB_STORES=['questions','images','folders']`；只建立缺少的 store，保留既有資料；folders 存 `{id,name,parentId,createdAt,updatedAt}`，不新增 localStorage 欄位或資料遷移。
- balance 僅新增 `questions.maxImageBytes:null` 並補同層 _note；null 使用 5MB，表單與 CSV 共用限制。怪物題數仍計算全部題目。
- 測試結果：`node --test` 72/72 通過（原有測試保留）；`git diff --check` 通過；Chromium 驗證 v1 資料保留升級、範本下載、資料夾／搬題／刪除、無題幹圖片、CSV 取消零寫入／新增不覆蓋／圖片比對／中途失敗計數、重整保留與手機無溢出，無 pageerror。
- 與計畫書不同的地方：依使用者補充，是非 CSV 標題改為 `folder,prompt,is_true`，填充維持 `folder,prompt,answer`，嚴格由標題辨識；未修改 PLAN 或正式階段編號，探險圖片檢視器本次不做。
- 對階段 3 的注意事項：圖片題可能無題幹；圖片檢視器規格見 PLAN 第 6 章；資料夾僅整理，不影響出題與怪物可用題數；未決 balance 數值仍待設定。
