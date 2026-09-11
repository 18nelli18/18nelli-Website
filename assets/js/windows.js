/* =====================================================================
   windows.js — fenêtres déplaçables des galeries photo
   ---------------------------------------------------------------------
   Pour chaque `.window` présente dans la page (générées par
   tools/gen.sh) :
     - position de départ aléatoire dans l'écran
     - déplacement à la souris via la barre de titre
     - passage au premier plan au clic
     - fermeture par la croix
     - clic sur la photo : affichage plein écran, reclic : réduction

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

  /* ===================================================================
     Visionneuse plein écran
     -------------------------------------------------------------------
     Un seul overlay pour toute la page, créé à la demande et réutilisé :
     inutile d'en fabriquer un par photo.
     Styles : .photo-viewer dans assets/css/layout.css
     =================================================================== */

  var viewer = null;   // l'overlay
  var viewerImg = null;
  var viewerName = null;

  /** Construit l'overlay au premier usage. */
  function buildViewer() {
    if (viewer) return;

    viewer = document.createElement('div');
    viewer.className = 'photo-viewer';
    viewer.setAttribute('role', 'dialog');
    viewer.setAttribute('aria-modal', 'true');
    viewer.setAttribute('aria-label', 'Photo en plein ecran');

    // Cadre : se retrecit a la taille de la photo, ce qui aligne la
    // barre de titre sur la largeur de l'image.
    var frame = document.createElement('div');
    frame.className = 'photo-viewer-frame';

    var bar = document.createElement('div');
    bar.className = 'photo-viewer-bar';

    viewerName = document.createElement('span');
    viewerName.className = 'photo-viewer-name';

    var close = document.createElement('span');
    close.className = 'photo-viewer-close';
    close.title = 'Fermer (Echap)';
    close.textContent = '\u2715';

    bar.appendChild(viewerName);
    bar.appendChild(close);

    viewerImg = document.createElement('img');
    viewerImg.alt = '';
    viewerImg.draggable = false;

    frame.appendChild(bar);
    frame.appendChild(viewerImg);
    viewer.appendChild(frame);
    document.body.appendChild(viewer);

    // Reclic n'importe ou sur l'overlay (fond, image ou croix) -> reduire.
    viewer.addEventListener('click', closeViewer);
  }

  /** Affiche une photo en grand. */
  function openViewer(img, titre) {
    buildViewer();
    // currentSrc : respecte un eventuel srcset, sinon src.
    viewerImg.src = img.currentSrc || img.src;
    viewerImg.alt = img.alt || '';
    viewerName.textContent = titre || img.alt || '';
    viewerName.title = viewerName.textContent; // infobulle si le nom est tronque
    viewer.classList.add('is-open');
  }

  function closeViewer() {
    if (viewer) viewer.classList.remove('is-open');
  }

  function viewerIsOpen() {
    return !!viewer && viewer.classList.contains('is-open');
  }

  // Echap ferme la visionneuse.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && viewerIsOpen()) closeViewer();
  });

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

      // --- Clic sur la photo : plein ecran ---------------------------
      // Ecouteur pose directement sur l'image : si l'utilisateur relache
      // le bouton sur la photo apres avoir demarre un glisser depuis la
      // barre de titre, l'evenement `click` est dispatche sur .window
      // (ancetre commun) et non sur l'image -> pas d'ouverture parasite.
      var photo = win.querySelector('img');
      if (photo) {
        var titreSpan = win.querySelector('.titlebar span');
        photo.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          openViewer(photo, titreSpan ? titreSpan.textContent : '');
        });
      }

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
