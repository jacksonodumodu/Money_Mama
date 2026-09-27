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
    let resolving = false;     // true during the pause after a trick: no taps
    let closed = false;        // match over / left: ignore late timers
    const later = (fn, ms) => setTimeout(() => { if (!closed) fn(); }, reduce ? 0 : ms);

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
      // group by suit (the left bower moves in with trump once trump is set),
      // trump first, strongest cards first
      const suitOf = (c) => trump ? C.effectiveSuit(c, trump) : c.suit;
      const order = (s) => (trump && s === trump) ? -1 : C.SUITS.indexOf(s);
      const str = (c) => trump ? C.cardStrength(c, trump, suitOf(c)) : C.RANKS.indexOf(c.rank);
      h.sort((a, b) => suitOf(a) === suitOf(b) ? str(b) - str(a) : order(suitOf(a)) - order(suitOf(b)));
    }

    // ---- Bidding ----
    function orderUp(seat, suit, alone) {
      if (closed) return;
      trump = suit; maker = seat;
      // round 1: the dealer picks up the turned card and discards one
      if (phase === 'bid1') {
        hands[dealer].push(kitty);
        if (dealer === 0) {
          phase = 'discard';
          sortHand(hands[0]);
          msg = `${SEAT_NAMES[seat]} called ${suit}. You picked up the ${kitty.rank}${kitty.suit} — tap a card to discard.`;
          rebuild();
          return;
        }
        discardWorst(dealer, trump);
      }
      startPlay(`${SEAT_NAMES[seat]} called ${suit} as trump!`);
    }

    function humanDiscard(card) {
      if (closed || phase !== 'discard') return;
      hands[0] = hands[0].filter(c => c.id !== card.id);
      startPlay(`You discarded the ${card.rank}${card.suit}. ${trump} is trump.`);
    }

    function startPlay(message) {
      phase = 'play';
      leader = (dealer + 1) % 4;
      turn = leader;
      currentTrick = [];
      sortHand(hands[0]);
      msg = message;
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
      if (closed) return;
      if (phase === 'bid1') {
        if (seat === dealer) { phase = 'bid2'; turn = (dealer + 1) % 4; msg = 'All passed. Name a different suit or pass.'; }
        else turn = (turn + 1) % 4;
      } else { // bid2
        if (seat === dealer) { // everyone passed twice -> redeal (misdeal)
          msg = 'Everyone passed. Redealing…';
          rebuild();
          dealer = (dealer + 1) % 4;
          later(dealHand, 700);
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
      later(() => {
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
      }, 600);
    }

    // ---- Trick play ----
    function playCard(seat, card) {
      if (closed || resolving || phase !== 'play' || seat !== turn) return;
      const idx = hands[seat].findIndex(c => c.id === card.id);
      if (idx < 0) return;
      hands[seat].splice(idx, 1);
      currentTrick.push({ seat, card });
      if (currentTrick.length === 4) {
        const w = C.trickWinner(currentTrick, trump);
        tricksWon[w]++;
        msg = `${SEAT_NAMES[w]} wins the trick.`;
        resolving = true;          // freeze input while everyone sees the trick
        rebuild();
        later(() => {
          resolving = false;
          currentTrick = [];
          leader = w; turn = w;
          if (hands[0].length === 0) { scoreHand(); }
          else { rebuild(); maybeAiPlay(); }
        }, 1000);
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
      later(() => {
        const card = C.aiChooseCard(hands[seat], currentTrick, trump);
        playCard(seat, card);
      }, 650);
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
      if (closed || phase !== 'handDone') return;
      if (handsPlayed >= HANDS_PER_GAME) { finishMatch(); return; }
      dealer = (dealer + 1) % 4;
      dealHand();
    }

    // convert your team's points into winnings vs the buy-in
    function finishMatch() {
      if (closed) return;
      closed = true;               // pay out exactly once
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
      const isTurn = !resolving && (phase === 'play' || phase === 'bid1' || phase === 'bid2' || (phase === 'discard' && seat === 0)) && turn === seat;
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
      const myTurn = phase === 'play' && turn === 0 && !resolving;
      const legal = myTurn ? C.legalPlays(hands[0], yourLed, trump) : [];
      const legalIds = new Set(legal.map(c => c.id));
      const handRow = el('div', { class: 'eu-hand' }, hands[0].map(card => {
        if (phase === 'discard') return cardBtn(card, { playable: true, onclick: () => humanDiscard(card) });
        const playable = myTurn && legalIds.has(card.id);
        return cardBtn(card, {
          playable,
          dim: myTurn && !legalIds.has(card.id),
          onclick: playable ? () => playCard(0, card) : null,
        });
      }));
      if (myTurn) ctrl.appendChild(el('p', { class: 'muted center' }, legal.length < hands[0].length ? 'Your turn — you must follow suit (raised cards).' : 'Your turn — tap a card to play it.'));
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
      if (closed) return;
      UI.modal({
        title: 'Leave the game?',
        bodyNodes: [ Mama.speech("Leaving now forfeits this match's stake, sweetie. Sure?", 'stern') ],
        buttons: [
          { label: 'Keep playing', class: 'gold' },
          { label: 'Forfeit & leave', class: 'wood', onClick: (c) => { c(); if (closed) return; closed = true; const res = Engine.settleGame(run, 0); onEarn(res, { title: 'You left the table', detail: 'No winnings this match.' }); } },
        ],
      });
    }

    dealHand();
    return wrap;
  }

  window.Euchre = { render };
})();
