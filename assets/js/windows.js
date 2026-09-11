/* =====================================================================
   windows.js — fenêtres déplaçables des galeries photo
   ---------------------------------------------------------------------
   Pour chaque `.window` présente dans la page (générées par
   tools/gen.sh) :
     - position de départ aléatoire dans l'écran
     - déplacement à la souris via la barre de titre
     - passage au premier plan au clic
     - fermeture par la croix

   Le déplacement se fait en `transform: translate(x, y)` (accéléré GPU)
   et non en `left/top` : la position courante est mémorisée dans
   `dataset.x` / `dataset.y`.

   Styles associés : .window dans assets/css/layout.css
   Utilisé par : albums/<nom>/<nom>.html
   ===================================================================== */

(function () {
  'use strict';

  /** Compteur global de z-index : la dernière fenêtre cliquée passe devant. */
  var highestZ = 1;

  window.addEventListener('load', function () {
    var windows = document.querySelectorAll('.window');
    var viewportW = window.innerWidth;
    var viewportH = window.innerHeight;

    windows.forEach(function (win) {
      var winW = win.offsetWidth;
      var winH = win.offsetHeight;

      // --- Position initiale aléatoire ------------------------------
      // 20px de marge pour qu'aucune fenêtre ne colle au bord.
      var maxLeft = Math.max(viewportW - winW - 20, 0);
      var maxTop = Math.max(viewportH - winH - 20, 0);
      var x0 = Math.random() * maxLeft;
      var y0 = Math.random() * maxTop;

      win.dataset.x = x0;
      win.dataset.y = y0;
      win.style.transform = 'translate(' + x0 + 'px, ' + y0 + 'px)';

      // --- Fermeture ------------------------------------------------
      var closeBtn = win.querySelector('.close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', function () {
          win.style.display = 'none';
        });
      }

      // --- Premier plan ---------------------------------------------
      // On désactive le drag natif HTML5, qui entrerait en conflit
      // avec notre propre gestion du déplacement.
      win.addEventListener('dragstart', function (e) { e.preventDefault(); });
      win.addEventListener('mousedown', function () {
        highestZ++;
        win.style.zIndex = highestZ;
      });

      // --- Déplacement à la souris ----------------------------------
      var titlebar = win.querySelector('.titlebar');
      if (!titlebar) return;

      var isDragging = false;
      var offsetX = 0;
      var offsetY = 0;

      titlebar.addEventListener('mousedown', function (e) {
        e.preventDefault();
        document.body.style.userSelect = 'none';

        // 1. passer au premier plan
        highestZ++;
        win.style.zIndex = highestZ;

        // 2. mémoriser l'écart entre le curseur et le coin de la fenêtre
        isDragging = true;
        offsetX = e.clientX - parseFloat(win.dataset.x);
        offsetY = e.clientY - parseFloat(win.dataset.y);
      });

      document.addEventListener('mousemove', function (e) {
        if (!isDragging) return;
        e.preventDefault();

        // Contraint la fenêtre à rester entièrement visible.
        var x = Math.max(0, Math.min(e.clientX - offsetX, viewportW - winW));
        var y = Math.max(0, Math.min(e.clientY - offsetY, viewportH - winH));

        win.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
        win.dataset.x = x;
        win.dataset.y = y;
      });

      document.addEventListener('mouseup', function () {
        if (!isDragging) return;
        isDragging = false;
        document.body.style.userSelect = '';
      });
    });
  });
})();
