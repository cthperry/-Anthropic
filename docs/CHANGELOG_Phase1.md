# CHANGELOG — Phase 1 架構改善

日期：2026-02-08

## 概要

Phase 1 聚焦於降低全域耦合、統一 Service 初始化、合併 Firebase Rules、新增事件委派工具。
**不改 UI 外觀、不改 Firebase 資料結構、不改功能流程。**

---

## 1. core/registry.js — AppRegistry 增強

**新增 API：**

- `AppRegistry.ensureReady(name|[names], {silent})` — 統一 Service 初始化入口
  - idempotent：已初始化不重複執行
  - 並發安全：同一 Service 被多處呼叫只 init 一次
  - `silent: true`：失敗回傳 null 不拋錯
- `AppRegistry.getInitError(name)` — 查詢初始化失敗原因
- `AppRegistry.resetAll()` — 登出時重置追蹤狀態

**向後相容：** `window._svc()` / `window.getService()` 不變

---

## 2. core/event-delegate.js — 事件委派工具（新增）

取代 inline `onclick="Xxx.method()"`，使用 `data-action` + `data-*` 屬性分派。

```javascript
// 註冊
EventDelegate.bind('#main-content', {
  'customer-edit': (el) => CustomerUI.openForm(el.dataset.id),
});

// HTML
<button data-action="customer-edit" data-id="${id}">編輯</button>

// 解除
EventDelegate.unbind('#main-content');
```

---

## 3. 全部 Controller 重構（11 個）

| Controller | Before | After |
|---|---|---|
| RepairController | 6 段 try/catch 手動 init | `ensureReady` 2 行 |
| MachinesController | 5 個 window._svc + 手動 init | `ensureReady([5])` 1 行 |
| CustomerController | window._svc + 手動 init | `ensureReady` 1 行 |
| PartsController | 2 個 window.* init | `ensureReady([2])` 1 行 |
| QuotesController | 2 個 window.* init | `ensureReady([2])` 1 行 |
| OrdersController | 2 個 window.* init | `ensureReady([2])` 1 行 |
| MaintenanceController | window.* init | `ensureReady` 1 行 |
| WeeklyController | window.* init | `ensureReady` 1 行 |
| KBController | window.* init | `ensureReady` 1 行 |
| SettingsController | window.* init | `ensureReady` 1 行 |
| GuideController | window.* 直取 | AppRegistry.get |

---

## 4. Firebase Rules 合併

- 刪除 `firebase_database_rules.json`（較舊）
- 刪除 `firebase-database-rules.json`（較新）
- 新增 `database.rules.json`（合併版）

合併策略：
- `.indexOn` 取自較舊版（較完整）
- `.validate` 取自較新版（有欄位驗證）
- `users` / `usersByEmail` 權限取自較舊版（有 admin 判斷）
- `weeklyPlans` 加上 `.indexOn`（兩版合併）

---

## 5. HTML 載入順序調整

Desktop / Mobile HTML 在 `core/registry.js` 後新增：
```html
<script src="core/event-delegate.js"></script>
```

---

## 變更檔案清單

**替換（用新檔覆蓋舊檔）：**
- `core/registry.js`
- `features/repairs/repairs.controller.js`
- `features/machines/machines.controller.js`
- `features/customers/customers.controller.js`
- `features/parts/parts.controller.js`
- `features/quotes/quotes.controller.js`
- `features/orders/orders.controller.js`
- `features/maintenance/maintenance.controller.js`
- `features/weekly/weekly.controller.js`
- `features/kb/kb.controller.js`
- `features/settings/settings.controller.js`
- `features/guide/guide.controller.js`
- `V161_Desktop.html`
- `V161_Mobile.html`

**新增：**
- `core/event-delegate.js`
- `database.rules.json`

**可刪除：**
- `firebase_database_rules.json`
- `firebase-database-rules.json`
- `patch_phase1.js`（建議先執行一次後合入源碼再刪）
