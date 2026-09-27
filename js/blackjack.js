/* =========================================================
   Money Mama — Blackjack
   Classic rules: hit / stand / double. Dealer draws to 17
   (stands on all 17). Blackjack pays 3:2. Bust = lose.

   Money: the table buy-in pays for your FIRST hand. Every extra
   hand costs another bet straight from your cash, and doubling
   down puts up a second bet. Winnings land in your cash the moment
   a hand ends, so the balance at the top is always real. Leaving
   the table ends the session (one week passes).
========================================================= */
(function () {
  const { el } = UI;
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RED = new Set(['♥', '♦']);
  const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];

  function color(s) { return RED.has(s) ? 'red' : 'black'; }

  function makeShoe() {
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
      else if (['K', 'Q', 'J', '10'].includes(c.rank)) total += 10;
      else total += parseInt(c.rank, 10);
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return { total, soft: aces > 0 };
  }
  function isBlackjack(cards) { return cards.length === 2 && handValue(cards).total === 21; }

  // How much a finished hand returns to you, for a hand bet of `bet`.
  // (Blackjack only happens on an undoubled 2-card hand.)
  function handReturn(player, dealer, bet) {
    const pv = handValue(player).total, dv = handValue(dealer).total;
    const pBJ = isBlackjack(player), dBJ = isBlackjack(dealer);
    if (pBJ && dBJ) return { outcome: 'push', back: bet };
    if (pBJ) return { outcome: 'blackjack', back: Math.round(bet * 2.5) };
    if (dBJ) return { outcome: 'lose', back: 0 };
    if (pv > 21) return { outcome: 'lose', back: 0 };
    if (dv > 21 || pv > dv) return { outcome: 'win', back: bet * 2 };
    if (pv < dv) return { outcome: 'lose', back: 0 };
    return { outcome: 'push', back: bet };
  }

  function render(run, onExit, onEarn) {
    const t = Engine.tierById(run.tierId);
    const BET = t.buyIn;
    const reduce = UI.reduceMotion();
    let shoe = makeShoe();
    const draw = () => { if (shoe.length < 15) shoe = makeShoe(); return shoe.pop(); };

    let wagered = BET;        // the buy-in already paid covers hand #1
    let returned = 0;
    let handsPlayed = 0;
    let player = [], dealer = [];
    let handBet = BET;
    let phase = 'player';     // player | dealer | done
    let outcome = null, lastBack = 0;
    let closed = false;       // session over: ignore any late timers/taps
    const seen = new Set();   // card ids already on screen (only new cards animate)

    const wrap = el('div', null);

    function dealHand() {
      player = [draw(), draw()];
      dealer = [draw(), draw()];
      handBet = BET;
      outcome = null;
      phase = 'player';
      if (isBlackjack(player) || isBlackjack(dealer)) { endHand(); return; }
      rebuild();
    }

    function nextHand() {
      if (closed || phase !== 'done') return;
      if (!Engine.placeBet(run, BET)) { rebuild(); return; }   // can't afford it
      wagered += BET;
      UI.moneyChanged();
      dealHand();
    }

    function hit() {
      if (closed || phase !== 'player') return;
      player.push(draw());
      if (handValue(player).total >= 21) { handValue(player).total > 21 ? endHand() : dealerPlay(); return; }
      rebuild();
    }
    function stand() { if (!closed && phase === 'player') dealerPlay(); }
    function double() {
      if (closed || phase !== 'player' || player.length !== 2) return;
      if (!Engine.placeBet(run, BET)) return;                 // needs a second bet
      wagered += BET;
      handBet = BET * 2;
      UI.moneyChanged();
      player.push(draw());
      if (handValue(player).total > 21) { endHand(); return; }
      dealerPlay();
    }

    function dealerPlay() {
      phase = 'dealer';
      rebuild();
      const step = () => {
        if (closed) return;
        if (handValue(dealer).total < 17) { dealer.push(draw()); rebuild(); setTimeout(step, reduce ? 0 : 550); }
        else endHand();
      };
      setTimeout(step, reduce ? 0 : 550);
    }

    function endHand() {
      if (closed) return;
      const r = handReturn(player, dealer, handBet);
      outcome = r.outcome;
      lastBack = r.back;
      Engine.payOut(run, r.back);
      returned += r.back;
      handsPlayed++;
      phase = 'done';
      UI.moneyChanged();
      rebuild();
    }

    // End the session: one week passes; report the whole table's result.
    function leave() {
      if (closed) return;
      closed = true;
      const res = Engine.closeSession(run, returned, wagered);
      const net = returned - wagered;
      onEarn(res, {
        title: net > 0 ? 'You beat the house!' : net === 0 ? 'Broke even' : 'The house won this time',
        detail: `${handsPlayed} hand${handsPlayed === 1 ? '' : 's'} played. You put in ${Engine.fmt(wagered)} and took back ${Engine.fmt(returned)}.`,
      });
    }

    function cardNode(card, hidden) {
      const isNew = !seen.has(card.id + (hidden ? 'h' : ''));
      seen.add(card.id + (hidden ? 'h' : ''));
      const n = hidden
        ? el('div', { class: 'bj-card back' })
        : el('div', { class: 'bj-card ' + color(card.suit) }, card.rank + card.suit);
      if (isNew && !reduce) n.style.animation = 'dealIn 0.28s ease both';
      return n;
    }

    function rebuild() {
      if (closed) return;
      UI.clear(wrap);
      wrap.appendChild(el('div', { class: 'gamebar' }, [
        el('button', { class: 'back', onclick: confirmExit }, '← Leave table'),
        el('div', { class: 'score' }, `Bet ${Engine.fmt(handBet)} · Cash ${Engine.fmt(run.cash)}`),
      ]));

      const hideHole = phase === 'player';
      wrap.appendChild(el('div', { class: 'bj-board' }, [
        el('div', { class: 'bj-seat' }, [
          el('div', { class: 'bj-label' }, `Dealer${hideHole ? '' : ' — ' + handValue(dealer).total}`),
          el('div', { class: 'bj-cards' }, dealer.map((c, i) => cardNode(c, hideHole && i === 1))),
        ]),
        el('div', { class: 'bj-seat' }, [
          el('div', { class: 'bj-label' }, `You — ${handValue(player).total}${handValue(player).soft && handValue(player).total < 21 ? ' (soft)' : ''}`),
          el('div', { class: 'bj-cards' }, player.map(c => cardNode(c, false))),
        ]),
      ]));

      const controls = el('div', { style: { padding: '4px 10px 12px' } });
      if (phase === 'player') {
        controls.appendChild(el('div', { class: 'row' }, [
          el('button', { class: 'btn', onclick: hit }, 'Hit'),
          el('button', { class: 'btn wood', onclick: stand }, 'Stand'),
        ]));
        if (player.length === 2) {
          const canDouble = run.cash >= BET;
          controls.appendChild(el('div', { style: { marginTop: '8px' } },
            el('button', { class: 'btn gold', disabled: canDouble ? null : '', onclick: double },
              canDouble ? `Double down (bet another ${Engine.fmt(BET)})` : `Double needs ${Engine.fmt(BET)} cash`)));
        }
        controls.appendChild(el('p', { class: 'muted center', style: { marginTop: '8px' } }, 'Get closer to 21 than the dealer — without going over.'));
      } else if (phase === 'done') {
        const good = outcome === 'win' || outcome === 'blackjack';
        const msg = outcome === 'blackjack' ? `Blackjack! You get back ${Engine.fmt(lastBack)} 💰`
                  : outcome === 'win' ? `You win! You get back ${Engine.fmt(lastBack)} 🎉`
                  : outcome === 'push' ? `Push — your ${Engine.fmt(lastBack)} bet comes back.`
                  : `Dealer takes your ${Engine.fmt(handBet)} bet. 😬`;
        controls.appendChild(el('p', { class: (good ? 'good' : outcome === 'push' ? 'muted' : 'warn') + ' center', style: { fontWeight: '800' } }, msg));
        const tableNet = returned - wagered;
        controls.appendChild(Mama.speech(
          tableNet > 0 ? `You're up ${Engine.fmt(tableNet)} at this table, sweetie. Walking away while you're ahead is a real skill.`
          : tableNet === 0 ? "You're even at this table. No harm done."
          : `You're down ${Engine.fmt(-tableNet)} here, hon. Don't chase it — another hand costs another ${Engine.fmt(BET)}.`,
          tableNet > 0 ? 'proud' : tableNet === 0 ? 'happy' : 'worried'));
        const canAfford = run.cash >= BET;
        controls.appendChild(el('div', { class: 'row', style: { marginTop: '8px' } }, [
          el('button', { class: 'btn', disabled: canAfford ? null : '', onclick: nextHand },
            canAfford ? `Deal again (${Engine.fmt(BET)})` : 'Out of cash'),
          el('button', { class: 'btn gold', onclick: leave }, 'Leave table'),
        ]));
        controls.appendChild(el('p', { class: 'muted center', style: { marginTop: '6px' } },
          `This table: put in ${Engine.fmt(wagered)} · took back ${Engine.fmt(returned)}`));
      } else {
        controls.appendChild(el('p', { class: 'muted center' }, 'Dealer is playing…'));
      }
      wrap.appendChild(controls);
    }

    function confirmExit() {
      if (closed) return;
      if (phase === 'done') { leave(); return; }
      UI.modal({
        title: 'Leave the table?',
        bodyNodes: [Mama.speech(`Leaving mid-hand means you give up this hand's ${Engine.fmt(handBet)} bet, dear. Finish the hand first?`, 'stern')],
        buttons: [
          { label: 'Finish the hand', class: 'gold' },
          { label: 'Give up the bet & leave', class: 'wood', onClick: (c) => { c(); leave(); } },
        ],
      });
    }

    dealHand();
    return wrap;
  }

  window.Blackjack = { render, _test: { makeShoe, handValue, isBlackjack, handReturn } };
})();
