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
  function mount(node) { const app = document.getElementById('app'); clear(app); app.appendChild(node); }

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

  window.UI = { el, clear, mount, modal, lineChart };
})();
