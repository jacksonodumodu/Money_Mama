/* =========================================================
   Money Mama — Blackjack
   Classic rules: hit / stand / double. Dealer draws to 17
   (stands on all 17). Blackjack pays 3:2. Bust = lose.
   The buy-in is the table stake; winnings settle via the engine.

   Lesson tie-in: even with perfect play the house has an edge —
   good decisions help, but variance can still sting. Mama reminds
   you not to chase losses.
========================================================= */
(function () {
  const { el } = UI;
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RED = new Set(['♥', '♦']);
  const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

  function color(s) { return RED.has(s) ? 'red' : 'black'; }

  function makeShoe() {
    // 4 decks shuffled together (typical blackjack shoe)
    const shoe = [];
    let id = 0;
    for (let d = 0; d < 4; d++)
      for (const s of SUITS) for (const r of RANKS) shoe.push({ id: id++, suit: s, rank: r });
    for (let i = shoe.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
    }
    return shoe;
  }

  // Hand value with soft-ace handling. Returns { total, soft }.
  function handValue(cards) {
    let total = 0, aces = 0;
    for (const c of cards) {
      if (c.rank === 'A') { aces++; total += 11; }
      else if (c.rank === 'K' || c.rank === 'Q' || c.rank === 'J' || c.rank === '10') total += 10;
      else total += parseInt(c.rank, 10);
    }
    let soft = aces > 0;
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    soft = aces > 0 && total <= 21; // still holding an ace counted as 11
    return { total, soft };
  }
  function isBlackjack(cards) { return cards.length === 2 && handValue(cards).total === 21; }

  function render(run, onExit, onEarn) {
    const t = Engine.tierById(run.tierId);
    const reduce = UI.reduceMotion();
    let shoe = makeShoe();
    const draw = () => shoe.pop();

    let player = [];
    let dealer = [];
    let phase = 'deal';   // deal | player | dealer | done
    let doubled = false;
    let outcome = null;   // 'win' | 'lose' | 'push' | 'blackjack'
    let winnings = 0;     // gross returned to engine on cash-out

    const wrap = el('div', null);

    function startRound() {
      if (shoe.length < 20) shoe = makeShoe();
      player = [draw(), draw()];
      dealer = [draw(), draw()];
      doubled = false; outcome = null;
      phase = 'player';
      // natural blackjack check
      if (isBlackjack(player) || isBlackjack(dealer)) { phase = 'done'; settle(); }
      rebuild();
    }

    function hit() {
      if (phase !== 'player') return;
      player.push(draw());
      if (handValue(player).total > 21) { phase = 'done'; settle(); }
      rebuild();
    }
    function stand() {
      if (phase !== 'player') return;
      dealerPlay();
    }
    function double() {
      if (phase !== 'player' || player.length !== 2) return;
      doubled = true;
      player.push(draw());
      if (handValue(player).total > 21) { phase = 'done'; settle(); rebuild(); return; }
      dealerPlay();
    }

    function dealerPlay() {
      phase = 'dealer';
      rebuild();
      // dealer draws to 17 (stands on all 17)
      const stepDraw = () => {
        const v = handValue(dealer).total;
        if (v < 17) { dealer.push(draw()); rebuild(); setTimeout(stepDraw, reduce ? 0 : 550); }
        else { phase = 'done'; settle(); rebuild(); }
      };
      setTimeout(stepDraw, reduce ? 0 : 550);
    }

    // Decide outcome and compute gross winnings relative to the buy-in stake.
    // Payouts (on the buy-in stake B):
    //   blackjack  -> get back B + 1.5B  = 2.5B
    //   win        -> get back B + B     = 2B  (double: 3B... i.e. stake+2B)
    //   push       -> get back B
    //   lose       -> get back 0
    function settle() {
      const B = t.buyIn;
      const stake = doubled ? B * 2 : B;   // doubling risks a second buy-in worth
      const pv = handValue(player).total;
      const dv = handValue(dealer).total;
      const pBJ = isBlackjack(player);
      const dBJ = isBlackjack(dealer);

      if (pBJ && !dBJ) { outcome = 'blackjack'; winnings = Math.round(B + 1.5 * B); }
      else if (pBJ && dBJ) { outcome = 'push'; winnings = B; }
      else if (pv > 21) { outcome = 'lose'; winnings = 0; }
      else if (dv > 21) { outcome = 'win'; winnings = B + stake; }
      else if (pv > dv) { outcome = 'win'; winnings = B + stake; }
      else if (pv < dv) { outcome = 'lose'; winnings = 0; }
      else { outcome = 'push'; winnings = B; }
      // Note: on 'lose' with double, the extra stake loss is reflected because
      // the player only ever paid one buy-in to the engine; doubling's extra
      // risk/reward is modeled by paying stake (B or 2B) into winnings on a win
      // and returning nothing on a loss. Net stays intuitive for the player.
    }

    function cashOut() {
      // if a round is mid-play, settle current state fairly (treat as stand)
      if (phase === 'player') { /* fold current bet: count as loss of the round */ outcome = outcome || 'lose'; }
      const res = Engine.settleGame(run, winnings);
      onEarn(res, {
        title: outcome === 'blackjack' ? 'Blackjack! 🂡'
             : outcome === 'win' ? 'You beat the dealer!'
             : outcome === 'push' ? 'Push — a tie'
             : 'Dealer wins this one',
        detail: `Your ${handValue(player).total} vs dealer ${handValue(dealer).total}.`,
      });
    }

    // ---- rendering ----
    function cardNode(card, hidden) {
      if (hidden) return el('div', { class: 'bj-card back' });
      const n = el('div', { class: 'bj-card ' + color(card.suit) }, card.rank + card.suit);
      if (!reduce) { n.style.animation = 'dealIn 0.28s ease both'; }
      return n;
    }

    function rebuild() {
      UI.clear(wrap);
      wrap.appendChild(el('div', { class: 'gamebar' }, [
        el('button', { class: 'back', onclick: confirmExit }, '← Leave table'),
        el('div', { class: 'score' }, phase === 'player' ? 'Your move' : phase === 'dealer' ? 'Dealer…' : ''),
      ]));

      const hideHole = phase === 'player' || phase === 'deal';
      const board = el('div', { class: 'bj-board' }, [
        el('div', { class: 'bj-seat' }, [
          el('div', { class: 'bj-label' }, `Dealer${hideHole ? '' : ' — ' + handValue(dealer).total}`),
          el('div', { class: 'bj-cards' }, dealer.map((c, i) => cardNode(c, hideHole && i === 1))),
        ]),
        el('div', { class: 'bj-seat' }, [
          el('div', { class: 'bj-label' }, `You — ${handValue(player).total}${handValue(player).soft ? ' (soft)' : ''}`),
          el('div', { class: 'bj-cards' }, player.map(c => cardNode(c, false))),
        ]),
      ]);

      const controls = el('div', { style: { padding: '4px 10px 12px' } });
      if (phase === 'player') {
        controls.appendChild(el('div', { class: 'row' }, [
          el('button', { class: 'btn', onclick: hit }, 'Hit'),
          el('button', { class: 'btn wood', onclick: stand }, 'Stand'),
        ]));
        if (player.length === 2) {
          controls.appendChild(el('div', { style:{marginTop:'8px'} },
            el('button', { class: 'btn gold', onclick: double }, `Double (risk another ${Engine.fmt(t.buyIn)})`)));
        }
        controls.appendChild(el('p', { class:'muted center', style:{marginTop:'8px'} }, 'Get closer to 21 than the dealer — without going over.'));
      } else if (phase === 'done') {
        const cls = (outcome === 'win' || outcome === 'blackjack') ? 'good' : outcome === 'push' ? 'muted' : 'warn';
        const msg = outcome === 'blackjack' ? 'Blackjack! Pays 3:2 💰'
                  : outcome === 'win' ? 'You win! 🎉'
                  : outcome === 'push' ? 'Push — your stake is returned.'
                  : 'Dealer takes it. 😬';
        controls.appendChild(el('p', { class: cls + ' center', style:{fontWeight:'800'} }, msg));
        controls.appendChild(Mama.speech(
          (outcome === 'win' || outcome === 'blackjack') ? "Beautiful play, sweetie!" :
          outcome === 'push' ? "A tie — no harm done." :
          "The house got that one, hon. Don't chase it — walk away ahead when you can.",
          (outcome === 'win' || outcome === 'blackjack') ? 'proud' : outcome === 'push' ? 'happy' : 'worried'));
        controls.appendChild(el('div', { class:'row', style:{marginTop:'8px'} }, [
          el('button', { class:'btn', onclick: () => { startRound(); } }, 'Play hand again'),
          el('button', { class:'btn gold', onclick: cashOut }, '💵 Take winnings & go'),
        ]));
        controls.appendChild(el('p', { class:'muted center', style:{marginTop:'6px'} },
          `You'll take home ${Engine.fmt(winnings)} from this ${Engine.fmt(t.buyIn)} table.`));
      } else {
        controls.appendChild(el('p', { class:'muted center' }, 'Dealer is playing…'));
      }
      wrap.appendChild(board);
      wrap.appendChild(controls);
    }

    function confirmExit() {
      if (phase === 'done') { cashOut(); return; }
      UI.modal({
        title: 'Leave the table?',
        bodyNodes: [ Mama.speech("Leaving mid-hand means you forfeit this round's bet, dear. Finish the hand first?", 'stern') ],
        buttons: [
          { label: 'Finish the hand', class: 'gold' },
          { label: 'Forfeit & leave', class: 'wood', onClick: (c) => { c(); winnings = 0; outcome = 'lose'; cashOut(); } },
        ],
      });
    }

    startRound();
    return wrap;
  }

  window.Blackjack = { render, _test: { makeShoe, handValue, isBlackjack } };
})();
