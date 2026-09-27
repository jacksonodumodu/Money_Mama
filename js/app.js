/* =========================================================
   Money Mama — app controller
   Hub, navigation, tiers, checkpoints, and the win/lose flow.
   Mama runs the bank: holds savings, gives loans, drops tips.

   New mechanics wired here:
   - Buy-in charged before each game (a game can net-LOSE money).
   - Weekly paycheck collected on every week that passes.
   - "Skip a week" button: collect income + compounding, no buy-in risk.
   - Mama's rotating tips.
========================================================= */
(function () {
  const { el, mount, modal } = UI;
  const fmt = Engine.fmt;

  let state = Engine.load();
  let tipIndex = Mama.randomTipIndex();

  function saveAll() { Engine.save(state); }

  function topbar() {
    const run = state.run;
    return el('div', { class: 'topbar' }, [
      el('div', { class: 'brand' }, [
        el('span', { class: 'brand-face', html: Mama.portrait('happy', 26) }),
        ' Money Mama',
      ]),
      el('div', { class: 'stat-pills' }, [
        el('div', { class: 'pill cash' }, ['💵 ' + fmt(run.cash)]),
        run.debt > 0 ? el('div', { class: 'pill debt' }, ['💳 ' + fmt(run.debt)]) : null,
        el('div', { class: 'pill week' }, ['📅 Wk ' + run.week]),
      ]),
    ]);
  }

  function screen(children) {
    return el('div', { class: 'screen' }, [topbar(), ...children]);
  }

  // ---- HUB --------------------------------------------------------------
  function renderHub() {
    const run = state.run;
    const t = Engine.tierById(run.tierId);
    const nw = Engine.netWorth(run);
    const pct = Math.max(0, Math.min(100, (nw / t.goal) * 100));
    const canPlay = Engine.canAfford(run, t.buyIn);

    const content = el('div', { class: 'content' }, [
      el('div', { class: 'hero' }, [
        el('div', { class: 'goal-card' }, [
          el('div', { class: 'goal-title' }, `${t.name} — Goal`),
          el('div', { class: 'goal-amount' }, fmt(t.goal)),
          el('div', { class: 'muted', style:{color:'var(--cream-2)'} }, `Net worth: ${fmt(nw)}`),
          el('div', { class: 'progress-track' }, el('div', { class: 'progress-fill', style: { width: pct + '%' } })),
          el('div', { class: 'checkpoints' }, t.checkpoints.map(cp =>
            el('span', { style: { color: run.checkpointHit.includes(cp) ? 'var(--sun)' : 'var(--moss)' } },
              (run.checkpointHit.includes(cp) ? '✓ ' : '') + fmt(cp)))),
        ]),
        el('div', { class: 'motif' }, '🍷 ☕ ⚽ 🚗'),
      ]),

      // buy-in + weekly income info
      el('div', { class: 'panel' }, [
        el('div', { class: 'buyin-note center' }, `Each game costs a ${fmt(t.buyIn)} buy-in. Win more than that and you profit — but a cold streak can lose it.`),
        el('div', { class: 'income-note', style:{marginTop:'6px'} }, `💼 Every week you collect a ${fmt(t.income)} paycheck.`),
        el('div', { class: 'week-controls' }, [
          el('button', { class: 'btn wood', onclick: () => doSkipWeek() }, '⏭️ Skip a week (collect pay)'),
        ]),
        el('p', { class:'muted center', style:{marginTop:'6px'} }, 'Tip: when the games look risky, just collect your paycheck and pay down debt.'),
      ]),

      el('div', { class: 'game-grid' }, [
        gameTile('tile-solitaire', '🃏', 'Solitaire', `Buy-in ${fmt(t.buyIn)}`, () => startGame('solitaire'), !canPlay),
        gameTile('tile-bejeweled', '🍷', "Mom's Match", `Buy-in ${fmt(t.buyIn)}`, () => startGame('bejeweled'), !canPlay),
        gameTile('tile-bank', '🏦', "Mama's Bank", 'Save / Loans', () => go('bank')),
        gameTile('tile-solitaire', '🃏', 'Blackjack', 'Coming soon', null, true),
      ]),

      !canPlay ? el('p', { class:'warn center' }, `You need ${fmt(t.buyIn)} to play a game. Skip a week to collect your paycheck!`) : null,

      // Mama's tip of the moment
      el('div', { class: 'panel tips-card' }, [
        el('h2', null, "Mama's Tip"),
        Mama.tip(tipIndex),
        el('button', { class:'btn ghost small', onclick: () => { tipIndex++; renderHub(); } }, 'Another tip →'),
        run.debt > 0 ? el('p', { class:'warn', style:{marginTop:'8px'} }, `⚠️ You owe ${fmt(run.debt)} and it grows every week. Pay it down!`) : null,
      ]),

      el('button', { class: 'btn ghost', onclick: chooseTier }, 'Change difficulty / restart'),
      el('div', { class: 'spacer' }),
    ]);

    mount(screen([content]));
  }

  function gameTile(cls, emoji, name, pay, onClick, locked) {
    return el('button', {
      class: 'game-tile ' + (locked ? 'tile-locked' : cls),
      onclick: locked ? null : onClick,
    }, [
      el('span', { class: 'emoji' }, locked ? '🔒' : emoji),
      el('div', { class: 'name' }, name),
      el('div', { class: 'pay' }, pay),
    ]);
  }

  // ---- skip a week ------------------------------------------------------
  function doSkipWeek() {
    const res = Engine.skipWeek(state.run);
    saveAll();
    const parts = [
      Mama.speech("A quiet week — smart. You collected your paycheck and let things settle.", 'happy'),
      el('p', { class:'good' }, `💼 Paycheck: +${fmt(res.tick.income)}`),
    ];
    if (res.tick.investGain > 0) parts.push(el('p', { class:'good' }, `📈 Savings grew +${fmt(res.tick.investGain)}`));
    if (res.tick.debtGrowth > 0) parts.push(el('p', { class:'warn' }, `💳 Debt grew +${fmt(res.tick.debtGrowth)}`));
    if (res.checkpoint) parts.push(el('p', { style:{color:'var(--sun-deep)', fontWeight:'800'} }, `🚩 Checkpoint: ${fmt(res.checkpoint)} saved!`));

    if (res.status === 'won') return modalWinLater({ title: 'Goal reached!' }, parts);
    if (res.status === 'wiped') return handleWipe();
    modal({
      title: 'Week ' + res.tick.week, bodyNodes: parts,
      buttons: [ { label: 'Continue', class: 'gold', onClick: (c) => { c(); renderHub(); } } ],
    });
  }

  // ---- start a game (charge buy-in first) -------------------------------
  function startGame(which) {
    const run = state.run;
    const t = Engine.tierById(run.tierId);
    if (!Engine.canAfford(run, t.buyIn)) { renderHub(); return; }
    modal({
      title: 'Ready to play?',
      bodyNodes: [
        Mama.speech(`This round costs a ${fmt(t.buyIn)} buy-in, dear. Play well and you'll take home more than that. Only bet what you can afford!`, 'stern'),
      ],
      buttons: [
        { label: `Pay ${fmt(t.buyIn)} & play`, class: 'gold', onClick: (c) => { c(); Engine.payBuyIn(run); saveAll(); go(which); } },
        { label: 'Maybe later', class: 'ghost' },
      ],
    });
  }

  // ---- navigation -------------------------------------------------------
  function go(where) {
    if (where === 'solitaire') mount(screen([ Solitaire.render(state.run, renderHub, onGameEnd) ]));
    else if (where === 'bejeweled') mount(screen([ Bejeweled.render(state.run, renderHub, onGameEnd) ]));
    else if (where === 'bank') mount(screen([ Bank.render(state.run, renderHub, () => { saveAll(); afterBank(); }) ]));
  }

  function afterBank() {
    const status = Engine.checkWinLose(state.run);
    if (status === 'won') return handleWin();
    saveAll();
  }

  // ---- game finished ----------------------------------------------------
  // result comes from Engine.settleGame: { gross, buyIn, net, tick, checkpoint, status }
  function onGameEnd(result, summary) {
    saveAll();
    const won = result.net >= 0;
    const parts = [];
    parts.push(el('p', null, summary.detail));
    // net result vs the buy-in — the key teaching moment
    if (won) {
      parts.push(el('p', { class:'good' }, `🎉 You won ${fmt(result.gross)} on a ${fmt(result.buyIn)} buy-in — up ${fmt(result.net)}!`));
    } else {
      parts.push(el('p', { class:'warn' }, `😬 You won ${fmt(result.gross)} but the buy-in was ${fmt(result.buyIn)} — down ${fmt(-result.net)} this round.`));
    }
    parts.push(el('p', { class:'good' }, `💼 Weekly paycheck: +${fmt(result.tick.income)}`));
    if (result.tick.investGain > 0) parts.push(el('p', { class: 'good' }, `📈 Savings grew +${fmt(result.tick.investGain)}`));
    if (result.tick.debtGrowth > 0) parts.push(el('p', { class: 'warn' }, `💳 Debt grew +${fmt(result.tick.debtGrowth)}`));
    if (result.checkpoint) parts.push(el('p', { style:{color:'var(--sun-deep)', fontWeight:'800'} }, `🚩 Checkpoint: ${fmt(result.checkpoint)} saved!`));

    if (result.status === 'won') { modalWinLater(summary, parts); return; }
    if (result.status === 'wiped') { handleWipe(); return; }

    modal({
      title: won ? summary.title : 'Tough round',
      bodyNodes: [ Mama.speech(won ? "Nice work, sweetie!" : "Cold streak, hon — don't chase it. Collect your paycheck and try again when you're ready.", won ? 'proud' : 'worried'), ...parts ],
      buttons: [
        { label: 'Save with Mama 📈', class: 'gold', onClick: (c) => { c(); go('bank'); } },
        { label: 'Back to games', class: 'wood', onClick: (c) => { c(); renderHub(); } },
      ],
    });
  }

  function modalWinLater(summary, parts) {
    modal({
      title: summary.title || 'Goal reached!',
      bodyNodes: parts,
      buttons: [ { label: 'Continue', class: 'gold', onClick: (c) => { c(); handleWin(); } } ],
    });
  }

  function handleWin() {
    const run = state.run;
    Engine.completeTier(state);
    saveAll();
    const t = Engine.tierById(run.tierId);
    const nextUnlocked = run.tierId < 3;
    modal({
      emoji: '🏆', title: `${t.name} Complete!`,
      bodyNodes: [
        Mama.speech(`You reached ${fmt(t.goal)} in ${run.week} weeks! Steady income and compound interest did the heavy lifting. Mama is SO proud. 🥰`, 'proud'),
        nextUnlocked ? el('p', { class:'good' }, 'A tougher level is now unlocked.') : el('p', { class:'good' }, 'You beat every level — a true Money Mama master! 🏆'),
      ],
      buttons: nextUnlocked
        ? [
            { label: 'Next level →', class: 'gold', onClick: (c) => { c(); Engine.startTier(state, run.tierId + 1); saveAll(); renderHub(); } },
            { label: 'Replay this one', class: 'wood', onClick: (c) => { c(); Engine.startTier(state, run.tierId); saveAll(); renderHub(); } },
          ]
        : [ { label: 'Play again', class: 'gold', onClick: (c) => { c(); Engine.startTier(state, 1); saveAll(); renderHub(); } } ],
    });
  }

  function handleWipe() {
    const run = state.run;
    const restored = Engine.restoreCheckpoint(run);
    saveAll();
    modal({
      emoji: '💸', title: 'The debt caught up with you!',
      bodyNodes: [
        Mama.speech("Oh honey… that loan grew faster than you could pay it. That's exactly how debt traps folks in real life — but Mama's not mad.", 'worried'),
        el('p', null, `I've set you back on your feet at your last checkpoint with ${fmt(restored)}. This time, collect your paycheck, pay down debt, and let savings grow!`),
      ],
      buttons: [ { label: "Okay, Mama", class: 'gold', onClick: (c) => { c(); renderHub(); } } ],
    });
  }

  // ---- tier chooser -----------------------------------------------------
  function chooseTier() {
    const boxes = Engine.TIERS.map(t => {
      const unlocked = state.highestTierUnlocked >= t.id;
      return el('div', { class: 'panel', style: { opacity: unlocked ? '1' : '0.5' } }, [
        el('h2', null, `${unlocked ? '' : '🔒 '}${t.name} — Goal ${fmt(t.goal)}`),
        el('p', null, t.blurb),
        el('p', { class:'muted' }, `Start ${fmt(t.startCash)} · paycheck ${fmt(t.income)}/wk · buy-in ${fmt(t.buyIn)} · save ${(t.investRate*100).toFixed(0)}%/wk · debt ${(t.debtRate*100).toFixed(0)}%/wk`),
        unlocked ? el('button', { class:'btn', onclick: () => { Engine.startTier(state, t.id); saveAll(); renderHub(); } }, 'Start this level') : null,
      ]);
    });
    const content = el('div', { class: 'content' }, [
      el('div', { class:'panel' }, [ el('h2', null, 'Choose your level'), el('p', null, 'Each level is harder and takes longer. Beat one to unlock the next.') ]),
      ...boxes,
      el('button', { class:'btn wood', onclick: renderHub }, '← Back'),
      el('div', { class:'spacer' }),
    ]);
    mount(screen([content]));
  }

  // ---- boot -------------------------------------------------------------
  if (state.run.week === 0 && state.totalWins === 0 && state.run.cash === Engine.tierById(state.run.tierId).startCash) {
    renderHub();
    const t = Engine.tierById(state.run.tierId);
    modal({
      title: 'Welcome to Money Mama!',
      bodyNodes: [
        Mama.speech("Hi sweetheart, I'm Mama — I run the bank around here. Play your favorite games to earn cash, then bring it to me and I'll grow it. Need a loan? I've got those too… but be smart now.", 'happy'),
        el('p', null, `You start with ${fmt(state.run.cash)} and a ${fmt(t.income)} weekly paycheck. First goal: reach ${fmt(t.goal)}!`),
      ],
      buttons: [ { label: "Let's do it, Mama!", class: 'gold' } ],
    });
  } else {
    renderHub();
  }
})();
