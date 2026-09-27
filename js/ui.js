/* =========================================================
   Money Mama — shared UI helpers (tiny DOM builder + modal)
========================================================= */
(function () {
  // element builder: el('div', {class:'x', onclick:fn}, [children or text])
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.startsWith('on') && typeof attrs[k] === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        } else if (k === 'style' && typeof attrs[k] === 'object') {
          Object.assign(node.style, attrs[k]);
        } else if (attrs[k] != null) {
          node.setAttribute(k, attrs[k]);
        }
      }
    }
    if (children != null) {
      const list = Array.isArray(children) ? children : [children];
      for (const c of list) {
        if (c == null) continue;
        node.appendChild(typeof c === 'string' || typeof c === 'number'
          ? document.createTextNode(String(c)) : c);
      }
    }
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

  function reduceMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }

  // Mount a new screen with a gentle cross-fade + slight slide so navigation
  // doesn't feel like a jarring hard swap. Respects reduce-motion settings.
  function mount(node) {
    const app = document.getElementById('app');
    // Any open modal belongs to the old screen — drop it immediately.
    app.querySelectorAll(':scope > .overlay').forEach(o => o.remove());
    if (reduceMotion()) { clear(app); app.appendChild(node); return; }
    // EVERY existing screen fades out (not just the first child — fast taps
    // used to leave a stale screen stuck in the page).
    const olds = Array.from(app.children);
    olds.forEach(old => old.classList.add('screen-exit'));
    node.classList.add('screen-enter');
    app.appendChild(node);
    requestAnimationFrame(() => requestAnimationFrame(() => node.classList.add('screen-enter-active')));
    setTimeout(() => {
      olds.forEach(old => { if (old.parentNode === app) app.removeChild(old); });
      node.classList.remove('screen-enter', 'screen-enter-active');
    }, 320);
  }

  // Games call this whenever money moves mid-game; app.js wires it up to
  // save progress and refresh the balance in the top bar.
  const hooks = { moneyChanged: null };
  function moneyChanged() { if (hooks.moneyChanged) hooks.moneyChanged(); }

  // Animate a number counting up/down inside a node (money feels alive).
  function countTo(node, from, to, opts) {
    opts = opts || {};
    const fmt = opts.fmt || ((n) => Math.round(n));
    const dur = reduceMotion() ? 0 : (opts.dur || 600);
    if (dur === 0) { node.textContent = fmt(to); return; }
    node.textContent = fmt(from);   // start from the old value (no flash of the final number)
    const start = performance.now();
    function frame(now) {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      node.textContent = fmt(from + (to - from) * eased);
      if (p < 1) requestAnimationFrame(frame);
      else node.textContent = fmt(to);
    }
    requestAnimationFrame(frame);
  }

  // Modal overlay. buttons = [{label, class, onClick}]
  function modal({ emoji, title, bodyNodes, buttons }) {
    const overlay = el('div', { class: 'overlay' });
    const close = () => overlay.remove();
    const box = el('div', { class: 'modal' }, [
      emoji ? el('div', { class: 'big-emoji' }, emoji) : null,
      title ? el('h2', null, title) : null,
      ...(bodyNodes || []),
      ...(buttons || []).map(b =>
        el('div', { style: { marginTop: '8px' } },
          el('button', {
            class: 'btn ' + (b.class || ''),
            onclick: () => { if (b.onClick) b.onClick(close); else close(); }
          }, b.label))
      ),
    ]);
    overlay.appendChild(box);
    document.getElementById('app').appendChild(overlay);
    return { close };
  }

  // simple SVG line chart from an array of numbers
  function lineChart(values, color, baseline) {
    const w = 100, h = 100;
    const max = Math.max(...values, baseline != null ? baseline : -Infinity);
    const min = Math.min(...values, 0, baseline != null ? baseline : Infinity);
    const range = Math.max(1, max - min);
    const pts = values.map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const svg = `
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="chart">
        ${baseline != null ? `<line x1="0" y1="${(h - ((baseline - min) / range) * h).toFixed(1)}" x2="${w}" y2="${(h - ((baseline - min) / range) * h).toFixed(1)}" stroke="#cbb993" stroke-width="0.6" stroke-dasharray="2"/>` : ''}
        <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/>
      </svg>`;
    const wrap = el('div', { html: svg });
    return wrap.firstElementChild;
  }

  window.UI = { el, clear, mount, modal, lineChart, countTo, reduceMotion, hooks, moneyChanged };
})();
