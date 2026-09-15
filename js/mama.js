/* =========================================================
   Money Mama — the character who runs the bank.
   She holds your savings, offers (tempting) loans, and reacts
   to how you're doing: warm and proud when you save,
   gently worried when you take on debt.
========================================================= */
(function () {
  const { el } = UI;

  // Mama's face changes with her mood.
  const FACES = {
    happy:   '👩🏽‍🌾',
    proud:   '🥰',
    neutral: '👩🏽‍🌾',
    worried: '😟',
    stern:   '🤨',
    cheer:   '🎉',
  };

  // A speech-bubble with Mama's portrait beside it.
  function speech(text, mood) {
    const face = FACES[mood] || FACES.neutral;
    return el('div', { class: 'mama-row' }, [
      el('div', { class: 'mama-face' }, face),
      el('div', { class: 'mama-bubble' }, text),
    ]);
  }

  // Pick a line based on the player's situation.
  function line(run) {
    const t = Engine.tierById(run.tierId);
    const nw = Engine.netWorth(run);
    if (run.debt > run.cash + run.invested) {
      return { text: "Sweetheart, that debt is bigger than everything you own. Let's pay it down before it grows again, okay?", mood: 'worried' };
    }
    if (run.debt > 0) {
      return { text: "I'm holding your loan, honey. Every week it gets bigger — pay Mama back as soon as you can.", mood: 'stern' };
    }
    if (run.invested > 0 && run.invested >= run.cash) {
      return { text: "Look at you! Money in the grove, growing while you sleep. That's my smart cookie. 🌱", mood: 'proud' };
    }
    if (run.cash > 0 && run.invested === 0) {
      return { text: "You've got cash, baby. Don't let it sit there — put some in savings and let it grow for you!", mood: 'happy' };
    }
    return { text: "Welcome to Mama's Bank. Save your money here and I'll help it grow. Need cash? I do loans too… but be careful now.", mood: 'neutral' };
  }

  function greeting(run) {
    const l = line(run);
    return speech(l.text, l.mood);
  }

  window.Mama = { speech, greeting, line, FACES };
})();
