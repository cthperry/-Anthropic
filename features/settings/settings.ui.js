/**
 * 設定 - UI 層
 * V161 - Settings Module - UI Layer
 */

class SettingsUI {
  constructor() {
    this.containerId = 'settings-container';
    this._saveDebounce = null;

    // 權限管理
    this._userAdminUsers = [];
  }

  isAdmin() {
    try { return (window.currentUser && window.currentUser.role) === 'admin'; } catch (_) { return false; }
  }

  async render(containerId = 'settings-container') {
    this.containerId = containerId;
    const container = document.getElementById(containerId);
    if (!container) return;

    const settings = await window.SettingsService.getSettings();

    // Maintenance settings（MNT 系列）：允許在「設定」頁面直接管理
    let maintSettings = null;
    try {
      if (window.MaintenanceService && typeof window.MaintenanceService.init === 'function') {
        // 避免在 Settings 頁面第一次進入時維護服務未初始化
        if (!window.MaintenanceService.isInitialized) await window.MaintenanceService.init();
        if (typeof window.MaintenanceService.getSettings === 'function') {
          maintSettings = window.MaintenanceService.getSettings();
        }
      }
    } catch (e) {
      console.warn('SettingsUI: MaintenanceService not ready, skip maintenance settings:', e);
      maintSettings = null;
    }

    // 取得公司清單（用於釘選新增 autocomplete）
    let companies = [];
    try {
      if (window.CustomerService && typeof window.CustomerService.init === 'function' && !window.CustomerService.isInitialized) {
        await window.CustomerService.init();
      }
      if (window.CustomerService && typeof window.CustomerService.getCompanies === 'function') {
        companies = window.CustomerService.getCompanies() || [];
      }
    } catch (e) {
      console.warn('SettingsUI: CustomerService not ready, skip company list:', e);
    }
    // 公司清單（用於釘選新增下拉）
    this._companyList = (companies || []).filter(Boolean);

    // local UI state (avoid repeatedly parsing DOM)
    this._pinnedCompanies = Array.isArray(settings.pinnedCompanies) ? [...settings.pinnedCompanies] : [];
    this._pinnedTopN = Number(settings.pinnedTopN || 8);

    // machine catalog state
    const baseCatalog = (window.AppConfig && window.AppConfig.business && typeof window.AppConfig.business.machineCatalog === 'object')
      ? window.AppConfig.business.machineCatalog
      : {};
    this._machineCatalogBase = baseCatalog;
    this._machineCatalogCustom = (settings.machineCatalog && typeof settings.machineCatalog === 'object')
      ? JSON.parse(JSON.stringify(settings.machineCatalog))
      : {};

    const effectiveCatalog = (window.AppConfig && typeof window.AppConfig.getMachineCatalog === 'function')
      ? window.AppConfig.getMachineCatalog()
      : baseCatalog;

    const preferredOrder = ['MAR', 'MAP'];
    const allLines = Array.from(new Set([
      ...Object.keys(effectiveCatalog || {}),
      ...Object.keys(this._machineCatalogCustom || {})
    ])).filter(Boolean);
    allLines.sort((a, b) => {
      const ia = preferredOrder.indexOf(a);
      const ib = preferredOrder.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return String(a).localeCompare(String(b));
    });

    if (!this._machineCatalogSelectedLine || !allLines.includes(this._machineCatalogSelectedLine)) {
      this._machineCatalogSelectedLine = (allLines.includes('MAR') ? 'MAR' : (allLines[0] || ''));
    }

    const mcLine = this._machineCatalogSelectedLine;
    const mcModels = Array.isArray(effectiveCatalog?.[mcLine]) ? effectiveCatalog[mcLine] : [];
    const mcModelsText = mcModels.join('\n');
    const mcIsCustom = !!(mcLine && this._machineCatalogCustom && Object.prototype.hasOwnProperty.call(this._machineCatalogCustom, mcLine));
    const mcIsDefault = !!(mcLine && baseCatalog && Object.prototype.hasOwnProperty.call(baseCatalog, mcLine));
    // 設定頁 Tab（避免頁面過長）
    const tabKey = `rt_settings_tab_${(window.currentUser && window.currentUser.uid) ? window.currentUser.uid : 'anon'}`;
    const tabs = [
      { key: 'general', label: '一般' },
      { key: 'pinned', label: '釘選' },
      { key: 'equipment', label: '設備' },
      { key: 'templates', label: '模板/備份' },
      ...(this.isAdmin() ? [{ key: 'admin', label: '權限' }] : [])
    ];
    let activeTab = 'general';
    try { activeTab = localStorage.getItem(tabKey) || 'general'; } catch (_) { activeTab = 'general'; }
    if (!tabs.some(t => t.key === activeTab)) activeTab = 'general';
    this._settingsTabKey = tabKey;
    this._activeTab = activeTab;

    container.innerHTML = `
      <div class="settings-module">
        <div class="settings-toolbar module-toolbar">
          <div class="module-toolbar-left">
            <div class="page-title">
              <h2>設定</h2>
              <span class="muted">週報收件人、簽名檔、常用公司釘選、設備選項、顯示偏好</span>
            </div>
          </div>
          <div class="module-toolbar-right">
            <button class="btn primary" onclick="SettingsUI.saveNow()">儲存</button>
          </div>
        </div>

        <div class="settings-tabbar chip-row" id="settings-tabbar">
          ${tabs.map(t => `<button class="chip ${activeTab===t.key?'active':''}" type="button" data-tab="${t.key}">${t.label}</button>`).join('')}
        </div>

        <div class="settings-tab-pane ${activeTab==='general'?'active':''}" data-tab="general">
          <div class="settings-card card">
            <div class="settings-card-header card-head">
              <div>
                <div class="settings-card-title card-title">週報寄送收件人</div>
                <div class="settings-card-meta muted">可編輯；預設內建名單（以 ; 分隔）</div>
              </div>
            </div>
            <div class="settings-card-body card-body">
              <textarea class="input" rows="4" id="settings-weekly-recipients" placeholder="Name<email>; ...">${this.escape(settings.weeklyRecipients || '')}</textarea>
            </div>
          </div>

          <div class="settings-card card">
            <div class="settings-card-header card-head">
              <div>
                <div class="settings-card-title card-title">週報本週工作依據</div>
                <div class="settings-card-meta muted">建立日：只抓本週內建立的維修單；更新日：只抓本週內有更新的維修單</div>
              </div>
            </div>
            <div class="settings-card-body card-body">
              <div class="settings-row">
                <label class="settings-label">依據欄位</label>
                <select class="input" id="settings-weekly-basis">
                  <option value="created" ${settings.weeklyThisWeekBasis !== 'updated' ? 'selected' : ''}>建立日（預設）</option>
                  <option value="updated" ${settings.weeklyThisWeekBasis === 'updated' ? 'selected' : ''}>更新日</option>
                </select>
              </div>
            </div>
          </div>


          <div class="settings-card card">
            <div class="settings-card-header card-head">
              <div>
                <div class="settings-card-title card-title">簽名檔</div>
                <div class="settings-card-meta muted">會附加在 mailto 內容末端</div>
              </div>
            </div>
            <div class="settings-card-body card-body">
              <textarea class="input" rows="5" id="settings-signature" placeholder="例如：\nBest Regards,\nPerry">${this.escape(settings.signature || '')}</textarea>
            </div>
          </div>

          <div class="settings-card card">
            <div class="settings-card-header card-head">
              <div>
                <div class="settings-card-title card-title">顯示偏好</div>
                <div class="settings-card-meta muted">列表密度、簡易模式（可在此切換）</div>
              </div>
            </div>
            <div class="settings-card-body card-body">
              <div class="settings-row settings-row-top">
                <label class="settings-label">簡易模式</label>
                <div class="settings-col">
                  <label class="form-checkbox">
                    <input type="checkbox" id="settings-simple-mode" ${settings.simpleMode ? 'checked' : ''} />
                    <span>啟用精簡介面（隱藏進階模組）</span>
                  </label>
                  <div class="settings-hint muted">啟用後：側邊選單僅保留「維修 / 客戶 / 週報 / 指南 / 設定」，全域搜尋也會只搜尋保留模組。</div>
                </div>
              </div>

              <div class="settings-row">
                <label class="settings-label">列表密度</label>
                <select class="input" id="settings-density">
                  <option value="comfortable" ${settings.uiDensity === 'comfortable' ? 'selected' : ''}>舒適</option>
                  <option value="compact" ${settings.uiDensity === 'compact' ? 'selected' : ''}>緊湊</option>
                </select>
              </div>
              <div class="settings-hint" id="settings-status">尚未儲存</div>
            </div>
          </div>
        </div>

        <div class="settings-tab-pane ${activeTab==='pinned'?'active':''}" data-tab="pinned">
          <div class="settings-card card">
            <div class="settings-card-header card-head">
              <div>
                <div class="settings-card-title card-title">常用公司（Top N 釘選）</div>
                <div class="settings-card-meta muted">用於「新增維修單」快速選公司；以公司名稱為主</div>
              </div>
            </div>
            <div class="settings-card-body card-body">
              <div class="settings-row">
                <label class="settings-label">Top N</label>
                <input class="input" type="number" id="settings-pinned-topn" min="1" max="12" step="1" value="${Number(settings.pinnedTopN || 8)}" />
              </div>

              <div class="settings-row settings-row-top">
                <label class="settings-label">釘選清單</label>
                <div class="settings-col">
                  <div class="settings-inline settings-inline-gap">
                    <div class="input-with-dropdown" id="settings-pinned-dd">
                      <input class="input" id="settings-pinned-add" placeholder="輸入公司名稱後新增" autocomplete="off" />
                      <button class="input-dropdown-btn" type="button" id="settings-pinned-dd-btn" aria-label="展開公司清單" title="展開清單">▾</button>
                    </div>
                    <button class="btn" type="button" id="settings-pinned-add-btn">新增</button>
                  </div>

                  <div class="pinned-list" id="settings-pinned-list"></div>

                  <div class="settings-hint">
                    提示：可用 ↑/↓ 調整順序；順序會影響「常用公司」顯示優先順序。
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-tab-pane ${activeTab==='equipment'?'active':''}" data-tab="equipment">
          ${this.renderMaintenanceSettingsCard(maintSettings)}

          <div class="settings-card card">
            <div class="settings-card-header card-head">
              <div>
                <div class="settings-card-title card-title">設備產品線 / 機型清單</div>
                <div class="settings-card-meta muted">用於「新增維修單」的產品線 → 設備名稱快速選擇（可自訂）</div>
              </div>
            </div>
            <div class="settings-card-body card-body">
              <div class="mc-top">
                <div class="chip-row mc-lines" id="mc-lines"></div>

                <div class="mc-add">
                  <input class="input" id="mc-add-line" placeholder="新增產品線（例如：MAR/MAP）" />
                  <button class="btn" type="button" id="mc-add-line-btn">新增</button>
                </div>
              </div>

              <div class="mc-editor">
                <div class="mc-editor-head">
                  <div class="mc-title">目前產品線：<span id="mc-active-line">${this.escape(mcLine || '-')}</span></div>
                  <div class="mc-actions">
                    <button class="btn ghost" type="button" id="mc-reset-line-btn" ${(!mcLine || !mcIsCustom || !mcIsDefault) ? 'disabled' : ''}>恢復預設</button>
                    <button class="btn ghost danger-outline" type="button" id="mc-delete-line-btn" ${(!mcLine || !mcIsCustom || mcIsDefault) ? 'disabled' : ''}>刪除產品線</button>
                    <button class="btn ghost" type="button" id="mc-clear-all-btn" ${(!Object.keys(this._machineCatalogCustom || {}).length) ? 'disabled' : ''}>清除全部自訂</button>
                  </div>
                </div>

                <textarea class="input" rows="10" id="mc-models" placeholder="每行一個機型（例如：FlexTRAK-S）">${this.escape(mcModelsText || '')}</textarea>
                <div class="settings-hint" id="mc-hint">
                  ${mcLine ? `此產品線共 ${mcModels.length} 個機型。` : '尚未建立任何產品線。'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="settings-tab-pane ${activeTab==='templates'?'active':''}" data-tab="templates">
          ${this.renderRepairTemplatesCard()}
          ${this.renderBackupCard()}
        </div>

        ${this.isAdmin() ? `<div class="settings-tab-pane ${activeTab==='admin'?'active':''}" data-tab="admin">${this.renderUserAdminCard()}</div>` : ''}

        <div class="settings-savebar" id="settings-savebar">
          <div class="savebar-left">
            <span class="savebar-dot" aria-hidden="true"></span>
            <span id="settings-savebar-status">尚未儲存</span>
          </div>
          <div class="savebar-right">
            <button class="btn ghost" type="button" id="settings-savebar-top">回到頂部</button>
            <button class="btn primary" type="button" id="settings-savebar-save">儲存</button>
          </div>
        </div>
      </div>
    `;
    this.bind();

    // 權限管理初始化（admin only）
    if (this.isAdmin()) {
      try { await this.refreshUserAdminList(); } catch (e) { console.warn('UserAdmin init failed:', e); }
      this.bindUserAdmin();
    }
  }

