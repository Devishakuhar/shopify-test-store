
(function () {
  'use strict';
  if (window.__pscLoaded) return;
  window.__pscLoaded = true;

  var CARD = '[data-psc-card]';
  var cache = new WeakMap();
  var routesRoot = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
  var LABELS = { available: 'Add to cart', soldout: 'Sold out', missing: 'Unavailable' };

  function variantsOf(card) {
    if (!cache.has(card)) {
      var data = [];
      var node = card.querySelector('script[data-psc-variants]');
      try { data = JSON.parse(node.textContent); } catch (e) { /* empty list handled below */ }
      cache.set(card, data);
    }
    return cache.get(card);
  }

  var hoverCache = new WeakMap();
  /** Hover (2nd) image data per variant id: { "123": { src, srcset } | null } */
  function hoverMapOf(card) {
    if (!hoverCache.has(card)) {
      var data = {};
      var node = card.querySelector('script[data-psc-hover-map]');
      try { data = JSON.parse(node.textContent); } catch (e) { /* no hover images */ }
      hoverCache.set(card, data);
    }
    return hoverCache.get(card);
  }

  function idx(card, key) { return parseInt(card.dataset[key], 10); }

  /** Exact variant for colour + size (prefers an in-stock one if a 3rd option exists). null = combination doesn't exist. */
  function match(card, color, size) {
    var ci = idx(card, 'colorIndex');
    var si = idx(card, 'sizeIndex');
    var list = variantsOf(card).filter(function (v) {
      return (ci < 0 || v.options[ci] === color) && (si < 0 || v.options[si] === size);
    });
    return list.find(function (v) { return v.available; }) || list[0] || null;
  }

  /** Any variant of this colour – used for image/link when the size combination is missing. */
  function byColor(card, color) {
    var ci = idx(card, 'colorIndex');
    var all = variantsOf(card);
    var list = ci < 0 ? all : all.filter(function (v) { return v.options[ci] === color; });
    return list.find(function (v) { return v.available; }) || list[0] || all[0] || null;
  }

  function stateOf(v) { return !v ? 'missing' : (v.available ? 'available' : 'soldout'); }

  function syncOptions(card) {
    var color = card.dataset.color;
    var size = card.dataset.size;
    card.querySelectorAll('[data-psc-option]').forEach(function (btn) {
      var kind = btn.dataset.pscOption;
      var selected = btn.dataset.value === card.dataset[kind];
      var s = kind === 'color' ? stateOf(match(card, btn.dataset.value, size))
                               : stateOf(match(card, color, btn.dataset.value));
      btn.dataset.state = s;
      btn.setAttribute('aria-checked', selected ? 'true' : 'false');
      btn.tabIndex = selected ? 0 : -1;
      var suffix = s === 'soldout' ? ', sold out' : s === 'missing' ? ', unavailable' : '';
      btn.setAttribute('aria-label', btn.dataset.label + suffix);
    });
  }

  function paintButton(card) {
    var btn = card.querySelector('[data-psc-add]');
    var label = card.querySelector('[data-psc-label]');
    var ui = card.dataset.ui || 'idle';
    var state = card.dataset.state;
    btn.disabled = ui === 'loading' || state !== 'available';
    btn.setAttribute('aria-busy', ui === 'loading' ? 'true' : 'false');
    btn.classList.toggle('is-loading', ui === 'loading');
    btn.classList.toggle('is-success', ui === 'success');
    label.textContent = ui === 'loading' ? 'Adding…' : ui === 'success' ? 'Added to cart ✓' : LABELS[state];
  }

  function render(card) {
    var color = card.dataset.color;
    var size = card.dataset.size;
    var v = match(card, color, size);
    var ref = v || byColor(card, color);
    var state = stateOf(v);
    card.dataset.state = state;
    card.dataset.variantId = v ? v.id : '';

    // Image
    var img = card.querySelector('[data-psc-img]');
    if (img && ref && ref.image && img.getAttribute('src') !== ref.image.src) {
      img.src = ref.image.src;
      img.srcset = ref.image.srcset;
      img.alt = ref.image.alt;
    }

    // Hover (2nd) image follows the selected colour
    var hoverImg = card.querySelector('[data-psc-hover-img]');
    if (hoverImg) {
      var h = ref ? hoverMapOf(card)[ref.id] : null;
      if (h && h.src) {
        if (hoverImg.getAttribute('src') !== h.src) {
          hoverImg.srcset = h.srcset;
          hoverImg.src = h.src;
        }
        hoverImg.hidden = false;
      } else {
        hoverImg.hidden = true;
        hoverImg.removeAttribute('src');
        hoverImg.removeAttribute('srcset');
      }
    }

    // Links open the selected variant
    if (ref) {
      card.querySelectorAll('[data-psc-link]').forEach(function (a) { a.href = (v || ref).url; });
    }

    // Price + discount
    var price = card.querySelector('[data-psc-price]');
    var na = card.querySelector('[data-psc-na]');
    var disc = card.querySelector('[data-psc-discount-row]');
    var mrpWrap = card.querySelector('[data-psc-mrp-wrap]');
    if (v) {
      var hasCompare = v.compare > v.price;
      var pct = hasCompare ? Math.round(((v.compare - v.price) / v.compare) * 100) : 0;
      card.querySelector('[data-psc-sale]').textContent = v.priceFormatted;
      card.querySelector('[data-psc-mrp]').textContent = hasCompare ? v.compareFormatted : '';
      card.querySelector('[data-psc-discount]').textContent = pct + '% OFF';
      mrpWrap.classList.toggle('is-empty', !hasCompare);
      disc.classList.toggle('is-empty', !hasCompare);
      price.hidden = false;
      na.hidden = true;
    } else {
      price.hidden = true;
      na.hidden = false;
      disc.classList.add('is-empty');
    }

    syncOptions(card);
    paintButton(card);

    // Screen-reader announcement
    var live = card.querySelector('[data-psc-live]');
    if (live) {
      var parts = [color, size].filter(Boolean).join(', ');
      live.textContent = (parts ? parts + ': ' : '') + (v ? (v.available ? v.priceFormatted : 'sold out') : 'this combination is unavailable');
    }
  }

  function clearFeedback(card) {
    clearTimeout(card._pscTimer);
    card.dataset.ui = 'idle';
    var err = card.querySelector('[data-psc-error]');
    err.hidden = true;
    err.textContent = '';
  }

  function select(opt) {
    var card = opt.closest(CARD);
    if (!card || card.dataset.busy === 'true') return; // no changes mid-request
    card.dataset[opt.dataset.pscOption] = opt.dataset.value; // size is preserved when colour changes
    clearFeedback(card);
    render(card);
  }

  function updateCartCount() {
    fetch(routesRoot + 'cart.js', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        document.querySelectorAll('[data-cart-count], .cart-count-bubble span[aria-hidden="true"]').forEach(function (el) {
          el.textContent = cart.item_count;
        });
        document.dispatchEvent(new CustomEvent('psc:cart-updated', { detail: { cart: cart } }));
      })
      .catch(function () { /* cosmetic only */ });
  }

  function addToCart(card) {
    if (card.dataset.busy === 'true') return; // duplicate-submit guard
    var v = match(card, card.dataset.color, card.dataset.size);
    if (!v || !v.available) return;

    card.dataset.busy = 'true';
    clearFeedback(card);
    card.dataset.ui = 'loading';
    paintButton(card);

    fetch(routesRoot + 'cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: [{ id: v.id, quantity: 1 }] })
    })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) throw new Error(body.description || body.message || 'Could not add this item to your cart.');
          return body;
        });
      })
      .then(function (body) {
        card.dataset.ui = 'success';
        card._pscTimer = setTimeout(function () { card.dataset.ui = 'idle'; paintButton(card); }, 2200);
        document.dispatchEvent(new CustomEvent('psc:cart-add', { detail: { variantId: v.id, response: body } }));
        updateCartCount();
      })
      .catch(function (err) {
        card.dataset.ui = 'idle';
        var box = card.querySelector('[data-psc-error]');
        box.textContent = err && err.message ? err.message : 'Something went wrong. Please try again.';
        box.hidden = false;
      })
      .then(function () {
        card.dataset.busy = 'false';
        paintButton(card);
      });
  }

  document.addEventListener('click', function (e) {
    var next = e.target.closest('[data-psc-sizes-next]');
    if (next) {
      e.preventDefault();
      var row = next.parentNode.querySelector('.psc-sizes');
      row.scrollBy({ left: row.clientWidth * 0.7, behavior: 'smooth' });
      return;
    }
    var opt = e.target.closest('[data-psc-option]');
    if (opt) { e.preventDefault(); e.stopPropagation(); select(opt); return; }
    var add = e.target.closest('[data-psc-add]');
    if (add) { e.preventDefault(); addToCart(add.closest(CARD)); }
  });

  // Radio-group keyboard behaviour: arrows move + select, Home/End jump. Enter/Space work natively on buttons.
  document.addEventListener('keydown', function (e) {
    var opt = e.target.closest && e.target.closest('[data-psc-option]');
    if (!opt) return;
    var dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    var items = Array.prototype.slice.call(opt.closest('[data-psc-group]').querySelectorAll('[data-psc-option]'));
    var i = items.indexOf(opt);
    var next;
    if (dir) next = items[(i + dir + items.length) % items.length];
    else if (e.key === 'Home') next = items[0];
    else if (e.key === 'End') next = items[items.length - 1];
    if (!next) return;
    e.preventDefault();
    next.focus();
    select(next);
  });

  function checkOverflow(wrap) {
    var row = wrap.querySelector('.psc-sizes');
    var btn = wrap.querySelector('[data-psc-sizes-next]');
    btn.hidden = row.scrollWidth - row.scrollLeft <= row.clientWidth + 1;
  }

  function checkAllOverflow(scope) {
    (scope || document).querySelectorAll('[data-psc-sizes-wrap]').forEach(checkOverflow);
  }

  function initAll(scope) {
    (scope || document).querySelectorAll(CARD).forEach(syncOptions);
    checkAllOverflow(scope);
  }

  window.addEventListener('resize', function () { checkAllOverflow(); });
  document.addEventListener('scroll', function (e) {
    if (e.target.classList && e.target.classList.contains('psc-sizes')) checkOverflow(e.target.parentNode);
  }, true);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { checkAllOverflow(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { initAll(); });
  else initAll();

  // Theme editor: section re-rendered / added
  document.addEventListener('shopify:section:load', function (e) { initAll(e.target); });
})();