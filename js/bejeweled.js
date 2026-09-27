/* =========================================================
   Money Mama — "Mom's Match" match-3 (animated)
   Tap two neighbouring tiles OR swipe a tile toward a neighbour
   to swap. Match 3+, cascades. Score -> winnings.

   Input: ONE pointer handler on the board works out which cell was
   touched from the touch position. (Per-tile handlers went stale as
   tiles moved, which broke selection.)

   Animation: each tile is a persistent absolutely-positioned element;
   moving it = changing its transform, which CSS transitions. Matches
   pop, survivors fall, new tiles drop in from above. If the board ever
   has no possible move, it reshuffles. Respects reduce-motion.
========================================================= */
(function () {
  const { el } = UI;
  const GEMS = ['🍷', '☕', '⚽', '🛒', '💐', '🧁']; // wine, coffee, soccer, groceries, flowers, cupcake
  const PALETTE = ['#7a3b2e', '#6b4f34', '#3e6b45', '#8a6d4b', '#a85a8a', '#c99b39'];
  const SIZE = 7;
  const MOVES = 12;

  function randGemVal() { return Math.floor(Math.random() * GEMS.length); }

  // ---- pure board logic (works on a grid of gem values) ----
  function findMatchesVals(vals) {
    const matched = new Set();
    for (let r = 0; r < SIZE; r++) {
      let run = 1;
      for (let c = 1; c <= SIZE; c++) {
        if (c < SIZE && vals[r][c] != null && vals[r][c] === vals[r][c - 1]) run++;
        else { if (run >= 3) for (let k = c - run; k < c; k++) matched.add(r + ',' + k); run = 1; }
      }
    }
    for (let c = 0; c < SIZE; c++) {
      let run = 1;
      for (let r = 1; r <= SIZE; r++) {
        if (r < SIZE && vals[r][c] != null && vals[r][c] === vals[r - 1][c]) run++;
        else { if (run >= 3) for (let k = r - run; k < r; k++) matched.add(k + ',' + c); run = 1; }
      }
    }
    return matched;
  }
  function areAdjacent(a, b) {
    return (a.r === b.r && Math.abs(a.c - b.c) === 1) || (a.c === b.c && Math.abs(a.r - b.r) === 1);
  }
  // Is there at least one swap that makes a match?
  function hasPossibleMove(vals) {
    const g = vals.map(row => row.slice());
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const r2 = r + dr, c2 = c + dc;
        if (r2 >= SIZE || c2 >= SIZE) continue;
        [g[r][c], g[r2][c2]] = [g[r2][c2], g[r][c]];
        const found = findMatchesVals(g).size > 0;
        [g[r][c], g[r2][c2]] = [g[r2][c2], g[r][c]];
        if (found) return true;
      }
    }
    return false;
  }
  // A fresh grid of values with no matches but at least one move.
  function freshVals() {
    let v;
    do {
      v = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, randGemVal));
    } while (findMatchesVals(v).size > 0 || !hasPossibleMove(v));
    return v;
  }

  function render(run, onExit, onEarn) {
    let nextId = 1;
    const newTile = (gem) => ({ id: nextId++, gem: gem == null ? randGemVal() : gem });
    let board = freshVals().map(row => row.map(g => newTile(g)));

    let sel = null;
    let score = 0;
    let movesLeft = MOVES;
    let busy = false;
    let finished = false;

    const wrap = el('div', null);
    let gridEl = null;
    const tileNodes = new Map(); // tile id -> DOM node
    const reduce = UI.reduceMotion();
    const STEP = reduce ? 0 : 1;
    const cellPct = 100 / SIZE;

    const valsOf = () => board.map(row => row.map(t => (t ? t.gem : null)));
    function updateScore() {
      const s = wrap.querySelector('.score');
      if (s) s.textContent = `Score ${score} · Moves ${movesLeft}`;
    }

    function place(node, r, c, opts) {
      opts = opts || {};
      node.style.transform = `translate(${c * 100}%, ${r * 100}%) scale(${opts.scale != null ? opts.scale : 1})`;
      node.style.opacity = opts.opacity != null ? opts.opacity : 1;
    }
    function styleTile(node, gem) {
      node.textContent = GEMS[gem];
      node.style.background = PALETTE[gem % PALETTE.length];
    }
    function makeTileNode(tile, r, c) {
      const node = el('div', { class: 'gem-tile', style: { width: cellPct + '%', height: cellPct + '%' } });
      styleTile(node, tile.gem);
      place(node, r, c);
      tileNodes.set(tile.id, node);
      return node;
    }

    function syncPositions(animate) {
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
        const t = board[r][c];
        const node = t && tileNodes.get(t.id);
        if (!node) continue;
        node.style.transition = animate && !reduce ? 'transform 0.22s ease, opacity 0.2s ease' : 'none';
        place(node, r, c);
      }
    }

    function setSelected() {
      tileNodes.forEach(node => node.classList.remove('sel'));
      if (sel && board[sel.r][sel.c]) {
        const n = tileNodes.get(board[sel.r][sel.c].id);
        if (n) n.classList.add('sel');
      }
    }

    // ---- input: one handler for the whole board (tap-tap or swipe) ----
    function cellAt(clientX, clientY) {
      const rect = gridEl.getBoundingClientRect();
      const c = Math.floor(((clientX - rect.left) / rect.width) * SIZE);
      const r = Math.floor(((clientY - rect.top) / rect.height) * SIZE);
      if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return null;
      return { r, c };
    }
    let press = null; // { cell, x, y, swiped }
    function onDown(e) {
      if (busy || finished || movesLeft <= 0) return;
      const cell = cellAt(e.clientX, e.clientY);
      if (!cell) return;
      press = { cell, x: e.clientX, y: e.clientY, swiped: false };
      try { gridEl.setPointerCapture(e.pointerId); } catch (err) {}
    }
    function onMove(e) {
      if (!press || press.swiped) return;
      const dx = e.clientX - press.x, dy = e.clientY - press.y;
      const cellPx = gridEl.getBoundingClientRect().width / SIZE;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < cellPx * 0.35) return;
      press.swiped = true;
      const a = press.cell;
      const b = Math.abs(dx) > Math.abs(dy)
        ? { r: a.r, c: a.c + (dx > 0 ? 1 : -1) }
        : { r: a.r + (dy > 0 ? 1 : -1), c: a.c };
      if (b.r < 0 || b.c < 0 || b.r >= SIZE || b.c >= SIZE) return;
      sel = null; setSelected();
      doSwap(a, b);
    }
    function onUp(e) {
      if (!press) return;
      const p = press; press = null;
      if (!p.swiped) onCellTap(p.cell.r, p.cell.c);
    }

    function onCellTap(r, c) {
      if (busy || finished || movesLeft <= 0) return;
      if (!sel) { sel = { r, c }; setSelected(); return; }
      if (sel.r === r && sel.c === c) { sel = null; setSelected(); return; }
      if (areAdjacent(sel, { r, c })) { const a = sel; sel = null; setSelected(); doSwap(a, { r, c }); }
      else { sel = { r, c }; setSelected(); }
    }

    function swapInBoard(a, b) {
      const tmp = board[a.r][a.c]; board[a.r][a.c] = board[b.r][b.c]; board[b.r][b.c] = tmp;
    }

    async function doSwap(a, b) {
      if (busy || finished) return;
      busy = true;
      swapInBoard(a, b);
      syncPositions(true);
      await wait(230 * STEP);
      if (findMatchesVals(valsOf()).size === 0) {
        swapInBoard(a, b);           // not a match: slide back, no move spent
        syncPositions(true);
        await wait(230 * STEP);
        busy = false;
        return;
      }
      movesLeft--;
      updateScore();
      await resolveCascades();
      if (!hasPossibleMove(valsOf())) await reshuffle();
      busy = false;
      if (movesLeft <= 0) setTimeout(finish, 400);
    }

    async function resolveCascades() {
      let loop = 0;
      while (loop++ < 30) {
        const matches = findMatchesVals(valsOf());
        if (matches.size === 0) break;
        score += matches.size * 10 * loop;    // cascades are worth more
        updateScore();
        // 1) pop
        for (const key of matches) {
          const [r, c] = key.split(',').map(Number);
          const t = board[r][c];
          const node = t && tileNodes.get(t.id);
          if (node) { node.style.transition = reduce ? 'none' : 'transform 0.2s ease, opacity 0.2s ease'; place(node, r, c, { scale: 0, opacity: 0 }); }
          board[r][c] = null;
        }
        await wait(200 * STEP);
        cleanupOrphanNodes();
        // 2) gravity + refill from above
        for (let c = 0; c < SIZE; c++) {
          const survivors = [];
          for (let r = SIZE - 1; r >= 0; r--) if (board[r][c]) survivors.push(board[r][c]);
          for (let r = SIZE - 1, i = 0; r >= 0; r--, i++) board[r][c] = survivors[i] || null;
          let spawned = 0;
          for (let r = SIZE - 1; r >= 0; r--) {
            if (board[r][c]) continue;
            spawned++;
            const t = newTile();
            board[r][c] = t;
            const node = makeTileNode(t, r, c);
            node.style.transition = 'none';
            node.style.transform = `translate(${c * 100}%, ${(r - SIZE) * 100}%)`;
            gridEl.appendChild(node);
          }
        }
        await nextFrame();
        syncPositions(true);
        await wait(240 * STEP);
      }
    }

    // No moves left on the board: gently re-deal the gems in place.
    async function reshuffle() {
      const v = freshVals();
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
        board[r][c].gem = v[r][c];
        const node = tileNodes.get(board[r][c].id);
        if (!node) continue;
        node.style.transition = reduce ? 'none' : 'transform 0.18s ease';
        place(node, r, c, { scale: 0.6 });
        styleTile(node, v[r][c]);
      }
      const note = wrap.querySelector('.gem-note');
      if (note) note.textContent = 'No moves left — Mama shuffled the board for you!';
      await wait(180 * STEP);
      syncPositions(true);
      await wait(200 * STEP);
    }

    function cleanupOrphanNodes() {
      const alive = new Set();
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board[r][c]) alive.add(board[r][c].id);
      for (const [id, node] of Array.from(tileNodes.entries())) {
        if (!alive.has(id)) { node.remove(); tileNodes.delete(id); }
      }
    }

    // ---- payout ----
    function payout() {
      const t = Engine.tierById(run.tierId);
      return { cash: Math.round(score * (t.buyIn / 300)), score };  // ~300 pts ≈ break-even
    }
    function finish() {
      if (finished) return;           // never pay out twice
      finished = true;
      const p = payout();
      const res = Engine.settleGame(run, p.cash);
      onEarn(res, {
        title: p.score > 800 ? 'Dazzling round!' : p.score > 300 ? 'Nice matches!' : 'Round over',
        detail: `You scored ${p.score} points.`,
      });
    }
    function confirmExit() {
      if (finished) return;
      const p = payout();
      UI.modal({
        title: 'Cash out?',
        bodyNodes: [Mama.speech(`You'll take home ${Engine.fmt(p.cash)} for ${p.score} points, dear. You still have ${movesLeft} move${movesLeft === 1 ? '' : 's'} left.`, 'happy')],
        buttons: [
          { label: 'Cash out', class: 'gold', onClick: (cl) => { cl(); finish(); } },
          { label: 'Keep playing', class: 'ghost' },
        ],
      });
    }

    function wait(ms) { return new Promise(res => setTimeout(res, ms)); }
    function nextFrame() { return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res))); }

    // ---- initial paint ----
    gridEl = el('div', { class: 'gem-grid-anim' });
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) gridEl.appendChild(makeTileNode(board[r][c], r, c));
    gridEl.addEventListener('pointerdown', onDown);
    gridEl.addEventListener('pointermove', onMove);
    gridEl.addEventListener('pointerup', onUp);
    gridEl.addEventListener('pointercancel', () => { press = null; });

    wrap.appendChild(el('div', { class: 'gamebar' }, [
      el('button', { class: 'back', onclick: confirmExit }, '← Cash out'),
      el('div', { class: 'score' }, `Score ${score} · Moves ${movesLeft}`),
    ]));
    wrap.appendChild(el('div', { style: { padding: '10px' } }, [
      el('div', { class: 'gem-board' }, gridEl),
      el('p', { class: 'muted center gem-note', style: { marginTop: '10px' } }, 'Swipe a tile toward its neighbour — or tap two neighbours — to swap. Line up 3+ to clear them!'),
      el('button', { class: 'btn gold', onclick: confirmExit }, '💵 Cash out'),
    ]));
    return wrap;
  }

  window.Bejeweled = { render, _test: { findMatchesVals, areAdjacent, hasPossibleMove, freshVals, SIZE } };
})();
