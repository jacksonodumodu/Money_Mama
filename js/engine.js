/* =========================================================
   Money Mama — money engine
   The heart of the game: cash, investments (compound interest),
   tempting debt (compounds against you), a weekly paycheck,
   game buy-ins, week ticks, tiers, and checkpoint saves.

   The core lesson lives in the numbers:
   - Playing games costs a buy-in and can LOSE money on a bad run.
   - Skilled play is net-positive on average, but swingy.
   - Every week you also collect a steady PAYCHECK.
   - So the reliable path is: collect income, pay down debt, and let
     savings compound — gambling to get ahead is the risky temptation.
========================================================= */
(function () {
  const SAVE_KEY = 'moneymama_save_v2';

  // ---- Difficulty tiers -------------------------------------------------
  const TIERS = [
    {
      id: 1,
      name: 'Starter',
      goal: 1000,
      startCash: 80,
      income: 40,         // paycheck collected each week
      buyIn: 20,          // cost to play one game
      investRate: 0.08,   // 8%/week savings growth — compounding felt fast
      debtRate: 0.10,     // 10%/week debt growth
      checkpoints: [250, 500, 1000],
      blurb: 'Reach $1,000. Winnable in one sitting — learn how money grows!',
    },
    {
      id: 2,
      name: 'Homeowner',
      goal: 10000,
      startCash: 300,
      income: 250,
      buyIn: 150,
      investRate: 0.05,
      debtRate: 0.12,
      checkpoints: [2500, 5000, 10000],
      blurb: 'Reach $10,000. Bigger buy-ins — patience and compounding win.',
    },
    {
      id: 3,
      name: 'Investor',
      goal: 100000,
      startCash: 800,
      income: 1500,
      buyIn: 1200,
      investRate: 0.04,
      debtRate: 0.15,
      checkpoints: [25000, 50000, 100000],
      blurb: 'Reach $100,000. Big stakes. Steady income + investing is the way.',
    },
  ];

  function tierById(id) { return TIERS.find(t => t.id === id) || TIERS[0]; }

  function freshRun(tierId) {
    const t = tierById(tierId);
    return {
      tierId: t.id,
      cash: t.startCash,
      invested: 0,
      debt: 0,
      week: 0,
      lastCheckpoint: 0,
      checkpointHit: [],
      history: [t.startCash],
      won: false,
    };
  }

  function defaultSave() {
    return { highestTierUnlocked: 1, run: freshRun(1), totalWins: 0 };
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return defaultSave();
      const s = JSON.parse(raw);
      return Object.assign(defaultSave(), s);
    } catch (e) { return defaultSave(); }
  }
  function save(state) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  // ---- Core money math --------------------------------------------------
  function netWorth(run) { return Math.round(run.cash + run.invested - run.debt); }

  // Advance one "week": pay the paycheck, grow investments, grow debt.
  // invested/debt kept fractional so compounding is exact even when small.
  function tickWeek(run, opts) {
    opts = opts || {};
    const t = tierById(run.tierId);
    const income = opts.income === false ? 0 : t.income;
    const investGain = run.invested * t.investRate;
    const debtGrowth = run.debt * t.debtRate;
    run.cash += income;
    run.invested += investGain;
    run.debt += debtGrowth;
    run.week += 1;
    run.history.push(netWorth(run));
    if (run.history.length > 80) run.history.shift();
    return { income, investGain: Math.round(investGain), debtGrowth: Math.round(debtGrowth), week: run.week };
  }

  // ---- Playing a game ---------------------------------------------------
  // Pay the buy-in up front. Must have enough cash.
  function canAfford(run, amount) { return run.cash >= amount; }
  function payBuyIn(run) {
    const t = tierById(run.tierId);
    if (run.cash < t.buyIn) return false;
    run.cash -= t.buyIn;
    return true;
  }

  // Settle a game: the game reports its gross winnings (>= 0). Net vs the
  // buy-in already spent is computed for messaging. Then a week ticks
  // (paycheck + compounding), so playing always advances time.
  function settleGame(run, grossWinnings) {
    const t = tierById(run.tierId);
    grossWinnings = Math.max(0, Math.round(grossWinnings));
    run.cash += grossWinnings;
    const net = grossWinnings - t.buyIn;   // how the round did vs the buy-in
    const tick = tickWeek(run);
    const cp = checkAndBankCheckpoint(run);
    const status = checkWinLose(run);
    return { gross: grossWinnings, buyIn: t.buyIn, net, tick, checkpoint: cp, status };
  }

  // Skip a week without playing: just collect paycheck + compounding.
  // Often the SMART move — no buy-in risk, debt still needs managing.
  function skipWeek(run) {
    const tick = tickWeek(run);
    const cp = checkAndBankCheckpoint(run);
    const status = checkWinLose(run);
    return { tick, checkpoint: cp, status };
  }

  // ---- Bank actions -----------------------------------------------------
  function invest(run, amount) {
    amount = Math.min(run.cash, Math.max(0, Math.round(amount)));
    run.cash -= amount; run.invested += amount; return amount;
  }
  function withdraw(run, amount) {
    amount = Math.min(run.invested, Math.max(0, Math.round(amount)));
    run.invested -= amount; run.cash += amount; return amount;
  }
  function borrow(run, amount) {
    amount = Math.max(0, Math.round(amount));
    run.cash += amount; run.debt += amount; return amount;
  }
  // Flexible partial repayment — pay any amount up to what you owe / have.
  function repay(run, amount) {
    amount = Math.min(run.cash, run.debt, Math.max(0, Math.round(amount)));
    run.cash -= amount; run.debt -= amount; return amount;
  }

  // ---- Projections ------------------------------------------------------
  function projectInvest(principal, rate, weeks) {
    const pts = [principal]; let v = principal;
    for (let i = 0; i < weeks; i++) { v = v + v * rate; pts.push(Math.round(v)); }
    return pts;
  }
  function projectDebt(balance, rate, weeks) {
    const pts = [balance]; let v = balance;
    for (let i = 0; i < weeks; i++) { v = v + v * rate; pts.push(Math.round(v)); }
    return pts;
  }

  // ---- Checkpoints & win/lose ------------------------------------------
  function checkAndBankCheckpoint(run) {
    const t = tierById(run.tierId);
    const nw = netWorth(run);
    let newlyHit = null;
    for (const cp of t.checkpoints) {
      if (nw >= cp && !run.checkpointHit.includes(cp)) {
        run.checkpointHit.push(cp);
        run.lastCheckpoint = cp;
        newlyHit = cp;
      }
    }
    return newlyHit;
  }

  function checkWinLose(run) {
    const t = tierById(run.tierId);
    const nw = netWorth(run);
    if (nw >= t.goal) { run.won = true; return 'won'; }
    // Wiped: deep in debt, and can't even afford a buy-in to try to earn out.
    if (nw < 0 && run.cash < t.buyIn && run.invested < 10) return 'wiped';
    return 'playing';
  }

  function restoreCheckpoint(run) {
    const t = tierById(run.tierId);
    const base = run.lastCheckpoint > 0 ? run.lastCheckpoint : t.startCash;
    run.cash = base; run.invested = 0; run.debt = 0;
    run.history.push(netWorth(run));
    return base;
  }

  function startTier(state, tierId) { state.run = freshRun(tierId); return state.run; }
  function completeTier(state) {
    state.totalWins += 1;
    const next = Math.min(3, state.run.tierId + 1);
    state.highestTierUnlocked = Math.max(state.highestTierUnlocked, next);
  }

  // ---- expose -----------------------------------------------------------
  window.Engine = {
    TIERS, tierById,
    load, save, defaultSave, freshRun,
    netWorth, tickWeek, skipWeek,
    canAfford, payBuyIn, settleGame,
    invest, withdraw, borrow, repay,
    projectInvest, projectDebt,
    checkWinLose, restoreCheckpoint, checkAndBankCheckpoint,
    startTier, completeTier,
    fmt: (n) => '$' + Math.round(n).toLocaleString('en-US'),
  };
})();
