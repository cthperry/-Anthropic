/**
 * EventDelegate — 事件委派工具（Phase 1）
 * 用 data-action + data-* 屬性取代 inline onclick
 */
(function () {
  'use strict';

  var _bindings = new Map();

  function bind(container, actions, options) {
    var el = (typeof container === 'string') ? document.querySelector(container) : container;
    if (!el) return;
    var key = (typeof container === 'string') ? container : (el.id || '___ed');
    unbind(container);

    var opts = options || {};
    var bubbleSet = new Set(opts.bubbleActions || []);

    var handler = function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var actionEl = t.closest('[data-action]');
      if (!actionEl || !el.contains(actionEl)) return;
      var action = actionEl.getAttribute('data-action') || '';
      if (!action) return;
      var fn = actions[action];
      if (!fn) return;

      if (actionEl.tagName === 'A' || actionEl.tagName === 'BUTTON') e.preventDefault();
      if (!bubbleSet.has(action)) { try { e.stopPropagation(); } catch (_) {} }

      try { fn(actionEl, e); }
      catch (err) {
        console.error('EventDelegate: "' + action + '" failed:', err);
        try { window.ErrorHandler && window.ErrorHandler.handle && window.ErrorHandler.handle(err); } catch (_) {}
      }
    };

    el.addEventListener('click', handler, false);
    _bindings.set(key, { el: el, handler: handler });
  }

  function unbind(container) {
    var key = (typeof container === 'string') ? container : (container && (container.id || '___ed'));
    if (!key) return;
    var b = _bindings.get(key);
    if (!b) return;
    try { b.el.removeEventListener('click', b.handler, false); } catch (_) {}
    _bindings.delete(key);
  }

  function unbindAll() {
    _bindings.forEach(function (b) {
      try { b.el.removeEventListener('click', b.handler, false); } catch (_) {}
    });
    _bindings.clear();
  }

  if (typeof window !== 'undefined') {
    window.EventDelegate = { bind: bind, unbind: unbind, unbindAll: unbindAll };
  }

  try { console.log('✅ EventDelegate loaded'); } catch (_) {}
})();
