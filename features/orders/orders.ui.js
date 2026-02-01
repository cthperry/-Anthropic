/**
 * 訂單/採購追蹤 - UI
 * V161 - Orders Module - UI Layer
 */

class OrdersUI {
  constructor() {
    this.searchText = '';
    this.searchDraft = '';
    this.filterStatus = '';
    this.filterOverdue = false;
    this.filterOpenOnly = false;
    this.sortKey = 'updatedAt_desc';
    this.searchDebounce = null;
    this._renderToken = 0;
    this._updateScheduled = false;



    // 列表分頁（避免一次渲染過多造成卡頓）
    this.pageSize = (window.ListPaging && typeof window.ListPaging.getDefaultPageSize === 'function')
      ? window.ListPaging.getDefaultPageSize()
      : 60;
    this.visibleCount = this.pageSize;
    this._querySig = '';


    // 明細零件編輯（未儲存前暫存）
    this._activeOrderId = '';
    this._draftItems = {};

    // P3-2：進階篩選（可摺疊、多條件）
    this.filtersOpen = this._loadFiltersOpen();
    this.filterOrderedFrom = '';
    this.filterOrderedTo = '';
    this.filterExpectedFrom = '';
    this.filterExpectedTo = '';
    this.filterAmountMin = '';
    this.filterAmountMax = '';
    this.filterSupplier = '';


    // 方案2：篩選草稿（輸入不立即套用；按【搜尋】才套用）
    this.filterStatusDraft = this.filterStatus;
    this.filterOverdueDraft = this.filterOverdue;
    this.filterOpenOnlyDraft = this.filterOpenOnly;
    this.sortKeyDraft = this.sortKey;
    this.filterOrderedFromDraft = this.filterOrderedFrom;
    this.filterOrderedToDraft = this.filterOrderedTo;
    this.filterExpectedFromDraft = this.filterExpectedFrom;
    this.filterExpectedToDraft = this.filterExpectedTo;
    this.filterAmountMinDraft = this.filterAmountMin;
    this.filterAmountMaxDraft = this.filterAmountMax;
    this.filterSupplierDraft = this.filterSupplier;
    this.searchDraft = this.searchText;
  }

