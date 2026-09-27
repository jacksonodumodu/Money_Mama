/* =========================================================
   Money Mama — the friendly banker character.
   Drawn as inline SVG (no images, no dependencies) so she
   scales crisply and can change expression. A warm suburban
   mom who runs the bank: holds savings, gives loans, and
   drops money tips.
========================================================= */
(function () {
  const { el } = UI;

  // --- SVG portrait. mood tweaks eyes/mouth/brows. ---
  function portrait(mood, size) {
    size = size || 64;
    const m = mood || 'happy';
    // mouth path per mood
    const mouths = {
      happy:   '<path d="M40 74 Q50 84 60 74" stroke="#7a3b2e" stroke-width="3" fill="none" stroke-linecap="round"/>',
      proud:   '<path d="M39 73 Q50 88 61 73" stroke="#7a3b2e" stroke-width="3.5" fill="#c96b58" stroke-linecap="round"/>',
      worried: '<path d="M41 79 Q50 72 59 79" stroke="#7a3b2e" stroke-width="3" fill="none" stroke-linecap="round"/>',
      stern:   '<path d="M41 77 L59 77" stroke="#7a3b2e" stroke-width="3" fill="none" stroke-linecap="round"/>',
      wink:    '<path d="M40 74 Q50 84 60 74" stroke="#7a3b2e" stroke-width="3" fill="none" stroke-linecap="round"/>',
    };
    const brows = {
      happy:   '<path d="M34 50 Q40 47 46 50" stroke="#6b4f34" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M54 50 Q60 47 66 50" stroke="#6b4f34" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
      proud:   '<path d="M34 49 Q40 46 46 49" stroke="#6b4f34" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M54 49 Q60 46 66 49" stroke="#6b4f34" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
      worried: '<path d="M34 48 Q40 52 46 50" stroke="#6b4f34" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M54 50 Q60 52 66 48" stroke="#6b4f34" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
      stern:   '<path d="M34 51 Q40 48 46 49" stroke="#6b4f34" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M54 49 Q60 48 66 51" stroke="#6b4f34" stroke-width="3" fill="none" stroke-linecap="round"/>',
      wink:    '<path d="M34 50 Q40 47 46 50" stroke="#6b4f34" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M54 50 Q60 47 66 50" stroke="#6b4f34" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
    };
    const leftEye = (m === 'wink')
      ? '<path d="M37 60 Q41 57 45 60" stroke="#2a2118" stroke-width="2.5" fill="none" stroke-linecap="round"/>'
      : '<circle cx="41" cy="60" r="3.2" fill="#2a2118"/>';
    const rightEye = '<circle cx="59" cy="60" r="3.2" fill="#2a2118"/>';

    return `
    <svg viewBox="0 0 100 110" width="${size}" height="${size*1.1}" xmlns="http://www.w3.org/2000/svg" aria-label="Mama the banker">
      <!-- shoulders / blazer (banker) -->
      <path d="M18 110 Q18 88 32 82 L68 82 Q82 88 82 110 Z" fill="#3e6b45"/>
      <path d="M42 82 L50 96 L58 82 Z" fill="#f3ecdd"/>            <!-- blouse collar -->
      <circle cx="50" cy="99" r="2" fill="#c99b39"/>              <!-- necklace bead -->
      <!-- neck -->
      <rect x="44" y="74" width="12" height="12" rx="4" fill="#e0ac86"/>
      <!-- hair back -->
      <path d="M26 58 Q24 30 50 28 Q76 30 74 58 Q78 74 70 78 L66 60 Q64 44 50 44 Q36 44 34 60 L30 78 Q22 74 26 58 Z" fill="#6b4f34"/>
      <!-- face -->
      <ellipse cx="50" cy="62" rx="20" ry="22" fill="#f0c19b"/>
      <!-- cheeks -->
      <circle cx="37" cy="69" r="4" fill="#eca98a" opacity="0.6"/>
      <circle cx="63" cy="69" r="4" fill="#eca98a" opacity="0.6"/>
      <!-- brows/eyes/mouth by mood -->
      ${brows[m] || brows.happy}
      ${leftEye}${rightEye}
      ${mouths[m] || mouths.happy}
      <!-- bangs -->
      <path d="M30 52 Q34 40 50 40 Q66 40 70 52 Q60 46 50 46 Q40 46 30 52 Z" fill="#6b4f34"/>
      <!-- little gold earrings -->
      <circle cx="30" cy="66" r="2" fill="#c99b39"/>
      <circle cx="70" cy="66" r="2" fill="#c99b39"/>
    </svg>`;
  }

  function faceNode(mood, size) {
    const wrap = el('div', { class: 'mama-face', html: portrait(mood, size || 46) });
    return wrap;
  }

  // Speech bubble with portrait beside it.
  function speech(text, mood) {
    return el('div', { class: 'mama-row' }, [
      faceNode(mood, 46),
      el('div', { class: 'mama-bubble' }, text),
    ]);
  }

  // Situation-aware greeting.
  function line(run) {
    if (run.debt > run.cash + run.invested && run.debt > 0) {
      return { text: "Honey, that loan is bigger than everything you've got. Let's chip away at it before it grows again, okay?", mood: 'worried' };
    }
    if (run.debt > 0) {
      return { text: "I'm still holding your loan, sweetie. It grows a little every week — pay me back what you can.", mood: 'stern' };
    }
    if (run.invested > 0 && run.invested >= run.cash) {
      return { text: "Look at you — money working while you relax! That's how it's done. 💅", mood: 'proud' };
    }
    if (run.cash > 0 && run.invested === 0) {
      return { text: "You've got cash sitting there, dear. Don't let it get lonely — put some in savings so it can grow!", mood: 'happy' };
    }
    return { text: "Welcome in! I'm Mama. Save your money with me and I'll grow it. Need a loan? I do those too… carefully now.", mood: 'happy' };
  }
  function greeting(run) { const l = line(run); return speech(l.text, l.mood); }

  // Rotating money tips (suburban-mom voice).
  const TIPS = [
    "Pay yourself first, dear — move a little to savings the moment money comes in.",
    "A steady paycheck beats a lucky streak. Skip a week and just collect your income when the cards are cold.",
    "Compound interest is like a slow-cooker: leave it alone and it just keeps getting better.",
    "Never bet money you need for the bills. Only play with what you can afford to lose.",
    "Debt grows while you sleep — the fast way to lose is to owe and wait.",
    "Chasing losses is like a second glass of wine on a Tuesday: it rarely ends well. Walk away and collect your paycheck.",
    "Small savings add up. Skip one splurge a week and watch it grow.",
    "If a loan feels too easy, that's the trap talking. Borrow only when you truly must.",
  ];
  function tip(i) {
    const idx = ((i % TIPS.length) + TIPS.length) % TIPS.length;
    return speech("💡 " + TIPS[idx], 'wink');
  }
  function randomTipIndex() { return Math.floor(Math.random() * TIPS.length); }

  window.Mama = { portrait, faceNode, speech, greeting, line, tip, randomTipIndex, TIPS };
})();
