/* =========================================================
   Money Mama — Mama's Bank screen.
   Mama holds your savings (compound interest FOR you) and
   reluctantly offers loans (tempting debt that grows AGAINST you).

   Sliders update their numbers/chart IN PLACE while dragging —
   rebuilding the whole screen on every slider move used to destroy
   the slider under your finger.
========================================================= */
(function () {
  const { el, lineChart } = UI;

  function render(run, onBack, onChange) {
    const t = Engine.tierById(run.tierId);
    const fmt = Engine.fmt;
    let loanAmt = t.loanSize;   // selected loan amount (default = the level's usual loan)

    let investAmt = 0;
    let repayAmt = 0;
    const prevVals = {};   // last shown amount per summary box, to animate count-ups

    const wrap = el('div', { class: 'content' });

    // after any bank action: save, refresh the top-bar balance, redraw
    function refresh() { onChange(); UI.moneyChanged(); rebuild(); }

    function rebuild() {
      UI.clear(wrap);
      if (investAmt > run.cash) investAmt = run.cash;

      wrap.appendChild(el('div', { class: 'panel mama-panel' }, [
        el('h2', null, "🏦 Mama's Bank"),
        Mama.greeting(run),
      ]));

      // --- Money summary ---
      wrap.appendChild(el('div', { class: 'panel' }, [
        el('div', { class: 'row', style: { marginBottom: '6px' } }, [
          summaryBox('💵 Cash', run.cash, 'var(--forest)'),
          summaryBox('📈 With Mama', Math.round(run.invested), 'var(--sun-deep)'),
        ]),
        el('div', { class: 'row' }, [
          summaryBox('💳 You owe', Math.round(run.debt), 'var(--danger)'),
          summaryBox('🏆 Net Worth', Engine.netWorth(run), 'var(--bark)'),
        ]),
        el('p', { class: 'muted', style: { marginTop: '10px' } },
          `Each week, your savings grow ${(t.investRate * 100).toFixed(0)}% and any loan grows ${(t.debtRate * 100).toFixed(0)}%. Playing a game or skipping a week moves time forward.`),
      ]));

      // --- SAVINGS ---
      const investDisplay = el('div', { class: 'amount-display' }, fmt(investAmt));
      const chartSlot = el('div');
      const previewNote = el('p', { class: 'good', style: { marginTop: '6px' } });
      const investBtn = el('button', { class: 'btn gold',
        onclick: () => { if (investAmt > 0) { Engine.invest(run, investAmt); investAmt = 0; refresh(); } } }, 'Give to Mama');
      function updateInvest() {
        investDisplay.textContent = fmt(investAmt);
        const preview = Engine.projectInvest(run.invested + investAmt, t.investRate, 12);
        UI.clear(chartSlot).appendChild(lineChart(preview, '#c99b39', run.invested + investAmt));
        previewNote.textContent = run.invested + investAmt > 0
          ? `In 12 weeks Mama could grow this to ~${fmt(preview[preview.length - 1])}.`
          : 'Pick an amount to see it compound!';
        investBtn.disabled = investAmt <= 0;
      }
      wrap.appendChild(el('div', { class: 'panel' }, [
        el('h2', null, '📈 Save with Mama'),
        Mama.speech("Hand me your cash, sugar, and I'll keep it growing. Compound interest means the growth grows too — that's the magic!", 'happy'),
        investDisplay,
        rangeRow(run.cash, () => investAmt, (v) => { investAmt = v; updateInvest(); }),
        chartSlot,
        previewNote,
        el('div', { class: 'row', style: { marginTop: '6px' } }, [
          investBtn,
          el('button', { class: 'btn wood', disabled: run.invested < 1 ? '' : null,
            onclick: () => { Engine.withdraw(run, run.invested); refresh(); } }, 'Take it all back'),
        ]),
      ]));
      updateInvest();

      // --- LOAN WINDOW (pick an amount) ---
      const loanWarn = el('div', { class: 'warn' });
      const loanChart = el('div');
      const borrowBtn = el('button', { class: 'btn danger', style: { marginTop: '6px' }, onclick: confirmBorrow });
      const optionBtns = t.loanOptions.map(amt =>
        el('button', { class: 'btn small loan-opt', onclick: () => { loanAmt = amt; updateLoan(); } }, fmt(amt)));
      function updateLoan() {
        const preview = Engine.projectDebt(loanAmt, t.debtRate, 12);
        const weekly = loanAmt * t.debtRate;
        loanWarn.textContent = `A ${fmt(loanAmt)} loan grows ${(t.debtRate * 100).toFixed(0)}%/week (${fmt(weekly)} the first week) — left alone for 12 weeks you'd owe ~${fmt(preview[preview.length - 1])}.`
          + (weekly >= t.income ? ` That's more interest than your whole ${fmt(t.income)} paycheck!` : '');
        UI.clear(loanChart).appendChild(lineChart(preview, '#a8412f', loanAmt));
        borrowBtn.textContent = `💸 Borrow ${fmt(loanAmt)}`;
        optionBtns.forEach((b, i) => b.classList.toggle('picked', t.loanOptions[i] === loanAmt));
      }
      wrap.appendChild(el('div', { class: 'panel', style: { borderColor: '#e2b7ac' } }, [
        el('h2', { style: { color: 'var(--danger)' } }, "💳 Mama's Loan Window"),
        Mama.speech("Short on cash, baby? Pick how much you need… but a loan grows every week you don't pay it back. The bigger it is, the faster it grows. Promise me you'll be careful.", 'stern'),
        el('div', { class: 'loan-options' }, optionBtns),
        loanWarn,
        loanChart,
        borrowBtn,
      ]));
      updateLoan();

      // --- REPAY (any amount) ---
      if (run.debt >= 1) {
        const maxRepay = Math.min(run.cash, Math.round(run.debt));
        if (repayAmt > maxRepay) repayAmt = maxRepay;
        const repayDisplay = el('div', { class: 'amount-display' }, fmt(repayAmt));
        const repayBtn = el('button', { class: 'btn gold',
          onclick: () => { if (repayAmt > 0) { Engine.repay(run, repayAmt); repayAmt = 0; refresh(); } } }, 'Pay this amount');
        const updateRepay = () => { repayDisplay.textContent = fmt(repayAmt); repayBtn.disabled = repayAmt <= 0; };
        wrap.appendChild(el('div', { class: 'panel' }, [
          el('h2', { style: { color: 'var(--danger)' } }, '💳 Pay Mama back'),
          Mama.speech(`You owe me ${fmt(run.debt)}, sweetie. Pay back whatever you can — every bit stops it from growing.`, 'stern'),
          repayDisplay,
          rangeRow(maxRepay, () => repayAmt, (v) => { repayAmt = v; updateRepay(); }),
          el('div', { class: 'row', style: { marginTop: '6px' } }, [
            repayBtn,
            el('button', { class: 'btn', disabled: maxRepay <= 0 ? '' : null,
              onclick: () => { Engine.repay(run, maxRepay); repayAmt = 0; refresh(); } }, `Pay max (${fmt(maxRepay)})`),
          ]),
          maxRepay < Math.round(run.debt)
            ? el('p', { class: 'warn', style: { marginTop: '6px' } }, 'Not enough cash to clear it all — pay what you can, then earn more.')
            : null,
        ]));
        updateRepay();
      } else {
        wrap.appendChild(el('div', { class: 'panel' }, [
          el('p', { class: 'good center' }, "Debt-free — Mama's proud of you. Keep it that way! 🌟"),
        ]));
      }

      wrap.appendChild(el('button', { class: 'btn wood', onclick: onBack }, '← Back to games'));
      wrap.appendChild(el('div', { class: 'spacer' }));
    }

    function confirmBorrow() {
      UI.modal({
        title: `Borrow ${fmt(loanAmt)} from Mama?`,
        bodyNodes: [
          Mama.speech(`You sure, honey? That's ${fmt(loanAmt * t.debtRate)} of interest in the first week alone, and it grows ${(t.debtRate * 100).toFixed(0)}% every single week. Debt is the fastest way to lose everything. Mama would rather you saved.`, 'worried'),
        ],
        buttons: [
          { label: "I promise I'll repay it", class: 'danger', onClick: (close) => { Engine.borrow(run, loanAmt); close(); refresh(); } },
          { label: "You're right, no thanks", class: 'ghost' },
        ],
      });
    }

    rebuild();
    return wrap;

    function summaryBox(label, amount, color) {
      const prev = prevVals[label];
      const valNode = el('div', { style: { fontWeight: '900', fontSize: '20px', color } }, fmt(prev != null ? prev : amount));
      if (prev != null && prev !== amount) UI.countTo(valNode, prev, amount, { fmt, dur: 500 });
      prevVals[label] = amount;
      return el('div', { style: { textAlign: 'center', padding: '6px' } }, [el('div', { class: 'muted' }, label), valNode]);
    }

    // Slider + quick buttons. Only calls onValue — never rebuilds the screen.
    function rangeRow(max, getVal, onValue) {
      max = Math.max(0, Math.floor(max));
      const input = el('input', { type: 'range', min: 0, max, step: 1 });
      input.value = String(Math.min(getVal(), max));
      input.disabled = max === 0;
      input.addEventListener('input', () => onValue(parseInt(input.value, 10) || 0));
      const set = (v) => { v = Math.max(0, Math.min(max, Math.round(v))); input.value = String(v); onValue(v); };
      return el('div', null, [
        el('div', { class: 'slider-row' }, input),
        el('div', { class: 'row', style: { marginTop: '4px' } }, [
          el('button', { class: 'btn ghost small', onclick: () => set(max * 0.25) }, '25%'),
          el('button', { class: 'btn ghost small', onclick: () => set(max * 0.5) }, '50%'),
          el('button', { class: 'btn ghost small', onclick: () => set(max) }, 'All'),
        ]),
      ]);
    }
  }

  window.Bank = { render };
})();