  _todayTaipei() {
    try {
      const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      // en-CA => YYYY-MM-DD
      return fmt.format(new Date());
    } catch (_) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  _isOverdue(order, today = '') {
    const o = order || {};
    const st = (o.status || '').toString().trim();
    if (st === '已到貨' || st === '已結案' || st === '已取消') return false;
    const expected = (o.expectedAt || '').toString().trim();
    if (!expected) return false;
    const t = today || this._todayTaipei();
    return expected < t;
  }

  _escapeHtml(input) {
    const s = (input === null || input === undefined) ? '' : String(input);
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  _escapeAttr(input) {
    return this._escapeHtml(input).split('\n').join(' ').split('\r').join(' ');
  }

  _storageKey(suffix) {
    try {
      const prefix = (window.AppConfig && window.AppConfig.system && window.AppConfig.system.storage && window.AppConfig.system.storage.prefix)
        ? window.AppConfig.system.storage.prefix
        : 'repair_tracking_v161_';
      return `${prefix}${suffix}`;
    } catch (_) {
      return `repair_tracking_v161_${suffix}`;
    }
  }

  _loadFiltersOpen() {
    try {
      const key = this._storageKey('ui_orders_filters_open');
      return localStorage.getItem(key) === '1';
    } catch (_) {
      return false;
    }
  }

  _saveFiltersOpen(open) {
    try {
      const key = this._storageKey('ui_orders_filters_open');
      localStorage.setItem(key, open ? '1' : '0');
    } catch (_) {}
  }

  _isoYmd(v) {
    const s = (v || '').toString().trim();
    if (!s) return '';
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  }

  _toNumberOrNull(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    // 重要：空字串不應被視為 0，否則會把「金額範圍」預設套用成 <= 0，導致列表看似空白。
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  _badgeClassForOrderStatus(status) {
    const s = (status || '').toString().trim();
    if (s === '已結案') return 'badge-success';
    if (s === '已到貨') return 'badge-warning';
    if (s === '已下單') return 'badge-info';
    if (s === '已取消') return 'badge-error';
    if (s === '建立') return 'badge-primary';
    // 其他 / 空
    return '';
  }

  _accentForStatus(status) {
    const s = (status || '').toString().trim();
    // 僅用於卡片左側 accent（不影響全站 primary 色）
    if (s === '已結案') return { accent: '#16a34a', soft: 'rgba(22,163,74,.14)' };
    if (s === '已到貨') return { accent: '#d97706', soft: 'rgba(217,119,6,.15)' };
    if (s === '已下單') return { accent: '#0ea5e9', soft: 'rgba(14,165,233,.14)' };
    if (s === '已取消') return { accent: '#dc2626', soft: 'rgba(220,38,38,.12)' };
    if (s === '建立') return { accent: '#7c3aed', soft: 'rgba(124,58,237,.12)' };
    return { accent: 'var(--module-accent)', soft: 'var(--module-accent-soft)' };
  }

  _scheduleUpdate() {
    if (this._updateScheduled) return;
    this._updateScheduled = true;
    requestAnimationFrame(() => {
      this._updateScheduled = false;
      try { this.update(); } catch (_) {}
    });
  }

  applyFilters() {
    this.searchText = (this.searchDraft || '').toString().trim();
    this.filterStatus = (this.filterStatusDraft || '').toString().trim();
    this.filterOverdue = !!this.filterOverdueDraft;
    this.filterOpenOnly = !!this.filterOpenOnlyDraft;
    this.sortKey = (this.sortKeyDraft || 'updatedAt_desc').toString().trim() || 'updatedAt_desc';
    this.filterOrderedFrom = (this.filterOrderedFromDraft || '').toString();
    this.filterOrderedTo = (this.filterOrderedToDraft || '').toString();
    this.filterExpectedFrom = (this.filterExpectedFromDraft || '').toString();
    this.filterExpectedTo = (this.filterExpectedToDraft || '').toString();
    this.filterAmountMin = (this.filterAmountMinDraft || '').toString();
    this.filterAmountMax = (this.filterAmountMaxDraft || '').toString();
    this.filterSupplier = (this.filterSupplierDraft || '').toString();

    this._scheduleUpdate();
  }

  clearAll() {
    this.searchText = '';
    this.searchDraft = '';
    this.filterStatus = '';
    this.filterStatusDraft = '';
    this.filterOverdue = false;
    this.filterOverdueDraft = false;
    this.filterOpenOnly = false;
    this.filterOpenOnlyDraft = false;
    this.sortKey = 'updatedAt_desc';
    this.sortKeyDraft = 'updatedAt_desc';
    this.filterOrderedFrom = '';
    this.filterOrderedFromDraft = '';
    this.filterOrderedTo = '';
    this.filterOrderedToDraft = '';
    this.filterExpectedFrom = '';
    this.filterExpectedFromDraft = '';
    this.filterExpectedTo = '';
    this.filterExpectedToDraft = '';
    this.filterAmountMin = '';
    this.filterAmountMinDraft = '';
    this.filterAmountMax = '';
    this.filterAmountMaxDraft = '';
    this.filterSupplier = '';
    this.filterSupplierDraft = '';
    this._scheduleUpdate();
  }


  render(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    el.innerHTML = `
      <div class="orders-module">
        <div class="module-toolbar">
          <div class="module-toolbar-left">
            <div class="page-title">
              <h2>訂單/採購追蹤</h2>
              <span class="muted" id="orders-subtitle">載入中...</span>
            </div>
          </div>
          <div class="module-toolbar-right">
            <div class="orders-search">
              <input class="input" type="text" placeholder="搜尋：訂單號 / 客戶 / 供應商 / 狀態" value="${this._escapeAttr(this.searchDraft)}" oninput="OrdersUI.onSearchDraft(event)" />
            </div>
            <button class="btn primary" onclick="OrdersUI.applyFilters()">🔍 搜尋</button>
            <button class="btn" onclick="OrdersUI.clearAll()">🧹 清除</button>
            <button class="btn primary" onclick="OrdersUI.openCreateFromQuote()">從報價建立</button>
          </div>
        </div>

        <div class="orders-summary" id="orders-summary"></div>
        <div class="orders-filters" id="orders-filters"></div>
        <div class="orders-list" id="orders-list"><div class="muted" style="padding:16px;">載入中...</div></div>
      </div>

      <div id="orders-modal" class="modal" style="display:none;">
        <div class="modal-backdrop" onclick="OrdersUI.closeModal()"></div>
        <!--
          注意：Orders 明細需要更寬的視窗與橫向捲動表格。
          這裡避免使用 .modal-content（預設寬度較窄），改由內層 .modal-dialog / .modal-xlarge 控制寬度。
        -->
        <div class="modal-host" id="orders-modal-content"></div>
      </div>
    `;

    this.update();
  }
  async update() {
    try {
      if ((window._svc ? window._svc('OrderService') : window.OrderService) && !(window._svc ? window._svc('OrderService') : window.OrderService).isInitialized) await (window._svc ? window._svc('OrderService') : window.OrderService).init();
      if ((window._svc ? window._svc('QuoteService') : window.QuoteService) && !(window._svc ? window._svc('QuoteService') : window.QuoteService).isInitialized) await (window._svc ? window._svc('QuoteService') : window.QuoteService).init();
    } catch (e) {
      console.warn('OrdersUI init service failed:', e);
    }

    const baseRows = (window._svc ? window._svc('OrderService') : window.OrderService) ? (window._svc ? window._svc('OrderService') : window.OrderService).search(this.searchText) : [];
    const subtitle = document.getElementById('orders-subtitle');
    if (subtitle) subtitle.textContent = `共 ${baseRows.length} 筆`;


    // 若查詢條件改變，重置分頁顯示數量
    const sig = `${this.searchText}|${this.filterStatus}|${this.filterOverdue ? '1' : '0'}|${this.filterOpenOnly ? '1' : '0'}|${this.sortKey}|${this.filterOrderedFrom}|${this.filterOrderedTo}|${this.filterExpectedFrom}|${this.filterExpectedTo}|${this.filterAmountMin}|${this.filterAmountMax}|${this.filterSupplier}`;
    if (sig !== this._querySig) {
      this._querySig = sig;
      this.visibleCount = this.pageSize;
    }

    this._renderSummary(baseRows);
    this._renderFilters();

    const listRows = this._applyFiltersAndSort(baseRows);
    const token = ++this._renderToken;
    this._renderList(listRows, token);
  }

  _renderSummary(baseRows) {
    const host = document.getElementById('orders-summary');
    if (!host) return;

    const rows = Array.isArray(baseRows) ? baseRows : [];
    const today = this._todayTaipei();
    const countBy = (st) => rows.filter(o => (o?.status || '').toString().trim() === st).length;
    const openCount = rows.filter(o => {
      const st = (o?.status || '').toString().trim();
      return st !== '已結案' && st !== '已取消';
    }).length;
    const overdueCount = rows.filter(o => this._isOverdue(o, today)).length;

    host.innerHTML = `
      <div class="stats-grid orders-stats">
        <div class="stat-card clickable" onclick="OrdersUI.setQuickFilter('')" title="顯示全部">
          <div class="stat-value">${rows.length}</div>
          <div class="stat-label">全部</div>
        </div>
        <div class="stat-card clickable" style="--accent:#7c3aed;" onclick="OrdersUI.setQuickFilter('OPEN')" title="未結案/未取消">
          <div class="stat-value">${openCount}</div>
          <div class="stat-label">待處理</div>
        </div>
        <div class="stat-card clickable" style="--accent:#0ea5e9;" onclick="OrdersUI.setQuickFilter('已下單')">
          <div class="stat-value">${countBy('已下單')}</div>
          <div class="stat-label">已下單</div>
        </div>
        <div class="stat-card clickable" style="--accent:#d97706;" onclick="OrdersUI.setQuickFilter('已到貨')">
          <div class="stat-value">${countBy('已到貨')}</div>
          <div class="stat-label">已到貨</div>
        </div>
        <div class="stat-card clickable" style="--accent:#16a34a;" onclick="OrdersUI.setQuickFilter('已結案')">
          <div class="stat-value">${countBy('已結案')}</div>
          <div class="stat-label">已結案</div>
        </div>
        <div class="stat-card clickable" style="--accent:#b45309;" onclick="OrdersUI.setQuickFilter('OVERDUE')" title="預計到貨日早於今日且未到貨">
          <div class="stat-value">${overdueCount}</div>
          <div class="stat-label">逾期</div>
        </div>
      </div>
    `;
  }

  _renderFilters() {
    const host = document.getElementById('orders-filters');
    if (!host) return;
    const statuses = (AppConfig?.business?.orderStatus || []).map(s => s.value);

    const orderedFrom = this._escapeAttr(this.filterOrderedFromDraft || '');
    const orderedTo = this._escapeAttr(this.filterOrderedToDraft || '');
    const expectedFrom = this._escapeAttr(this.filterExpectedFromDraft || '');
    const expectedTo = this._escapeAttr(this.filterExpectedToDraft || '');
    const minAmt = this._escapeAttr(this.filterAmountMinDraft || '');
    const maxAmt = this._escapeAttr(this.filterAmountMaxDraft || '');
    const supplier = this._escapeAttr(this.filterSupplierDraft || '');

    host.innerHTML = `
      <div class="orders-filters-inner">
        <div class="orders-filters-top">
          <div class="chip-row" aria-label="快速篩選">
            <button class="chip ${(!this.filterStatus && !this.filterOverdue && !this.filterOpenOnly) ? 'active' : ''}" onclick="OrdersUI.setQuickFilter('')">全部</button>
            ${statuses.map(v => {
              const active = (this.filterStatus === v && !this.filterOverdue && !this.filterOpenOnly);
              const c = this._accentForStatus(v).accent;
              return `<button class="chip ${active ? 'active' : ''}" style="--chip-color:${this._escapeAttr(c)}" onclick="OrdersUI.setQuickFilter('${this._escapeAttr(v)}')">${this._escapeHtml(v)}</button>`;
            }).join('')}
            <button class="chip ${this.filterOpenOnly ? 'active' : ''}" style="--chip-color:#7c3aed" onclick="OrdersUI.setQuickFilter('OPEN')">待處理</button>
            <button class="chip ${this.filterOverdue ? 'active' : ''}" style="--chip-color:#b45309" onclick="OrdersUI.setQuickFilter('OVERDUE')">逾期</button>
          </div>

          <div class="orders-filters-actions" aria-label="篩選操作">
            <button class="btn sm" onclick="OrdersUI.toggleAdvancedFilters()">${this.filtersOpen ? '收合' : '展開'} 篩選</button>
            <button class="btn sm primary" onclick="OrdersUI.applyFilters()">🔍 搜尋</button>
            <button class="btn sm ghost" onclick="OrdersUI.clearAll()" title="清除所有條件">清除</button>
          </div>
        </div>

        <div class="panel compact orders-advanced-filters" style="display:${this.filtersOpen ? 'block' : 'none'}">
          <div class="filter-row">
            <div class="filter-group">
              <label class="form-label">狀態（詳細）</label>
              <select class="input" id="orders-filter-status" onchange="OrdersUI.setStatusFilter(event)">
                <option value="" ${(this.filterStatusDraft || "").toString().trim() ? "" : "selected"}>全部</option>
                ${statuses.map(v => `<option value="${this._escapeAttr(v)}" ${this.filterStatusDraft === v ? 'selected' : ''}>${this._escapeHtml(v)}</option>`).join('')}
              </select>
            </div>

            <div class="filter-group">
              <label class="form-label">排序</label>
              <select class="input" id="orders-filter-sort" onchange="OrdersUI.setSort(event)">
                <option value="updatedAt_desc" ${this.sortKeyDraft === 'updatedAt_desc' ? 'selected' : ''}>最近更新</option>
                <option value="orderedAt_desc" ${this.sortKeyDraft === 'orderedAt_desc' ? 'selected' : ''}>下單日（新→舊）</option>
                <option value="expectedAt_asc" ${this.sortKeyDraft === 'expectedAt_asc' ? 'selected' : ''}>預計到貨（近→遠）</option>
                <option value="totalAmount_desc" ${this.sortKeyDraft === 'totalAmount_desc' ? 'selected' : ''}>金額（高→低）</option>
              </select>
            </div>
          </div>

          <div class="filter-row">
            <div class="filter-group" style="min-width:260px;">
              <label class="form-label">下單日期範圍</label>
              <div class="date-range-row">
                <input type="date" class="input" id="orders-filter-ordered-from" value="${orderedFrom}" onchange="OrdersUI.applyAdvancedFilters()" />
                <span class="date-range-sep">至</span>
                <input type="date" class="input" id="orders-filter-ordered-to" value="${orderedTo}" onchange="OrdersUI.applyAdvancedFilters()" />
              </div>
            </div>

            <div class="filter-group" style="min-width:260px;">
              <label class="form-label">預計到貨範圍</label>
              <div class="date-range-row">
                <input type="date" class="input" id="orders-filter-expected-from" value="${expectedFrom}" onchange="OrdersUI.applyAdvancedFilters()" />
                <span class="date-range-sep">至</span>
                <input type="date" class="input" id="orders-filter-expected-to" value="${expectedTo}" onchange="OrdersUI.applyAdvancedFilters()" />
              </div>
            </div>
          </div>

          <div class="filter-row">
            <div class="filter-group" style="min-width:260px;">
              <label class="form-label">金額範圍</label>
              <div class="date-range-row">
                <input type="number" inputmode="numeric" class="input" id="orders-filter-amount-min" placeholder="最低" value="${minAmt}" onchange="OrdersUI.applyAdvancedFilters()" />
                <span class="date-range-sep">~</span>
                <input type="number" inputmode="numeric" class="input" id="orders-filter-amount-max" placeholder="最高" value="${maxAmt}" onchange="OrdersUI.applyAdvancedFilters()" />
              </div>
            </div>

            <div class="filter-group" style="min-width:220px;">
              <label class="form-label">供應商</label>
              <input type="text" class="input" id="orders-filter-supplier" placeholder="包含關鍵字" value="${supplier}" oninput="OrdersUI.applyAdvancedFilters()" />
            </div>
          </div>

          <div class="muted orders-filters-hint">提示：欄位較多的明細表格支援左右滑動（水平滑桿）。</div>
        </div>
      </div>
    `;
  }
  _applyFiltersAndSort(baseRows) {
    let rows = Array.isArray(baseRows) ? baseRows.slice() : [];
    const today = this._todayTaipei();

    if (this.filterOverdue) {
      rows = rows.filter(o => this._isOverdue(o, today));
    } else if (this.filterOpenOnly) {
      rows = rows.filter(o => {
        const st = (o?.status || '').toString().trim();
        return st !== '已結案' && st !== '已取消';
      });
    } else if (this.filterStatus) {
      rows = rows.filter(o => (o?.status || '') === this.filterStatus);
    }

    // 進階篩選：下單日期範圍
    const orderedFrom = (this.filterOrderedFrom || '').toString().trim();
    const orderedTo = (this.filterOrderedTo || '').toString().trim();
    if (orderedFrom) {
      rows = rows.filter(o => {
        const ymd = this._isoYmd(o?.orderedAt);
        return ymd && ymd >= orderedFrom;
      });
    }
    if (orderedTo) {
      rows = rows.filter(o => {
        const ymd = this._isoYmd(o?.orderedAt);
        return ymd && ymd <= orderedTo;
      });
    }

    // 進階篩選：預計到貨範圍
    const expectedFrom = (this.filterExpectedFrom || '').toString().trim();
    const expectedTo = (this.filterExpectedTo || '').toString().trim();
    if (expectedFrom) {
      rows = rows.filter(o => {
        const ymd = this._isoYmd(o?.expectedAt);
        return ymd && ymd >= expectedFrom;
      });
    }
    if (expectedTo) {
      rows = rows.filter(o => {
        const ymd = this._isoYmd(o?.expectedAt);
        return ymd && ymd <= expectedTo;
      });
    }

    // 進階篩選：金額範圍
    const minAmtNum = this._toNumberOrNull(this.filterAmountMin);
    const maxAmtNum = this._toNumberOrNull(this.filterAmountMax);
    if (minAmtNum !== null) rows = rows.filter(o => Number(o?.totalAmount || 0) >= minAmtNum);
    if (maxAmtNum !== null) rows = rows.filter(o => Number(o?.totalAmount || 0) <= maxAmtNum);

    // 進階篩選：供應商
    const supplierKw = (this.filterSupplier || '').toString().trim().toLowerCase();
    if (supplierKw) {
      rows = rows.filter(o => (o?.supplier || '').toString().toLowerCase().includes(supplierKw));
    }

    // 排序
    rows.sort((a, b) => {
      const ka = a || {};
      const kb = b || {};
      if (this.sortKey === 'orderedAt_desc') return String(kb.orderedAt || '').localeCompare(String(ka.orderedAt || ''));
      if (this.sortKey === 'expectedAt_asc') return String(ka.expectedAt || '9999-12-31').localeCompare(String(kb.expectedAt || '9999-12-31'));
      if (this.sortKey === 'totalAmount_desc') return Number(kb.totalAmount || 0) - Number(ka.totalAmount || 0);
      return String(kb.updatedAt || '').localeCompare(String(ka.updatedAt || ''));
    });

    return rows;
  }

  renderLoadingCards() {
    const isMobile = (window.AppConfig && window.AppConfig.device && typeof window.AppConfig.device.isMobile === 'function')
      ? window.AppConfig.device.isMobile()
      : (window.innerWidth <= 640);
    const n = isMobile ? 6 : 8;

    return Array.from({ length: n }).map(() => `
      <div class="card accent-left order-card placeholder" style="--module-accent: rgba(148,163,184,.9); --module-accent-soft: rgba(148,163,184,.14); --accent-opacity:.55;">
        <div class="card-head">
          <div class="order-card-head-left" style="flex:1;min-width:0;">
            <div class="ph ph-line w-50"></div>
            <div class="ph ph-line w-90" style="margin-top:10px;"></div>
          </div>
          <div class="card-head-right">
            <div class="ph ph-badge"></div>
            <div class="ph ph-badge" style="margin-left:8px;"></div>
          </div>
        </div>
        <div class="card-body">
          <div class="ph ph-line w-80"></div>
          <div class="ph ph-line w-70" style="margin-top:10px;"></div>
        </div>
        <div class="card-foot">
          <button class="btn sm primary" disabled>開啟明細</button>
          <button class="btn sm danger" disabled>刪除</button>
        </div>
      </div>
    `).join('');
  }

  renderOrderCard(o, today) {
    const safeId = this._escapeAttr(o.id);
    const repair = (window._svc ? window._svc('RepairService') : window.RepairService)?.get?.(o.repairId) || null;
    const repairNo = repair ? (repair.repairNo || repair.id || '') : (o.repairId ? o.repairId : '');
    const machine = repair ? (repair.machine || '') : '';
    const supplier = (o.supplier || '').toString().trim();
    const isOverdue = this._isOverdue(o, today);
    const accent = this._accentForStatus(o.status);
    const itemsCount = Array.isArray(o.items) ? o.items.length : 0;

    return `
      <div class="card accent-left order-card" style="--module-accent:${this._escapeAttr(accent.accent)};--module-accent-soft:${this._escapeAttr(accent.soft)};${isOverdue ? '--accent-opacity:.95;' : '--accent-opacity:.70;'}">
        <div class="card-head">
          <div class="order-card-head-left">
            <div class="card-title">${this._escapeHtml(o.orderNo || '(未編號)')}</div>
            <div class="muted order-card-sub">${this._escapeHtml(o.customer || '')}${supplier ? ' · ' + this._escapeHtml(supplier) : ''}${repairNo ? ' · ' + this._escapeHtml(repairNo) : ''}${machine ? ' · ' + this._escapeHtml(machine) : ''}</div>
          </div>
          <div class="card-head-right">
            <span class="badge ${this._badgeClassForOrderStatus(o.status)}">${this._escapeHtml(o.status || '')}</span>
            ${isOverdue ? `<span class="badge badge-warning">逾期</span>` : ''}
            <span class="badge">$ ${this._escapeHtml(o.totalAmount || 0)} ${this._escapeHtml(o.currency || 'TWD')}</span>
          </div>
        </div>

        <div class="card-body">
          <div class="meta-grid">
            <div class="meta-item"><div class="meta-k">下單日</div><div class="meta-v mono">${this._escapeHtml(o.orderedAt || '—')}</div></div>
            <div class="meta-item"><div class="meta-k">預計到貨</div><div class="meta-v mono">${this._escapeHtml(o.expectedAt || '—')}</div></div>
            <div class="meta-item"><div class="meta-k">收貨日</div><div class="meta-v mono">${this._escapeHtml(o.receivedAt || '—')}</div></div>
            <div class="meta-item"><div class="meta-k">項目數</div><div class="meta-v">${itemsCount}</div></div>
          </div>
        </div>

        <div class="card-foot">
          <button class="btn sm primary" onclick="OrdersUI.openDetail('${safeId}')">開啟明細</button>
          <button class="btn sm danger" onclick="OrdersUI.confirmRemove('${safeId}')">刪除</button>
        </div>
      </div>
    `;
  }

  renderCardsIncrementally(rows, cardsEl, token) {
    if (!cardsEl) return;

    const list = Array.isArray(rows) ? rows : [];
    const total = list.length;
    const today = this._todayTaipei();

    const isMobile = (window.AppConfig && window.AppConfig.device && typeof window.AppConfig.device.isMobile === 'function')
      ? window.AppConfig.device.isMobile()
      : (window.innerWidth <= 640);

    const maxPerFrame = isMobile ? 10 : 16;
    const frameBudgetMs = isMobile ? 10 : 12;

    let i = 0;
    let cleared = false;

    const step = () => {
      if (token !== this._renderToken) return;

      if (!cleared) {
        cardsEl.innerHTML = '';
        cleared = true;
      }

      const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

      let html = '';
      let count = 0;

      while (i < total && count < maxPerFrame) {
        html += this.renderOrderCard(list[i], today);
        i += 1;
        count += 1;

        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        if ((now - t0) >= frameBudgetMs) break;
      }

      if (html) cardsEl.insertAdjacentHTML('beforeend', html);

      if (i < total) {
        requestAnimationFrame(step);
      } else {
        cardsEl.classList.remove('is-rendering');
      }
    };

    cardsEl.classList.add('is-rendering');
    requestAnimationFrame(step);
  }

  _renderList(rows, token) {
    const host = document.getElementById('orders-list');
    if (!host) return;

    const list = Array.isArray(rows) ? rows : [];

    if (!list.length) {
      host.innerHTML = `<div class="empty-state">目前沒有資料</div>`;
      return;
    }

    const total = list.length;
    const visible = list.slice(0, Math.min(this.visibleCount || this.pageSize || 60, total));
    const hasMore = visible.length < total;

    host.innerHTML = `
      <div class="card-list orders-cards is-rendering">
        ${this.renderLoadingCards()}
      </div>
      <div class="orders-list-footer">
        <div class="muted">已顯示 <span class="mono">${visible.length}</span> / <span class="mono">${total}</span></div>
        <div class="orders-list-footer-actions">
          ${hasMore ? `<button class="btn" onclick="OrdersUI.loadMore()">顯示更多</button>` : `<span class="muted">已顯示全部</span>`}
        </div>
      </div>
    `;

    const cardsEl = host.querySelector('.orders-cards');
    this.renderCardsIncrementally(visible, cardsEl, token);
  }

  async loadMore() {
    const y = (typeof window !== 'undefined') ? (window.scrollY || 0) : 0;
    this.visibleCount = (window.ListPaging && typeof window.ListPaging.nextVisibleCount === 'function')
      ? window.ListPaging.nextVisibleCount(this.visibleCount, this.pageSize)
      : ((this.visibleCount || this.pageSize || 60) + (this.pageSize || 60));
    await this.update();
    try { requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'auto' })); } catch (_) {}
  }