  renderUserAdminCard() {
    return `
      <div class="settings-card card user-admin-card">
        <div class="settings-card-header card-head">
          <div>
            <div class="settings-card-title card-title">權限管理</div>
            <div class="settings-card-meta muted">僅管理員可見：建立預設使用者、調整角色、停用帳號</div>
          </div>
          <div class="settings-card-actions">
            <button class="btn" type="button" id="ua-refresh">重新整理</button>
            <button class="btn primary" type="button" id="ua-seed">建立預設使用者</button>
          </div>
        </div>
        <div class="settings-card-body card-body">
          <div class="ua-layout">
            <div class="ua-subbar">
              <div class="ua-note">
                預設密碼：<b>123456</b>；首次登入會強制設定新密碼（至少 6 位）。
              </div>
              <div class="ua-right">
                <div class="ua-count muted" id="ua-count"></div>
                <select class="input ua-select" id="ua-status-filter" title="狀態篩選">
                  <option value="all">全部</option>
                  <option value="enabled">啟用</option>
                  <option value="disabled">停用</option>
                  <option value="mustpw">需改密碼</option>
                  <option value="missing">缺少 profile</option>
                </select>
                <input class="input" id="ua-filter" placeholder="搜尋 email / 顯示名稱" />
                <button class="btn sm primary" id="ua-apply" type="button">🔍 搜尋</button>
                <button class="btn sm" id="ua-clear" type="button">🧹 清除</button>
                <button class="btn" type="button" id="ua-toggle-create">＋ 新增使用者</button>
              </div>
            </div>

            <div class="ua-createbar" id="ua-createbar" style="display:none;">
              <input class="input" id="ua-create-email" placeholder="新增使用者 Email" autocomplete="off" />
              <input class="input" id="ua-create-name" placeholder="顯示名稱（選填）" autocomplete="off" />
              <select class="input" id="ua-create-role" style="min-width: 140px;">
                <option value="engineer">engineer</option>
                <option value="admin">admin</option>
              </select>
              <button class="btn primary ua-mini" type="button" id="ua-create-btn">建立</button>
              <button class="btn ghost ua-mini" type="button" id="ua-create-cancel">取消</button>
            </div>
            <div class="ua-create-hint muted" id="ua-create-hint" style="display:none;">
              建立後預設密碼為 <b>123456</b>；首次登入會要求改密碼。
            </div>

            <div class="table-wrap ua-table-wrap">
              <table class="table zebra ua-table" style="min-width: 1100px;">
                <thead>
                  <tr>
                    <th style="width: 260px;">Email</th>
                    <th style="width: 180px;">顯示名稱</th>
                    <th style="width: 140px;">角色</th>
                    <th style="width: 180px;">建立時間</th>
                    <th style="width: 220px;">狀態</th>
                    <th style="width: 260px;">操作</th>
                  </tr>
                </thead>
                <tbody id="ua-tbody">
                  <tr><td colspan="6" class="muted" style="padding:14px;">載入中...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `.trim();
  }


  renderBackupCard() {
    const ver = (window.AppConfig && typeof window.AppConfig.getFullVersion === 'function') ? window.AppConfig.getFullVersion() : '';
    return `
      <div class="settings-card card backup-card">
        <div class="settings-card-header card-head">
          <div>
            <div class="settings-card-title card-title">備份 / 還原（本機資料）</div>
            <div class="settings-card-meta muted">用於換電腦、換瀏覽器或意外清除快取前先備份。備份範圍：此系統寫入 localStorage 的資料（不含 Firebase 登入 token）。</div>
          </div>
          <div class="settings-card-actions">
            <button class="btn" type="button" id="backup-export">下載備份</button>
            <button class="btn" type="button" id="backup-import">從備份還原</button>
            <input type="file" id="backup-file" accept="application/json" style="display:none" />
          </div>
        </div>
        <div class="settings-card-body card-body">
          <div class="backup-row">
            <label class="muted" style="display:flex;align-items:center;gap:8px;">
              <input type="checkbox" id="backup-clear" />
              匯入前先清除本機資料（僅此裝置）
            </label>
          </div>
          <div class="backup-meta muted">目前版本：${this.escape(ver)}</div>
        </div>
      </div>
    `.trim();
  }

  // =========================
  // 機台保養（Maintenance）設定
  // - 將保養模組的 Email / 提醒規則等設定同步放到「設定」頁面
  // =========================
  renderMaintenanceSettingsCard(maintSettings) {
    // 若專案未載入 Maintenance 模組，直接略過
    if (!window.MaintenanceService) return '';

    const ms = (maintSettings && typeof maintSettings === 'object') ? maintSettings : {
      emailTo: '',
      emailCc: '',
      defaultRemindDays: [3, 7],
      useOwnerEmail: false,
      autoEmailEnabled: false,
      autoEmailIncludeNoRecord: false
    };

    const days = Array.isArray(ms.defaultRemindDays) ? ms.defaultRemindDays : [3, 7];
    const daysText = days.join(', ');

    return `
      <div class="settings-card card">
        <div class="settings-card-header card-head">
          <div>
            <div class="settings-card-title card-title">機台保養設定</div>
            <div class="settings-card-meta muted">保養提醒收件人、預設提醒天數與自動寄信（Cloud Functions）</div>
          </div>
          <div class="settings-card-actions">
            <button class="btn" type="button" onclick="SettingsUI.saveMaintenanceNow()">儲存保養設定</button>
          </div>
        </div>
        <div class="settings-card-body card-body">
          <div class="maint-settings-grid">
            <div>
              <div class="settings-hint" style="margin-bottom:6px;">Email To（預設收件人）</div>
              <input id="settings-maint-email-to" class="input" placeholder="Email To（預設收件人）" value="${this.escapeAttr(ms.emailTo || '')}" />
            </div>
            <div>
              <div class="settings-hint" style="margin-bottom:6px;">Email Cc（可選）</div>
              <input id="settings-maint-email-cc" class="input" placeholder="Email Cc（可選）" value="${this.escapeAttr(ms.emailCc || '')}" />
            </div>
            <div>
              <div class="settings-hint" style="margin-bottom:6px;">預設提醒天數（例如 3,7）</div>
              <input id="settings-maint-default-remind" class="input" placeholder="預設提醒天數（例如 3,7）" value="${this.escapeAttr(daysText)}" />
            </div>
            <div>
              <div class="settings-hint" style="margin-bottom:6px;">說明</div>
              <div class="muted" style="line-height:1.45;">
                1) 保養模組內已移除「提醒清單/設定區塊」，請在此頁統一管理。<br/>
                2) 自動寄信為後端排程（非 mailto），需部署 functions（見 docs/MNT-4_SETUP_CloudFunctions_AutoEmail.md）。
              </div>
            </div>
          </div>

          <div class="maint-settings-chips">
            <label class="chip" style="display:flex;gap:8px;align-items:center;user-select:none;">
              <input id="settings-maint-use-owner-email" type="checkbox" ${ms.useOwnerEmail ? 'checked' : ''} />
              優先使用負責人 Email
            </label>
            <label class="chip" style="display:flex;gap:8px;align-items:center;user-select:none;">
              <input id="settings-maint-auto-email-enabled" type="checkbox" ${ms.autoEmailEnabled ? 'checked' : ''} />
              啟用自動 Email（需部署 Cloud Functions）
            </label>
            <label class="chip" style="display:flex;gap:8px;align-items:center;user-select:none;">
              <input id="settings-maint-auto-email-no-record" type="checkbox" ${ms.autoEmailIncludeNoRecord ? 'checked' : ''} />
              自動提醒包含「尚無紀錄」
            </label>
          </div>
        </div>
      </div>
    `;
  }

