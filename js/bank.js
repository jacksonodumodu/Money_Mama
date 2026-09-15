/* =========================================================
   Money Mama — Mama's Bank screen.
   Mama holds your savings (compound interest FOR you) and
   reluctantly offers loans (tempting debt that grows AGAINST you).
========================================================= */
(function () {
  const { el, lineChart } = UI;

  function render(run, onBack, onChange) {
    const t = Engine.tierById(run.tierId);
    const fmt = Engine.fmt;

    let investAmt = 0;

    const wrap = el('div', { class: 'content' });

    function refresh() { onChange(); rebuild(); }

    function rebuild() {
      UI.clear(wrap);

      // --- Mama greets you based on your situation ---
      wrap.appendChild(el('div', { class: 'panel mama-panel' }, [
        el('h2', null, "🏦 Mama's Bank"),
        Mama.greeting(run),
      ]));

      // --- Money summary ---
      wrap.appendChild(el('div', { class: 'panel' }, [
        el('div', { class: 'row', style: { marginBottom: '6px' } }, [
          summaryBox('💵 Cash', fmt(run.cash), 'var(--forest)'),
          summaryBox("📈 With Mama", fmt(run.invested), 'var(--sun-deep)'),
        ]),
        el('div', { class: 'row' }, [
          summaryBox('💳 You owe', fmt(run.debt), 'var(--danger)'),
          summaryBox('🏆 Net Worth', fmt(Engine.netWorth(run)), 'var(--bark)'),
        ]),
        el('p', { class: 'muted', style: { marginTop: '10px' } },
          `Each week, your savings grow ${(t.investRate*100).toFixed(0)}% and any loan grows ${(t.debtRate*100).toFixed(0)}%. Playing games advances the weeks.`),
      ]));

      // --- SAVINGS panel (Mama holds it) ---
      const investPreview = Engine.projectInvest(run.invested + investAmt, t.investRate, 12);
      wrap.appendChild(el('div', { class: 'panel' }, [
        el('h2', null, '📈 Save with Mama'),
        Mama.speech("Hand me your cash, sugar, and I'll keep it growing. Compound interest means the growth grows too — that's the magic!", 'happy'),
        el('div', { class: 'amount-display' }, fmt(investAmt)),
        rangeRow(0, run.cash, investAmt, (v) => { investAmt = v; rebuild(); }),
        lineChart(investPreview, '#c99b39', run.invested + investAmt),
        el('p', { class: 'good', style:{marginTop:'6px'} },
          run.invested + investAmt > 0
            ? `In 12 weeks Mama could grow this to ~${fmt(investPreview[investPreview.length-1])}.`
            : 'Give Mama some cash to see it compound!'),
        el('div', { class: 'row', style: { marginTop: '6px' } }, [
          el('button', { class: 'btn gold', disabled: investAmt <= 0 ? '' : null,
            onclick: () => { Engine.invest(run, investAmt); investAmt = 0; refresh(); } }, 'Give to Mama'),
          el('button', { class: 'btn wood', disabled: run.invested <= 0 ? '' : null,
            onclick: () => { Engine.withdraw(run, run.invested); refresh(); } }, 'Take it back'),
        ]),
      ]));

      // --- LOAN panel (Mama offers it, reluctantly) ---
      const debtPreview = Engine.projectDebt(Math.max(run.debt, 500), t.debtRate, 12);
      wrap.appendChild(el('div', { class: 'panel', style: { borderColor: '#e2b7ac' } }, [
        el('h2', { style: { color: 'var(--danger)' } }, "💳 Mama's Loan Window"),
        Mama.speech("Short on cash, baby? I can lend you $500 right now… but a loan grows every week you don't pay it back. Promise me you'll be careful.", 'stern'),
        el('div', { class: 'warn' },
          `A $500 loan grows ${(t.debtRate*100).toFixed(0)}%/week — in 12 weeks you'd owe Mama ~${fmt(debtPreview[debtPreview.length-1])}.`),
        lineChart(debtPreview, '#a8412f', Math.max(run.debt, 500)),
        el('div', { class: 'row', style: { marginTop: '6px' } }, [
          el('button', { class: 'btn danger',
            onclick: () => confirmBorrow() }, '💸 Borrow $500'),
          el('button', { class: 'btn',
            disabled: (run.debt <= 0 || run.cash <= 0) ? '' : null,
            onclick: () => { Engine.repay(run, run.debt); refresh(); } }, 'Pay Mama back'),
        ]),
        run.debt > 0
          ? el('p', { class: 'warn', style:{marginTop:'8px'} }, `You owe Mama ${fmt(run.debt)}. Pay it off fast before it snowballs!`)
          : el('p', { class: 'good', style:{marginTop:'8px'} }, "Debt-free — Mama's proud of you. Keep it that way! 🌱"),
      ]));

      wrap.appendChild(el('button', { class: 'btn wood', onclick: onBack }, '← Back to games'));
      wrap.appendChild(el('div', { class: 'spacer' }));
    }

    function confirmBorrow() {
      UI.modal({
        emoji: '🤨',
        title: 'Borrow $500 from Mama?',
        bodyNodes: [
          Mama.speech("You sure, honey? Easy money now, but it grows " + (t.debtRate*100).toFixed(0) + "% every single week. Debt is the fastest way to lose everything. Mama would rather you saved.", 'worried'),
        ],
        buttons: [
          { label: 'I promise I\'ll repay it', class: 'danger', onClick: (close) => { Engine.borrow(run, 500); close(); refresh(); } },
          { label: 'You\'re right, no thanks', class: 'ghost' },
        ],
      });
    }

    rebuild();
    return wrap;

    function summaryBox(label, value, color) {
      return el('div', { style: { textAlign: 'center', padding: '6px' } }, [
        el('div', { class: 'muted' }, label),
        el('div', { style: { fontWeight: '900', fontSize: '20px', color } }, value),
      ]);
    }
    function rangeRow(min, max, val, onInput) {
      const input = el('input', { type: 'range', min, max: Math.max(min, max), value: val, step: Math.max(1, Math.round(max/50)) });
      input.addEventListener('input', () => onInput(parseInt(input.value, 10)));
      const quick = el('div', { class: 'row', style: { marginTop: '4px' } }, [
        el('button', { class: 'btn ghost small', onclick: () => onInput(Math.round(max*0.25)) }, '25%'),
        el('button', { class: 'btn ghost small', onclick: () => onInput(Math.round(max*0.5)) }, '50%'),
        el('button', { class: 'btn ghost small', onclick: () => onInput(max) }, 'All'),
      ]);
      return el('div', null, [el('div', { class: 'slider-row' }, input), quick]);
    }
  }

  window.Bank = { render };
})();