  openModal(html) {
    const modal = document.getElementById('orders-modal');
    const content = document.getElementById('orders-modal-content');
    if (!modal || !content) return;
    content.innerHTML = html;
    modal.style.display = 'flex';
    try {
      // Scroll container 以內層 dialog 為主（避免外層 host 沒有 overflow 時 scrollTop 無效）
      const scrollEl = content.querySelector('.modal-dialog') || content;
      scrollEl.scrollTop = 0;
    } catch (_) {}
  }


  _cloneItems(items) {
    const list = Array.isArray(items) ? items : [];
    return list.map(x => ({
      name: (x?.name || '').toString(),
      mpn: (x?.mpn || '').toString(),
      vendor: (x?.vendor || '').toString(),
      unit: (x?.unit || 'pcs').toString(),
      qty: Number(x?.qty || 1),
      unitPrice: Number(x?.unitPrice || 0)
    }));
  }

  _ensureDraftItems(orderId, items) {
    const id = (orderId || '').toString().trim();
    if (!id) return [];
    if (!this._draftItems) this._draftItems = {};
    if (!this._draftItems[id]) this._draftItems[id] = this._cloneItems(items);
    return this._draftItems[id];
  }

  _setActiveOrder(orderId, items) {
    const id = (orderId || '').toString().trim();
    if (!id) return;
    this._activeOrderId = id;
    this._ensureDraftItems(id, items);
  }