  async refreshUserAdminList() {
    const tbody = document.getElementById('ua-tbody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" class="muted" style="padding:14px;">載入中...</td></tr>`;

    if (!window.UserAdminService) {
      tbody.innerHTML = `<tr><td colspan="6" style="padding:14px; color: var(--color-error);">UserAdminService 未載入（請確認 core/user-admin.js）</td></tr>`;
      return;
    }

    let users = await window.UserAdminService.listUsers();
    users = Array.isArray(users) ? users : [];

    // 將預設使用者補齊到列表（即便 /users profile 被刪除，也能顯示並提供修復/寄送重設密碼）
    try {
      const defaults = window.UserAdminService.getDefaultUsers ? window.UserAdminService.getDefaultUsers() : [];
      const present = new Set(users.map(u => String(u.email || '').toLowerCase()).filter(Boolean));
      for (const d of (defaults || [])) {
        const email = String(d.email || '').trim().toLowerCase();
        if (!email || present.has(email)) continue;
        users.push({
          uid: '',
          email: d.email,
          displayName: d.displayName || (email.split('@')[0] || ''),
          role: d.role || 'engineer',
          isDisabled: false,
          mustChangePassword: true,
          _missingProfile: true
        });
      }

      // admin 置頂，其餘依 email 排序（與 service 行為一致）
      users.sort((a, b) => {
        const ra = (a.role === 'admin') ? '0' : '1';
        const rb = (b.role === 'admin') ? '0' : '1';
        if (ra !== rb) return ra.localeCompare(rb);
        return String(a.email || '').localeCompare(String(b.email || ''));
      });
    } catch (_) {}

    this._userAdminUsers = users;
    if (!this._userAdminUsers.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted" style="padding:14px;">尚無資料（可能尚未建立使用者 profile）</td></tr>`;
      return;
    }

    // 渲染（含搜尋過濾）
    this.renderUserAdminTbody();
  }

  renderUserAdminTbody() {
    const tbody = document.getElementById('ua-tbody');
    if (!tbody) return;

    const kw = String(document.getElementById('ua-filter')?.value || '').trim().toLowerCase();
    let list = Array.isArray(this._userAdminUsers) ? this._userAdminUsers : [];
    if (kw) {
      list = list.filter(u => {
        const hay = `${(u.email || '')} ${(u.displayName || '')}`.toLowerCase();
        return hay.includes(kw);
      });
    }
    const sf = String(document.getElementById('ua-status-filter')?.value || 'all').trim();
    if (sf && sf !== 'all') {
      list = list.filter(u => {
        const missing = !u.uid;
        const disabled = (u.isDisabled === true);
        const must = (u.mustChangePassword === true);
        if (sf === 'missing') return missing;
        if (missing) return false;
        if (sf === 'enabled') return !disabled;
        if (sf === 'disabled') return disabled;
        if (sf === 'mustpw') return (!disabled && must);
        return true;
      });
    }

    // 顯示筆數（篩選後 / 總筆數）
    try {
      const total = (Array.isArray(this._userAdminUsers) ? this._userAdminUsers : []).length;
      const countEl = document.getElementById('ua-count');
      if (countEl) countEl.textContent = total ? `顯示 ${list.length} / ${total}` : '';
    } catch (_) {}


    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted" style="padding:14px;">查無符合資料</td></tr>`;
      return;
    }

    const fmt = (v) => {
      if (!v) return '';
      try {
        if (window.RepairModel && typeof window.RepairModel.formatDateTime === 'function') {
          return window.RepairModel.formatDateTime(v);
        }
      } catch (_) {}
      try {
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) return '';
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const da = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return `${y}-${m}-${da} ${hh}:${mm}`;
      } catch (_) {}
      return '';
    };

    const meUid = (() => {
      try { return (window.currentUser && window.currentUser.uid) ? String(window.currentUser.uid) : ''; } catch (_) { return ''; }
    })();

    const rows = list.map(u => {
      const role = (u.role === 'admin') ? 'admin' : 'engineer';
      const missing = !u.uid;
      const disabled = (u.isDisabled === true);
      const must = (u.mustChangePassword === true);
      const chipMissing = `<span class="chip chip-warn">缺少 profile</span>`;
      const chipEnable = missing ? '' : (disabled ? `<span class="chip chip-danger">停用</span>` : `<span class="chip">啟用</span>`);
      const chipPw = missing ? '' : (must ? `<span class="chip chip-warn">需改密碼</span>` : `<span class="chip chip-ok">正常</span>`);

      const isSelf = (!missing && meUid && String(u.uid || '') === meUid);
      const disableBtn = missing
        ? ''
        : `<button class="btn ghost danger-outline ua-mini" type="button" data-act="toggleDisable" ${isSelf ? 'disabled title="不可停用自己"' : ''}>${disabled ? '解除停用' : '停用'}</button>`;

      const statusHtml = missing
        ? `<div class="ua-status-row">${chipMissing}</div>`
        : `<div class="ua-status-row">${chipEnable}${chipPw}${disableBtn}</div>`;
      const uidAttr = missing ? '' : this.escape(u.uid);
      const emailAttr = this.escape(u.email || '');

      const createdText = missing ? '' : (fmt(u.createdAt) || '');
      const createdCell = createdText ? this.escape(createdText) : '—';

      return `
        <tr data-uid="${uidAttr}" data-email="${emailAttr}" data-missing="${missing ? '1' : '0'}">
          <td class="mono">${this.escape(u.email || '')}</td>
          <td>${this.escape(u.displayName || '')}</td>
          <td>
            <select class="input ua-role" style="min-width: 120px;">
              <option value="admin" ${role === 'admin' ? 'selected' : ''}>admin</option>
              <option value="engineer" ${role === 'engineer' ? 'selected' : ''}>engineer</option>
            </select>
          </td>
          <td class="mono muted">${createdCell}</td>
          <td>${statusHtml}</td>
          <td>
            <div class="ua-actions">
              ${missing
                ? `<button class="btn ghost" type="button" data-act="restore">修復</button>`
                : (must
                    ? `<button class="btn ghost" type="button" data-act="clearpw" title="解除：下次登入不再強制改密碼">解除需改密碼</button>`
                    : `<button class="btn ghost" type="button" data-act="forcepw" title="下次登入強制改密碼">強制改密碼</button>`
                  )
              }
              <button class="btn ghost" type="button" data-act="resetpw" title="寄送重設密碼">寄送重設</button>
            </div>
          </td>
        </tr>
      `.trim();
    }).join('');

