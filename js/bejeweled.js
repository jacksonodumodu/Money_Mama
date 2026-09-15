/* =========================================================
   Money Mama — Bejeweled-style match-3
   Swap adjacent gems, match 3+, cascades. Score -> cash.
========================================================= */
(function () {
  const { el } = UI;
  const GEMS = ['🌰', '🍄', '🌿', '🍁', '🌸', '🐚']; // forest-y tokens
  const SIZE = 7;
  const MOVES = 12;

  function randGem() { return Math.floor(Math.random() * GEMS.length); }

  function makeBoard() {
    // build a board with no initial matches
    let b;
    do {
      b = [];
      for (let r = 0; r < SIZE; r++) {
        const row = [];
        for (let c = 0; c < SIZE; c++) row.push(randGem());
        b.push(row);
      }
    } while (findMatches(b).size > 0);
    return b;
  }

  function findMatches(b) {
    const matched = new Set();
    // horizontal
    for (let r = 0; r < SIZE; r++) {
      let run = 1;
      for (let c = 1; c <= SIZE; c++) {
        if (c < SIZE && b[r][c] === b[r][c-1] && b[r][c] != null) run++;
        else {
          if (run >= 3) for (let k = c - run; k < c; k++) matched.add(r + ',' + k);
          run = 1;
        }
      }
    }
    // vertical
    for (let c = 0; c < SIZE; c++) {
      let run = 1;
      for (let r = 1; r <= SIZE; r++) {
        if (r < SIZE && b[r][c] === b[r-1][c] && b[r][c] != null) run++;
        else {
          if (run >= 3) for (let k = r - run; k < r; k++) matched.add(k + ',' + c);
          run = 1;
        }
      }
    }
    return matched;
  }

  function areAdjacent(a, b) {
    return (a.r === b.r && Math.abs(a.c - b.c) === 1) || (a.c === b.c && Math.abs(a.r - b.r) === 1);
  }

  function render(run, onExit, onEarn) {
    let board = makeBoard();
    let sel = null;
    let score = 0;
    let movesLeft = MOVES;
    let busy = false;
    const wrap = el('div', null);

    function collapse() {
      // clear matches, drop, refill, repeat; accumulate score
      let chainCleared = 0;
      let loops = 0;
      while (loops++ < 30) {
        const m = findMatches(board);
        if (m.size === 0) break;
        chainCleared += m.size;
        score += m.size * 10 * loops; // cascades worth more
        for (const key of m) { const [r, c] = key.split(',').map(Number); board[r][c] = null; }
        // drop
        for (let c = 0; c < SIZE; c++) {
          const col = [];
          for (let r = SIZE - 1; r >= 0; r--) if (board[r][c] != null) col.push(board[r][c]);
          for (let r = SIZE - 1; r >= 0; r--) board[r][c] = col[SIZE - 1 - r] != null ? col[SIZE - 1 - r] : randGem();
        }
      }
      return chainCleared;
    }

    function trySwap(a, b) {
      if (busy) return;
      [board[a.r][a.c], board[b.r][b.c]] = [board[b.r][b.c], board[a.r][a.c]];
      const m = findMatches(board);
      if (m.size === 0) {
        // swap back — invalid move, no move spent
        [board[a.r][a.c], board[b.r][b.c]] = [board[b.r][b.c], board[a.r][a.c]];
        sel = null; rebuild(); return;
      }
      movesLeft--;
      collapse();
      sel = null; rebuild();
      if (movesLeft <= 0) setTimeout(finish, 400);
    }

    function onGemTap(r, c) {
      if (busy || movesLeft <= 0) return;
      if (!sel) { sel = { r, c }; rebuild(); return; }
      if (sel.r === r && sel.c === c) { sel = null; rebuild(); return; }
      if (areAdjacent(sel, { r, c })) trySwap(sel, { r, c });
      else { sel = { r, c }; rebuild(); }
    }

    function payout() {
      const t = Engine.tierById(run.tierId);
      const rate = t.id === 1 ? 0.05 : t.id === 2 ? 0.12 : 0.3; // cash per score point
      return { cash: Math.round(score * rate), score };
    }

    function finish() {
      const p = payout();
      const res = Engine.earn(run, p.cash);
      onEarn(res, {
        emoji: p.score > 800 ? '💎' : p.score > 300 ? '✨' : '🍄',
        title: p.score > 800 ? 'Dazzling!' : p.score > 300 ? 'Nice matches!' : 'Round over',
        detail: `You scored ${p.score} points.`,
      });
    }

    function rebuild() {
      UI.clear(wrap);
      wrap.appendChild(el('div', { class: 'gamebar' }, [
        el('button', { class: 'back', onclick: confirmExit }, '← Cash out'),
        el('div', { class: 'score' }, `Score ${score} · Moves ${movesLeft}`),
      ]));

      const grid = el('div', { class: 'gem-grid', style: { gridTemplateColumns: `repeat(${SIZE}, 1fr)`, maxWidth: '440px' } });
      const palette = ['#6b4f34','#8a6d4b','#5a9367','#a8412f','#c99b39','#3e6b45'];
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const isSel = sel && sel.r === r && sel.c === c;
          const gi = board[r][c];
          grid.appendChild(el('div', {
            class: 'gem' + (isSel ? ' sel' : ''),
            style: { background: palette[gi % palette.length] },
            onclick: () => onGemTap(r, c),
          }, GEMS[gi]));
        }
      }
      const pad = el('div', { style: { padding: '10px' } }, [
        grid,
        el('div', { class: 'spacer' }),
        el('p', { class: 'muted center' }, 'Tap two neighboring tiles to swap. Line up 3+ of the same to clear them and earn cash!'),
        el('button', { class: 'btn gold', onclick: finish }, '💵 Cash out now'),
      ]);
      wrap.appendChild(pad);
    }

    function confirmExit() {
      const p = payout();
      UI.modal({
        emoji: '💎', title: 'Cash out?',
        bodyNodes: [ el('p', null, `You'll earn ${Engine.fmt(p.cash)} for ${p.score} points.`) ],
        buttons: [
          { label: 'Cash out', class: 'gold', onClick: (cl) => { cl(); finish(); } },
          { label: 'Keep playing', class: 'ghost' },
        ],
      });
    }

    rebuild();
    return wrap;
  }

  window.Bejeweled = { render, _test: { makeBoard, findMatches, areAdjacent, SIZE } };
})();