  _clearDraft(orderId) {
    const id = (orderId || '').toString().trim();
    if (!id) return;
    try { delete this._draftItems[id]; } catch (_) {}
  }

  _rerenderDetailModal(orderId, { preserveScroll = true } = {}) {
    const id = (orderId || '').toString().trim();
    const o = (window._svc ? window._svc('OrderService') : window.OrderService)?.get?.(id);
    if (!o) return;

    const modal = document.getElementById('orders-modal');
    const content = document.getElementById('orders-modal-content');
    if (!modal || !content) return;

    const prevScrollEl = content.querySelector('.modal-dialog') || content;
    const y = preserveScroll ? (prevScrollEl.scrollTop || 0) : 0;
    content.innerHTML = this.renderDetailModal(o);
    modal.style.display = 'flex';

    try {
      requestAnimationFrame(() => {
        try {
          const nextScrollEl = content.querySelector('.modal-dialog') || content;
          nextScrollEl.scrollTop = y;
        } catch (_) {}
        try { OrdersUI.recalcTotals(id); } catch (_) {}
      });
    } catch (_) {}
  }


  _syncDraftFromDOM(orderId) {
    const id = (orderId || '').toString().trim();
    if (!id) return [];
    const form = document.getElementById(`order-detail-form-${id}`);
    if (!form) return (this._draftItems && this._draftItems[id]) ? this._draftItems[id] : [];

    const o = (window._svc ? window._svc('OrderService') : window.OrderService)?.get?.(id);
    const baseItems = o?.items || [];
    this._setActiveOrder(id, baseItems);
    const list = this._ensureDraftItems(id, baseItems);

    const countNum = Number(form.elements?.itemsCount?.value ?? list.length);
    const count = Number.isFinite(countNum) ? Math.max(0, Math.floor(countNum)) : (list.length || 0);

    while (list.length < count) list.push({ name: '', mpn: '', vendor: '', unit: 'pcs', qty: 1, unitPrice: 0 });

    for (let i = 0; i < count; i++) {
      const name = (form.elements?.[`name_${i}`]?.value || '').toString();
      const mpn = (form.elements?.[`mpn_${i}`]?.value || '').toString();
      const vendor = (form.elements?.[`vendor_${i}`]?.value || '').toString();
      const unit = (form.elements?.[`unit_${i}`]?.value || 'pcs').toString();

      const qtyNum = Number(form.elements?.[`qty_${i}`]?.value);
      const priceNum = Number(form.elements?.[`unitPrice_${i}`]?.value);

      list[i] = list[i] || { name: '', mpn: '', vendor: '', unit: 'pcs', qty: 1, unitPrice: 0 };
      list[i].name = name;
      list[i].mpn = mpn;
      list[i].vendor = vendor;
      list[i].unit = unit;
      list[i].qty = Number.isFinite(qtyNum) ? qtyNum : (Number(list[i].qty) || 0);
      list[i].unitPrice = Number.isFinite(priceNum) ? priceNum : (Number(list[i].unitPrice) || 0);
    }

    list.length = count;
    return list;
  }

