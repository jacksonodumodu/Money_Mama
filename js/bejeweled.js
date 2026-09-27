/* =========================================================
   Money Mama — "Mom's Match" match-3 (animated)
   Swap adjacent tiles, match 3+, cascades. Score -> winnings.
   Suburban-mom themed tokens (wine, coffee, soccer, etc.).

   Animation approach (dependency-free):
   Each cell holds a persistent tile object { id, gem } rendered as an
   absolutely-positioned element. Moving a tile just updates its
   transform (translate) and CSS transitions it. Matches scale to 0
   (pop), survivors fall into gaps, and fresh tiles drop from above —
   with a small stagger for a natural cascade. Respects reduce-motion.
========================================================= */
(function () {
  const { el } = UI;
  const GEMS = ['🍷', '☕', '⚽', '🛒', '💐', '🧁']; // wine, coffee, soccer, groceries, flowers, cupcake
  const PALETTE = ['#7a3b2e','#6b4f34','#3e6b45','#8a6d4b','#a85a8a','#c99b39'];
  const SIZE = 7;
  const MOVES = 12;

  function randGemVal() { return Math.floor(Math.random() * GEMS.length); }

  // ---- pure board logic (unchanged, tested) ----
  function findMatchesVals(vals) {
    const matched = new Set();
    for (let r = 0; r < SIZE; r++) {
      let run = 1;
      for (let c = 1; c <= SIZE; c++) {
        if (c < SIZE && vals[r][c] === vals[r][c-1] && vals[r][c] != null) run++;
        else { if (run >= 3) for (let k = c - run; k < c; k++) matched.add(r + ',' + k); run = 1; }
      }
    }
    for (let c = 0; c < SIZE; c++) {
      let run = 1;
      for (let r = 1; r <= SIZE; r++) {
        if (r < SIZE && vals[r][c] === vals[r-1][c] && vals[r][c] != null) run++;
        else { if (run >= 3) for (let k = r - run; k < r; k++) matched.add(k + ',' + c); run = 1; }
      }
    }
    return matched;
  }
  function areAdjacent(a, b) {
    return (a.r === b.r && Math.abs(a.c - b.c) === 1) || (a.c === b.c && Math.abs(a.r - b.r) === 1);
  }

  function render(run, onExit, onEarn) {
    // board holds tile objects: { id, gem } (or null while resolving)
    let nextId = 1;
    const newTile = (gem) => ({ id: nextId++, gem: gem == null ? randGemVal() : gem });

    // build with no starting matches
    let board;
    do {
      board = [];
      for (let r = 0; r < SIZE; r++) { const row = []; for (let c = 0; c < SIZE; c++) row.push(newTile()); board.push(row); }
    } while (findMatchesVals(board.map(row => row.map(t => t.gem))).size > 0);

    let sel = null;
    let score = 0;
    let movesLeft = MOVES;
    let busy = false;

    const wrap = el('div', null);
    let gridEl = null;
    const tileNodes = new Map(); // id -> DOM node
    const reduce = UI.reduceMotion();
    const STEP = reduce ? 0 : 1;   // animation multiplier

    // cell geometry is percentage-based so it scales with the grid
    const cellPct = 100 / SIZE;

    function valsOf() { return board.map(row => row.map(t => (t ? t.gem : null))); }

    function scoreNode() { return wrap.querySelector('.score'); }
    function updateScore() { const s = scoreNode(); if (s) s.textContent = `Score ${score} · Moves ${movesLeft}`; }

    // position a tile node at its (r,c) via transform
    function place(node, r, c, opts) {
      opts = opts || {};
      node.style.transform = `translate(${c * 100}%, ${r * 100}%) scale(${opts.scale != null ? opts.scale : 1})`;
      node.style.opacity = opts.opacity != null ? opts.opacity : 1;
    }

    function makeTileNode(tile, r, c) {
      const node = el('div', {
        class: 'gem-tile',
        style: { width: cellPct + '%', height: cellPct + '%', background: PALETTE[tile.gem % PALETTE.length] },
      }, GEMS[tile.gem]);
      node.addEventListener('click', () => onCellTap(r, c));
      node.dataset.id = tile.id;
      place(node, r, c);
      tileNodes.set(tile.id, node);
      return node;
    }

    // full initial paint of the grid (creates persistent nodes)
    function paintGrid() {
      gridEl = el('div', { class: 'gem-grid-anim' });
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const t = board[r][c];
          gridEl.appendChild(makeTileNode(t, r, c));
        }
      }
      return gridEl;
    }

    // re-bind click handlers + reposition every existing tile to its board slot
    function syncPositions(animate) {
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const t = board[r][c];
          if (!t) continue;
          const node = tileNodes.get(t.id);
          if (!node) continue;
          node.style.transition = animate && !reduce ? 'transform 0.22s ease' : 'none';
          // refresh handler to current coords
          node.onclick = () => onCellTap(r, c);
          place(node, r, c);
        }
      }
    }

    function setSelected() {
      tileNodes.forEach((node) => node.classList.remove('sel'));
      if (sel) {
        const t = board[sel.r][sel.c];
        if (t) { const n = tileNodes.get(t.id); if (n) n.classList.add('sel'); }
      }
    }

    function onCellTap(r, c) {
      if (busy || movesLeft <= 0) return;
      if (!sel) { sel = { r, c }; setSelected(); return; }
      if (sel.r === r && sel.c === c) { sel = null; setSelected(); return; }
      if (areAdjacent(sel, { r, c })) { const a = sel; sel = null; setSelected(); doSwap(a, { r, c }); }
      else { sel = { r, c }; setSelected(); }
    }

    function swapInBoard(a, b) {
      const tmp = board[a.r][a.c]; board[a.r][a.c] = board[b.r][b.c]; board[b.r][b.c] = tmp;
    }

    async function doSwap(a, b) {
      busy = true;
      swapInBoard(a, b);
      syncPositions(true);
      await wait(230 * STEP);
      const matches = findMatchesVals(valsOf());
      if (matches.size === 0) {
        // invalid: swap back with a little animation
        swapInBoard(a, b);
        syncPositions(true);
        await wait(230 * STEP);
        busy = false;
        return;
      }
      movesLeft--;
      updateScore();
      await resolveCascades();
      busy = false;
      if (movesLeft <= 0) setTimeout(finish, 300);
    }

    // pop matches, drop survivors, spawn new — repeat for cascades
    async function resolveCascades() {
      let loop = 0;
      while (loop++ < 30) {
        const matches = findMatchesVals(valsOf());
        if (matches.size === 0) break;
        score += matches.size * 10 * loop;
        updateScore();

        // 1) pop matched tiles
        for (const key of matches) {
          const [r, c] = key.split(',').map(Number);
          const t = board[r][c];
          if (t) {
            const node = tileNodes.get(t.id);
            if (node) { node.style.transition = reduce ? 'none' : 'transform 0.2s ease, opacity 0.2s ease'; place(node, r, c, { scale: 0, opacity: 0 }); }
            board[r][c] = null;
          }
        }
        await wait(200 * STEP);
        // delete the popped tiles' DOM nodes (their board slots are now null)
        cleanupOrphanNodes();

        // 2) gravity: for each column, let survivors fall, spawn new on top
        for (let c = 0; c < SIZE; c++) {
          const survivors = [];
          for (let r = SIZE - 1; r >= 0; r--) if (board[r][c]) survivors.push(board[r][c]);
          // place survivors at bottom
          let idx = 0;
          for (let r = SIZE - 1; r >= 0; r--) {
            if (idx < survivors.length) { board[r][c] = survivors[idx++]; }
            else board[r][c] = null;
          }
          // fill remaining top cells with new tiles, spawned above the board
          for (let r = SIZE - 1; r >= 0; r--) {
            if (!board[r][c]) {
              const t = newTile();
              board[r][c] = t;
              const node = makeTileNode(t, r, c);
              // start above the visible grid, then fall in
              node.style.transition = 'none';
              node.style.transform = `translate(${c*100}%, ${(r - SIZE) * 100}%)`;
              gridEl.appendChild(node);
            }
          }
        }
        // next frame: animate everyone to their resting spot (the fall)
        await nextFrame();
        syncPositions(true);
        await wait(240 * STEP);
      }
    }

    function cleanupOrphanNodes() {
      const alive = new Set();
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board[r][c]) alive.add(board[r][c].id);
      for (const [id, node] of Array.from(tileNodes.entries())) {
        if (!alive.has(id)) { node.remove(); tileNodes.delete(id); }
      }
    }

    // ---- payout (unchanged) ----
    function payout() {
      const t = Engine.tierById(run.tierId);
      const rate = t.buyIn / 300;
      return { cash: Math.round(score * rate), score };
    }
    function finish() {
      const p = payout();
      const res = Engine.settleGame(run, p.cash);
      onEarn(res, {
        title: p.score > 800 ? 'Dazzling round!' : p.score > 300 ? 'Nice matches!' : 'Round over',
        detail: `You scored ${p.score} points.`,
      });
    }

    function confirmExit() {
      const p = payout();
      UI.modal({
        title: 'Cash out?',
        bodyNodes: [ Mama.speech(`You'll take home ${Engine.fmt(p.cash)} for ${p.score} points, dear.`, 'happy') ],
        buttons: [
          { label: 'Cash out', class: 'gold', onClick: (cl) => { cl(); finish(); } },
          { label: 'Keep playing', class: 'ghost' },
        ],
      });
    }

    // ---- helpers ----
    function wait(ms) { return new Promise(res => setTimeout(res, ms)); }
    function nextFrame() { return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res))); }

    // ---- initial paint ----
    wrap.appendChild(el('div', { class: 'gamebar' }, [
      el('button', { class: 'back', onclick: confirmExit }, '← Cash out'),
      el('div', { class: 'score' }, `Score ${score} · Moves ${movesLeft}`),
    ]));
    const boardBox = el('div', { class: 'gem-board' }, paintGrid());
    wrap.appendChild(el('div', { style: { padding: '10px' } }, [
      boardBox,
      el('div', { class: 'spacer' }),
      el('p', { class: 'muted center' }, 'Tap two neighboring tiles to swap. Line up 3+ to clear them and earn cash!'),
      el('button', { class: 'btn gold', onclick: finish }, '💵 Cash out now'),
    ]));

    return wrap;
  }

  window.Bejeweled = { render, _test: { findMatchesVals, areAdjacent, SIZE } };
})();