    tbody.innerHTML = rows;
  }

  bindUserAdmin() {
    const refreshBtn = document.getElementById('ua-refresh');
    const seedBtn = document.getElementById('ua-seed');
    const tbody = document.getElementById('ua-tbody');
    const filterInput = document.getElementById('ua-filter');
    const applyBtn = document.getElementById('ua-apply');
    const clearBtn = document.getElementById('ua-clear');
    const statusSel = document.getElementById('ua-status-filter');
    const toggleCreateBtn = document.getElementById('ua-toggle-create');
    const createBar = document.getElementById('ua-createbar');
    const createHint = document.getElementById('ua-create-hint');
    const createEmail = document.getElementById('ua-create-email');
    const createName = document.getElementById('ua-create-name');
    const createRole = document.getElementById('ua-create-role');
    const createBtn = document.getElementById('ua-create-btn');
    const createCancel = document.getElementById('ua-create-cancel');

    if (!tbody) return;
    const applyNow = () => {
      try { this.renderUserAdminTbody(); } catch (_) {}
    };

    if (applyBtn) applyBtn.addEventListener('click', applyNow);

    if (filterInput) {
      filterInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') applyNow();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        try { if (filterInput) filterInput.value = ''; } catch (_) {}
        try { if (statusSel) statusSel.value = 'all'; } catch (_) {}
        applyNow();
      });
    }


    const setCreateOpen = (open) => {
      if (!createBar || !createHint || !toggleCreateBtn) return;
      createBar.style.display = open ? '' : 'none';
      createHint.style.display = open ? '' : 'none';
      toggleCreateBtn.textContent = open ? '× 取消新增' : '＋ 新增使用者';
      if (open) {
        try { createEmail?.focus(); } catch (_) {}
      } else {
        try {
          if (createEmail) createEmail.value = '';
          if (createName) createName.value = '';
          if (createRole) createRole.value = 'engineer';
        } catch (_) {}
      }
    };

    if (toggleCreateBtn) {
      toggleCreateBtn.addEventListener('click', () => {
        const isOpen = (createBar && createBar.style.display !== 'none');
        setCreateOpen(!isOpen);
      });
    }

    if (createCancel) {
      createCancel.addEventListener('click', () => setCreateOpen(false));
    }

    const doCreate = async () => {
      if (!window.UserAdminService) {
        window.UI.toast('UserAdminService 未載入（請確認 core/user-admin.js）', { type: 'error' });
        return;
      }
      const email = String(createEmail?.value || '').trim().toLowerCase();
      const displayName = String(createName?.value || '').trim();
      const role = String(createRole?.value || 'engineer');
      if (!email) {
        window.UI.toast('請輸入 Email', { type: 'warning' });
        try { createEmail?.focus(); } catch (_) {}
        return;
      }
      try {
        if (createBtn) { createBtn.disabled = true; createBtn.textContent = '建立中...'; }
        const res = await window.UserAdminService.createUser({ email, displayName, role });
        const st = String(res?.status || '');
        if (st === 'created') {
          window.UI.toast(`已建立使用者：${email}`, { type: 'success' });
        } else if (st === 'restored' || st === 'repaired') {
          window.UI.toast(`已修復 profile：${email}`, { type: 'success' });
        } else if (st === 'needs_reset') {
          window.UI.toast(`需重設密碼後登入：${email}`, { type: 'warning' });
        } else if (st === 'exists') {
          window.UI.toast(`Email 已存在：${email}`, { type: 'warning' });
        } else if (st === 'invalid') {
          window.UI.toast('Email 無效', { type: 'warning' });
        } else {
          window.UI.toast(`建立失敗：${email}`, { type: 'error' });
        }
        await this.refreshUserAdminList();
        setCreateOpen(false);
      } catch (e) {
        console.warn(e);
        window.UI.toast('建立失敗：' + (e && e.message ? e.message : 'unknown'), { type: 'error' });
      } finally {
        if (createBtn) { createBtn.disabled = false; createBtn.textContent = '建立'; }
      }
    };

    if (createBtn) {
      createBtn.addEventListener('click', doCreate);
    }
    const bindEnter = (el) => {
      if (!el) return;
      el.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          doCreate();
        }
      });
    };
    bindEnter(createEmail);
    bindEnter(createName);

    if (refreshBtn) {
      const onRefreshUsers = async () => { try { await this.refreshUserAdminList(); } catch (e) { console.warn(e); } };
      refreshBtn.addEventListener('click', (window.guard ? window.guard(onRefreshUsers, 'Settings') : onRefreshUsers));
    }

    if (seedBtn) {
      const onSeedUsers = async () => {
        try {
          const ok = await window.UI.confirm({
            title: '建立預設使用者',
            message: '將建立 5 個帳號（預設密碼 123456，首次登入需改密碼）。\n\n若 Email 已存在會嘗試修復 profile/索引；若仍無法取得 UID，會標記為需重設密碼。',
            okText: '開始建立',
            cancelText: '取消'
          });
          if (!ok) return;

          seedBtn.disabled = true;
          seedBtn.textContent = '建立中...';
          const results = await window.UserAdminService.seedDefaultUsers();
          const created = results.filter(r => r.status === 'created').length;
          const repaired = results.filter(r => (r.status === 'restored' || r.status === 'repaired')).length;
          const needsReset = results.filter(r => r.status === 'needs_reset').length;
          const exists = results.filter(r => r.status === 'exists').length;
          const failed = results.filter(r => r.status === 'failed').length;
          window.UI.toast(`已完成：新增 ${created}、修復 ${repaired}、需重設密碼 ${needsReset}、已存在 ${exists}、失敗 ${failed}`, { type: (failed || needsReset) ? 'warning' : 'success' });
          await this.refreshUserAdminList();
        } catch (e) {
          console.warn(e);
          window.UI.toast('建立失敗：' + (e && e.message ? e.message : 'unknown'), { type: 'error' });
        } finally {
          seedBtn.disabled = false;
          seedBtn.textContent = '建立預設使用者';
        }
      };
      seedBtn.addEventListener('click', (window.guard ? window.guard(onSeedUsers, 'Settings') : onSeedUsers));
    }

    // role change + actions
    const onUserAdminChange = async (e) => {
      const target = e.target;
      if (!target || !target.classList || !target.classList.contains('ua-role')) return;
      const tr = target.closest('tr[data-uid]');
      const uid = tr ? tr.getAttribute('data-uid') : '';
      const newRole = String(target.value || 'engineer');

      // 缺少 uid（profile 被刪除）的列：角色選擇僅供「修復」時套用，不在這裡直接寫入
      if (!uid) return;

      try {
        const me = (window.currentUser && window.currentUser.uid) ? String(window.currentUser.uid) : '';
        if (me && uid === me) {
          const ok = await window.UI.confirm({
            title: '變更自己的角色',
            message: '你正在變更自己的角色。若改成 engineer，將失去「權限管理」功能。\n\n確定繼續？',
            okText: '確定',
            cancelText: '取消',
            tone: 'danger'
          });
          if (!ok) {
            // revert
            await this.refreshUserAdminList();
            return;
          }
        }

        await window.UserAdminService.updateUserRole(uid, newRole);
        window.UI.toast('已更新角色', { type: 'success' });
      } catch (err) {
        console.warn(err);
        window.UI.toast('更新失敗：' + (err && err.message ? err.message : 'unknown'), { type: 'error' });
        await this.refreshUserAdminList();
      }
    };
    tbody.addEventListener('change', (window.guard ? window.guard(onUserAdminChange, 'Settings') : onUserAdminChange));

    const onUserAdminClick = async (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('button[data-act]') : null;
      if (!btn) return;
      const act = btn.getAttribute('data-act');
      const tr = btn.closest('tr[data-uid]');
      const uid = tr ? String(tr.getAttribute('data-uid') || '') : '';
      const emailKey = tr ? String(tr.getAttribute('data-email') || '') : '';
      const row = this._userAdminUsers.find(x => {
        const xuid = String(x.uid || '');
        const xemail = String(x.email || '');
        if (uid) return xuid === uid;
        return emailKey && xemail === emailKey;
      }) || null;

      try {
        if (act === 'resetpw') {
          const email = (row && row.email) ? String(row.email) : String(tr?.getAttribute('data-email') || '');
          if (!email) return;
          const ok = await window.UI.confirm({
            title: '寄送重設密碼',
            message: `將寄送重設密碼信到：

${email}

使用者可透過信件重設密碼後登入。`,
            okText: '寄送',
            cancelText: '取消'
          });
          if (!ok) return;

          try {
            await firebase.auth().sendPasswordResetEmail(email);
            window.UI.toast('已寄送重設密碼信', { type: 'success' });
          } catch (e) {
            console.warn(e);
            window.UI.toast('寄送失敗：' + (e && e.message ? e.message : 'unknown'), { type: 'error' });
          }
          return;
        } else if (act === 'restore') {
          const email = (row && row.email) ? String(row.email) : String(tr?.getAttribute('data-email') || '');
          const displayName = (row && row.displayName) ? String(row.displayName) : '';
          const desiredRole = String(tr?.querySelector?.('select.ua-role')?.value || (row && row.role) || 'engineer');
          if (!email) return;

          const ok = await window.UI.confirm({
            title: '修復使用者資料',
            message: `將嘗試修復以下帳號的 /users profile 與索引：

${email}

若系統無法取得 UID（常見原因：索引被刪除且密碼已改），請改用「寄送重設密碼」並讓使用者登入一次。`,
            okText: '開始修復',
            cancelText: '取消'
          });
          if (!ok) return;

          const res = await window.UserAdminService.restoreExistingUserByEmail(email, { displayName, role: desiredRole });
          if (res.status === 'needs_reset') {
            window.UI.toast(res.message || '無法取得 UID，請先寄送重設密碼並讓使用者登入一次。', { type: 'warning' });
          } else if (res.status === 'failed') {
            window.UI.toast(res.message || '修復失敗', { type: 'error' });
          } else {
            window.UI.toast('已修復使用者資料', { type: 'success' });
          }
          await this.refreshUserAdminList();
          return;
        } else if (act === 'forcepw') {
          if (!uid) { window.UI.toast('此帳號缺少 uid，請先執行「修復」。', { type: 'warning' }); return; }
          await window.UserAdminService.forcePasswordChangeNextLogin(uid, true);
          window.UI.toast('已設定：下次登入需改密碼', { type: 'success' });
          await this.refreshUserAdminList();
        } else if (act === 'clearpw') {
          if (!uid) { window.UI.toast('此帳號缺少 uid，請先執行「修復」。', { type: 'warning' }); return; }
          await window.UserAdminService.forcePasswordChangeNextLogin(uid, false);
          window.UI.toast('已解除：下次登入不再強制改密碼', { type: 'success' });
          await this.refreshUserAdminList();
        } else if (act === 'toggleDisable') {
          if (!uid) { window.UI.toast('此帳號缺少 uid，請先執行「修復」。', { type: 'warning' }); return; }
          const next = !(row && row.isDisabled === true);
          const ok = await window.UI.confirm({
            title: next ? '停用帳號' : '解除停用',
            message: next ? '停用後此帳號將無法使用系統。' : '解除停用後此帳號可再次登入。',
            okText: next ? '停用' : '解除',
            cancelText: '取消',
            tone: next ? 'danger' : 'default'
          });
          if (!ok) return;
          await window.UserAdminService.setDisabled(uid, next);
          window.UI.toast(next ? '已停用帳號' : '已解除停用', { type: 'success' });
          await this.refreshUserAdminList();
        }
      } catch (err) {
        console.warn(err);
        window.UI.toast('操作失敗：' + (err && err.message ? err.message : 'unknown'), { type: 'error' });
        await this.refreshUserAdminList();
      }
    };
    tbody.addEventListener('click', (window.guard ? window.guard(onUserAdminClick, 'Settings') : onUserAdminClick));
  }

  bind() {
    const rec = document.getElementById('settings-weekly-recipients');
    const sig = document.getElementById('settings-signature');
    const den = document.getElementById('settings-density');
    const sm = document.getElementById('settings-simple-mode');

    const tabbar = document.getElementById('settings-tabbar');
    const savebarSave = document.getElementById('settings-savebar-save');
    const savebarTop = document.getElementById('settings-savebar-top');

    const topN = document.getElementById('settings-pinned-topn');
    const addInput = document.getElementById('settings-pinned-add');
    const addBtn = document.getElementById('settings-pinned-add-btn');
    const list = document.getElementById('settings-pinned-list');


    const onChange = () => this.scheduleSave();

    // Tabs
    if (tabbar) {
      tabbar.addEventListener('click', (e) => {
        const btn = e.target?.closest?.('button[data-tab]');
        if (!btn) return;
        const tab = btn.getAttribute('data-tab');
        this.setActiveTab(tab);
      });
    }

    // 底部儲存列
    if (savebarSave) savebarSave.addEventListener('click', () => SettingsUI.saveNow());
    if (savebarTop) savebarTop.addEventListener('click', () => this.scrollToTop());

    if (rec) rec.addEventListener('input', onChange);
    if (sig) sig.addEventListener('input', onChange);
    if (den) den.addEventListener('change', onChange);
    if (sm) sm.addEventListener('change', onChange);

    // pinned companies
    if (topN) {
      topN.addEventListener('change', () => {
        const v = Number(topN.value || 8);
        this._pinnedTopN = Number.isFinite(v) ? Math.max(1, Math.min(12, Math.round(v))) : 8;
        topN.value = String(this._pinnedTopN);
        this.scheduleSave();
      });
    }

    const doAdd = () => {
      const name = (addInput?.value || '').toString().trim();
      if (!name) return;
      const key = name.toLowerCase();
      const exists = (this._pinnedCompanies || []).some(x => String(x || '').toLowerCase() === key);
      if (!exists) {
        this._pinnedCompanies = [...(this._pinnedCompanies || []), name].slice(0, 40);
        this.renderPinnedList();
        this.scheduleSave();
      }
      if (addInput) addInput.value = '';
      this.closePinnedCompanyDropdown();
    };

    if (addBtn) addBtn.addEventListener('click', doAdd);
    if (addInput) addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); doAdd(); }
    });

    // pinned company dropdown（自訂）
    this.bindPinnedCompanyDropdown();

    if (list) {
      list.addEventListener('click', (e) => {
        const btn = e.target?.closest?.('button[data-act]');
        if (!btn) return;
        const act = btn.getAttribute('data-act');
        const idx = Number(btn.getAttribute('data-idx'));
        if (!Number.isFinite(idx)) return;

        if (act === 'remove') {
          this._pinnedCompanies = (this._pinnedCompanies || []).filter((_, i) => i !== idx);
          this.renderPinnedList();
          this.scheduleSave();
        } else if (act === 'up' && idx > 0) {
          const arr = [...(this._pinnedCompanies || [])];
          const tmp = arr[idx-1]; arr[idx-1] = arr[idx]; arr[idx] = tmp;
          this._pinnedCompanies = arr;
          this.renderPinnedList();
          this.scheduleSave();
        } else if (act === 'down') {
          const arr = [...(this._pinnedCompanies || [])];
          if (idx < arr.length - 1) {
            const tmp = arr[idx+1]; arr[idx+1] = arr[idx]; arr[idx] = tmp;
            this._pinnedCompanies = arr;
            this.renderPinnedList();
            this.scheduleSave();
          }
        }
      });
    }

    this.renderPinnedList();

    // machine catalog
    this.bindMachineCatalog();

    // backup tool
    this.bindBackup();

  
    // repair templates
    try { this.bindRepairTemplates(); } catch (e) { console.error(e); }

}

  scheduleSave() {
    this.setSaveStatus('尚未儲存', true);

    if (this._saveDebounce) clearTimeout(this._saveDebounce);
    this._saveDebounce = setTimeout(() => {
      this.save().catch(() => {});
    }, 800);
  }

  async save() {
    const rec = document.getElementById('settings-weekly-recipients')?.value || '';
    const sig = document.getElementById('settings-signature')?.value || '';
    const basis = document.getElementById('settings-weekly-basis')?.value || 'created';
    const den = document.getElementById('settings-density')?.value || 'comfortable';
    const simpleMode = !!document.getElementById('settings-simple-mode')?.checked;

    await window.SettingsService.update({
      weeklyRecipients: rec,
      weeklyThisWeekBasis: (basis === 'updated') ? 'updated' : 'created',
      signature: sig,
      uiDensity: den,
      simpleMode: simpleMode,
      pinnedTopN: this._pinnedTopN,
      pinnedCompanies: this._pinnedCompanies,

      machineCatalog: this._machineCatalogCustom || {}
    });

    // 同步儲存「機台保養設定」（若 Settings 頁面有顯示該區塊）
    // - 不強制要求 MaintenanceService 存在，避免其他版本/裁切模組報錯
    try {
      await this.saveMaintenanceSettingsOnly();
    } catch (e) {
      console.error('Maintenance settings save error:', e);
      // 一般設定已儲存，此處以提示方式告知（不中斷 Settings 儲存流程）
      if (window.UI && typeof window.UI.toast === 'function') {
        window.UI.toast('一般設定已儲存，但保養設定儲存失敗', { type: 'warning' });
      }
    }

    this.setSaveStatus('已儲存', false);
  }

  async saveMaintenanceSettingsOnly() {
    if (!window.MaintenanceService || typeof window.MaintenanceService.updateSettings !== 'function') return;

    const elTo = document.getElementById('settings-maint-email-to');
    const elCc = document.getElementById('settings-maint-email-cc');
    const elRemind = document.getElementById('settings-maint-default-remind');
    const elUseOwner = document.getElementById('settings-maint-use-owner-email');
    const elAutoEnabled = document.getElementById('settings-maint-auto-email-enabled');
    const elAutoNoRecord = document.getElementById('settings-maint-auto-email-no-record');

    // 若該區塊未渲染，代表使用者不需要在此頁管理保養設定
    if (!elTo && !elCc && !elRemind && !elUseOwner && !elAutoEnabled && !elAutoNoRecord) return;

    const toStr = (v) => (v == null ? '' : String(v));
    const emailTo = elTo ? toStr(elTo.value).trim() : '';
    const emailCc = elCc ? toStr(elCc.value).trim() : '';
    const useOwnerEmail = !!(elUseOwner && elUseOwner.checked);
    const autoEmailEnabled = !!(elAutoEnabled && elAutoEnabled.checked);
    const autoEmailIncludeNoRecord = !!(elAutoNoRecord && elAutoNoRecord.checked);

    const defaultRemindDays = (() => {
      const raw = elRemind ? toStr(elRemind.value).trim() : '';
      const arr = raw.split(',').map(s => parseInt(String(s).trim(), 10)).filter(n => Number.isFinite(n) && n >= 0);
      const uniq = Array.from(new Set(arr)).sort((a,b)=>a-b).slice(0, 3);
      return uniq.length ? uniq : [3, 7];
    })();

    // 確保 MaintenanceService 已 init（避免首次進入 Settings 頁尚未初始化）
    if (typeof window.MaintenanceService.init === 'function' && !window.MaintenanceService.isInitialized) {
      await window.MaintenanceService.init();
    }

    await window.MaintenanceService.updateSettings({
      emailTo,
      emailCc,
      useOwnerEmail,
      defaultRemindDays,
      autoEmailEnabled,
      autoEmailIncludeNoRecord
    });
  }

  setSaveStatus(text, dirty) {
    const status = document.getElementById('settings-status');
    if (status) status.textContent = text;
    const sb = document.getElementById('settings-savebar-status');
    if (sb) sb.textContent = text;
    const bar = document.getElementById('settings-savebar');
    if (bar) bar.classList.toggle('dirty', !!dirty);
  }

  scrollToTop(smooth = true) {
    const sc = document.querySelector('.app-content') || document.querySelector('#app-content') || document.scrollingElement || document.documentElement;
    try {
      if (sc && sc.scrollTo) sc.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
      else window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
    } catch (_) {
      try { window.scrollTo(0, 0); } catch (_) {}
    }
  }

  setActiveTab(tab) {
    if (!tab) return;
    const tabbar = document.getElementById('settings-tabbar');
    const panes = document.querySelectorAll('.settings-tab-pane');
    panes.forEach(p => p.classList.toggle('active', p.getAttribute('data-tab') === tab));
    if (tabbar) {
      tabbar.querySelectorAll('button[data-tab]').forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === tab));
    }
    this._activeTab = tab;
    try { if (this._settingsTabKey) localStorage.setItem(this._settingsTabKey, tab); } catch (_) {}
    this.scrollToTop(true);
    this.closePinnedCompanyDropdown();
  }

  bindPinnedCompanyDropdown() {
    const wrap = document.getElementById('settings-pinned-dd');
    const input = document.getElementById('settings-pinned-add');
    const btn = document.getElementById('settings-pinned-dd-btn');
    if (!wrap || !input || !btn) return;

    this._pinnedDdWrap = wrap;
    this._pinnedDdInput = input;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.togglePinnedCompanyDropdown();
    });

    input.addEventListener('input', () => {
      if (this._pinnedDdOpen) this.renderPinnedCompanyDropdown();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.openPinnedCompanyDropdown();
      } else if (e.key === 'Escape') {
        this.closePinnedCompanyDropdown();
      }
    });
  }

  togglePinnedCompanyDropdown(forceOpen) {
    if (forceOpen === false) return this.closePinnedCompanyDropdown();
    if (this._pinnedDdOpen) return this.closePinnedCompanyDropdown();
    return this.openPinnedCompanyDropdown();
  }

  ensurePinnedCompanyDropdown() {
    if (this._pinnedDdEl) return this._pinnedDdEl;
    const el = document.createElement('div');
    el.className = 'rt-company-dd';
    el.id = 'settings-pinned-company-dd';
    el.style.display = 'none';
    document.body.appendChild(el);

    el.addEventListener('click', (e) => {
      const item = e.target?.closest?.('[data-company]');
      if (!item) return;
      const name = item.getAttribute('data-company') || '';
      if (this._pinnedDdInput) this._pinnedDdInput.value = name;
      this.closePinnedCompanyDropdown();
      try { this._pinnedDdInput?.focus(); } catch (_) {}
    });

    this._pinnedDdEl = el;
    return el;
  }

  openPinnedCompanyDropdown() {
    const wrap = this._pinnedDdWrap || document.getElementById('settings-pinned-dd');
    const input = this._pinnedDdInput || document.getElementById('settings-pinned-add');
    if (!wrap || !input) return;

    const el = this.ensurePinnedCompanyDropdown();
    const rect = wrap.getBoundingClientRect();

    el.style.position = 'fixed';
    el.style.left = Math.max(12, rect.left) + 'px';
    el.style.top = (rect.bottom + 6) + 'px';
    el.style.width = Math.max(220, rect.width) + 'px';
    el.style.maxHeight = '320px';
    el.style.display = 'block';

    this._pinnedDdOpen = true;
    this.renderPinnedCompanyDropdown();

    const onDown = (e) => {
      const t = e.target;
      if (wrap.contains(t)) return;
      if (el.contains(t)) return;
      this.closePinnedCompanyDropdown();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') this.closePinnedCompanyDropdown();
    };
    // 注意：我們用 capture 監聽 scroll 來在「頁面/容器捲動」時收起下拉。
    // 但若使用者正在捲動的是「下拉清單本身」，不應該關閉，否則看起來會像「清單不能滾動」。
    const onScroll = (e) => {
      const t = e?.target;
      if (t && el.contains(t)) return; // 正在捲動下拉本身 → 允許滾動
      this.closePinnedCompanyDropdown();
    };

    this._pinnedDdHandlers = { onDown, onKey, onScroll };
    document.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    // 用 document 捕捉各種 scroll container（.app-content 等）
    document.addEventListener('scroll', onScroll, true);
  }

  closePinnedCompanyDropdown() {
    const el = this._pinnedDdEl;
    if (el) el.style.display = 'none';
    this._pinnedDdOpen = false;

    const h = this._pinnedDdHandlers;
    if (h) {
      try { document.removeEventListener('mousedown', h.onDown, true); } catch (_) {}
      try { window.removeEventListener('keydown', h.onKey, true); } catch (_) {}
      try { document.removeEventListener('scroll', h.onScroll, true); } catch (_) {}
    }
    this._pinnedDdHandlers = null;
  }

  renderPinnedCompanyDropdown() {
    const el = this._pinnedDdEl || this.ensurePinnedCompanyDropdown();
    const input = this._pinnedDdInput || document.getElementById('settings-pinned-add');
    const q = (input?.value || '').toString().trim().toLowerCase();

    const src = Array.isArray(this._companyList) ? this._companyList : [];
    const list = src
      .map(s => String(s || '').trim())
      .filter(Boolean);

    const scored = list
      .map(name => {
        const low = name.toLowerCase();
        let score = 0;
        if (!q) score = 1;
        else if (low === q) score = 100;
        else if (low.startsWith(q)) score = 60;
        else if (low.includes(q)) score = 30;
        return { name, score };
      })
      .filter(x => x.score > 0)
      .sort((a,b) => b.score - a.score || a.name.localeCompare(b.name, 'zh-Hant'))
      .slice(0, 40);

    if (!scored.length) {
      el.innerHTML = `<div class="rt-company-empty muted">無符合的公司</div>`;
      return;
    }

    el.innerHTML = scored.map(x => {
      const safeText = this.escape(x.name);
      const safeAttr = this.escapeAttr(x.name);
      return `<div class="rt-company-item" data-company="${safeAttr}">${safeText}</div>`;
    }).join('');
  }



  renderPinnedList() {
    const list = document.getElementById('settings-pinned-list');
    if (!list) return;

    const arr = Array.isArray(this._pinnedCompanies) ? this._pinnedCompanies : [];
    if (!arr.length) {
      list.innerHTML = `<div class="muted">尚未設定釘選公司</div>`;
      return;
    }

    list.innerHTML = arr.map((name, idx) => {
      const safe = this.escape(name);
      return `
        <div class="pinned-row">
          <div class="pinned-name" title="${safe}">${safe}</div>
          <div class="pinned-actions">
            <button class="btn ghost pinned-btn" type="button" data-act="up" data-idx="${idx}" title="上移">↑</button>
            <button class="btn ghost pinned-btn" type="button" data-act="down" data-idx="${idx}" title="下移">↓</button>
            <button class="btn ghost pinned-btn danger-outline" type="button" data-act="remove" data-idx="${idx}" title="移除">移除</button>
          </div>
        </div>
      `;
    }).join('');
  }

  escape(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // 用於 HTML attribute（例如 value="..." / title="..."）的安全轉義
  // 避免引號/反引號造成屬性截斷或 XSS 風險
  escapeAttr(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/`/g, '&#96;');
  }

  // ============================
  // Machine Catalog (產品線/機型)
  // ============================
  getEffectiveMachineCatalogForUI() {
    const base = (this._machineCatalogBase && typeof this._machineCatalogBase === 'object') ? this._machineCatalogBase : {};
    const custom = (this._machineCatalogCustom && typeof this._machineCatalogCustom === 'object') ? this._machineCatalogCustom : {};

    const keys = new Set([
      ...Object.keys(base || {}),
      ...Object.keys(custom || {})
    ]);

    const out = {};
    for (const k of keys) {
      const src = Object.prototype.hasOwnProperty.call(custom, k) ? custom[k] : base[k];
      out[k] = Array.isArray(src) ? src.map(v => String(v || '').trim()).filter(Boolean) : [];
    }
    return out;
  }

  getSortedMachineLines(lines) {
    const preferredOrder = ['MAR', 'MAP'];
    const arr = Array.from(new Set((lines || []).map(x => String(x || '').trim()).filter(Boolean)));
    arr.sort((a, b) => {
      const ia = preferredOrder.indexOf(a);
      const ib = preferredOrder.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return a.localeCompare(b);
    });
    return arr;
  }

  bindMachineCatalog() {
    const linesEl = document.getElementById('mc-lines');
    const addInput = document.getElementById('mc-add-line');
    const addBtn = document.getElementById('mc-add-line-btn');
    const modelsEl = document.getElementById('mc-models');
    const activeEl = document.getElementById('mc-active-line');
    const hintEl = document.getElementById('mc-hint');
    const resetBtn = document.getElementById('mc-reset-line-btn');
    const delBtn = document.getElementById('mc-delete-line-btn');
    const clearAllBtn = document.getElementById('mc-clear-all-btn');

    if (!linesEl || !modelsEl || !activeEl || !hintEl) return;

    const refresh = () => {
      const base = (this._machineCatalogBase && typeof this._machineCatalogBase === 'object') ? this._machineCatalogBase : {};
      const custom = (this._machineCatalogCustom && typeof this._machineCatalogCustom === 'object') ? this._machineCatalogCustom : {};

      const effective = this.getEffectiveMachineCatalogForUI();
      const allLines = this.getSortedMachineLines([
        ...Object.keys(effective || {}),
        ...Object.keys(custom || {})
      ]);

      if (!this._machineCatalogSelectedLine || !allLines.includes(this._machineCatalogSelectedLine)) {
        this._machineCatalogSelectedLine = (allLines.includes('MAR') ? 'MAR' : (allLines[0] || ''));
      }
      const line = this._machineCatalogSelectedLine;

      // render chips（預設線：可點右側「自訂/已自訂」快速切換）
      linesEl.innerHTML = allLines.map(l => {
        const isActive = l === line;
        const isCustom = Object.prototype.hasOwnProperty.call(custom, l);
        const isDefault = Object.prototype.hasOwnProperty.call(base, l);
        const label = this.escape(l);

        // default line: show action badge
        // custom-only line: still show badge but not clickable
        const flagText = isDefault ? (isCustom ? '已自訂' : '自訂') : '自訂';
        const flagTitle = isDefault ? (isCustom ? '點擊：恢復預設' : '點擊：開始自訂（複製預設清單）') : '使用者新增產品線';
        const flagCls = isDefault ? 'mc-flag mc-flag-action' : 'mc-flag';

        return `<button class="chip ${isActive ? 'active' : ''}" type="button" data-line="${label}" title="${isCustom ? '已自訂' : '預設'}">${label}<span class="${flagCls}" title="${flagTitle}">${flagText}</span></button>`;
      }).join('') || `<span class="muted">尚未建立</span>`;

      const isCustom = !!(line && Object.prototype.hasOwnProperty.call(custom, line));
      const isDefault = !!(line && Object.prototype.hasOwnProperty.call(base, line));
      const readOnly = !!(line && isDefault && !isCustom);

      // editor
      activeEl.textContent = line || '-';
      const models = Array.isArray(effective?.[line]) ? effective[line] : [];
      if (!modelsEl.dataset.userEditing) {
        modelsEl.value = models.join('\n');
      }

      // 預設清單：唯讀；需點右側「自訂」才可編輯（避免誤改）
      try {
        if (modelsEl) {
          modelsEl.readOnly = readOnly;
          if (readOnly) modelsEl.classList.add('readonly');
          else modelsEl.classList.remove('readonly');
        }
      } catch (_) {}

      if (!line) {
        hintEl.textContent = '尚未建立任何產品線。';
      } else if (readOnly) {
        hintEl.textContent = `此產品線共 ${models.length} 個機型（預設清單：唯讀）。點右側「自訂」開始編輯。`;
      } else {
        hintEl.textContent = `此產品線共 ${models.length} 個機型。`;
      }

      if (resetBtn) resetBtn.disabled = !(line && isCustom && isDefault);
      if (delBtn) delBtn.disabled = !(line && isCustom && !isDefault);
      if (clearAllBtn) clearAllBtn.disabled = !(Object.keys(custom || {}).length);
    };

    // click line
    if (!linesEl.dataset.bound) {
      linesEl.dataset.bound = '1';
      linesEl.addEventListener('click', (e) => {
        const btn = e.target?.closest?.('button[data-line]');
        if (!btn) return;
        const clickedLine = (btn.getAttribute('data-line') || '').toString().trim();
        if (!clickedLine) return;

        const base = (this._machineCatalogBase && typeof this._machineCatalogBase === 'object') ? this._machineCatalogBase : {};
        const custom = (this._machineCatalogCustom && typeof this._machineCatalogCustom === 'object') ? this._machineCatalogCustom : {};
        const isDefault = Object.prototype.hasOwnProperty.call(base, clickedLine);
        const isCustom = Object.prototype.hasOwnProperty.call(custom, clickedLine);

        // 點右側「自訂/已自訂」：切換模式（預設 -> 複製成自訂；自訂 -> 恢復預設）
        const clickedFlag = e.target?.closest?.('.mc-flag-action');
        if (clickedFlag && isDefault) {
          e.preventDefault();
          e.stopPropagation();

          if (!this._machineCatalogCustom || typeof this._machineCatalogCustom !== 'object') this._machineCatalogCustom = {};

          if (isCustom) {
            // revert to default
            delete this._machineCatalogCustom[clickedLine];
          } else {
            // start customizing: copy default list
            const arr = Array.isArray(base?.[clickedLine]) ? base[clickedLine] : [];
            this._machineCatalogCustom[clickedLine] = arr.map(v => String(v || '').trim()).filter(Boolean);
          }

          this._machineCatalogSelectedLine = clickedLine;
          if (modelsEl) modelsEl.dataset.userEditing = '';
          refresh();

          // 若剛切到可編輯狀態，聚焦到 textarea
          try {
            const nowCustom = Object.prototype.hasOwnProperty.call(this._machineCatalogCustom || {}, clickedLine);
            if (nowCustom && modelsEl) modelsEl.focus();
          } catch (_) {}

          this.scheduleSave();
          return;
        }

        // 一般點擊：切換產品線
        this._machineCatalogSelectedLine = clickedLine;
        // 切換時避免覆蓋使用者正在輸入的內容
        if (modelsEl) modelsEl.dataset.userEditing = '';
        refresh();
      });
    }

    // add line
    const doAddLine = () => {
      const raw = (addInput?.value || '').toString().trim();
      if (!raw) return;
      const line = raw.replace(/\s+/g, '');
      if (!line) return;
      if (!this._machineCatalogCustom || typeof this._machineCatalogCustom !== 'object') this._machineCatalogCustom = {};
      if (!Object.prototype.hasOwnProperty.call(this._machineCatalogCustom, line)) {
        this._machineCatalogCustom[line] = [];
      }
      this._machineCatalogSelectedLine = line;
      if (addInput) addInput.value = '';
      refresh();
      this.scheduleSave();
    };
    if (addBtn && !addBtn.dataset.bound) {
      addBtn.dataset.bound = '1';
      addBtn.addEventListener('click', doAddLine);
    }
    if (addInput && !addInput.dataset.bound) {
      addInput.dataset.bound = '1';
      addInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); doAddLine(); }
      });
    }

    // edit models
    if (modelsEl && !modelsEl.dataset.bound) {
      modelsEl.dataset.bound = '1';
      modelsEl.addEventListener('input', () => {
        // 預設清單（唯讀）不允許編輯
        if (modelsEl.readOnly) return;
        modelsEl.dataset.userEditing = '1';
        const line = this._machineCatalogSelectedLine;
        if (!line) return;
        const arr = (modelsEl.value || '').split(/\r?\n/)
          .map(x => String(x || '').trim())
          .filter(Boolean);

        // dedupe (case-insensitive)
        const seen = new Set();
        const models = [];
        for (const m of arr) {
          const key = m.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          models.push(m);
          if (models.length >= 200) break;
        }

        if (!this._machineCatalogCustom || typeof this._machineCatalogCustom !== 'object') this._machineCatalogCustom = {};
        this._machineCatalogCustom[line] = models;
        // 當使用者開始輸入，顯示即時數量（不等 save）
        if (hintEl) hintEl.textContent = `此產品線共 ${models.length} 個機型。`;
        this.scheduleSave();
      });

      // blur 後允許 refresh 覆蓋（例如切換產品線）
      modelsEl.addEventListener('blur', () => {
        modelsEl.dataset.userEditing = '';
      });
    }

    // reset to default (remove custom override)
    if (resetBtn && !resetBtn.dataset.bound) {
      resetBtn.dataset.bound = '1';
      resetBtn.addEventListener('click', () => {
        const line = this._machineCatalogSelectedLine;
        if (!line) return;
        const base = (this._machineCatalogBase && typeof this._machineCatalogBase === 'object') ? this._machineCatalogBase : {};
        if (!Object.prototype.hasOwnProperty.call(base, line)) return;
        if (this._machineCatalogCustom && Object.prototype.hasOwnProperty.call(this._machineCatalogCustom, line)) {
          delete this._machineCatalogCustom[line];
          refresh();
          this.scheduleSave();
        }
      });
    }

    // delete custom-only line
    if (delBtn && !delBtn.dataset.bound) {
      delBtn.dataset.bound = '1';
      delBtn.addEventListener('click', () => {
        const line = this._machineCatalogSelectedLine;
        if (!line) return;
        const base = (this._machineCatalogBase && typeof this._machineCatalogBase === 'object') ? this._machineCatalogBase : {};
        if (Object.prototype.hasOwnProperty.call(base, line)) return; // default line cannot be deleted
        if (this._machineCatalogCustom && Object.prototype.hasOwnProperty.call(this._machineCatalogCustom, line)) {
          delete this._machineCatalogCustom[line];
          this._machineCatalogSelectedLine = '';
          refresh();
          this.scheduleSave();
        }
      });
    }

    // clear all custom
    if (clearAllBtn && !clearAllBtn.dataset.bound) {
      clearAllBtn.dataset.bound = '1';
      clearAllBtn.addEventListener('click', () => {
        this._machineCatalogCustom = {};
        this._machineCatalogSelectedLine = '';
        refresh();
        this.scheduleSave();
      });
    }

    // initial render
    refresh();
  }

  /* ========================================
     備份 / 還原（本機 localStorage）
     - 目的：升版/換電腦前快速備份設定與本機草稿資料
     - 僅針對 AppConfig.system.storage.prefix 下的 keys
     ======================================== */
  bindBackup() {
    const expBtn = document.getElementById('backup-export');
    const impBtn = document.getElementById('backup-import');
    const fileEl = document.getElementById('backup-file');
    if (!expBtn || !impBtn || !fileEl) return;

    if (!expBtn.dataset.bound) {
      expBtn.dataset.bound = '1';
      expBtn.addEventListener('click', () => this.exportLocalBackup());
    }

    if (!impBtn.dataset.bound) {
      impBtn.dataset.bound = '1';
      impBtn.addEventListener('click', () => {
        fileEl.value = '';
        fileEl.click();
      });
    }

    if (!fileEl.dataset.bound) {
      fileEl.dataset.bound = '1';
      const onImportFile = async () => {
        const f = fileEl.files && fileEl.files[0];
        if (!f) return;
        try {
          const text = await f.text();
          const data = JSON.parse(text);
          await this.importLocalBackup(data);
        } catch (e) {
          console.error(e);
          const msg = '匯入失敗：檔案格式不正確';
          if (window.UI && typeof window.UI.toast === 'function') window.UI.toast(msg, { type: 'error' });
          else alert(msg);
        }
      };
      fileEl.addEventListener('change', (window.guard ? window.guard(onImportFile, 'Settings') : onImportFile));
    }
  }

  exportLocalBackup() {
    try {
      const prefix = (window.AppConfig && window.AppConfig.system && window.AppConfig.system.storage && window.AppConfig.system.storage.prefix)
        ? window.AppConfig.system.storage.prefix
        : 'repair_tracking_';

      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (!k.startsWith(prefix)) continue;
        // 排除 session（避免把登入狀態帶走造成困擾）
        if (k.endsWith('session')) continue;
        out[k] = localStorage.getItem(k);
      }

      const payload = {
        meta: {
          exportedAt: new Date().toISOString(),
          version: (window.AppConfig && typeof window.AppConfig.getFullVersion === 'function') ? window.AppConfig.getFullVersion() : '',
          prefix,
          itemCount: Object.keys(out).length
        },
        storage: out
      };

      const dt = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const stamp = `${dt.getFullYear()}${pad(dt.getMonth()+1)}${pad(dt.getDate())}_${pad(dt.getHours())}${pad(dt.getMinutes())}`;
      const build = (window.AppConfig) ? `${window.AppConfig.VERSION}.${window.AppConfig.BUILD_NUMBER}` : 'backup';
      const filename = `RepairTracking_${build}_backup_${stamp}.json`;

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      if (window.UI && typeof window.UI.toast === 'function') {
        window.UI.toast(`已匯出備份（${payload.meta.itemCount} 筆）`, { type: 'success' });
      }
    } catch (e) {
      console.error(e);
      const msg = '匯出失敗：' + (e?.message || e);
      if (window.UI && typeof window.UI.toast === 'function') window.UI.toast(msg, { type: 'error' });
      else alert(msg);
    }
  }

  async importLocalBackup(data) {
    const prefix = (window.AppConfig && window.AppConfig.system && window.AppConfig.system.storage && window.AppConfig.system.storage.prefix)
      ? window.AppConfig.system.storage.prefix
      : 'repair_tracking_';

    const storage = (data && typeof data === 'object') ? data.storage : null;
    if (!storage || typeof storage !== 'object') {
      throw new Error('invalid backup');
    }

    const clearFirst = !!document.getElementById('backup-clear')?.checked;

    const count = Object.keys(storage).length;
    const msg = `即將匯入 ${count} 筆本機資料。

注意：匯入後建議重新整理頁面。

確定要繼續嗎？`;
    const ok = window.confirm ? window.confirm(msg) : true;
    if (!ok) return;

    try {
      if (clearFirst) {
        const remove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          if (!k.startsWith(prefix)) continue;
          if (k.endsWith('session')) continue;
          remove.push(k);
        }
        remove.forEach(k => localStorage.removeItem(k));
      }

      for (const [k, v] of Object.entries(storage)) {
        if (!k || typeof k !== 'string') continue;
        if (!k.startsWith(prefix)) continue;
        if (k.endsWith('session')) continue;
        if (typeof v === 'string') localStorage.setItem(k, v);
      }

      if (window.UI && typeof window.UI.toast === 'function') {
        window.UI.toast('已匯入備份，請重新整理頁面', { type: 'success' });
      } else {
        alert('已匯入備份，請重新整理頁面');
      }
    } catch (e) {
      console.error(e);
      const m = '匯入失敗：' + (e?.message || e);
      if (window.UI && typeof window.UI.toast === 'function') window.UI.toast(m, { type: 'error' });
      else alert(m);
    }
  }

  // ===============================
  // Repair Templates (V161.114)
  // ===============================
  renderRepairTemplatesCard() {
    return `
      <section class="card templates-card" id="settings-repair-templates-card">
        <div class="card-header">
          <div>
            <div class="card-title">維修單模板</div>
            <div class="card-subtitle">在新增維修單時可套用，一鍵覆寫狀態/進度/優先級/產品線/設備/問題/內容/備註/需要零件</div>
          </div>
          <div class="card-actions">
            <button class="btn" id="btn-templates-refresh" type="button" onclick="SettingsUI.templateRefresh()">刷新</button>
            <button class="btn primary" id="btn-templates-new" type="button" onclick="SettingsUI.templateNew()">新增模板</button>
          </div>
        </div>
        <div class="card-body">
          <div class="templates-list" id="templates-list"></div>
        </div>
      </section>
    `;
  }

  bindRepairTemplates() {
    const refreshBtn = document.getElementById('btn-templates-refresh');
    const newBtn = document.getElementById('btn-templates-new');

    if (refreshBtn) refreshBtn.onclick = () => this.refreshRepairTemplates();
    if (newBtn) newBtn.onclick = () => this.openTemplateModal();

    // Realtime update hook
    try {
      if (window.RepairTemplatesService && typeof window.RepairTemplatesService.onChange === 'function') {
        window.RepairTemplatesService.onChange(() => this.refreshRepairTemplates());
      }
    } catch (_) {}

    this.refreshRepairTemplates();
  }

  refreshRepairTemplates() {
    const box = document.getElementById('templates-list');
    if (!box) return;

    const list = (window.RepairTemplatesService && typeof window.RepairTemplatesService.getAll === 'function')
      ? window.RepairTemplatesService.getAll()
      : [];

    if (!list.length) {
      box.innerHTML = `<div class="muted">尚無模板。點「新增模板」建立第一個。</div>`;
      return;
    }

    const esc = (s)=>escapeHTML((s??'').toString());
    const badge = (enabled)=> enabled
      ? `<span class="pill ok">啟用</span>`
      : `<span class="pill muted">停用</span>`;

    box.innerHTML = list.map(t => `
      <div class="template-row" data-id="${esc(t.id)}">
        <div class="template-main">
          <div class="template-name">${esc(t.name)}</div>
          <div class="template-meta">
            ${badge(t.enabled)}
            <span class="dot"></span>
            <span>狀態：${esc(t.status||'-')}</span>
            <span class="dot"></span>
            <span>進度：${Number(t.progress||0)}%</span>
            <span class="dot"></span>
            <span>優先級：${esc(t.priority||'-')}</span>
          </div>
        </div>
        <div class="template-actions">
          <button class="btn" type="button" onclick="SettingsUI.templateEdit('${esc(t.id)}')">編輯</button>
          <button class="btn" type="button" onclick="SettingsUI.templateClone('${esc(t.id)}')">複製</button>
          <button class="btn" type="button" onclick="SettingsUI.templateToggle('${esc(t.id)}')">${t.enabled ? '停用' : '啟用'}</button>
          <button class="btn danger" type="button" onclick="SettingsUI.templateRemove('${esc(t.id)}')">刪除</button>
        </div>
      </div>
    `).join('');
  }


// ============================
// Template Modal: ProductLine/Machine picker (same source as 設備產品線 / 機型清單)
// ============================
_tplGetMachineCatalog() {
  try {
    if (window.AppConfig && typeof window.AppConfig.getMachineCatalog === 'function') return window.AppConfig.getMachineCatalog();
    if (window.AppConfig && window.AppConfig.business && window.AppConfig.business.defaults && window.AppConfig.business.defaults.machineCatalog) {
      return window.AppConfig.business.defaults.machineCatalog;
    }
  } catch (_) {}
  return {};
}

_tplInitMachineCatalog(t) {
  const catalog = this._tplGetMachineCatalog();
  const productLineSel = document.getElementById('tpl-productLine');
  if (!productLineSel) return;

  const inferProductLine = (machineName) => {
    try {
      const name = (machineName || '').toString().trim();
      if (!name) return '';
      for (const [line, models] of Object.entries(catalog || {})) {
        if (Array.isArray(models) && models.includes(name)) return line;
      }
    } catch (_) {}
    return '';
  };

  const initialLine = ((t?.productLine) || '').toString().trim() || inferProductLine(t?.machine);
  const productLines = Array.from(new Set([
    ...Object.keys(catalog || {}),
    ...(initialLine ? [initialLine] : [])
  ])).filter(Boolean);

  const preferredOrder = ['MAR', 'MAP'];
  productLines.sort((a, b) => {
    const ia = preferredOrder.indexOf(a);
    const ib = preferredOrder.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return a.localeCompare(b);
  });

  productLineSel.innerHTML = [
    '<option value="">（不指定）</option>',
    ...productLines.map(l => `<option value="${this.escapeAttr(l)}">${this.escape(l)}</option>`)
  ].join('');
}

_tplRenderMachinesForLine(line, currentMachine='') {
  const catalog = this._tplGetMachineCatalog();
  const machineSel = document.getElementById('tpl-machine');
  if (!machineSel) return;

  const models = (line && Array.isArray(catalog?.[line])) ? catalog[line] : [];
  const cur = (currentMachine || '').toString().trim();

  const opts = [];
  opts.push('<option value="">請選擇設備名稱</option>');

  // 若目前值不在清單內，保留原值
  if (cur && !(models || []).includes(cur)) {
    opts.push(`<option value="${this.escapeAttr(cur)}" selected>${this.escape(cur)}（自訂）</option>`);
  }

  for (const m of (models || [])) {
    const safe = this.escapeAttr(m);
    const sel = (cur && cur === m) ? ' selected' : '';
    opts.push(`<option value="${safe}"${sel}>${this.escape(m)}</option>`);
  }

  machineSel.innerHTML = opts.join('');
}

_tplOnProductLineChange() {
  const line = (document.getElementById('tpl-productLine')?.value || '').toString().trim();
  this._tplRenderMachinesForLine(line, '');
}

_tplOnMachineChange() {
  // no-op for now; kept for symmetry / future extension
}

  openTemplateModal(id=null) {
    const t = id && window.RepairTemplatesService ? window.RepairTemplatesService.getById(id) : null;

    const modalId = 'template-modal';
    let modal = document.getElementById(modalId);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = modalId;
      modal.className = 'tpl-modal-backdrop';
      modal.innerHTML = `
        <div class="tpl-modal">
          <div class="tpl-modal-header">
            <div class="tpl-modal-title" id="template-tpl-modal-title">模板</div>
            <button class="icon-btn" id="template-modal-close" type="button">✕</button>
          </div>
          <div class="tpl-modal-body">
            <div class="grid2">
              <label>名稱<input class="input" id="tpl-name" /></label>
              <label>啟用
                <select class="input" id="tpl-enabled">
                  <option value="1">啟用</option>
                  <option value="0">停用</option>
                </select>
              </label>
              <label>狀態<input class="input" id="tpl-status" /></label>
              <label>進度<input class="input" id="tpl-progress" type="number" min="0" max="100" /></label>
              <label>優先級<input class="input" id="tpl-priority" /></label>
              <label>產品線
                <select class="input" id="tpl-productLine" onchange="SettingsUI.tplHandleProductLineChange(event)">
                  <option value="">（不指定）</option>
                </select>
              </label>
              <label class="span2">設備
                <select class="input" id="tpl-machine" onchange="SettingsUI.tplHandleMachineChange(event)">
                  <option value="">請選擇設備名稱</option>
                </select>
                <div class="help" style="margin-top:6px;">設備清單來源：設定頁「設備產品線 / 機型清單」。</div>
              </label>
            </div>
            <label>問題<textarea class="input" id="tpl-issue" rows="2"></textarea></label>
            <label>內容<textarea class="input" id="tpl-content" rows="4"></textarea></label>
            <label>備註<textarea class="input" id="tpl-notes" rows="3"></textarea></label>
            <div class="tpl-needparts">
              <label class="tpl-needparts-label">
                <input type="checkbox" id="tpl-needParts" />
                <span>需要零件</span>
              </label>
              <div class="help">勾選後：套用模板會同步覆寫維修單「需要零件」勾選狀態。</div>
            </div>
          </div>
          <div class="tpl-modal-footer">
            <button class="btn" id="tpl-cancel" type="button">取消</button>
            <button class="btn primary" id="tpl-save" type="button">儲存</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.querySelector('#template-modal-close').onclick = ()=>SettingsUI.templateModalClose();
      modal.querySelector('#tpl-cancel').onclick = ()=>SettingsUI.templateModalClose();
      modal.querySelector('#tpl-save').onclick = ()=>SettingsUI.templateModalSave();
    }

    modal.dataset.editId = id || '';
    document.getElementById('template-tpl-modal-title').textContent = id ? '編輯模板' : '新增模板';

    // fill fields
    document.getElementById('tpl-name').value = (t?.name)||'';
    document.getElementById('tpl-enabled').value = (t && t.enabled===false) ? '0' : '1';
    document.getElementById('tpl-status').value = (t?.status)||'';
    document.getElementById('tpl-progress').value = (t?.progress ?? 0);
    document.getElementById('tpl-priority').value = (t?.priority)||'';
    this._tplInitMachineCatalog(t);
    document.getElementById('tpl-productLine').value = (t?.productLine)||'';
    this._tplRenderMachinesForLine(document.getElementById('tpl-productLine').value, (t?.machine)||'');
    document.getElementById('tpl-issue').value = (t?.issue)||'';
    document.getElementById('tpl-content').value = (t?.content)||'';
    document.getElementById('tpl-notes').value = (t?.notes)||'';
    // V161.114: needParts must be boolean
    document.getElementById('tpl-needParts').checked = (t?.needParts === true);

    modal.classList.add('show');
  }

  // Static handlers used in onclick
  static templateEdit(id){ try{ window.settingsUI.openTemplateModal(id); }catch(e){ console.error(e);} }