  _updateDraftField(orderId, index, field, rawValue) {
    const id = (orderId || '').toString().trim();
    const idx = Number(index);
    if (!id || !Number.isFinite(idx) || idx < 0) return;

    const o = (window._svc ? window._svc('OrderService') : window.OrderService)?.get?.(id);
    const baseItems = o?.items || [];
    this._setActiveOrder(id, baseItems);
    const list = this._ensureDraftItems(id, baseItems);

    while (list.length <= idx) list.push({ name: '', mpn: '', vendor: '', unit: 'pcs', qty: 1, unitPrice: 0 });

    const f = (field || '').toString().trim();
    if (!f) return;

    if (f === 'qty' || f === 'unitPrice') {
      const num = Number(rawValue);
      list[idx][f] = Number.isFinite(num) ? num : 0;
    } else {
      list[idx][f] = (rawValue === null || rawValue === undefined) ? '' : String(rawValue);
    }
  }




  addItem(orderId) {
    const id = (orderId || '').toString().trim();
    if (!id) return;
    const o = (window._svc ? window._svc('OrderService') : window.OrderService)?.get?.(id);
    if (!o) return;

    const ui = window.ordersUI;
    ui._setActiveOrder(id, o.items);
    ui._syncDraftFromDOM(id);
    const list = ui._ensureDraftItems(id, o.items);
    list.push({ name: '', mpn: '', vendor: '', unit: 'pcs', qty: 1, unitPrice: 0 });
    ui._rerenderDetailModal(id);

    try {
      setTimeout(() => {
        const form = document.getElementById(`order-detail-form-${id}`);
        const idx = Math.max(0, list.length - 1);
        const el = form?.querySelector?.(`input[name="name_${idx}"]`);
        el?.focus?.();
      }, 30);
    } catch (_) {}
  }

  removeItem(orderId, index) {
    const id = (orderId || '').toString().trim();
    const idx = Number(index);
    if (!id || !Number.isFinite(idx)) return;
    const o = (window._svc ? window._svc('OrderService') : window.OrderService)?.get?.(id);
    if (!o) return;

    const ui = window.ordersUI;
    ui._setActiveOrder(id, o.items);
    ui._syncDraftFromDOM(id);
    const list = ui._ensureDraftItems(id, o.items);
    if (idx < 0 || idx >= list.length) return;
    list.splice(idx, 1);
    ui._rerenderDetailModal(id);
  }

  recalcTotals(orderId) {
    const id = (orderId || '').toString().trim();
    if (!id) return;
    const form = document.getElementById(`order-detail-form-${id}`);
    if (!form) return;

    const currency = (form.elements?.currency?.value || 'TWD').toString();
    const countNum = Number(form.elements?.itemsCount?.value || 0);
    const count = Number.isFinite(countNum) ? Math.max(0, Math.floor(countNum)) : 0;

    let total = 0;
    for (let i = 0; i < count; i++) {
      const qty = Number(form.elements?.[`qty_${i}`]?.value || 0);
      const price = Number(form.elements?.[`unitPrice_${i}`]?.value || 0);
      const sub = (Number.isFinite(qty) ? qty : 0) * (Number.isFinite(price) ? price : 0);
      total += sub;

      const el = document.getElementById(`orderLineTotal_${id}_${i}`);
      if (el) el.textContent = `$ ${sub} ${currency}`;
    }

    const totalEl = document.getElementById(`orderTotalAmount_${id}`);
    if (totalEl) totalEl.textContent = `$ ${total} ${currency}`;

    const headerEl = document.getElementById(`orderHeaderTotal_${id}`);
    if (headerEl) headerEl.textContent = `$ ${total} ${currency}`;
  }

