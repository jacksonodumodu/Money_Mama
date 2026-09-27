/* =========================================================
   Money Mama — Euchre game controller + UI
   Uses EuchreCore for rules. You (seat 0) + Partner (seat 2)
   vs West (1) + East (3). Play a fixed number of hands, then
   convert your team's points into winnings via settleGame.
========================================================= */
(function () {
  const { el } = UI;
  const C = window.EuchreCore;
  const SEAT_NAMES = ['You', 'West', 'Partner', 'East'];
  const HANDS_PER_GAME = 4;   // short session; each game = one buy-in

  function render(run, onExit, onEarn) {
    const t = Engine.tierById(run.tierId);
    const reduce = UI.reduceMotion();

    // match state
    let teamPoints = [0, 0];   // [You+Partner, West+East]
    let handsPlayed = 0;
    let dealer = 3;            // start: East deals (you're first to act)

    // per-hand state
    let hands = [[], [], [], []];
    let kitty = null;          // turned-up card
    let trump = null;
    let maker = null;          // seat that called trump
    let phase = 'bid1';        // bid1 | bid2 | play | handDone | matchDone
    let turn = 0;
    let currentTrick = [];     // {seat, card}
    let tricksWon = [0,0,0,0];
    let leader = 0;
    let msg = '';

    const wrap = el('div', null);

    function teamOf(seat) { return seat % 2 === 0 ? 0 : 1; }

    function dealHand() {
      const deck = C.shuffle(C.makeDeck());
      hands = [[],[],[],[]];
      for (let n = 0; n < 5; n++) for (let s = 0; s < 4; s++) hands[s].push(deck.pop());
      kitty = deck.pop();
      trump = null; maker = null; currentTrick = [];
      tricksWon = [0,0,0,0];
      leader = (dealer + 1) % 4;
      turn = (dealer + 1) % 4;
      phase = 'bid1';
      msg = `${SEAT_NAMES[dealer]} deals. Turned up: ${kitty.rank}${kitty.suit}.`;
      sortHand(hands[0]);
      rebuild();
      maybeAiBid();
    }

    function sortHand(h) {
      // simple stable sort by suit then rank for readability
      h.sort((a,b) => a.suit === b.suit ? C.RANKS.indexOf(a.rank)-C.RANKS.indexOf(b.rank) : C.SUITS.indexOf(a.suit)-C.SUITS.indexOf(b.suit));
    }

    // ---- Bidding ----
    function orderUp(seat, suit, alone) {
      trump = suit; maker = seat;
      // dealer picks up the kitty and discards worst card
      if (phase === 'bid1') {
        hands[dealer].push(kitty);
        discardWorst(dealer, trump);
      }
      phase = 'play';
      leader = (dealer + 1) % 4;
      turn = leader;
      currentTrick = [];
      sortHand(hands[0]);
      msg = `${SEAT_NAMES[seat]} called ${suit} as trump!`;
      rebuild();
      maybeAiPlay();
    }

    function discardWorst(seat, trump) {
      const h = hands[seat];
      let worst = 0, worstStr = Infinity;
      for (let i = 0; i < h.length; i++) {
        const st = C.cardStrength(h[i], trump, '');
        if (st < worstStr) { worstStr = st; worst = i; }
      }
      h.splice(worst, 1);
    }

    function passBid(seat) {
      if (phase === 'bid1') {
        if (seat === dealer) { phase = 'bid2'; turn = (dealer + 1) % 4; msg = 'All passed. Name a different suit or pass.'; }
        else turn = (turn + 1) % 4;
      } else { // bid2
        if (seat === dealer) { // everyone passed twice -> redeal (misdeal)
          msg = 'Everyone passed. Redealing…';
          rebuild();
          dealer = (dealer + 1) % 4;
          setTimeout(dealHand, reduce ? 0 : 700);
          return;
        } else turn = (turn + 1) % 4;
      }
      rebuild();
      maybeAiBid();
    }

    function maybeAiBid() {
      if (phase !== 'bid1' && phase !== 'bid2') return;
      if (turn === 0) return; // your turn; wait for UI
      const seat = turn;
      setTimeout(() => {
        if (phase === 'bid1') {
          const s = C.handStrength(hands[seat], kitty.suit);
          // consider that dealer (their team?) picks up the kitty
          if (s >= 5.5) { orderUp(seat, kitty.suit, false); return; }
          passBid(seat);
        } else {
          // bid2: pick best alternative suit
          let best = null, bestStr = 0;
          for (const suit of C.SUITS) {
            if (suit === kitty.suit) continue;
            const s = C.handStrength(hands[seat], suit);
            if (s > bestStr) { bestStr = s; best = suit; }
          }
          if (best && bestStr >= 5.5) { orderUp(seat, best, false); return; }
          passBid(seat);
        }
      }, reduce ? 0 : 600);
    }

    // ---- Trick play ----
    function playCard(seat, card) {
      const idx = hands[seat].findIndex(c => c.id === card.id);
      if (idx < 0) return;
      hands[seat].splice(idx, 1);
      currentTrick.push({ seat, card });
      if (currentTrick.length === 4) {
        const w = C.trickWinner(currentTrick, trump);
        tricksWon[w]++;
        msg = `${SEAT_NAMES[w]} wins the trick.`;
        rebuild();
        setTimeout(() => {
          currentTrick = [];
          leader = w; turn = w;
          if (hands[0].length === 0) { scoreHand(); }
          else { rebuild(); maybeAiPlay(); }
        }, reduce ? 0 : 850);
      } else {
        turn = (turn + 1) % 4;
        rebuild();
        maybeAiPlay();
      }
    }

    function maybeAiPlay() {
      if (phase !== 'play') return;
      if (turn === 0) return; // your move
      const seat = turn;
      setTimeout(() => {
        const card = C.aiChooseCard(hands[seat], currentTrick, trump);
        playCard(seat, card);
      }, reduce ? 0 : 650);
    }

    function scoreHand() {
      const makerTeam = teamOf(maker);
      const makerTricks = makerTeam === 0 ? tricksWon[0] + tricksWon[2] : tricksWon[1] + tricksWon[3];
      let pts = 0, winnerTeam = makerTeam, note = '';
      if (makerTricks >= 3) {
        if (makerTricks === 5) { pts = 2; note = 'a march — all 5 tricks!'; }
        else { pts = 1; note = `${makerTricks} tricks.`; }
      } else {
        winnerTeam = 1 - makerTeam; pts = 2; note = `euchred! Makers only got ${makerTricks}.`;
      }
      teamPoints[winnerTeam] += pts;
      handsPlayed++;
      phase = 'handDone';
      msg = `${winnerTeam === 0 ? 'Your team' : 'Opponents'} score ${pts} — ${note}`;
      rebuild();
    }

    function nextHandOrFinish() {
      if (handsPlayed >= HANDS_PER_GAME) { finishMatch(); return; }
      dealer = (dealer + 1) % 4;
      dealHand();
    }

    // convert your team's points into winnings vs the buy-in
    function finishMatch() {
      phase = 'matchDone';
      const mine = teamPoints[0], theirs = teamPoints[1];
      // each of your points is worth ~ buy-in/4; beating opponents adds a bonus
      let winnings = Math.round((mine / Math.max(1, (mine + theirs))) * t.buyIn * 2.2);
      if (mine > theirs) winnings += Math.round(t.buyIn * 0.3);
      const res = Engine.settleGame(run, winnings);
      onEarn(res, {
        title: mine > theirs ? 'Your team won the match! 🎉' : mine === theirs ? 'Match tied' : 'Opponents took the match',
        detail: `Final: You ${mine} — Opponents ${theirs}.`,
      });
    }

    // ---- UI ----
    function cardBtn(card, opts) {
      opts = opts || {};
      const isRed = card.suit === '♥' || card.suit === '♦';
      const n = el('div', {
        class: 'eu-card ' + (isRed ? 'red' : 'black') + (opts.dim ? ' dim' : '') + (opts.playable ? ' playable' : ''),
        onclick: opts.onclick || null,
      }, card.rank + card.suit);
      return n;
    }

    function seatBox(seat) {
      const isTurn = (phase === 'play' || phase === 'bid1' || phase === 'bid2') && turn === seat;
      return el('div', { class: 'eu-seat' + (isTurn ? ' active' : '') }, [
        el('div', { class: 'eu-name' }, SEAT_NAMES[seat] + (teamOf(seat) === 0 ? ' 💚' : '') + (maker === seat ? ' ⭐' : '')),
        el('div', { class: 'eu-tricks' }, '🂠 ' + tricksWon[seat]),
      ]);
    }

    function rebuild() {
      UI.clear(wrap);
      wrap.appendChild(el('div', { class: 'gamebar' }, [
        el('button', { class: 'back', onclick: confirmExit }, '← Leave'),
        el('div', { class: 'score' }, `You ${teamPoints[0]} — Opp ${teamPoints[1]} · Hand ${Math.min(handsPlayed+1,HANDS_PER_GAME)}/${HANDS_PER_GAME}`),
      ]));

      const table = el('div', { class: 'eu-table' }, [
        seatBox(2), // partner top
        el('div', { class: 'eu-mid' }, [
          seatBox(1),
          el('div', { class: 'eu-center' },
            trump ? [ el('div', { class:'eu-trump' }, 'Trump: ' + trump), trickArea() ]
                  : [ el('div', { class:'eu-kitty' }, kitty ? ('Up: ' + kitty.rank + kitty.suit) : ''), trickArea() ]),
          seatBox(3),
        ]),
        seatBox(0), // you bottom
      ]);
      wrap.appendChild(table);

      wrap.appendChild(el('div', { class: 'eu-msg' }, msg));

      // controls
      const ctrl = el('div', { style: { padding: '4px 10px 14px' } });
      if (phase === 'bid1' && turn === 0) {
        ctrl.appendChild(el('p', { class:'muted center' }, `Order up ${kitty.suit}? (Dealer picks up the ${kitty.rank}${kitty.suit})`));
        ctrl.appendChild(el('div', { class:'row' }, [
          el('button', { class:'btn gold', onclick: () => orderUp(0, kitty.suit, false) }, `Order up ${kitty.suit}`),
          el('button', { class:'btn wood', onclick: () => passBid(0) }, 'Pass'),
        ]));
      } else if (phase === 'bid2' && turn === 0) {
        ctrl.appendChild(el('p', { class:'muted center' }, 'Name a different suit as trump, or pass.'));
        const suitRow = el('div', { class:'row' },
          C.SUITS.filter(s => s !== kitty.suit).map(s =>
            el('button', { class:'btn', onclick: () => orderUp(0, s, false) }, s)));
        ctrl.appendChild(suitRow);
        ctrl.appendChild(el('div', { style:{marginTop:'8px'} }, el('button', { class:'btn wood', onclick: () => passBid(0) }, 'Pass')));
      } else if (phase === 'handDone') {
        ctrl.appendChild(el('button', { class:'btn gold', onclick: nextHandOrFinish },
          handsPlayed >= HANDS_PER_GAME ? 'See match result →' : 'Next hand →'));
      }

      // your hand
      const yourLed = currentTrick.length ? currentTrick[0].card : null;
      const legal = (phase === 'play' && turn === 0) ? C.legalPlays(hands[0], yourLed, trump) : [];
      const legalIds = new Set(legal.map(c => c.id));
      const handRow = el('div', { class: 'eu-hand' }, hands[0].map(card => {
        const playable = phase === 'play' && turn === 0 && legalIds.has(card.id);
        return cardBtn(card, {
          playable,
          dim: phase === 'play' && turn === 0 && !legalIds.has(card.id),
          onclick: playable ? () => playCard(0, card) : null,
        });
      }));
      ctrl.appendChild(el('div', { class:'muted center', style:{marginTop:'6px'} }, 'Your hand'));
      ctrl.appendChild(handRow);
      wrap.appendChild(ctrl);
    }

    function trickArea() {
      return el('div', { class: 'eu-trick' }, currentTrick.map(p => {
        const isRed = p.card.suit === '♥' || p.card.suit === '♦';
        return el('div', { class: 'eu-card small ' + (isRed?'red':'black') }, [
          el('span', null, p.card.rank + p.card.suit),
          el('span', { class:'eu-mini' }, SEAT_NAMES[p.seat][0]),
        ]);
      }));
    }

    function confirmExit() {
      UI.modal({
        title: 'Leave the game?',
        bodyNodes: [ Mama.speech("Leaving now forfeits this match's stake, sweetie. Sure?", 'stern') ],
        buttons: [
          { label: 'Keep playing', class: 'gold' },
          { label: 'Forfeit & leave', class: 'wood', onClick: (c) => { c(); const res = Engine.settleGame(run, 0); onEarn(res, { title: 'You left the table', detail: 'No winnings this match.' }); } },
        ],
      });
    }

    dealHand();
    return wrap;
  }

  window.Euchre = { render };
})();
