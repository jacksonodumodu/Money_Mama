/* =========================================================
   Money Mama — money engine
   The heart of the game: cash, investments (compound interest),
   tempting debt (compounds against you), week ticks, tiers,
   and checkpoint saves.
========================================================= */
(function () {
  const SAVE_KEY = 'moneygrove_save_v1';

  // ---- Difficulty tiers -------------------------------------------------
  // Each tier has a goal, a starting cash buffer, per-week interest rates,
  // and checkpoints (milestones that save progress so a wipeout only
  // rolls back to the last checkpoint, never to zero).
  const TIERS = [
    {
      id: 1,
      name: 'Sprout',
      goal: 1000,
      startCash: 50,
      investRate: 0.08,   // 8% per week — generous so compounding is felt fast
      debtRate: 0.10,     // 10% per week on debt
      checkpoints: [250, 500, 1000],
      blurb: 'Reach $1,000. Winnable in one sitting — learn how money grows!',
    },
    {
      id: 2,
      name: 'Sapling',
      goal: 10000,
      startCash: 200,
      investRate: 0.05,
      debtRate: 0.12,
      checkpoints: [2500, 5000, 10000],
      blurb: 'Reach $10,000. Now you must let compounding work and dodge debt.',
    },
    {
      id: 3,
      name: 'Mighty Oak',
      goal: 100000,
      startCash: 500,
      investRate: 0.04,
      debtRate: 0.15,
      checkpoints: [25000, 50000, 100000],
      blurb: 'Reach $100,000. Patience, skill, and no debt spirals. The real test.',
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
      lastCheckpoint: 0,        // dollars of net worth banked at last checkpoint
      checkpointHit: [],        // which checkpoint values have been reached
      history: [t.startCash],   // net worth over weeks (for charts)
      won: false,
    };
  }

  function defaultSave() {
    return {
      highestTierUnlocked: 1,
      run: freshRun(1),
      totalWins: 0,
    };
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
  function netWorth(run) {
    return Math.round(run.cash + run.invested - run.debt);
  }

  // Advance one "week": investments grow by investRate, debt grows by debtRate.
  // We keep invested/debt as true fractional values so compounding is
  // mathematically correct (and visibly accelerates) even on small balances;
  // only display is rounded. Returns a summary so the UI can narrate it.
  function tickWeek(run) {
    const t = tierById(run.tierId);
    const investGain = run.invested * t.investRate;
    const debtGrowth = run.debt * t.debtRate;
    run.invested += investGain;
    run.debt += debtGrowth;
    run.week += 1;
    run.history.push(netWorth(run));
    if (run.history.length > 60) run.history.shift();
    return { investGain: Math.round(investGain), debtGrowth: Math.round(debtGrowth), week: run.week };
  }

  // Earn cash from playing a game. Each game played also advances a week,
  // so compounding (good or bad) happens as she plays.
  function earn(run, amount) {
    run.cash += Math.max(0, Math.round(amount));
    const tick = tickWeek(run);
    const cp = checkAndBankCheckpoint(run);
    const status = checkWinLose(run);
    return { earned: Math.round(amount), tick, checkpoint: cp, status };
  }

  // Move cash into investments (compounds FOR you).
  function invest(run, amount) {
    amount = Math.min(run.cash, Math.max(0, Math.round(amount)));
    run.cash -= amount;
    run.invested += amount;
    return amount;
  }
  function withdraw(run, amount) {
    amount = Math.min(run.invested, Math.max(0, Math.round(amount)));
    run.invested -= amount;
    run.cash += amount;
    return amount;
  }

  // Take a loan — TEMPTING: instant cash now, but it compounds AGAINST you.
  function borrow(run, amount) {
    amount = Math.max(0, Math.round(amount));
    run.cash += amount;
    run.debt += amount;
    return amount;
  }
  function repay(run, amount) {
    amount = Math.min(run.cash, run.debt, Math.max(0, Math.round(amount)));
    run.cash -= amount;
    run.debt -= amount;
    return amount;
  }

  // Project compound growth n weeks ahead (for the "watch it grow" preview).
  function projectInvest(principal, rate, weeks) {
    const pts = [principal];
    let v = principal;
    for (let i = 0; i < weeks; i++) { v = v + v * rate; pts.push(Math.round(v)); }
    return pts;
  }
  function projectDebt(balance, rate, weeks) {
    const pts = [balance];
    let v = balance;
    for (let i = 0; i < weeks; i++) { v = v + v * rate; pts.push(Math.round(v)); }
    return pts;
  }

  // ---- Checkpoints & win/lose ------------------------------------------
  // When net worth crosses a checkpoint, bank it. A wipeout restores cash
  // to the last banked checkpoint value (encouraging, never back to zero).
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

  // Lose condition: debt has swallowed you — net worth is deeply negative
  // and you have no cash to play out of it.
  function checkWinLose(run) {
    const t = tierById(run.tierId);
    const nw = netWorth(run);
    if (nw >= t.goal) { run.won = true; return 'won'; }
    // Debt spiral: you owe far more than you have and can't buy your way out.
    if (nw < 0 && run.cash < 10 && run.invested < 10) return 'wiped';
    return 'playing';
  }

  // Restore to last checkpoint after a wipeout.
  function restoreCheckpoint(run) {
    const t = tierById(run.tierId);
    const base = run.lastCheckpoint > 0 ? run.lastCheckpoint : t.startCash;
    run.cash = base;
    run.invested = 0;
    run.debt = 0;
    run.history.push(netWorth(run));
    return base;
  }

  function startTier(state, tierId) {
    state.run = freshRun(tierId);
    return state.run;
  }

  function completeTier(state) {
    state.totalWins += 1;
    const next = Math.min(3, state.run.tierId + 1);
    state.highestTierUnlocked = Math.max(state.highestTierUnlocked, next);
  }

  // ---- expose -----------------------------------------------------------
  window.Engine = {
    TIERS, tierById,
    load, save, defaultSave, freshRun,
    netWorth, tickWeek, earn,
    invest, withdraw, borrow, repay,
    projectInvest, projectDebt,
    checkWinLose, restoreCheckpoint, checkAndBankCheckpoint,
    startTier, completeTier,
    fmt: (n) => '$' + Math.round(n).toLocaleString('en-US'),
  };
})();