  closeModal() {
    const activeId = (this._activeOrderId || '').toString().trim();
    if (activeId) this._clearDraft(activeId);
    this._activeOrderId = '';

    const modal = document.getElementById('orders-modal');
    const content = document.getElementById('orders-modal-content');
    if (content) content.innerHTML = '';
    if (modal) modal.style.display = 'none';
  }

  _renderQuoteSelect(selectedQuoteId = '') {
    const quotes = (window._svc ? window._svc('QuoteService') : window.QuoteService)?.getAll?.()?.filter(q => q && !q.isDeleted) || [];
    return `
      <select class="input" name="quoteId" required>
        <option value="">請選擇</option>
        ${quotes.slice(0, 400).map(q => {
          const repair = (window._svc ? window._svc('RepairService') : window.RepairService)?.get?.(q.repairId) || null;
          const label = `${q.quoteNo || q.id} · ${(q.customer || '').toString()}${repair ? ' · ' + (repair.repairNo || repair.id) : ''}`;
          return `<option value="${this._escapeAttr(q.id)}" ${selectedQuoteId === q.id ? 'selected' : ''}>${this._escapeHtml(label)}</option>`;
        }).join('')}
      </select>
    `;
  }

  renderCreateFromQuoteModal() {
    return `
      <div class="modal-dialog">
        <div class="modal-header">
          <h3>從報價建立訂單</h3>
          <button class="modal-close" onclick="OrdersUI.closeModal()">✕</button>
        </div>
        <form class="modal-body" onsubmit="OrdersUI.handleCreateFromQuote(event)">
          <div class="form-section">
            <h4 class="form-section-title">選擇報價</h4>
            <div class="form-group">
              <label class="form-label required">報價</label>
              ${this._renderQuoteSelect('')}
            </div>
            <p class="muted" style="margin:10px 0 0;">將自動帶入報價項目並更新用料追蹤狀態（已下單）。</p>
          </div>
          <div class="modal-footer">
            <button class="btn" type="button" onclick="OrdersUI.closeModal()">取消</button>
            <button class="btn primary" type="submit">建立</button>
          </div>
        </form>
      </div>
    `;
  }

  
  renderDetailModal(order) {
    const o = OrderModel.normalize(order);
    const statuses = (AppConfig?.business?.orderStatus || []).map(s => s.value);

    const repair = (window._svc ? window._svc('RepairService') : window.RepairService)?.get?.(o.repairId) || null;
    const customer = (o.customer || repair?.customer || '').toString();
    const supplier = (o.supplier || '').toString();
    const machine = (repair?.machine || '').toString();
    const repairLabel = repair ? (repair.repairNo || repair.id || '') : (o.repairId || '');
    const metaParts = [customer, supplier, machine, repairLabel].filter(x => (x || '').toString().trim());
    const metaLine = metaParts.join(' · ');

    const idSafe = this._escapeAttr(o.id);
    const draftItems = this._ensureDraftItems(o.id, o.items);
    const draftTotal = (draftItems || []).reduce((sum, it) => {
      const qty = Number(it?.qty || 0);
      const price = Number(it?.unitPrice || 0);
      return sum + (Number.isFinite(qty) ? qty : 0) * (Number.isFinite(price) ? price : 0);
    }, 0);

    return `
      <div class="modal-dialog modal-xlarge order-detail-modal">
        <div class="modal-header">
          <div class="detail-header-left">
            <div class="orders-detail-title">
              <h3>${this._escapeHtml(o.orderNo || '訂單明細')}</h3>
              ${metaLine ? `<div class="muted orders-detail-sub">${this._escapeHtml(metaLine)}</div>` : ''}
            </div>
          </div>
          <div class="detail-header-right">
            <span class="badge ${this._badgeClassForOrderStatus(o.status)}">${this._escapeHtml(o.status || '')}</span>
            <span class="badge" id="orderHeaderTotal_${idSafe}">$ ${this._escapeHtml(draftTotal)} ${this._escapeHtml(o.currency || 'TWD')}</span>
            <button class="modal-close" type="button" onclick="OrdersUI.closeModal()">✕</button>
          </div>
        </div>

        <form class="modal-body" id="order-detail-form-${idSafe}" onsubmit="OrdersUI.handleSaveOrder(event)">
          <input type="hidden" name="id" value="${this._escapeAttr(o.id)}" />

          <div class="form-section">
            <h4 class="form-section-title">狀態與供應商</h4>
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">狀態</label>
                <select class="input" name="status">
                  ${statuses.map(v => `<option value="${this._escapeAttr(v)}" ${o.status === v ? 'selected' : ''}>${this._escapeHtml(v)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">幣別</label>
                <input class="input" name="currency" value="${this._escapeAttr(o.currency || 'TWD')}" oninput="OrdersUI.recalcTotals('${idSafe}')" />
              </div>
              <div class="form-group">
                <label class="form-label">供應商</label>
                <input class="input" name="supplier" value="${this._escapeAttr(o.supplier || '')}" />
              </div>
              <div class="form-group">
                <label class="form-label">下單日</label>
                <input class="input" type="date" name="orderedAt" value="${this._escapeAttr(o.orderedAt || '')}" />
              </div>
              <div class="form-group">
                <label class="form-label">預計到貨</label>
                <input class="input" type="date" name="expectedAt" value="${this._escapeAttr(o.expectedAt || '')}" />
              </div>
              <div class="form-group">
                <label class="form-label">收貨日</label>
                <input class="input" type="date" name="receivedAt" value="${this._escapeAttr(o.receivedAt || '')}" />
              </div>
            </div>
          </div>

          <div class="form-section">
            <div class="order-items-head">
              <h4 class="form-section-title">項目</h4>
              <div class="order-items-toolbar">
                <div class="order-items-toolbar-left">
                  <button class="btn sm" type="button" onclick="OrdersUI.addItem('${idSafe}')">＋ 新增零件</button>
                </div>
                <div class="muted">共 <span class="mono">${draftItems.length}</span> 筆</div>
              </div>
            </div>

            <input type="hidden" name="itemsCount" value="${draftItems.length}" />

            <div class="table-wrap order-items-wrap">
              <table class="table zebra order-items-table">
                <thead>
                  <tr>
                    <th style="width:26%;">名稱</th>
                    <th style="width:16%;">MPN</th>
                    <th style="width:14%;">Vendor</th>
                    <th style="width:8%;">單位</th>
                    <th class="right" style="width:8%;">數量</th>
                    <th class="right" style="width:10%;">單價</th>
                    <th class="right" style="width:14%;">小計</th>
                    <th class="center op-col" style="width:4%;"></th>
                  </tr>
                </thead>
                <tbody>
                  ${draftItems.length ? draftItems.map((it, i) => {
                    const qtyNum = Number(it.qty);
                    const priceNum = Number(it.unitPrice);
                    const qty = Number.isFinite(qtyNum) ? qtyNum : 1;
                    const unitPrice = Number.isFinite(priceNum) ? priceNum : 0;
                    const lineTotal = qty * unitPrice;
                    return `
                      <tr>
                        <td>
                          <input class="input order-text-input" name="name_${i}" value="${this._escapeAttr(it.name || '')}" placeholder="零件名稱 / 描述" oninput="OrdersUI.onItemInput('${idSafe}', ${i}, 'name', event)" />
                        </td>
                        <td>
                          <input class="input order-mpn-input" name="mpn_${i}" value="${this._escapeAttr(it.mpn || '')}" placeholder="MPN / P/N" oninput="OrdersUI.onItemInput('${idSafe}', ${i}, 'mpn', event)" />
                        </td>
                        <td>
                          <input class="input order-vendor-input" name="vendor_${i}" value="${this._escapeAttr(it.vendor || '')}" placeholder="Vendor / 品牌" oninput="OrdersUI.onItemInput('${idSafe}', ${i}, 'vendor', event)" />
                        </td>
                        <td>
                          <input class="input order-unit-input" name="unit_${i}" value="${this._escapeAttr(it.unit || 'pcs')}" placeholder="pcs" oninput="OrdersUI.onItemInput('${idSafe}', ${i}, 'unit', event)" />
                        </td>
                        <td class="right">
                          <input class="input order-num-input" name="qty_${i}" value="${this._escapeAttr(qty)}" type="number" step="1" min="0" inputmode="numeric" oninput="OrdersUI.onItemInput('${idSafe}', ${i}, 'qty', event); OrdersUI.recalcTotals('${idSafe}')" />
                        </td>
                        <td class="right">
                          <input class="input order-money-input" name="unitPrice_${i}" value="${this._escapeAttr(unitPrice)}" type="number" step="1" min="0" inputmode="numeric" oninput="OrdersUI.onItemInput('${idSafe}', ${i}, 'unitPrice', event); OrdersUI.recalcTotals('${idSafe}')" />
                        </td>
                        <td class="right">
                          <span class="mono" id="orderLineTotal_${idSafe}_${i}">$ ${this._escapeHtml(lineTotal)} ${this._escapeHtml(o.currency || 'TWD')}</span>
                        </td>
                        <td class="center op-col">
                          <button class="btn ghost sm order-remove-btn" type="button" onclick="OrdersUI.removeItem('${idSafe}', ${i})" title="移除">✕</button>
                        </td>
                      </tr>
                    `;
                  }).join('') : `
                    <tr>
                      <td colspan="8">
                        <div class="order-empty-inline">
                          <span>目前沒有項目</span>
                          <button class="btn sm primary" type="button" onclick="OrdersUI.addItem('${idSafe}')">＋ 新增零件</button>
                        </div>
                      </td>
                    </tr>
                  `}
                </tbody>
              </table>
            </div>

            <div class="order-total-row">
              <span class="muted">小計</span>
              <span class="order-total-amount" id="orderTotalAmount_${idSafe}">$ ${this._escapeHtml(draftTotal)} ${this._escapeHtml(o.currency || 'TWD')}</span>
            </div>
            <div class="muted order-scroll-hint">提示：欄位較多時可左右滑動（水平滑桿）。</div>
          </div>

          <div class="form-section">
            <h4 class="form-section-title">備註</h4>
            <textarea class="textarea" name="note" rows="3">${this._escapeHtml(o.note || '')}</textarea>
          </div>

          <div class="modal-footer sticky">
            <button class="btn" type="button" onclick="OrdersUI.closeModal()">關閉</button>
            <button class="btn primary" type="submit">儲存</button>
          </div>
        </form>
      </div>
    `;
  }

}
const ordersUI = new OrdersUI();
if (typeof window !== 'undefined') {
  window.ordersUI = ordersUI;
}

Object.assign(OrdersUI, {
  onSearchDraft(event) {
    const value = (event?.target?.value || '').toString();
    window.ordersUI.searchDraft = value;
  },

  applyFilters() {
    const ui = window.ordersUI;
    if (!ui) return;
    ui.applyFilters();
  },

  clearAll() {
    const ui = window.ordersUI;
    if (!ui) return;
    ui.clearAll();
  },

  setStatusFilter(event) {
    const ui = window.ordersUI;
    if (!ui) return;
    ui.filterStatusDraft = (event?.target?.value || '').toString().trim();
    ui.filterOverdueDraft = false;
    ui.filterOpenOnlyDraft = false;
  },

  setQuickFilter(key) {
    const ui = window.ordersUI;
    if (!ui) return;
    const k = (key || '').toString().trim();
    if (!k) {
      ui.filterStatus = '';
      ui.filterOverdue = false;
      ui.filterOpenOnly = false;
    } else if (k === 'OVERDUE') {
      ui.filterStatus = '';
      ui.filterOverdue = true;
      ui.filterOpenOnly = false;
    } else if (k === 'OPEN') {
      ui.filterStatus = '';
      ui.filterOverdue = false;
      ui.filterOpenOnly = true;
    } else {
      ui.filterStatus = k;
      ui.filterOverdue = false;
      ui.filterOpenOnly = false;
    }
    // chips 即時套用，同步草稿
    ui.filterStatusDraft = ui.filterStatus;
    ui.filterOverdueDraft = ui.filterOverdue;
    ui.filterOpenOnlyDraft = ui.filterOpenOnly;

    ui._scheduleUpdate();
  },

  toggleAdvancedFilters() {
    const ui = window.ordersUI;
    if (!ui) return;
    ui.filtersOpen = !ui.filtersOpen;
    try { ui._saveFiltersOpen(ui.filtersOpen); } catch (_) {}
    try { ui._renderFilters(); } catch (_) {}
  },

  applyAdvancedFilters() {
    const ui = window.ordersUI;
    if (!ui) return;
    const ofEl = document.getElementById('orders-filter-ordered-from');
    const otEl = document.getElementById('orders-filter-ordered-to');
    const efEl = document.getElementById('orders-filter-expected-from');
    const etEl = document.getElementById('orders-filter-expected-to');
    const minEl = document.getElementById('orders-filter-amount-min');
    const maxEl = document.getElementById('orders-filter-amount-max');
    const supEl = document.getElementById('orders-filter-supplier');

    ui.filterOrderedFromDraft = (ofEl ? ofEl.value : ui.filterOrderedFromDraft) || '';
    ui.filterOrderedToDraft = (otEl ? otEl.value : ui.filterOrderedToDraft) || '';
    ui.filterExpectedFromDraft = (efEl ? efEl.value : ui.filterExpectedFromDraft) || '';
    ui.filterExpectedToDraft = (etEl ? etEl.value : ui.filterExpectedToDraft) || '';
    ui.filterAmountMinDraft = (minEl ? minEl.value : ui.filterAmountMinDraft) || '';
    ui.filterAmountMaxDraft = (maxEl ? maxEl.value : ui.filterAmountMaxDraft) || '';
    ui.filterSupplierDraft = (supEl ? supEl.value : ui.filterSupplierDraft) || '';
  },

  clearAdvancedFilters() {
    const ui = window.ordersUI;
    if (!ui) return;
    ui.filterStatus = '';
    ui.filterOverdue = false;
    ui.filterOpenOnly = false;
    ui.filterOrderedFrom = '';
    ui.filterOrderedTo = '';
    ui.filterExpectedFrom = '';
    ui.filterExpectedTo = '';
    ui.filterAmountMin = '';
    ui.filterAmountMax = '';
    ui.filterSupplier = '';
    ui.update();
  },

  setSort(event) {
    const ui = window.ordersUI;
    if (!ui) return;
    ui.sortKeyDraft = (event?.target?.value || 'updatedAt_desc').toString().trim() || 'updatedAt_desc';
  },

  loadMore() {
    window.ordersUI?.loadMore?.();
  },

  openCreateFromQuote() {
    window.ordersUI.openModal(window.ordersUI.renderCreateFromQuoteModal());
  },

  closeModal() {
    window.ordersUI?.closeModal();
  },

  addItem(orderId) {
    window.ordersUI?.addItem?.(orderId);
  },

  removeItem(orderId, index) {
    window.ordersUI?.removeItem?.(orderId, index);
  },

  recalcTotals(orderId) {
    window.ordersUI?.recalcTotals?.(orderId);
  },

  onItemInput(orderId, index, field, event) {
    try {
      window.ordersUI?._updateDraftField?.(orderId, index, field, event?.target?.value);
    } catch (_) {}
  },

  syncFromDOM(orderId) {
    try { window.ordersUI?._syncDraftFromDOM?.(orderId); } catch (_) {}
  },



  async handleCreateFromQuote(event) {
    event.preventDefault();
    const form = event.target;
    const data = Object.fromEntries(new FormData(event.target).entries());
    const qid = (data.quoteId || '').trim();
    if (!qid) {
      const msg = '請選擇報價';
      if (window.UI && typeof window.UI.toast === 'function') window.UI.toast(msg, { type: 'warning' });
      else alert(msg);
      return;
    }
    try {
      const order = await (window._svc ? window._svc('OrderService') : window.OrderService).createFromQuote(qid);
      window.ordersUI.closeModal();
      await window.ordersUI.update();
      OrdersUI.openDetail(order.id);
    } catch (e) {
      console.error(e);
      const msg = '建立失敗：' + (e?.message || e);
      if (window.UI && typeof window.UI.toast === 'function') window.UI.toast(msg, { type: 'error' });
      else alert(msg);
    }
  },

  openDetail(orderId) {
    const o = (window._svc ? window._svc('OrderService') : window.OrderService).get(orderId);
    if (!o) return;
    try { window.ordersUI._setActiveOrder(o.id, o.items); } catch (_) {}
    window.ordersUI.openModal(window.ordersUI.renderDetailModal(o));
    try { setTimeout(() => OrdersUI.recalcTotals(o.id), 0); } catch (_) {}
  },

  async handleSaveOrder(event) {
    event.preventDefault();
    const form = event.target;
    const data = Object.fromEntries(new FormData(event.target).entries());
    const id = (data.id || '').trim();
    const o = (window._svc ? window._svc('OrderService') : window.OrderService).get(id);
    if (!o) return;

    const countNum = Number(data.itemsCount ?? (o.items || []).length);
    const count = Number.isFinite(countNum) ? Math.max(0, Math.floor(countNum)) : (o.items || []).length;

    const items = [];
    for (let i = 0; i < count; i++) {
      const name = (data[`name_${i}`] || '').toString();
      const mpn = (data[`mpn_${i}`] || '').toString();
      const vendor = (data[`vendor_${i}`] || '').toString();
      const unit = (data[`unit_${i}`] || 'pcs').toString();

      const qtyNum = Number(data[`qty_${i}`]);
      const priceNum = Number(data[`unitPrice_${i}`]);
      const qty = Number.isFinite(qtyNum) ? qtyNum : 1;
      const unitPrice = Number.isFinite(priceNum) ? priceNum : 0;

      // P0：空白列不寫入 + 資料品質檢查
      const nameT = (name || '').toString().trim();
      const mpnT = (mpn || '').toString().trim();
      const vendorT = (vendor || '').toString().trim();
      const unitT = (unit || '').toString().trim();

      const isEmptyRow = !nameT && !mpnT && !vendorT && (!unitT || unitT === 'pcs') && qty === 1 && unitPrice === 0;
      if (isEmptyRow) continue;

      if (!nameT) {
        const msg = `第 ${i + 1} 列：請填寫零件名稱`;
        if (window.UI && typeof window.UI.toast === 'function') window.UI.toast(msg, { type: 'warning' });
        else alert(msg);
        try { form.querySelector(`[name="name_${i}"]`)?.focus?.(); } catch (_) {}
        return;
      }

      if (!Number.isFinite(qty) || qty < 1 || Math.floor(qty) !== qty) {
        const msg = `第 ${i + 1} 列：數量需為整數且至少 1`;
        if (window.UI && typeof window.UI.toast === 'function') window.UI.toast(msg, { type: 'warning' });
        else alert(msg);
        try { form.querySelector(`[name="qty_${i}"]`)?.focus?.(); } catch (_) {}
        return;
      }

      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        const msg = `第 ${i + 1} 列：單價需為 0 或正數`;
        if (window.UI && typeof window.UI.toast === 'function') window.UI.toast(msg, { type: 'warning' });
        else alert(msg);
        try { form.querySelector(`[name="unitPrice_${i}"]`)?.focus?.(); } catch (_) {}
        return;
      }

      items.push({ name: nameT, mpn: mpnT, vendor: vendorT, unit: (unitT || 'pcs'), qty, unitPrice });
    }

    if (!items.length) {
      const msg = '請至少輸入一筆訂單項目';
      if (window.UI && typeof window.UI.toast === 'function') window.UI.toast(msg, { type: 'warning' });
      else alert(msg);
      return;
    }

    try {
      await (window._svc ? window._svc('OrderService') : window.OrderService).upsert({
        ...o,
        status: (data.status || o.status || '').toString(),
        currency: (data.currency || o.currency || 'TWD').toString().trim() || 'TWD',
        supplier: (data.supplier || '').toString(),
        orderedAt: (data.orderedAt || '').toString(),
        expectedAt: (data.expectedAt || '').toString(),
        receivedAt: (data.receivedAt || '').toString(),
        items,
        note: (data.note || '').toString()
      });
      await window.ordersUI.update();
      try { window.ordersUI._clearDraft(id); } catch (_) {}
      OrdersUI.closeModal();
    } catch (e) {
      console.error(e);
      const msg = '儲存失敗：' + (e?.message || e);
      if (window.UI && typeof window.UI.toast === 'function') window.UI.toast(msg, { type: 'error' });
      else alert(msg);
    }
  },

  async confirmRemove(orderId) {
    {
      const msg = '確定刪除此訂單？';
      const ok = (window.UI && typeof window.UI.confirm === 'function')
        ? await window.UI.confirm({ title: '確認刪除訂單', message: msg, okText: '刪除', cancelText: '取消', tone: 'danger' })
        : confirm(msg);
      if (!ok) return;
    }
    try {
      await (window._svc ? window._svc('OrderService') : window.OrderService).remove(orderId);
      await window.ordersUI.update();
    } catch (e) {
      console.error(e);
      const msg = '刪除失敗：' + (e?.message || e);
      if (window.UI && typeof window.UI.toast === 'function') window.UI.toast(msg, { type: 'error' });
      else alert(msg);
    }
  }
});

console.log('✅ OrdersUI loaded');