static tplHandleProductLineChange(){ try{ window.settingsUI && window.settingsUI._tplOnProductLineChange(); }catch(e){ console.error(e);} }
static tplHandleMachineChange(){ try{ window.settingsUI && window.settingsUI._tplOnMachineChange(); }catch(e){ console.error(e);} }

  static templateNew(){ try{ window.settingsUI.openTemplateModal(null); }catch(e){ console.error(e);} }
  static templateRefresh(){ try{ window.settingsUI.refreshRepairTemplates(); }catch(e){ console.error(e);} }
  static templateClone(id){
    (async()=>{
      try{
        if (!window.RepairTemplatesService) return;
        await window.RepairTemplatesService.clone(id);
      }catch(e){ console.error(e); }
    })();
  }
  static templateToggle(id){
    (async()=>{
      try{
        if (!window.RepairTemplatesService) return;
        await window.RepairTemplatesService.toggleEnabled(id);
      }catch(e){ console.error(e); }
    })();
  }
  static templateRemove(id){
    (async()=>{
      try{
        if (!window.RepairTemplatesService) return;
        const ok = confirm('確定刪除此模板？此動作無法復原。');
        if (!ok) return;
        await window.RepairTemplatesService.remove(id);
      }catch(e){ console.error(e); }
    })();
  }
  static templateModalClose(){
    const modal = document.getElementById('template-modal');
    if(modal) modal.classList.remove('show');
  }
  static templateModalSave(){
    (async()=>{
      try{
        if (!window.RepairTemplatesService) return;
        const modal = document.getElementById('template-modal');
        const editId = modal?.dataset?.editId || '';
        const enabled = document.getElementById('tpl-enabled').value === '1';
        const tpl = window.RepairTemplateModel.create({
          id: editId || null,
          name: document.getElementById('tpl-name').value,
          enabled,
          status: document.getElementById('tpl-status').value,
          progress: Number(document.getElementById('tpl-progress').value||0),
          priority: document.getElementById('tpl-priority').value,
          productLine: document.getElementById('tpl-productLine').value,
          machine: document.getElementById('tpl-machine').value,
          issue: document.getElementById('tpl-issue').value,
          content: document.getElementById('tpl-content').value,
          notes: document.getElementById('tpl-notes').value,
          // V161.114: needParts boolean
          needParts: !!document.getElementById('tpl-needParts').checked,
        });
        await window.RepairTemplatesService.upsert(tpl);
        SettingsUI.templateModalClose();
      }catch(e){ console.error(e); alert('儲存失敗，請查看 Console。'); }
    })();
  }

}

