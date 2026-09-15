/* =========================================================
   Money Mama — Klondike Solitaire
   Tap-to-move solitaire. Payout scales with foundations filled.
========================================================= */
(function () {
  const { el } = UI;
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RED = new Set(['♥', '♦']);
  const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

  function rankVal(r) { return RANKS.indexOf(r) + 1; }
  function color(suit) { return RED.has(suit) ? 'red' : 'black'; }

  function makeDeck() {
    const d = [];
    for (const s of SUITS) for (const r of RANKS) d.push({ suit: s, rank: r, faceUp: false });
    // shuffle
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  }

  function newGame() {
    const deck = makeDeck();
    const tableau = [[], [], [], [], [], [], []];
    let idx = 0;
    for (let col = 0; col < 7; col++) {
      for (let row = 0; row <= col; row++) {
        const card = deck[idx++];
        card.faceUp = (row === col);
        tableau[col].push(card);
      }
    }
    const stock = deck.slice(idx).map(c => ({ ...c, faceUp: false }));
    return {
      tableau,
      foundations: [[], [], [], []], // by suit index
      stock,
      waste: [],
      sel: null, // {from:'tableau'|'waste', col, index}
    };
  }

  function canStackTableau(card, onto) {
    if (!onto) return card.rank === 'K';           // empty column only takes K
    return color(card.suit) !== color(onto.suit) && rankVal(card.rank) === rankVal(onto.rank) - 1;
  }
  function canStackFoundation(card, foundation) {
    if (foundation.length === 0) return card.rank === 'A';
    const top = foundation[foundation.length - 1];
    return card.suit === top.suit && rankVal(card.rank) === rankVal(top.rank) + 1;
  }

  function render(run, onExit, onEarn) {
    let g = newGame();
    const wrap = el('div', null);

    function payout() {
      // cash scales with foundation cards placed (0..52). Full win = big bonus.
      const placed = g.foundations.reduce((a, f) => a + f.length, 0);
      const t = Engine.tierById(run.tierId);
      const base = t.id === 1 ? 4 : t.id === 2 ? 10 : 25; // per card
      let cash = placed * base;
      const complete = placed === 52;
      if (complete) cash += (t.id === 1 ? 200 : t.id === 2 ? 1500 : 12000);
      return { cash, placed, complete };
    }

    function finish() {
      const p = payout();
      const res = Engine.earn(run, p.cash);
      onEarn(res, {
        emoji: p.complete ? '🏆' : (p.placed > 0 ? '🃏' : '🙂'),
        title: p.complete ? 'You cleared it!' : (p.placed > 0 ? 'Nice progress!' : 'Cashed out'),
        detail: `You placed ${p.placed} card${p.placed===1?'':'s'} to the foundations.`,
      });
    }

    function draw() {
      if (g.stock.length === 0) {
        g.stock = g.waste.reverse().map(c => ({ ...c, faceUp: false }));
        g.waste = [];
      } else {
        const c = g.stock.pop(); c.faceUp = true; g.waste.push(c);
      }
      g.sel = null; rebuild();
    }

    function tryAutoFoundation(card, from, col, index) {
      for (let fi = 0; fi < 4; fi++) {
        if (canStackFoundation(card, g.foundations[fi])) {
          removeMoving(from, col, index);
          g.foundations[fi].push(card);
          flipExposed();
          g.sel = null; rebuild();
          if (g.foundations.reduce((a,f)=>a+f.length,0) === 52) setTimeout(finish, 300);
          return true;
        }
      }
      return false;
    }

    function removeMoving(from, col, index) {
      if (from === 'waste') g.waste.pop();
      else g.tableau[col].splice(index);
    }
    function flipExposed() {
      for (const colArr of g.tableau) {
        const top = colArr[colArr.length - 1];
        if (top && !top.faceUp) top.faceUp = true;
      }
    }

    function onCardTap(from, col, index) {
      const pile = from === 'waste' ? g.waste : g.tableau[col];
      const card = pile[index];
      if (!card || !card.faceUp) return;

      // second tap = try to move selection here
      if (g.sel) {
        const sel = g.sel;
        const selPile = sel.from === 'waste' ? g.waste : g.tableau[sel.from === 'tableau' ? sel.col : 0];
        const moving = sel.from === 'waste' ? [g.waste[g.waste.length-1]] : g.tableau[sel.col].slice(sel.index);
        const destTop = g.tableau[col][g.tableau[col].length - 1];
        if (from === 'tableau' && canStackTableau(moving[0], destTop)) {
          removeMoving(sel.from, sel.col, sel.index);
          g.tableau[col].push(...moving);
          flipExposed(); g.sel = null; rebuild(); return;
        }
        g.sel = null; rebuild(); return;
      }

      // single face-up card at top → try auto to foundation first
      const isTop = index === pile.length - 1;
      if (isTop && tryAutoFoundation(card, from, col, index)) return;

      // otherwise select this card (and the run below it, tableau only)
      g.sel = { from, col, index };
      rebuild();
    }

    function onEmptyColTap(col) {
      if (!g.sel) return;
      const moving = g.sel.from === 'waste' ? [g.waste[g.waste.length-1]] : g.tableau[g.sel.col].slice(g.sel.index);
      if (canStackTableau(moving[0], null)) {
        removeMoving(g.sel.from, g.sel.col, g.sel.index);
        g.tableau[col].push(...moving);
        flipExposed();
      }
      g.sel = null; rebuild();
    }

    function cardEl(card, opts) {
      opts = opts || {};
      if (!card) return el('div', { class: 'card empty', onclick: opts.onclick });
      if (!card.faceUp) return el('div', { class: 'card back', onclick: opts.onclick });
      const sel = opts.selected ? ' sel' : '';
      return el('div', { class: 'card ' + color(card.suit) + sel, onclick: opts.onclick },
        card.rank + card.suit);
    }

    function rebuild() {
      UI.clear(wrap);
      // top bar
      wrap.appendChild(el('div', { class: 'gamebar' }, [
        el('button', { class: 'back', onclick: () => confirmExit() }, '← Cash out'),
        el('div', { class: 'score' }, `Placed: ${g.foundations.reduce((a,f)=>a+f.length,0)}/52`),
      ]));

      const board = el('div', { class: 'sol-board' });

      // stock + waste + foundations
      const top = el('div', { class: 'sol-top' });
      const left = el('div', { style: { display: 'flex', gap: '4px', width: '30%' } }, [
        el('div', { style: { flex: 1 } }, cardEl(g.stock.length ? { faceUp: false } : null, { onclick: draw })),
        el('div', { style: { flex: 1 } }, g.waste.length
          ? cardEl(g.waste[g.waste.length-1], { selected: g.sel && g.sel.from==='waste', onclick: () => onCardTap('waste', 0, g.waste.length-1) })
          : cardEl(null, { onclick: draw })),
      ]);
      const founds = el('div', { style: { display: 'flex', gap: '4px', width: '58%' } },
        g.foundations.map((f, fi) =>
          el('div', { style: { flex: 1 } },
            cardEl(f.length ? f[f.length-1] : null, { onclick: () => {
              // allow moving selected card onto foundation by tapping it
              if (g.sel) {
                const moving = g.sel.from === 'waste' ? g.waste[g.waste.length-1] : g.tableau[g.sel.col][g.sel.index];
                const isSingle = g.sel.from === 'waste' || g.sel.index === g.tableau[g.sel.col].length - 1;
                if (isSingle && canStackFoundation(moving, f)) {
                  removeMoving(g.sel.from, g.sel.col, g.sel.index);
                  f.push(moving); flipExposed(); g.sel = null; rebuild();
                  if (g.foundations.reduce((a,ff)=>a+ff.length,0)===52) setTimeout(finish,300);
                  return;
                }
              }
            }})
          )
        )
      );
      top.appendChild(left); top.appendChild(founds);
      board.appendChild(top);

      // tableau
      const piles = el('div', { class: 'sol-piles' });
      g.tableau.forEach((colArr, col) => {
        const pile = el('div', { class: 'pile', onclick: (e) => { if (e.target === pile && colArr.length === 0) onEmptyColTap(col); } });
        if (colArr.length === 0) {
          pile.appendChild(cardEl(null, { onclick: () => onEmptyColTap(col) }));
        } else {
          colArr.forEach((card, index) => {
            const c = cardEl(card, {
              selected: g.sel && g.sel.from==='tableau' && g.sel.col===col && index >= g.sel.index,
              onclick: () => onCardTap('tableau', col, index),
            });
            c.style.top = (index * 22) + 'px';
            pile.appendChild(c);
          });
          pile.style.height = ((colArr.length - 1) * 22 + 60) + 'px';
        }
        piles.appendChild(pile);
      });
      board.appendChild(piles);

      board.appendChild(el('div', { class: 'spacer' }));
      board.appendChild(el('p', { class: 'muted center' }, 'Tap a card to auto-send to foundations, or tap a card then a column to move it. Draw from the deck top-left.'));
      board.appendChild(el('button', { class: 'btn gold', onclick: finish }, '💵 Cash out my winnings'));
      wrap.appendChild(board);
    }

    function confirmExit() {
      const p = payout();
      UI.modal({
        emoji: '🃏', title: 'Cash out?',
        bodyNodes: [ el('p', null, `You'll earn ${Engine.fmt(p.cash)} for ${p.placed} cards placed. Leaving mid-game still pays what you've earned.`) ],
        buttons: [
          { label: 'Cash out', class: 'gold', onClick: (c) => { c(); finish(); } },
          { label: 'Keep playing', class: 'ghost' },
        ],
      });
    }

    rebuild();
    return wrap;
  }

  // expose helpers too (for tests)
  window.Solitaire = { render, _test: { makeDeck, canStackTableau, canStackFoundation, rankVal, color, newGame } };
})();
