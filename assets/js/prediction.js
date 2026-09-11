/* =====================================================================
   prediction.js — faux chatbot de la page prédiction
   ---------------------------------------------------------------------
   1. Écran d'intro : visible 2 s, puis fondu de 2 s, puis retiré.
   2. Conversation : quoi que tu écrives, le bot répond « Non, pas du
      tout ». C'est l'intégralité de sa logique, et c'est voulu.
   3. Ctrl/Cmd + K efface l'historique.

   Styles associés : assets/css/pages/prediction.css
   ===================================================================== */

(function () {
  'use strict';

  /** Durée d'affichage de l'écran d'intro avant le fondu (ms). */
  var SPLASH_HOLD_MS = 2000;

  /** Durée du fondu — doit rester alignée sur la transition CSS (ms). */
  var SPLASH_FADE_MS = 2000;

  /** Délai avant la réponse du bot, pour le "feeling" rétro (ms). */
  var BOT_DELAY_MS = 420;

  /** Réponse unique du bot. */
  var BOT_ANSWER = 'Non, pas du tout';

  var messages = document.getElementById('messages');
  var form = document.getElementById('composer');
  var input = document.getElementById('text');

  // --- 1. Écran d'intro -------------------------------------------------

  window.addEventListener('load', function () {
    var splash = document.getElementById('prediction-screen');
    if (!splash) return;

    setTimeout(function () {
      splash.classList.add('fade-out');

      setTimeout(function () {
        splash.style.display = 'none';
        document.body.classList.remove('splash-lock'); // réactive le scroll
        if (input) input.focus();
      }, SPLASH_FADE_MS);
    }, SPLASH_HOLD_MS);
  });

  // --- 2. Conversation --------------------------------------------------

  /** Horodatage court « HH:MM ». */
  function stamp() {
    var d = new Date();
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    return hh + ':' + mm;
  }

  /**
   * Ajoute une bulle à la conversation et fait défiler vers le bas.
   * @param {string} text  contenu (inséré via innerText : pas d'injection HTML)
   * @param {'user'|'bot'} who  auteur du message
   */
  function addBubble(text, who) {
    who = who || 'user';

    var div = document.createElement('div');
    div.className = 'bubble ' + who;
    div.innerText = text;

    var meta = document.createElement('span');
    meta.className = 'meta';
    meta.innerText = (who === 'user' ? 'toi' : 'bot') + ' • ' + stamp();

    div.appendChild(document.createElement('br'));
    div.appendChild(meta);
    messages.appendChild(div);

    messages.scrollTop = messages.scrollHeight;
  }

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var val = (input.value || '').trim();
      if (!val) return;

      addBubble(val, 'user');
      input.value = '';

      setTimeout(function () {
        addBubble(BOT_ANSWER, 'bot');
      }, BOT_DELAY_MS);
    });
  }

  // --- 3. Raccourci : Ctrl/Cmd + K efface l'historique -------------------

  window.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      messages.innerHTML = '';
      addBubble('Historique effacé.', 'bot');
    }
  });
})();
