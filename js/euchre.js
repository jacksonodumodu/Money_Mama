/* =========================================================
   Money Mama — Euchre (4-player, partnerships)
   Standard rules:
   - 24-card deck: 9,10,J,Q,K,A in four suits.
   - Seats: 0=You (South), 1=West, 2=Partner (North), 3=East.
     You + Partner (0 & 2) vs West + East (1 & 3).
   - Deal 5 each; top card of the kitty is turned up.
   - Bidding round 1: each player may "order up" the turned suit
     (dealer picks it up) or pass.
   - Bidding round 2: if all pass, players may name a different suit
     as trump, or pass. (Simplified: no stick-the-dealer.)
   - Right bower = Jack of trump (highest). Left bower = Jack of the
     same color (second highest, counts AS trump).
   - Must follow the led suit if able (left bower counts as trump, not
     its printed suit).
   - Maker's team needs 3+ tricks. 3-4 tricks = 1 pt; all 5 = 2 pts;
     if maker's team fails (euchred) = 2 pts to the other team.
   - Play to a target; here we play a set number of hands and convert
     the player's team points into winnings.

   AI is heuristic but follows all legality rules.
========================================================= */
(function () {
  const SUITS = ['♠','♥','♦','♣'];
  const RANKS = ['9','10','J','Q','K','A'];
  const SAME_COLOR = { '♠':'♣', '♣':'♠', '♥':'♦', '♦':'♥' };

  function makeDeck() {
    const d = []; let id = 0;
    for (const s of SUITS) for (const r of RANKS) d.push({ id: id++, suit: s, rank: r });
    return d;
  }
  function shuffle(d) {
    for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [d[i],d[j]]=[d[j],d[i]]; }
    return d;
  }

  // Effective suit of a card given trump (left bower plays as trump).
  function effectiveSuit(card, trump) {
    if (card.rank === 'J' && card.suit === SAME_COLOR[trump]) return trump; // left bower
    return card.suit;
  }
  function isTrump(card, trump) { return effectiveSuit(card, trump) === trump; }

  // Rank a card's strength for winning a trick, given trump and the led suit.
  // Higher = stronger. Trump beats non-trump; within trump, bowers rank top.
  function cardStrength(card, trump, ledSuit) {
    const es = effectiveSuit(card, trump);
    if (es === trump) {
      if (card.rank === 'J' && card.suit === trump) return 100;             // right bower
      if (card.rank === 'J' && card.suit === SAME_COLOR[trump]) return 99;   // left bower
      return 50 + RANKS.indexOf(card.rank);                                  // other trump
    }
    if (es === ledSuit) return 10 + RANKS.indexOf(card.rank);                // following suit
    return RANKS.indexOf(card.rank);                                         // off-suit (can't win)
  }

  // Which card wins a completed trick (array of {seat, card}); trump + led.
  function trickWinner(plays, trump) {
    const ledSuit = effectiveSuit(plays[0].card, trump);
    let best = plays[0];
    let bestStr = cardStrength(plays[0].card, trump, ledSuit);
    for (let i = 1; i < plays.length; i++) {
      const s = cardStrength(plays[i].card, trump, ledSuit);
      if (s > bestStr) { bestStr = s; best = plays[i]; }
    }
    return best.seat;
  }

  // Legal plays: must follow led suit (effective) if you have it.
  function legalPlays(hand, ledCard, trump) {
    if (!ledCard) return hand.slice();
    const ledSuit = effectiveSuit(ledCard, trump);
    const canFollow = hand.filter(c => effectiveSuit(c, trump) === ledSuit);
    return canFollow.length ? canFollow : hand.slice();
  }

  // ---- AI helpers -------------------------------------------------------
  // Rough hand strength for bidding: count trump + bowers + off-aces.
  function handStrength(hand, trump) {
    let s = 0;
    for (const c of hand) {
      if (c.rank === 'J' && c.suit === trump) s += 4;
      else if (c.rank === 'J' && c.suit === SAME_COLOR[trump]) s += 3;
      else if (isTrump(c, trump)) s += 1.5;
      else if (c.rank === 'A') s += 1;
    }
    return s;
  }

  // AI picks a card to play (legal), simple heuristic.
  function aiChooseCard(hand, currentTrick, trump) {
    const ledCard = currentTrick.length ? currentTrick[0].card : null;
    const legal = legalPlays(hand, ledCard, trump);
    if (legal.length === 1) return legal[0];
    // if we can win the trick, play the lowest winning card; else dump lowest
    if (ledCard) {
      const ledSuit = effectiveSuit(ledCard, trump);
      let bestSoFar = -1;
      for (const p of currentTrick) bestSoFar = Math.max(bestSoFar, cardStrength(p.card, trump, ledSuit));
      const winners = legal.filter(c => cardStrength(c, trump, ledSuit) > bestSoFar)
                           .sort((a,b) => cardStrength(a,trump,ledSuit) - cardStrength(b,trump,ledSuit));
      if (winners.length) return winners[0];
      // can't win: throw lowest
      return legal.slice().sort((a,b)=>cardStrength(a,trump,'')-cardStrength(b,trump,''))[0];
    }
    // leading: lead a high trump if strong, else an off-suit ace, else highest
    const trumps = legal.filter(c => isTrump(c, trump)).sort((a,b)=>cardStrength(b,trump,trump)-cardStrength(a,trump,trump));
    const aces = legal.filter(c => c.rank === 'A' && !isTrump(c, trump));
    if (trumps.length >= 2) return trumps[0];
    if (aces.length) return aces[0];
    return legal.slice().sort((a,b)=>RANKS.indexOf(b.rank)-RANKS.indexOf(a.rank))[0];
  }

  window.EuchreCore = {
    SUITS, RANKS, SAME_COLOR, makeDeck, shuffle,
    effectiveSuit, isTrump, cardStrength, trickWinner, legalPlays,
    handStrength, aiChooseCard,
  };
})();