window.SettingsUI = SettingsUI;

const settingsUI = new SettingsUI();
window.settingsUI = settingsUI;

Object.assign(SettingsUI, {
  saveNow: async () => {
    try {
      if (window.settingsUI) await window.settingsUI.save();
    } catch (e) {
      console.error('Settings save error:', e);
      const status = document.getElementById('settings-status');
      if (status) status.textContent = '儲存失敗';
      const msg = '儲存失敗：' + (e?.message || e);
      if (window.UI && typeof window.UI.toast === 'function') window.UI.toast(msg, { type: 'error' });
      else alert(msg);
    }
  },

  saveMaintenanceNow: async () => {
    try {
      if (window.settingsUI) await window.settingsUI.saveMaintenanceSettingsOnly();
      const status = document.getElementById('settings-status');
      if (status) status.textContent = '已儲存';
      if (window.UI && typeof window.UI.toast === 'function') {
        window.UI.toast('已儲存保養設定', { type: 'success' });
      }
    } catch (e) {
      console.error('Maintenance settings save error:', e);
      const msg = '保養設定儲存失敗：' + (e?.message || e);
      if (window.UI && typeof window.UI.toast === 'function') window.UI.toast(msg, { type: 'error' });
      else alert(msg);
    }
  }
});

console.log('✅ SettingsUI loaded');
