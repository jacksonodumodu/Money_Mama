/* =========================================================
   Money Mama — app controller
   Hub screen, navigation, tiers, checkpoints, win/lose flow.
   Mama is the bank owner who holds savings & gives loans.
========================================================= */
(function () {
  const { el, mount, modal } = UI;
  const fmt = Engine.fmt;

  let state = Engine.load();

  function saveAll() { Engine.save(state); }

  function topbar() {
    const run = state.run;
    return el('div', { class: 'topbar' }, [
      el('div', { class: 'brand' }, ['👩🏽‍🌾 Money Mama']),
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

    const content = el('div', { class: 'content' }, [
      el('div', { class: 'hero' }, [
        el('div', { class: 'goal-card' }, [
          el('div', { class: 'goal-title' }, `${t.name} Tier — Goal`),
          el('div', { class: 'goal-amount' }, fmt(t.goal)),
          el('div', { class: 'muted', style:{color:'var(--cream-2)'} }, `Net worth: ${fmt(nw)}`),
          el('div', { class: 'progress-track' }, el('div', { class: 'progress-fill', style: { width: pct + '%' } })),
          el('div', { class: 'checkpoints' }, t.checkpoints.map(cp =>
            el('span', { style: { color: run.checkpointHit.includes(cp) ? 'var(--sun)' : 'var(--moss)' } },
              (run.checkpointHit.includes(cp) ? '✓ ' : '') + fmt(cp)))),
        ]),
      ]),

      el('div', { class: 'game-grid' }, [
        gameTile('tile-solitaire', '🃏', 'Solitaire', 'Earn cash', () => go('solitaire')),
        gameTile('tile-bejeweled', '💎', 'Grove Gems', 'Earn cash', () => go('bejeweled')),
        gameTile('tile-bank', '🏦', "Mama's Bank", 'Save / Loans', () => go('bank')),
        gameTile('tile-solitaire', '🫧', 'Bubble Pop', 'Coming soon', null, true),
      ]),

      el('div', { class: 'panel mama-panel', style: { marginTop: '14px' } }, [
        el('h2', null, 'How to win 🌱'),
        Mama.speech("Play the games to earn cash, baby. Every game is one week gone by. Bring your money to me and I'll grow it with compound interest — or borrow if you must, and watch that debt chase you. Reach the goal and you win!", 'happy'),
        run.debt > 0 ? el('p', { class:'warn' }, `⚠️ You owe Mama ${fmt(run.debt)} and it grows every week. Pay it down!`) : null,
      ]),

      el('button', { class: 'btn ghost', onclick: chooseTier }, 'Change difficulty / restart tier'),
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

  // ---- navigation -------------------------------------------------------
  function go(where) {
    if (where === 'solitaire') {
      mount(screen([ Solitaire.render(state.run, renderHub, onGameEnd) ]));
    } else if (where === 'bejeweled') {
      mount(screen([ Bejeweled.render(state.run, renderHub, onGameEnd) ]));
    } else if (where === 'bank') {
      mount(screen([ Bank.render(state.run, renderHub, () => { saveAll(); afterBank(); }) ]));
    }
  }

  // recheck win/lose after bank actions (borrowing can't lose immediately, but keep consistent)
  function afterBank() {
    const status = Engine.checkWinLose(state.run);
    if (status === 'won') return handleWin();
    saveAll();
  }

  // ---- game finished: earn cash, tick week, handle results --------------
  function onGameEnd(result, summary) {
    saveAll();
    const run = state.run;
    const parts = [];
    parts.push(el('p', null, summary.detail));
    parts.push(el('p', { class: 'good' }, `Earned ${fmt(result.earned)}!`));
    if (result.tick.investGain > 0) parts.push(el('p', { class: 'good' }, `📈 Your investments grew ${fmt(result.tick.investGain)} this week.`));
    if (result.tick.debtGrowth > 0) parts.push(el('p', { class: 'warn' }, `💳 Your debt grew ${fmt(result.tick.debtGrowth)} this week!`));
    if (result.checkpoint) parts.push(el('p', { style:{color:'var(--sun-deep)', fontWeight:'800'} }, `🚩 Checkpoint reached: ${fmt(result.checkpoint)} — progress saved!`));

    if (result.status === 'won') { modalWinLater(summary, parts); return; }
    if (result.status === 'wiped') { handleWipe(); return; }

    modal({
      emoji: summary.emoji, title: summary.title,
      bodyNodes: parts,
      buttons: [
        { label: 'Invest my cash 📈', class: 'gold', onClick: (c) => { c(); go('bank'); } },
        { label: 'Back to games', class: 'wood', onClick: (c) => { c(); renderHub(); } },
      ],
    });
  }

  function modalWinLater(summary, parts) {
    // show earnings, then the win
    modal({
      emoji: summary.emoji, title: summary.title,
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
      emoji: '🏆', title: `${t.name} Tier Complete!`,
      bodyNodes: [
        Mama.speech(`You reached ${fmt(t.goal)} in ${run.week} weeks! You let compound interest do the heavy lifting. Mama is SO proud of you. 🥰`, 'proud'),
        nextUnlocked ? el('p', { class:'good' }, 'A tougher tier is now unlocked. 🌳') : el('p', { class:'good' }, 'You beat every tier — a true Money Mama master! 🌲🏆'),
      ],
      buttons: nextUnlocked
        ? [
            { label: 'Next tier →', class: 'gold', onClick: (c) => { c(); Engine.startTier(state, run.tierId + 1); saveAll(); renderHub(); } },
            { label: 'Replay this tier', class: 'wood', onClick: (c) => { c(); Engine.startTier(state, run.tierId); saveAll(); renderHub(); } },
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
        Mama.speech("Oh honey… that loan grew faster than you could pay it. That's exactly how debt traps folks in real life — I warned you, but Mama's not mad.", 'worried'),
        el('p', null, `I've set you back on your feet at your last checkpoint with ${fmt(restored)}. This time, save early and steer clear of my loan window, okay?`),
      ],
      buttons: [ { label: "Okay, Mama 🌱", class: 'gold', onClick: (c) => { c(); renderHub(); } } ],
    });
  }

  // ---- tier chooser -----------------------------------------------------
  function chooseTier() {
    const boxes = Engine.TIERS.map(t => {
      const unlocked = state.highestTierUnlocked >= t.id;
      return el('div', { class: 'panel', style: { opacity: unlocked ? '1' : '0.5' } }, [
        el('h2', null, `${unlocked ? '' : '🔒 '}${t.name} — Goal ${fmt(t.goal)}`),
        el('p', null, t.blurb),
        el('p', { class:'muted' }, `Start with ${fmt(t.startCash)} · invest ${(t.investRate*100).toFixed(0)}%/wk · debt ${(t.debtRate*100).toFixed(0)}%/wk`),
        unlocked ? el('button', { class:'btn', onclick: () => {
          Engine.startTier(state, t.id); saveAll(); renderHub();
        }}, 'Start this tier') : null,
      ]);
    });
    const content = el('div', { class: 'content' }, [
      el('div', { class:'panel' }, [ el('h2', null, 'Choose your challenge'), el('p', null, 'Each tier is harder and takes longer. Beat one to unlock the next.') ]),
      ...boxes,
      el('button', { class:'btn wood', onclick: renderHub }, '← Back'),
      el('div', { class:'spacer' }),
    ]);
    mount(screen([content]));
  }

  // ---- boot -------------------------------------------------------------
  // Show a short welcome the very first time.
  if (state.run.week === 0 && state.totalWins === 0 && state.run.cash === Engine.tierById(state.run.tierId).startCash) {
    renderHub();
    modal({
      emoji: '👩🏽‍🌾', title: 'Welcome to Money Mama!',
      bodyNodes: [
        Mama.speech("Hi sweetheart, I'm Mama — I run the bank around here. Play your favorite games to earn cash, then bring it to me and I'll grow it. Need a loan? I've got those too… but be smart now.", 'happy'),
        el('p', null, `You start with ${fmt(state.run.cash)}. First goal: reach ${fmt(Engine.tierById(state.run.tierId).goal)}!`),
      ],
      buttons: [ { label: "Let's do it, Mama! 🌱", class: 'gold' } ],
    });
  } else {
    renderHub();
  }
})();
