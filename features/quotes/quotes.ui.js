/**
 * 報價管理 - UI
 * V161 - Quotes Module - UI Layer
 */

class QuotesUI {
  constructor() {
    this.searchText = '';
    this.searchDraft = '';
    this.filterStatus = '';
    this.filterPendingOnly = false;
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

    // 報價明細編輯：暫存 items（未儲存前不寫回 service）
    this._draftItems = {};
    this._activeQuoteId = '';

    // P3-2：進階篩選（可摺疊、多條件）
    this.filtersOpen = this._loadFiltersOpen();
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.filterAmountMin = '';
    this.filterAmountMax = '';

  }

  _isoToDate(iso) {
    const s = (iso || '').toString();
    if (!s) return '—';
    // ISO => YYYY-MM-DD
    return s.length >= 10 ? s.slice(0, 10) : s;
  }

  _isoToDateTime(iso) {
    const s = (iso || '').toString();
    if (!s) return '—';
    // ISO => YYYY-MM-DD HH:mm:ss（最多到秒）
    const x = s.replace('T', ' ');
    return x.length >= 19 ? x.slice(0, 19) : x;
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
      const key = this._storageKey('ui_quotes_filters_open');
      return localStorage.getItem(key) === '1';
    } catch (_) {
      return false;
    }
  }

  _saveFiltersOpen(open) {
    try {
      const key = this._storageKey('ui_quotes_filters_open');
      localStorage.setItem(key, open ? '1' : '0');
    } catch (_) {}
  }

  _isoYmd(iso) {
    const s = (iso || '').toString();
    if (!s) return '';
    return s.length >= 10 ? s.slice(0, 10) : '';
  }

  _toNumberOrNull(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }


  _badgeClassForQuoteStatus(status) {
    const s = (status || '').toString().trim();
    if (s === '已核准') return 'badge-success';
    if (s === '已送出') return 'badge-info';
    if (s === '已取消') return 'badge-error';
    // 草稿 / 其他
    return '';
  }

  _isApprovedStatus(status) {
    const s = (status || '').toString().trim();
    const sl = s.toLowerCase();
    return (s === '已核准' || sl === 'approved' || sl === 'approve' || s === '已簽核' || s === '簽核完成');
  }

  _accentForStatus(status) {
    const s = (status || '').toString().trim();
    // 僅用於卡片左側 accent（不影響全站 primary 色）
    if (s === '已核准') return { accent: '#16a34a', soft: 'rgba(22,163,74,.14)' };
    if (s === '已送出') return { accent: '#0ea5e9', soft: 'rgba(14,165,233,.14)' };
    if (s === '已取消') return { accent: '#dc2626', soft: 'rgba(220,38,38,.12)' };
    if (s === '草稿') return { accent: '#7c3aed', soft: 'rgba(124,58,237,.12)' };
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
    this.filterPendingOnly = !!this.filterPendingOnlyDraft;
    this.sortKey = (this.sortKeyDraft || 'updatedAt_desc').toString().trim() || 'updatedAt_desc';
    this.filterDateFrom = (this.filterDateFromDraft || '').toString();
    this.filterDateTo = (this.filterDateToDraft || '').toString();
    this.filterAmountMin = (this.filterAmountMinDraft || '').toString();
    this.filterAmountMax = (this.filterAmountMaxDraft || '').toString();

    this._scheduleUpdate();
  }

  clearAll() {
    this.searchText = '';
    this.searchDraft = '';
    this.filterStatus = '';
    this.filterStatusDraft = '';
    this.filterPendingOnly = false;
    this.filterPendingOnlyDraft = false;
    this.sortKey = 'updatedAt_desc';
    this.sortKeyDraft = 'updatedAt_desc';
    this.filterDateFrom = '';
    this.filterDateFromDraft = '';
    this.filterDateTo = '';
    this.filterDateToDraft = '';
    this.filterAmountMin = '';
    this.filterAmountMinDraft = '';
    this.filterAmountMax = '';
    this.filterAmountMaxDraft = '';
    this._scheduleUpdate();
  }


  render(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    el.innerHTML = `
      <div class="quotes-module">
        <div class="module-toolbar">
          <div class="module-toolbar-left">
            <div class="page-title">
              <h2>報價管理</h2>
              <span class="muted" id="quotes-subtitle">載入中...</span>
            </div>
          </div>
          <div class="module-toolbar-right">
            <div class="quotes-search">
              <input class="input" type="text" placeholder="搜尋：報價單號 / 客戶 / 狀態" value="${this._escapeAttr(this.searchDraft)}" oninput="QuotesUI.onSearchDraft(event)" />
            </div>
            <button class="btn primary" onclick="QuotesUI.applyFilters()">🔍 搜尋</button>
            <button class="btn" onclick="QuotesUI.clearAll()">🧹 清除</button>
            <button class="btn primary" onclick="QuotesUI.openCreateFromRepair()">從維修單建立</button>
          </div>
        </div>

        <div class="quotes-summary" id="quotes-summary"></div>
        <div class="quotes-filters" id="quotes-filters"></div>
        <div class="quotes-list" id="quotes-list"><div class="muted" style="padding:16px;">載入中...</div></div>
      </div>

      <div id="quotes-modal" class="modal" style="display:none;">
        <div class="modal-backdrop" onclick="QuotesUI.closeModal()"></div>
        <!--
          注意：Quotes 需要更寬的明細視窗與橫向捲動表格。
          這裡不要使用 .modal-content（預設寬度較窄），改由內層 .modal-dialog 控制寬度。
        -->
        <div class="modal-host" id="quotes-modal-content"></div>
      </div>
    `;

    this.update();
  }
  async update() {
    try {
      if (window.QuoteService && !window.QuoteService.isInitialized) await window.QuoteService.init();
      if (window.RepairPartsService && !window.RepairPartsService.isInitialized) await window.RepairPartsService.init();
    } catch (e) {
      console.warn('QuotesUI init service failed:', e);
    }

    const baseRows = window.QuoteService ? window.QuoteService.search(this.searchText) : [];
    const subtitle = document.getElementById('quotes-subtitle');
    if (subtitle) subtitle.textContent = `共 ${baseRows.length} 筆`;


    // 若查詢條件改變，重置分頁顯示數量
    const sig = `${this.searchText}|${this.filterStatus}|${this.filterPendingOnly ? '1' : '0'}|${this.sortKey}|${this.filterDateFrom}|${this.filterDateTo}|${this.filterAmountMin}|${this.filterAmountMax}`;
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
    const host = document.getElementById('quotes-summary');
    if (!host) return;
    const rows = Array.isArray(baseRows) ? baseRows : [];
    const countBy = (st) => rows.filter(q => (q?.status || '').toString().trim() === st).length;
    const pendingCount = rows.filter(q => {
      const st = (q?.status || '').toString().trim();
      return st !== '已核准' && st !== '已取消';
    }).length;

    host.innerHTML = `
      <div class="stats-grid quotes-stats">
        <div class="stat-card clickable" onclick="QuotesUI.setQuickFilter('')" title="顯示全部">
          <div class="stat-value">${rows.length}</div>
          <div class="stat-label">全部</div>
        </div>
        <div class="stat-card clickable" style="--accent:#7c3aed;" onclick="QuotesUI.setQuickFilter('PENDING')" title="草稿 + 已送出">
          <div class="stat-value">${pendingCount}</div>
          <div class="stat-label">待處理</div>
        </div>
        <div class="stat-card clickable" style="--accent:#7c3aed;" onclick="QuotesUI.setQuickFilter('草稿')">
          <div class="stat-value">${countBy('草稿')}</div>
          <div class="stat-label">草稿</div>
        </div>
        <div class="stat-card clickable" style="--accent:#0ea5e9;" onclick="QuotesUI.setQuickFilter('已送出')">
          <div class="stat-value">${countBy('已送出')}</div>
          <div class="stat-label">已送出</div>
        </div>
        <div class="stat-card clickable" style="--accent:#16a34a;" onclick="QuotesUI.setQuickFilter('已核准')">
          <div class="stat-value">${countBy('已核准')}</div>
          <div class="stat-label">已核准</div>
        </div>
        <div class="stat-card clickable" style="--accent:#dc2626;" onclick="QuotesUI.setQuickFilter('已取消')">
          <div class="stat-value">${countBy('已取消')}</div>
          <div class="stat-label">已取消</div>
        </div>
      </div>
    `;
  }

  _renderFilters() {
    const host = document.getElementById('quotes-filters');
    if (!host) return;
    const statuses = (AppConfig?.business?.quoteStatus || []).map(s => s.value);

    const from = this._escapeAttr(this.filterDateFromDraft || '');
    const to = this._escapeAttr(this.filterDateToDraft || '');
    const minAmt = this._escapeAttr(this.filterAmountMinDraft || '');
    const maxAmt = this._escapeAttr(this.filterAmountMaxDraft || '');

    host.innerHTML = `
      <div class="quotes-filters-inner">
        <div class="quotes-filters-top">
          <div class="chip-row" aria-label="快速篩選">
            <button class="chip ${(!this.filterStatus && !this.filterPendingOnly) ? 'active' : ''}" onclick="QuotesUI.setQuickFilter('')">全部</button>
            <button class="chip ${this.filterPendingOnly ? 'active' : ''}" style="--chip-color:#7c3aed" onclick="QuotesUI.setQuickFilter('PENDING')">待處理</button>
            ${statuses.map(v => {
              const active = (!this.filterPendingOnly && this.filterStatus === v);
              const c = this._accentForStatus(v).accent;
              return `<button class="chip ${active ? 'active' : ''}" style="--chip-color:${this._escapeAttr(c)}" onclick="QuotesUI.setQuickFilter('${this._escapeAttr(v)}')">${this._escapeHtml(v)}</button>`;
            }).join('')}
          </div>

          <div class="quotes-filters-actions" aria-label="篩選操作">
            <button class="btn sm" onclick="QuotesUI.toggleAdvancedFilters()">${this.filtersOpen ? '收合' : '展開'} 篩選</button>
            <button class="btn sm primary" onclick="QuotesUI.applyFilters()">🔍 搜尋</button>
            <button class="btn sm ghost" onclick="QuotesUI.clearAll()" title="清除所有條件">清除</button>
          </div>
        </div>

        <div class="panel compact quotes-advanced-filters" style="display:${this.filtersOpen ? 'block' : 'none'}">
          <div class="filter-row">
            <div class="filter-group">
              <label class="form-label">狀態（詳細）</label>
              <select class="input" id="quotes-filter-status" onchange="QuotesUI.setStatusFilter(event)">
                <option value="" ${(this.filterStatusDraft || "").toString().trim() ? "" : "selected"}>全部</option>
                ${statuses.map(v => `<option value="${this._escapeAttr(v)}" ${this.filterStatusDraft === v ? 'selected' : ''}>${this._escapeHtml(v)}</option>`).join('')}
              </select>
            </div>

            <div class="filter-group">
              <label class="form-label">排序</label>
              <select class="input" id="quotes-filter-sort" onchange="QuotesUI.setSort(event)">
                <option value="updatedAt_desc" ${this.sortKeyDraft === 'updatedAt_desc' ? 'selected' : ''}>最近更新</option>
                <option value="createdAt_desc" ${this.sortKeyDraft === 'createdAt_desc' ? 'selected' : ''}>建立日（新→舊）</option>
                <option value="totalAmount_desc" ${this.sortKeyDraft === 'totalAmount_desc' ? 'selected' : ''}>金額（高→低）</option>
                <option value="quoteNo_desc" ${this.sortKeyDraft === 'quoteNo_desc' ? 'selected' : ''}>報價單號（新→舊）</option>
              </select>
            </div>
          </div>

          <div class="filter-row">
            <div class="filter-group" style="min-width:260px;">
              <label class="form-label">建立日期範圍</label>
              <div class="date-range-row">
                <input type="date" class="input" id="quotes-filter-date-from" value="${from}" onchange="QuotesUI.applyAdvancedFilters()" />
                <span class="date-range-sep">至</span>
                <input type="date" class="input" id="quotes-filter-date-to" value="${to}" onchange="QuotesUI.applyAdvancedFilters()" />
              </div>
            </div>

            <div class="filter-group" style="min-width:260px;">
              <label class="form-label">金額範圍</label>
              <div class="date-range-row">
                <input type="number" inputmode="numeric" class="input" id="quotes-filter-amount-min" placeholder="最低" value="${minAmt}" onchange="QuotesUI.applyAdvancedFilters()" />
                <span class="date-range-sep">~</span>
                <input type="number" inputmode="numeric" class="input" id="quotes-filter-amount-max" placeholder="最高" value="${maxAmt}" onchange="QuotesUI.applyAdvancedFilters()" />
              </div>
            </div>
          </div>

          <div class="muted quotes-filters-hint">提示：報價明細表格支援左右滑動（水平滑桿）。</div>
        </div>
      </div>
    `;
  }

  _applyFiltersAndSort(baseRows) {
    let rows = Array.isArray(baseRows) ? baseRows.slice() : [];

    if (this.filterPendingOnly) {
      rows = rows.filter(q => {
        const st = (q?.status || '').toString().trim();
        return st !== '已核准' && st !== '已取消';
      });
    } else if (this.filterStatus) {
      const want = (this.filterStatus || '').toString().trim();
      rows = rows.filter(q => (q?.status || '').toString().trim() === want);
    }

    // 進階篩選：建立日期範圍
    // 注意：date input 若 value 不是 YYYY-MM-DD，瀏覽器會顯示空白但值仍可能存在，會導致全部被過濾掉
    let fromYmd = (this.filterDateFrom || '').toString().trim();
    let toYmd = (this.filterDateTo || '').toString().trim();
    const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
    if (fromYmd && !ymdRe.test(fromYmd)) fromYmd = '';
    if (toYmd && !ymdRe.test(toYmd)) toYmd = '';
    if (fromYmd) {
      rows = rows.filter(q => {
        const ymd = this._isoYmd(q?.createdAt) || this._isoYmd(q?.updatedAt);
        return ymd && ymd >= fromYmd;
      });
    }
    if (toYmd) {
      rows = rows.filter(q => {
        const ymd = this._isoYmd(q?.createdAt) || this._isoYmd(q?.updatedAt);
        return ymd && ymd <= toYmd;
      });
    }

    // 進階篩選：金額範圍
    const minAmtNum = this._toNumberOrNull(this.filterAmountMin);
    const maxAmtNum = this._toNumberOrNull(this.filterAmountMax);
    if (minAmtNum !== null) rows = rows.filter(q => Number(q?.totalAmount || 0) >= minAmtNum);
    if (maxAmtNum !== null) rows = rows.filter(q => Number(q?.totalAmount || 0) <= maxAmtNum);

    // 排序
    rows.sort((a, b) => {
      const ka = a || {};
      const kb = b || {};
      if (this.sortKey === 'createdAt_desc') return String(kb.createdAt || '').localeCompare(String(ka.createdAt || ''));
      if (this.sortKey === 'totalAmount_desc') return Number(kb.totalAmount || 0) - Number(ka.totalAmount || 0);
      if (this.sortKey === 'quoteNo_desc') return String(kb.quoteNo || '').localeCompare(String(ka.quoteNo || ''));
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
      <div class="card accent-left quote-card placeholder" style="--module-accent: rgba(148,163,184,.9); --module-accent-soft: rgba(148,163,184,.14); --accent-opacity:.55;">
        <div class="card-head">
          <div style="min-width:0;flex:1;">
            <div class="ph ph-line w-50"></div>
            <div class="ph ph-line w-80" style="margin-top:10px;"></div>
          </div>
          <div class="card-head-right">
            <div class="ph ph-badge"></div>
            <div class="ph ph-badge" style="margin-left:8px;"></div>
          </div>
        </div>
        <div class="card-body">
          <div class="ph ph-line w-90"></div>
          <div class="ph ph-line w-70" style="margin-top:10px;"></div>
        </div>
        <div class="card-foot">
          <button class="btn sm primary" disabled>開啟明細</button>
          <button class="btn sm" disabled>建立訂單</button>
          <button class="btn sm danger" disabled>刪除</button>
        </div>
      </div>
    `).join('');
  }

  renderQuoteCard(q) {
    // 注意：卡片 render 時仍可能在資料同步/空值狀態，需避免未宣告變數造成全站 fatal
    const idSafe = this._escapeAttr(q.id);
    const repair = window.RepairService?.get?.(q.repairId) || null;
    const repairNo = repair ? (repair.repairNo || repair.id || '') : (q.repairId ? q.repairId : '');
    // customer：以維修單的公司名稱為優先（客戶更名後卡片/搜尋可反映新名稱）
    const customerDisplay = (repair?.customer || q.customer || '').toString().trim();
    const machine = repair ? (repair.machine || '') : '';
    const accent = this._accentForStatus(q.status);
    const itemsArr = Array.isArray(q.items) ? q.items : [];
    const itemsCount = itemsArr.length;
    const draftTotal = (itemsArr || []).reduce((sum, it) => {
      const qty = Number(it?.qty || 0);
      const price = Number(it?.unitPrice || 0);
      return sum + (Number.isFinite(qty) ? qty : 0) * (Number.isFinite(price) ? price : 0);
    }, 0);

    const canConvert = this._isApprovedStatus(q.status);

    return `
      <div class="card accent-left quote-card" style="--module-accent:${this._escapeAttr(accent.accent)};--module-accent-soft:${this._escapeAttr(accent.soft)};--accent-opacity:.75;">
        <div class="card-head">
          <div>
            <div class="card-title">${this._escapeHtml(q.quoteNo || '(未編號)')}</div>
            <div class="muted quote-card-sub">${this._escapeHtml(customerDisplay)}${repairNo ? ' · ' + this._escapeHtml(repairNo) : ''}${machine ? ' · ' + this._escapeHtml(machine) : ''}</div>
          </div>
          <div class="card-head-right">
            <span class="badge ${this._badgeClassForQuoteStatus(q.status)}">${this._escapeHtml(q.status || '')}</span>
            <span class="badge" id="quoteHeaderTotal_${idSafe}">$ ${this._escapeHtml(draftTotal)} ${this._escapeHtml(q.currency || 'TWD')}</span>
          </div>
        </div>
        <div class="card-body">
          <div class="meta-grid">
            <div class="meta-item"><div class="meta-k">建立日</div><div class="meta-v mono">${this._escapeHtml(this._isoToDate(q.createdAt))}</div></div>
            <div class="meta-item"><div class="meta-k">更新日</div><div class="meta-v mono">${this._escapeHtml(this._isoToDate(q.updatedAt))}</div></div>
            <div class="meta-item"><div class="meta-k">項目數</div><div class="meta-v">${itemsCount}</div></div>
            <div class="meta-item"><div class="meta-k">幣別</div><div class="meta-v">${this._escapeHtml(q.currency || 'TWD')}</div></div>
          </div>
        </div>
        <div class="card-foot">
          <button class="btn sm primary" onclick="QuotesUI.openDetail('${idSafe}')">開啟明細</button>
          <button class="btn sm" onclick="QuotesUI.createOrderFromQuote('${idSafe}')" ${canConvert ? '' : 'disabled title="需先將狀態改為已核准（簽核）才可轉訂單"'}>轉訂單</button>
          <button class="btn sm danger" onclick="QuotesUI.confirmRemove('${idSafe}')">刪除</button>
        </div>
      </div>
    `;
  }

  renderCardsIncrementally(rows, cardsEl, token) {
    if (!cardsEl) return;

    const list = Array.isArray(rows) ? rows : [];
    const total = list.length;

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
        // 保留 placeholder 直到第一個 frame，避免白屏
        cardsEl.innerHTML = '';
        cleared = true;
      }

      const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

      let html = '';
      let count = 0;

      while (i < total && count < maxPerFrame) {
        html += this.renderQuoteCard(list[i]);
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
    const host = document.getElementById('quotes-list');
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
      <div class="card-list quotes-cards is-rendering">
        ${this.renderLoadingCards()}
      </div>
      <div class="quotes-list-footer">
        <div class="muted">已顯示 <span class="mono">${visible.length}</span> / <span class="mono">${total}</span></div>
        <div class="quotes-list-footer-actions">
          ${hasMore ? `<button class="btn" onclick="QuotesUI.loadMore()">顯示更多</button>` : `<span class="muted">已顯示全部</span>`}
        </div>
      </div>
    `;

    const cardsEl = host.querySelector('.quotes-cards');
    this.renderCardsIncrementally(visible, cardsEl, token);
  }

  async loadMore() {
    // 保留目前捲動位置，避免更新後跳動
    const y = (typeof window !== 'undefined') ? (window.scrollY || 0) : 0;
    this.visibleCount = (window.ListPaging && typeof window.ListPaging.nextVisibleCount === 'function')
      ? window.ListPaging.nextVisibleCount(this.visibleCount, this.pageSize)
      : ((this.visibleCount || this.pageSize || 60) + (this.pageSize || 60));
    await this.update();
    try {
      requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'auto' }));
    } catch (_) {}
  }

  openModal(html) {
    const modal = document.getElementById('quotes-modal');
    const content = document.getElementById('quotes-modal-content');
    if (!modal || !content) return;
    content.innerHTML = html;
    modal.style.display = 'flex';
    try { content.scrollTop = 0; } catch (_) {}
  }



  _syncDraftFromDOM(quoteId) {
    const id = (quoteId || '').toString().trim();
    if (!id) return [];
    const form = document.getElementById(`quote-detail-form-${id}`);
    if (!form) return (this._draftItems && this._draftItems[id]) ? this._draftItems[id] : [];

    const q = window.QuoteService?.get?.(id);
    const baseItems = q?.items || [];
    this._setActiveQuote(id, baseItems);
    const list = this._ensureDraftItems(id, baseItems);

    const countNum = Number(form.elements?.itemsCount?.value ?? list.length);
    const count = Number.isFinite(countNum) ? Math.max(0, Math.floor(countNum)) : (list.length || 0);

    // 確保陣列長度
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

  _updateDraftField(quoteId, index, field, rawValue) {
    const id = (quoteId || '').toString().trim();
    const idx = Number(index);
    if (!id || !Number.isFinite(idx) || idx < 0) return;

    const q = window.QuoteService?.get?.(id);
    const baseItems = q?.items || [];
    this._setActiveQuote(id, baseItems);
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





  addItem(quoteId) {
    const id = (quoteId || '').toString().trim();
    if (!id) return;
    const q = window.QuoteService?.get?.(id);
    if (!q) return;

    const ui = window.quotesUI;
    ui._setActiveQuote(id, q.items);
    ui._syncDraftFromDOM(id);
    const list = ui._ensureDraftItems(id, q.items);
    // 新增項目採「新在上、舊在下」：插入到最上方
    list.unshift({ name: '', mpn: '', vendor: '', unit: 'pcs', qty: 1, unitPrice: 0 });
    ui._rerenderDetailModal(id);

    // focus 新增列的名稱欄位
    try {
      setTimeout(() => {
        const form = document.getElementById(`quote-detail-form-${id}`);
        const idx = 0;
        const el = form?.querySelector?.(`input[name="name_${idx}"]`);
        el?.focus?.();
      }, 30);
    } catch (_) {}
  }

  removeItem(quoteId, index) {
    const id = (quoteId || '').toString().trim();
    const idx = Number(index);
    if (!id || !Number.isFinite(idx)) return;
    const q = window.QuoteService?.get?.(id);
    if (!q) return;

    const ui = window.quotesUI;
    ui._setActiveQuote(id, q.items);
    ui._syncDraftFromDOM(id);
    const list = ui._ensureDraftItems(id, q.items);
    if (idx < 0 || idx >= list.length) return;
    list.splice(idx, 1);
    ui._rerenderDetailModal(id);
  }

  syncFromRepairParts(quoteId) {
    const id = (quoteId || '').toString().trim();
    if (!id) return;
    const q = window.QuoteService?.get?.(id);
    if (!q) return;
    const rid = (q.repairId || '').toString().trim();
    if (!rid) {
      const msg = '此報價未綁定維修單，無法帶入用料追蹤';
      if (window.UI && typeof window.UI.toast === 'function') window.UI.toast(msg, { type: 'warning' });
      else alert(msg);
      return;
    }

    const parts = window.RepairPartsService?.getForRepair?.(rid) || [];
    const items = (parts || [])
      .filter(p => p && !p.isDeleted)
      .map(p => ({
        name: (p.partName || '').toString(),
        mpn: (p.mpn || '').toString(),
        vendor: (p.vendor || '').toString(),
        qty: Number(p.qty || 1),
        unit: (p.unit || 'pcs').toString(),
        unitPrice: Number(p.unitPrice || 0)
      }))
      .filter(it => (it.name || '').trim().length > 0 || (it.mpn || '').trim().length > 0);

    const ui = window.quotesUI;
    ui._setActiveQuote(id, q.items);
    ui._draftItems[id] = ui._cloneItems(items);
    ui._rerenderDetailModal(id);

    try {
      const msg = items.length ? `已帶入 ${items.length} 筆用料追蹤項目（尚未儲存）` : '用料追蹤目前沒有可帶入的項目';
      if (window.UI && typeof window.UI.toast === 'function') window.UI.toast(msg, { type: items.length ? 'success' : 'info' });
    } catch (_) {}
  }

  recalcTotals(quoteId) {
    const id = (quoteId || '').toString().trim();
    if (!id) return;
    const form = document.getElementById(`quote-detail-form-${id}`);
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

      const el = document.getElementById(`quoteLineTotal_${id}_${i}`);
      if (el) el.textContent = `$ ${sub} ${currency}`;
    }

    const totalEl = document.getElementById(`quoteTotalAmount_${id}`);
    if (totalEl) totalEl.textContent = `$ ${total} ${currency}`;

    const headerEl = document.getElementById(`quoteHeaderTotal_${id}`);
    if (headerEl) headerEl.textContent = `$ ${total} ${currency}`;
  }

  closeModal() {
    const activeId = (this._activeQuoteId || '').toString().trim();
    if (activeId) this._clearDraft(activeId);
    this._activeQuoteId = '';

    const modal = document.getElementById('quotes-modal');
    const content = document.getElementById('quotes-modal-content');
    if (content) content.innerHTML = '';
    if (modal) modal.style.display = 'none';
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

  _ensureDraftItems(quoteId, items) {
    const id = (quoteId || '').toString().trim();
    if (!id) return [];
    if (!this._draftItems) this._draftItems = {};
    if (!this._draftItems[id]) this._draftItems[id] = this._cloneItems(items);
    return this._draftItems[id];
  }

  _setActiveQuote(quoteId, items) {
    const id = (quoteId || '').toString().trim();
    if (!id) return;
    this._activeQuoteId = id;
    this._ensureDraftItems(id, items);
  }

  _clearDraft(quoteId) {
    const id = (quoteId || '').toString().trim();
    if (!id) return;
    try { delete this._draftItems[id]; } catch (_) {}
  }

  _rerenderDetailModal(quoteId, { preserveScroll = true } = {}) {
    const id = (quoteId || '').toString().trim();
    const q = window.QuoteService?.get?.(id);
    if (!q) return;

    const modal = document.getElementById('quotes-modal');
    const content = document.getElementById('quotes-modal-content');
    if (!modal || !content) return;

    const y = preserveScroll ? (content.scrollTop || 0) : 0;
    content.innerHTML = this.renderDetailModal(q);
    modal.style.display = 'flex';
    try {
      requestAnimationFrame(() => {
        try { content.scrollTop = y; } catch (_) {}
        try { QuotesUI.recalcTotals(id); } catch (_) {}
      });
    } catch (_) {}
  }
  _renderRepairSelect(selectedRepairId = '') {
    let repairs = window.RepairService?.getAll?.()?.filter(r => r && !r.isDeleted) || [];
    // 需求：維修單號由新到舊排列（避免每次都從舊單開始翻）
    try {
      repairs = [...repairs].sort((a, b) => {
        const ano = (a?.repairNo || a?.id || '').toString();
        const bno = (b?.repairNo || b?.id || '').toString();
        // repairNo 格式 RYYYYMMDD-XXX：字串排序即可達成新→舊
        if (ano && bno && ano !== bno) return bno.localeCompare(ano);
        const at = (a?.createdAt || a?.updatedAt || '').toString();
        const bt = (b?.createdAt || b?.updatedAt || '').toString();
        if (at && bt && at !== bt) return bt.localeCompare(at);
        return (b?.id || '').toString().localeCompare((a?.id || '').toString());
      });
    } catch (_) {}
    return `
      <select class="input" name="repairId" required>
        <option value="">請選擇</option>
        ${repairs.slice(0, 400).map(r => {
          const label = `${r.repairNo || r.id} · ${(r.customer || '').toString()} · ${(r.machine || '').toString()}`;
          return `<option value="${this._escapeAttr(r.id)}" ${selectedRepairId === r.id ? 'selected' : ''}>${this._escapeHtml(label)}</option>`;
        }).join('')}
      </select>
    `;
  }

  renderCreateFromRepairModal() {
    return `
      <div class="modal-dialog">
        <div class="modal-header">
          <h3>從維修單建立報價</h3>
          <button class="modal-close" onclick="QuotesUI.closeModal()">✕</button>
        </div>
        <form class="modal-body" onsubmit="QuotesUI.handleCreateFromRepair(event)">
          <div class="form-section">
            <h4 class="form-section-title">選擇維修單</h4>
            <div class="form-group">
              <label class="form-label required">維修單</label>
              ${this._renderRepairSelect('')}
            </div>
            <p class="muted" style="margin:10px 0 0;">將自動帶入該維修單的用料追蹤（repairParts）項目。</p>
          </div>
          <div class="modal-footer" style="padding:0;border:0;">
            <button class="btn" type="button" onclick="QuotesUI.closeModal()">取消</button>
            <button class="btn primary" type="submit">建立</button>
          </div>
        </form>
      </div>
    `;
  }

  renderDetailModal(quote) {
    const q = QuoteModel.normalize(quote);
    const statuses = (AppConfig?.business?.quoteStatus || []).map(s => s.value);
    const repair = window.RepairService?.get?.(q.repairId) || null;
    const customer = (q.customer || repair?.customer || '').toString();
    const machine = (repair?.machine || '').toString();
    const repairLabel = repair ? (repair.repairNo || repair.id || '') : (q.repairId || '');
    const metaParts = [customer, machine, repairLabel].filter(x => (x || '').toString().trim());
    const metaLine = metaParts.join(' · ');
    const idSafe = this._escapeAttr(q.id);
    // 使用暫存 items（未儲存前不寫回 QuoteService）
    const draftItems = this._ensureDraftItems(q.id, q.items);
    const draftTotal = (draftItems || []).reduce((sum, it) => {
      const qty = Number(it?.qty || 0);
      const price = Number(it?.unitPrice || 0);
      return sum + (Number.isFinite(qty) ? qty : 0) * (Number.isFinite(price) ? price : 0);
    }, 0);
    const canConvert = this._isApprovedStatus(q.status);
    return `
      <div class="modal-dialog modal-xlarge quote-detail-modal">
        <div class="modal-header">
          <div class="detail-header-left">
            ${canConvert
              ? `<button class="btn sm" type="button" onclick="QuotesUI.createOrderFromQuote('${this._escapeAttr(q.id)}')">轉訂單</button>`
              : `<button class="btn sm" type="button" disabled title="需先將狀態改為已核准（簽核）才可轉訂單">轉訂單</button>`
            }
            <div class="quotes-detail-title">
              <h3>${this._escapeHtml(q.quoteNo || '報價明細')}</h3>
              ${metaLine ? `<div class="muted quotes-detail-sub">${this._escapeHtml(metaLine)}</div>` : ''}
            </div>
          </div>
          <div class="detail-header-right">
            <span class="badge ${this._badgeClassForQuoteStatus(q.status)}">${this._escapeHtml(q.status || '')}</span>
            <span class="badge" id="quoteHeaderTotal_${idSafe}">$ ${this._escapeHtml(draftTotal)} ${this._escapeHtml(q.currency || 'TWD')}</span>
            <button class="modal-close" type="button" onclick="QuotesUI.closeModal()">✕</button>
          </div>
        </div>

        <form class="modal-body" id="quote-detail-form-${idSafe}" onsubmit="QuotesUI.handleSaveQuote(event)">
          <input type="hidden" name="id" value="${this._escapeAttr(q.id)}" />

          <div class="form-section">
            <h4 class="form-section-title">狀態</h4>
            <div class="form-grid">
              <div class="form-group">
                <label class="form-label">狀態</label>
                <select class="input" name="status">
                  ${statuses.map(v => `<option value="${this._escapeAttr(v)}" ${q.status === v ? 'selected' : ''}>${this._escapeHtml(v)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">幣別</label>
                <input class="input" name="currency" value="${this._escapeAttr(q.currency)}" oninput="QuotesUI.recalcTotals('${idSafe}')" />
              </div>
            </div>
          </div>

          <div class="form-section">
            <div class="quote-items-head">
              <h4 class="form-section-title">項目</h4>
              <div class="quote-items-toolbar">
                <div class="quote-items-toolbar-left">
                  <button class="btn sm" type="button" onclick="QuotesUI.addItem('${idSafe}')">＋ 新增零件</button>
                  ${q.repairId ? `<button class="btn sm" type="button" onclick="QuotesUI.syncFromRepairParts('${idSafe}')">↻ 從用料追蹤帶入（覆寫）</button>` : ''}
                </div>
                <div class="muted">共 <span class="mono">${draftItems.length}</span> 筆</div>
              </div>
            </div>

            <input type="hidden" name="itemsCount" value="${draftItems.length}" />

            <div class="table-wrap quote-items-wrap">
              <table class="table zebra quote-items-table">
                <thead>
                  <tr>
                    <th style="width:30%;">名稱</th>
                    <th style="width:16%;">MPN</th>
                    <th style="width:14%;">Vendor</th>
                    <th style="width:8%;">單位</th>
                    <th class="right" style="width:8%;">數量</th>
                    <th class="right" style="width:10%;">單價</th>
                    <th class="right" style="width:10%;">小計</th>
                    <th class="center op-col" style="width:4%;"></th>
                  </tr>
                </thead>
                <tbody>
                  ${draftItems.length ? draftItems.map((it, i) => {
                    const qtyNum = Number(it.qty);
                    const priceNum = Number(it.unitPrice);
                    const qty = Number.isFinite(qtyNum) ? qtyNum : 1;
                    const unitPrice = Number.isFinite(priceNum) ? priceNum : 0;
                    // UX：單價為 0 時顯示空白，避免使用者每次都要刪除 0
                    const unitPriceDisplay = (Number.isFinite(priceNum) && priceNum != 0) ? priceNum : '';
                    const lineTotal = qty * unitPrice;
                    return `
                      <tr>
                        <td>
                          <input class="input quote-text-input" name="name_${i}" value="${this._escapeAttr(it.name || '')}" placeholder="零件名稱 / 描述" oninput="QuotesUI.onItemInput('${idSafe}', ${i}, 'name', event)" />
                        </td>
                        <td>
                          <input class="input quote-mpn-input" name="mpn_${i}" value="${this._escapeAttr(it.mpn || '')}" placeholder="MPN / P/N" oninput="QuotesUI.onItemInput('${idSafe}', ${i}, 'mpn', event)" />
                        </td>
                        <td>
                          <input class="input quote-vendor-input" name="vendor_${i}" value="${this._escapeAttr(it.vendor || '')}" placeholder="Vendor / 品牌" oninput="QuotesUI.onItemInput('${idSafe}', ${i}, 'vendor', event)" />
                        </td>
                        <td>
                          <input class="input quote-unit-input" name="unit_${i}" value="${this._escapeAttr(it.unit || 'pcs')}" placeholder="pcs" oninput="QuotesUI.onItemInput('${idSafe}', ${i}, 'unit', event)" />
                        </td>
                        <td class="right">
                          <input class="input quote-num-input" name="qty_${i}" value="${this._escapeAttr(qty)}" type="number" step="1" min="0" inputmode="numeric" oninput="QuotesUI.onItemInput('${idSafe}', ${i}, 'qty', event); QuotesUI.recalcTotals('${idSafe}')" />
                        </td>
                        <td class="right">
                          <input class="input quote-money-input" name="unitPrice_${i}" value="${this._escapeAttr(unitPriceDisplay)}" type="number" step="1" min="0" inputmode="numeric" placeholder="0" onfocus="QuotesUI.onMoneyFocus(event)" oninput="QuotesUI.onItemInput('${idSafe}', ${i}, 'unitPrice', event); QuotesUI.recalcTotals('${idSafe}')" />
                        </td>
                        <td class="right">
                          <span class="mono" id="quoteLineTotal_${idSafe}_${i}">$ ${this._escapeHtml(lineTotal)} ${this._escapeHtml(q.currency || 'TWD')}</span></td>
                        <td class="center op-col">
                          <button class="btn ghost sm quote-remove-btn" type="button" onclick="QuotesUI.removeItem('${idSafe}', ${i})" title="移除">✕</button>
                        </td>
                      </tr>
                    `;
                  }).join('') : `
                    <tr>
                      <td colspan="8">
                        <div class="quote-empty-inline">
                          <span>目前沒有項目</span>
                          <button class="btn sm primary" type="button" onclick="QuotesUI.addItem('${idSafe}')">＋ 新增零件</button>
                        </div>
                      </td>
                    </tr>
                  `}
                </tbody>
              </table>
            </div>
            <div class="quote-total-row">
              <span class="muted">小計</span>
              <span class="quote-total-amount" id="quoteTotalAmount_${idSafe}">$ ${this._escapeHtml(draftTotal)} ${this._escapeHtml(q.currency || 'TWD')}</span>
            </div>
            <div class="muted quote-scroll-hint">提示：欄位較多時可左右滑動（水平滑桿）。</div>
          </div>


          <div class="form-section">
            <h4 class="form-section-title">備註</h4>
            <textarea class="textarea" name="note" rows="3">${this._escapeHtml(q.note || '')}</textarea>
          </div>

          <div class="form-section">
            <h4 class="form-section-title">版本與變更歷史</h4>
            <div class="form-grid">
              <div class="form-field">
                <label>目前版本</label>
                <div class="hint mono">v${this._escapeHtml(String(q.version || 1))}</div>
              </div>
              <div class="form-field">
                <label>最後修改</label>
                <div class="hint">
                  ${this._escapeHtml((q.updatedByName || q.updatedByEmail || '—').toString())}
                  <span class="muted mono">${this._escapeHtml(this._isoToDateTime(q.updatedAt))}</span>
                </div>
              </div>
            </div>
            <div class="quote-history-toolbar">
              <button class="btn sm" type="button" onclick="QuotesUI.reloadHistory('${idSafe}')">重新整理</button>
            </div>
            <div id="quote_history_${idSafe}" class="quote-history-box"><div class="muted">載入中...</div></div>
          </div>

          <div class="modal-footer sticky">
            <button class="btn" type="button" onclick="QuotesUI.closeModal()">關閉</button>
            <button class="btn" type="button" onclick="QuotesUI.exportQuotePdf(\'${idSafe}\')">輸出 PDF</button>
            <button class="btn primary" type="submit">儲存</button>
          </div>
        </form>
      </div>
    `;
  }
}

const quotesUI = new QuotesUI();
if (typeof window !== 'undefined') {
  window.quotesUI = quotesUI;
}

Object.assign(QuotesUI, {
  onSearchDraft(event) {
    const value = (event?.target?.value || '').toString();
    window.quotesUI.searchDraft = value;
  },

  applyFilters() {
    const ui = window.quotesUI;
    if (!ui) return;
    ui.applyFilters();
  },

  clearAll() {
    const ui = window.quotesUI;
    if (!ui) return;
    ui.clearAll();
  },

  onMoneyFocus(event) {
    try {
      const el = event?.target;
      if (!el) return;
      const v = (el.value ?? '').toString().trim();
      // 若目前是 0（或 0.00），點入時自動清空，避免每次都要手動刪除
      if (v === '0' || v === '0.0' || v === '0.00') {
        el.value = '';
        return;
      }
      // 方便快速覆寫
      try { el.select?.(); } catch (_) {}
    } catch (_) {}
  },

  setStatusFilter(event) {
    const ui = window.quotesUI;
    if (!ui) return;
    ui.filterStatusDraft = (event?.target?.value || '').toString().trim();
    ui.filterPendingOnlyDraft = false;
  },

  setSort(event) {
    const ui = window.quotesUI;
    if (!ui) return;
    ui.sortKeyDraft = (event?.target?.value || 'updatedAt_desc').toString().trim() || 'updatedAt_desc';
  },

  setQuickFilter(key) {
    const ui = window.quotesUI;
    if (!ui) return;
    const k = (key || '').toString().trim();
    if (!k) {
      ui.filterStatus = '';
      ui.filterPendingOnly = false;
    } else if (k === 'PENDING') {
      ui.filterStatus = '';
      ui.filterPendingOnly = true;
    } else {
      ui.filterStatus = k;
      ui.filterPendingOnly = false;
    }
    // chips 即時套用，同步草稿
    ui.filterStatusDraft = ui.filterStatus;
    ui.filterPendingOnlyDraft = ui.filterPendingOnly;

    ui._scheduleUpdate();
  },

  toggleAdvancedFilters() {
    const ui = window.quotesUI;
    if (!ui) return;
    ui.filtersOpen = !ui.filtersOpen;
    try { ui._saveFiltersOpen(ui.filtersOpen); } catch (_) {}
    try { ui._renderFilters(); } catch (_) {}
  },

  applyAdvancedFilters() {
    const ui = window.quotesUI;
    if (!ui) return;
    const fromEl = document.getElementById('quotes-filter-date-from');
    const toEl = document.getElementById('quotes-filter-date-to');
    const minEl = document.getElementById('quotes-filter-amount-min');
    const maxEl = document.getElementById('quotes-filter-amount-max');
    ui.filterDateFromDraft = (fromEl ? fromEl.value : ui.filterDateFromDraft) || '';
    ui.filterDateToDraft = (toEl ? toEl.value : ui.filterDateToDraft) || '';
    ui.filterAmountMinDraft = (minEl ? minEl.value : ui.filterAmountMinDraft) || '';
    ui.filterAmountMaxDraft = (maxEl ? maxEl.value : ui.filterAmountMaxDraft) || '';
  },

  clearAdvancedFilters() {
    const ui = window.quotesUI;
    if (!ui) return;
    // 相容舊按鈕：清除全部條件（立即套用）
    ui.clearAll();
  },

  loadMore() {
    window.quotesUI?.loadMore?.();
  },

  openCreateFromRepair() {
    window.quotesUI.openModal(window.quotesUI.renderCreateFromRepairModal());
  },

  closeModal() {
    window.quotesUI?.closeModal();
  },

  addItem(quoteId) {
    window.quotesUI?.addItem?.(quoteId);
  },

  removeItem(quoteId, index) {
    window.quotesUI?.removeItem?.(quoteId, index);
  },

  syncFromRepairParts(quoteId) {
    window.quotesUI?.syncFromRepairParts?.(quoteId);
  },

  recalcTotals(quoteId) {
    window.quotesUI?.recalcTotals?.(quoteId);
  },

  onItemInput(quoteId, index, field, event) {
    try {
      window.quotesUI?._updateDraftField?.(quoteId, index, field, event?.target?.value);
    } catch (_) {}
  },

  syncFromDOM(quoteId) {
    try { window.quotesUI?._syncDraftFromDOM?.(quoteId); } catch (_) {}
  },

  async renderHistory(quoteId) {
    const id = (quoteId || '').toString().trim();
    if (!id) return;

    const ui = window.quotesUI;
    const idSafe = ui?._escapeAttr ? ui._escapeAttr(id) : id;
    const el = document.getElementById(`quote_history_${idSafe}`);
    if (!el) return;

    el.innerHTML = `<div class="muted">載入中...</div>`;

    try {
      if (!window.QuoteService || typeof window.QuoteService.getHistory !== 'function') {
        el.innerHTML = `<div class="muted">History 模組尚未載入</div>`;
        return;
      }
      const list = await window.QuoteService.getHistory(id);
      const rows = Array.isArray(list) ? list : [];
      if (!rows.length) {
        el.innerHTML = `<div class="muted">尚無歷史紀錄</div>`;
        return;
      }

      // 以 version desc / 時間 desc
      rows.sort((a, b) => {
        const av = Number(a?.version || 0);
        const bv = Number(b?.version || 0);
        if (bv !== av) return bv - av;
        const at = (a?.at || '').toString();
        const bt = (b?.at || '').toString();
        return bt.localeCompare(at);
      });

      const esc = (s) => ui?._escapeHtml ? ui._escapeHtml(s) : String(s || '');
      const fmtAt = (iso) => ui?._isoToDateTime ? ui._isoToDateTime(iso) : (iso || '');

      const html = rows.map((h) => {
        const ver = `v${Number(h?.version || 0) || 0}`;
        const at = fmtAt(h?.at);
        const by = (h?.byName || h?.byEmail || '—').toString();
        const action = (h?.action || '').toString();
        const summary = (h?.summary || '').toString();
        const changed = Array.isArray(h?.changed) ? h.changed : [];
        const changedText = changed.length
          ? changed.map(c => `${(c?.field || '').toString()}: ${(c?.from ?? '')} → ${(c?.to ?? '')}`).join('；')
          : '';
        let snapshotText = '';
        try {
          snapshotText = h?.snapshot ? JSON.stringify(h.snapshot, null, 2) : '';
        } catch (_) { snapshotText = ''; }

        return `
          <div class="quote-history-item">
            <div class="quote-history-row">
              <div class="quote-history-meta">
                <span class="badge">${esc(ver)}</span>
                <span class="mono muted">${esc(at)}</span>
                <span class="muted">${esc(by)}</span>
              </div>
              <div class="quote-history-action">
                <span class="badge">${esc(action)}</span>
              </div>
            </div>
            ${summary ? `<div class="quote-history-summary">${esc(summary)}</div>` : ''}
            ${changedText ? `<div class="muted quote-history-changed">${esc(changedText)}</div>` : ''}
            ${snapshotText ? `
              <details class="quote-history-details">
                <summary>查看快照</summary>
                <pre class="quote-history-pre">${esc(snapshotText)}</pre>
              </details>
            ` : ''}
          </div>
        `;
      }).join('');

      el.innerHTML = `<div class="quote-history-list">${html}</div>`;
    } catch (e) {
      console.error(e);
      el.innerHTML = `<div class="muted">載入失敗：${(ui?._escapeHtml ? ui._escapeHtml(e?.message || e) : String(e))}</div>`;
    }
  },

  reloadHistory(quoteId) {
    const id = (quoteId || '').toString().trim();
    if (!id) return;
    try { window.QuoteService?._historyCache?.delete?.(id); } catch (_) {}
    QuotesUI.renderHistory(id);
  },


async exportQuotePdf(quoteId) {
  const id = (quoteId || '').toString().trim();
  if (!id) return;

  try {
    // 先同步畫面輸入到 draft（避免使用者未儲存就輸出）
    try { QuotesUI.syncFromDOM(id); } catch (_) {}

    // 先確保核心服務已就緒（避免資料仍停留在舊快取）
    try { if (window.QuoteService && typeof window.QuoteService.init === 'function') await window.QuoteService.init(); } catch (_) {}
    try { if (window.RepairService && typeof window.RepairService.init === 'function') await window.RepairService.init(); } catch (_) {}
    try {
      const cs = (typeof window._svc === 'function') ? window._svc('CustomerService') : null;
      if (cs && typeof cs.init === 'function') await cs.init();
    } catch (_) {}

    const q0 = window.QuoteService?.get?.(id);
    if (!q0) throw new Error('找不到報價資料');
    const q = window.QuoteModel?.normalize ? window.QuoteModel.normalize(q0) : q0;

    const repair = window.RepairService?.get?.(q.repairId) || null;

    // 檢查 PDFLib
    const PDFLib = window.PDFLib;
    if (!PDFLib || !PDFLib.PDFDocument) {
      throw new Error('PDF 模組尚未載入（請確認網路可連線）');
    }

    const { PDFDocument } = PDFLib;

    const _resolveUrl = (u) => {
      try { return new URL(String(u), window.location.href).toString(); }
      catch (_) { return String(u); }
    };

    const _xhrArrayBuffer = (absUrl, originalLabel) => new Promise((resolve, reject) => {
      try {
        const x = new XMLHttpRequest();
        x.open('GET', absUrl, true);
        x.responseType = 'arraybuffer';
        x.onload = () => {
          const ok = (x.status >= 200 && x.status < 300) || (x.status === 0 && x.response);
          if (ok && x.response) return resolve(x.response);
          reject(new Error('讀取失敗：' + (originalLabel || absUrl) + '（' + x.status + '）'));
        };
        x.onerror = () => reject(new Error('讀取失敗：' + (originalLabel || absUrl) + '（network）'));
        x.send();
      } catch (e) {
        reject(e);
      }
    });

    const loadBuf = async (url, cacheMode) => {
      const abs = _resolveUrl(url);
      try {
        const r = await fetch(abs, { cache: cacheMode || 'no-store' });
        if (!r.ok) throw new Error('讀取失敗：' + url + '（' + r.status + '）');
        return await r.arrayBuffer();
      } catch (e1) {
        try {
          return await _xhrArrayBuffer(abs, url);
        } catch (e2) {
          const proto = (window.location && window.location.protocol) ? window.location.protocol : '';
          const hint = proto === 'file:'
            ? '（你目前用檔案方式開啟：file://。瀏覽器會阻擋 fetch/XHR 讀取 PDF/字型。請改用 http 方式開啟，例如在專案根目錄執行：python -m http.server 8088，然後用瀏覽器開啟 http://localhost:8088/Index_V161.html）'
            : '';
          const detail = (e1 && e1.message) ? (' ' + e1.message) : '';
          throw new Error('讀取失敗：' + url + hint + detail);
        }
      }
    };

    // 字型策略（依你要求「細明體」）：
    // 1) 若你自行放入 assets/fonts/mingliu.ttf → 優先使用（最接近 Windows 細明體 MingLiU）
    // 2) 若你放入 mingliu.ttc（Windows 預設是 .ttc）→ 目前 pdf-lib 1.17.1 不支援直接嵌入 TTC，會自動改用替代字型並提示你轉檔
    // 3) 內建免費替代字型：assets/fonts/uming.ttf（UMing TW，明體風格）
    // 4) 最後 fallback 舊字型（避免完全失敗）
    const loadFontBuf = async () => {
      const candidates = [
        'assets/fonts/mingliu.ttf',
        'assets/fonts/mingliu.ttc',
        'assets/fonts/uming.ttf',
        'assets/fonts/bsmi00lp.ttf'
      ];

      let ttcDetected = false;
      for (const u of candidates) {
        try {
          // TTC 會導致「this.font.layout is not a function」：若偵測到存在就記錄，但不採用。
          if (u.toLowerCase().endsWith('.ttc')) {
            try {
              const abs = _resolveUrl(u);
              const r = await fetch(abs, { method: 'HEAD', cache: 'no-store' });
              if (r && r.ok) ttcDetected = true;
            } catch (_) {}
            continue;
          }

          const buf = await loadBuf(u, 'no-store');
          return { url: u, buf, ttcDetected };
        } catch (_) {}
      }
      throw new Error('讀取字型失敗：請放入 assets/fonts/mingliu.ttf（細明體）或使用內建 assets/fonts/uming.ttf');
    };

    const [tplBuf, fontRes] = await Promise.all([
      loadBuf('assets/quote/quote_template.pdf', 'no-store'),
      loadFontBuf()
    ]);

    const pdfDoc = await PDFDocument.load(tplBuf);
    try {
      // fontkit (UMD) 有些環境會掛在 default
      const fk = (window.fontkit && (window.fontkit.default || window.fontkit))
        || (window.Fontkit && (window.Fontkit.default || window.Fontkit))
        || null;
      if (fk && typeof pdfDoc.registerFontkit === 'function') pdfDoc.registerFontkit(fk);
    } catch (_) {}

    // 使用 subset：避免每次輸出把整套 CJK 字型（數十 MB）全部嵌入，造成 PDF 過大
    const font = await pdfDoc.embedFont(fontRes.buf, { subset: true });
    const fontInfoLabel = (() => {
      const u = (fontRes?.url || '').toLowerCase();
      if (u.includes('mingliu')) return '細明體（MingLiU）';
      if (u.includes('uming')) return '明體（UMing，免費替代）';
      return '內建字型';
    })();
    const page = pdfDoc.getPages()[0];
    const H = page.getHeight();

    const safeText = (v) => (v == null ? '' : String(v));
    const trim = (s) => safeText(s).trim();

    const pad2 = (n) => String(n).padStart(2, '0');
    const fmtDateYMD = (v) => {
      const s = trim(v);
      if (!s) return '';
      // 支援 ISO / YYYY-MM-DD / YYYY/MM/DD
      const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (m) return `${m[1]}/${pad2(m[2])}/${pad2(m[3])}`;
      // 支援 YYYYMMDD
      const m2 = s.match(/^(\d{4})(\d{2})(\d{2})$/);
      if (m2) return `${m2[1]}/${m2[2]}/${m2[3]}`;
      // 嘗試 Date 解析
      const d = new Date(s);
      if (!isNaN(d.getTime())) return `${d.getFullYear()}/${pad2(d.getMonth()+1)}/${pad2(d.getDate())}`;
      return s;
    };

    const parseYMD = (v) => {
      const s = trim(v);
      if (!s) return null;
      // 支援 YYYY-MM-DD / YYYY/M/D / YYYY/MM/DD
      let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (m) return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
      // 支援 YYYYMMDD
      m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
      if (m) return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
      // 嘗試 Date 解析（最後手段）
      const dt = new Date(s);
      if (!Number.isNaN(dt.getTime())) return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
      return null;
    };

    const addDaysUTC = (ymd, days) => {
      const ms = Date.UTC(ymd.y, ymd.m - 1, ymd.d) + (Number(days) || 0) * 86400000;
      const dt = new Date(ms);
      return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
    };

    const fmtYMDSlash = (ymd) => (ymd ? `${ymd.y}/${pad2(ymd.m)}/${pad2(ymd.d)}` : '');

    const fmtMoney = (num) => {
      const x = Number(num);
      const v = Number.isFinite(x) ? x : 0;
      return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const rightText = (text, rightX, yTop, size=9) => {
      const t = trim(text);
      if (!t) return;
      const w = font.widthOfTextAtSize(t, size);
      drawText(t, rightX - w, yTop, size);
    };

    const drawText = (text, x, yTop, size=9) => {
      const t = trim(text);
      if (!t) return;
      const y = H - yTop - size;
      page.drawText(t, { x, y, size, font });
    };

    // ====== Header / Meta ======
    const created = fmtDateYMD(q.createdAt || q.updatedAt || '');
    const quoteDate = created;

    // 報價失效日期：以「產生日（製表日期）」+30天
    const expiryDate = (() => {
      const base = parseYMD(q.createdAt || q.updatedAt || '');
      if (!base) return '';
      return fmtYMDSlash(addDaysUTC(base, 30));
    })();
    const quoteNo = trim(q.quoteNo || q.id || '');
    const currency = trim(q.currency || 'TWD');
    const ownerName = trim(q.ownerName || '');

    // 客戶名稱：優先以「維修單」為準（公司更名時，維修單較容易被同步更新；避免報價快取仍顯示舊名）
    const customerName = trim(repair?.customer || q.customer || '');
    const contactName = trim(repair?.contact || '');
    const contactPhone = trim(repair?.phone || '');
    const contactLine = [contactName, contactPhone].filter(Boolean).join('  ');

    // 依附件樣式（以提供的範例 PDF 位置為基準）
    drawText(created, 73.3, 155.6, 9);          // 製表日期
    drawText('1 / 1', 513.6, 156.6, 9);         // 頁次（目前僅支援單頁）
    drawText(quoteNo, 73.3, 169.0, 9);          // 報價單號（貼近「：」後）
    drawText(quoteDate, 73.3, 181.0, 9);        // 報價日期
    drawText(ownerName, 335.9, 182.0, 9);       // 業務經辦（僅姓名）
    drawText(customerName, 73.3, 204.0, 9);     // 客戶全名（上移避免偏下）
    drawText(contactLine, 92.0, 227, 9);      // 連絡人&電話
    // 幣別
    drawText(currency === 'TWD' ? 'NTD' : currency, 335.9, 252.6, 9);

    
    // ====== 備註（PDF） ======
    // 需求：備註一 3 行 + 備註二 3 行（共 6 行），超過則第 6 行以「…」截斷
    // 備註來源優先序：畫面 textarea（未儲存也可輸出）→（若有）draft → q.note / q.notes
    const wrapText = (text, maxWidth, size = 9, maxLines = 6) => {
      const raw = String(text || '').replace(/\r/g, '');
      if (!raw.trim()) return Array.from({ length: maxLines }, () => '');
      const parts = raw.split(/\n/);
      const lines = [];
      let overflow = false;

      const measure = (s) => {
        try { return font.widthOfTextAtSize(String(s || ''), size); }
        catch (_) { return String(s || '').length * size; }
      };

      const push = (s) => {
        if (lines.length < maxLines) lines.push(String(s || ''));
        else overflow = true;
      };

      outer:
      for (let pi = 0; pi < parts.length; pi++) {
        const part = String(parts[pi] || '');
        // 空行：保留換行效果
        if (part === '') {
          push('');
          if (lines.length >= maxLines) {
            overflow = overflow || (pi < parts.length - 1);
            break;
          }
          continue;
        }

        let cur = '';
        for (let ci = 0; ci < part.length; ci++) {
          const ch = part.charAt(ci);
          if (!cur) { cur = ch; continue; }
          if (measure(cur + ch) <= maxWidth) { cur += ch; continue; }

          push(cur);
          cur = ch;

          if (lines.length >= maxLines) { overflow = true; break outer; }
        }

        push(cur);

        if (lines.length >= maxLines) {
          overflow = overflow || (pi < parts.length - 1);
          break;
        }
      }

      while (lines.length < maxLines) lines.push('');

      if (overflow) {
        const ell = '…';
        let last = String(lines[maxLines - 1] || '').replace(/\s+$/g, '');
        if (!last) { lines[maxLines - 1] = ell; return lines; }
        while (last && measure(last + ell) > maxWidth) {
          last = last.slice(0, -1);
        }
        lines[maxLines - 1] = last + ell;
      }

      return lines;
    };

    const noteFromDom = (() => {
      try {
        const el = document.querySelector('textarea[name="note"], textarea[data-field="note"], #quote_note, #quoteNote');
        return el ? el.value : '';
      } catch (_) { return ''; }
    })();

    const noteFallback = (() => {
      const v = (q && (q.note || q.notes)) || '';
      if (Array.isArray(v)) return v.join('\n');
      return String(v || '');
    })();

    const noteText = trim(noteFromDom || noteFallback || '');
    // 備註欄位在母版上是寬欄位，使用較接近實際欄寬的 maxWidth
    const noteLines = wrapText(noteText, 470, 9, 6);

    // 位置（以現行母版文字座標為準）：備註一（上）/ 備註二（下）
    const NOTE_X = 73.3;
    const NOTE1_Y = 275.9;
    const NOTE2_Y = 311.0;
    const NOTE_STEP = 11.0;

    for (let i = 0; i < 3; i++) {
      drawText(noteLines[i] || '', NOTE_X, NOTE1_Y + (i * NOTE_STEP), 9);
    }
    for (let i = 0; i < 3; i++) {
      drawText(noteLines[i + 3] || '', NOTE_X, NOTE2_Y + (i * NOTE_STEP), 9);
    }

// ====== Items Table ======
    const draftItems = (window.quotesUI && window.quotesUI._ensureDraftItems)
      ? window.quotesUI._ensureDraftItems(id, q.items || [])
      : (q.items || []);
    const items = Array.isArray(draftItems) ? draftItems : [];

    const startY1 = 396.5;   // 第一行（序號/品號/數量/單價/金額/專案）
    const startY2 = 409.9;   // 第二行（品名/單位/失效日）
    const rowStep = 46;      // 每筆資料（兩行）高度
    const maxPerPage = 7;    // 單頁最大筆數（避免碰到底部合計）

    let qtySum = 0;
    let subtotal = 0;

    const take = items.slice(0, maxPerPage);
    take.forEach((it, idx) => {
      const seq = String(idx + 1).padStart(4, '0');
      const mpn = trim(it.mpn || '');
      const name = trim(it.name || '');
      const vendor = trim(it.vendor || '');
      const qty = Number(it.qty);
      const qv = Number.isFinite(qty) ? qty : 0;
      const unit = trim(it.unit || 'PCS').toUpperCase();
      const unitPrice = Number(it.unitPrice);
      const pv = Number.isFinite(unitPrice) ? unitPrice : 0;
      const lineTotal = qv * pv;

      qtySum += qv;
      subtotal += lineTotal;

      const y1 = startY1 + (idx * rowStep);
      const y2 = startY2 + (idx * rowStep);

      drawText(seq, 32.0, y1, 9);          // 序號
      drawText(mpn, 55.3, y1, 9);          // 品號
      rightText(String(qv || ''), 309.7, y1, 9);     // 數量（右對齊）
      rightText(fmtMoney(pv), 373.4, y1, 9);         // 單價（右對齊）
      rightText(fmtMoney(lineTotal), 458.1, y1, 9);  // 金額（右對齊）

      // 專案代號：優先用 repair.productLine（若無則留白）
      const project = trim(repair?.productLine || '');
      drawText(project, 463.3, y1, 9);

      // 品名（必要時附 vendor）
      const nameLine = [name, vendor ? `(${vendor})` : ''].filter(Boolean).join(' ');
      const shortName = nameLine.length > 60 ? (nameLine.slice(0, 57) + '...') : nameLine;
      drawText(shortName, 55.3, y2, 9);

      drawText(unit, 296.3, y2, 9);       // 單位

      // 報價失效日期（同一份報價單共用）：產生日 + 30 天
      drawText(expiryDate, 463.3, y2, 9);
    });

    // ====== Totals ======
    const taxRate = 0.05; // 依附件「應稅外加 5%」的常見設定；若你要改為可配置，我可以下一版把它搬到設定/報價欄位
    const tax = subtotal * taxRate;
    const total = subtotal + tax;

    rightText(String(qtySum || ''), 94.4, 697.4, 9);          // 數量合計
    rightText(fmtMoney(subtotal), 234.1, 697.4, 9);           // 報價金額
    rightText(fmtMoney(tax), 339.9, 697.4, 9);                // 稅額
    rightText(fmtMoney(total), 469.5, 697.4, 9);              // 金額合計

    const outBytes = await pdfDoc.save();

    const fileNameSafe = (quoteNo || id).replace(/[\\/:*?"<>|\s]+/g, '_');
    const blob = new Blob([outBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `報價單_${fileNameSafe}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    if (window.UI && typeof window.UI.toast === 'function') {
      const u = (fontRes && fontRes.url) ? String(fontRes.url) : '';
      const ttcHint = fontRes?.ttcDetected
        ? '（偵測到 mingliu.ttc，但目前不支援直接嵌入；已改用替代字型。請將 mingliu.ttc 轉成 mingliu.ttf 後放入 assets/fonts/）'
        : '';
      const note = u.includes('mingliu') ? '（細明體）'
        : (u.includes('uming') ? '（UMing，免費替代）'
        : (u ? `（${u.split('/').pop()}）` : ''));
      window.UI.toast('已輸出 PDF ' + note + (ttcHint ? ' ' + ttcHint : ''), { type: 'success', duration: 7000 });
    }
  } catch (e) {
    console.error(e);
    // 對 TTC 常見錯誤給更明確指引
    const raw = (e?.message || e);
    const msg = String(raw).includes('this.font.layout is not a function')
      ? '輸出 PDF 失敗：偵測到 .ttc 字型（例如 mingliu.ttc）。目前版本不支援直接嵌入 TTC，請先轉成 mingliu.ttf 後放入 assets/fonts/（或先用內建 UMing）。'
      : ('輸出 PDF 失敗：' + raw);
    if (window.UI && typeof window.UI.toast === 'function') window.UI.toast(msg, { type: 'error' });
    else alert(msg);
  }
},


  async handleCreateFromRepair(event) {
    event.preventDefault();
    const form = event.target;
    const data = Object.fromEntries(new FormData(event.target).entries());
    const rid = (data.repairId || '').trim();
    if (!rid) {
      const msg = '請選擇維修單';
      if (window.UI && typeof window.UI.toast === 'function') window.UI.toast(msg, { type: 'warning' });
      else alert(msg);
      return;
    }

    try {
      const quote = await window.QuoteService.createFromRepair(rid);
      window.quotesUI.closeModal();
      await window.quotesUI.update();
      QuotesUI.openDetail(quote.id);
    } catch (e) {
      console.error(e);
      const msg = '建立失敗：' + (e?.message || e);
      if (window.UI && typeof window.UI.toast === 'function') window.UI.toast(msg, { type: 'error' });
      else alert(msg);
    }
  },

  openDetail(quoteId) {
    const q = window.QuoteService.get(quoteId);
    if (!q) return;
    try { window.quotesUI._setActiveQuote(q.id, q.items); } catch (_) {}
    window.quotesUI.openModal(window.quotesUI.renderDetailModal(q));
    try { setTimeout(() => QuotesUI.recalcTotals(q.id), 0); } catch (_) {}
    try { setTimeout(() => QuotesUI.renderHistory(q.id), 0); } catch (_) {}
  },

  async handleSaveQuote(event) {
    event.preventDefault();
    const form = event.target;
    const data = Object.fromEntries(new FormData(event.target).entries());
    const id = (data.id || '').trim();
    const q = window.QuoteService.get(id);
    if (!q) return;

    const countNum = Number(data.itemsCount ?? (q.items || []).length);
    const count = Number.isFinite(countNum) ? Math.max(0, Math.floor(countNum)) : (q.items || []).length;

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
      const msg = '請至少輸入一筆報價項目';
      if (window.UI && typeof window.UI.toast === 'function') window.UI.toast(msg, { type: 'warning' });
      else alert(msg);
      return;
    }

    try {
      await window.QuoteService.upsert({
        ...q,
        status: (data.status || q.status || '').toString(),
        currency: (data.currency || q.currency || '').toString(),
        items,
        note: (data.note || '').toString()
      });
      await window.quotesUI.update();
      try { window.quotesUI._clearDraft(id); } catch (_) {}
      QuotesUI.closeModal();
    } catch (e) {
      console.error(e);
      const msg = '儲存失敗：' + (e?.message || e);
      if (window.UI && typeof window.UI.toast === 'function') window.UI.toast(msg, { type: 'error' });
      else alert(msg);
    }
  },

  async confirmRemove(quoteId) {
    {
      const msg = '確定刪除此報價？';
      const ok = (window.UI && typeof window.UI.confirm === 'function')
        ? await window.UI.confirm({ title: '確認刪除報價', message: msg, okText: '刪除', cancelText: '取消', tone: 'danger' })
        : confirm(msg);
      if (!ok) return;
    }
    try {
      await window.QuoteService.remove(quoteId);
      await window.quotesUI.update();
    } catch (e) {
      console.error(e);
      const msg = '刪除失敗：' + (e?.message || e);
      if (window.UI && typeof window.UI.toast === 'function') window.UI.toast(msg, { type: 'error' });
      else alert(msg);
    }
  },

  async createOrderFromQuote(quoteId) {
    try {
      const q = window.QuoteService?.get?.(quoteId) || null;
      const canConvert = !!(window.quotesUI?._isApprovedStatus?.(q?.status));
      if (!canConvert) {
        const msg = '需先將報價狀態設定為「已核准（簽核）」才可轉訂單';
        if (window.UI && typeof window.UI.toast === 'function') window.UI.toast(msg, { type: 'warning' });
        else alert(msg);
        return;
      }
      if (!window.OrderService) {
        const msg = '訂單模組尚未載入';
        if (window.UI && typeof window.UI.toast === 'function') window.UI.toast(msg, { type: 'error' });
        else alert(msg);
        return;
      }
      await window.OrderService.init();
      // 避免重複轉單：若已存在同 quoteId 的訂單，優先直接開啟
      const existing = (typeof window.OrderService.getAll === 'function')
        ? (window.OrderService.getAll() || []).find(o => (o?.quoteId || '') === quoteId && !o?.isDeleted)
        : null;

      const created = !existing;
      const order = existing || await window.OrderService.createFromQuote(quoteId, { requireApproved: true });

      // 版本控制：將「轉訂單」行為記錄在報價歷史中（即使報價本體未變更）
      try {
        await window.QuoteService?.addHistoryAction?.(quoteId, {
          action: 'CONVERT_TO_ORDER',
          version: Number(q?.version || 1),
          summary: created
            ? `CONVERT_TO_ORDER → ${(order?.orderNo || order?.id || '').toString()}`
            : `OPEN_EXISTING_ORDER → ${(order?.orderNo || order?.id || '').toString()}`,
          changed: [],
          snapshot: q,
          meta: { orderId: order?.id || '', orderNo: order?.orderNo || '' }
        });
      } catch (_) {}

      // 切換到訂單頁（延遲載入：先確保 orders UI 已載入，避免空白）
      try { await window.ModuleLoader?.ensure?.('orders'); } catch (_) {}
      if (window.AppRouter?.navigate) {
        await window.AppRouter.navigate('orders');
      }
      try { window.ordersUI?.openDetail?.(order.id); } catch (_) {}
      try { window.OrdersUI?.openDetail?.(order.id); } catch (_) {}
    } catch (e) {
      console.error(e);
      const msg = '轉訂單失敗：' + (e?.message || e);
      if (window.UI && typeof window.UI.toast === 'function') window.UI.toast(msg, { type: 'error' });
      else alert(msg);
    }
  }
});

console.log('✅ QuotesUI loaded');
