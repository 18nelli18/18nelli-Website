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

   Le déplacement lui-même est délégué à assets/js/draggable.js, partagé
   avec le lecteur CD de la page d'accueil.

   Styles associés : .window dans assets/css/layout.css
   Dépend de     : assets/js/draggable.js (à charger AVANT)
   Utilisé par    : albums/<nom>/<nom>.html
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

      Draggable.setOffset(win, x0, y0);

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
      function bringToFront() {
        highestZ++;
        win.style.zIndex = highestZ;
      }
      win.addEventListener('mousedown', bringToFront);

      // --- Déplacement à la souris ----------------------------------
      var titlebar = win.querySelector('.titlebar');
      if (!titlebar) return;

      Draggable.make(win, titlebar, {
        onStart: bringToFront,
        // Bornes explicites (et non celles par défaut de draggable.js) :
        // le décalage des fenêtres se compte depuis le coin du
        // #windows-container, on garde donc le comportement d'origine.
        bounds: function () {
          return {
            minX: 0,
            maxX: viewportW - winW,
            minY: 0,
            maxY: viewportH - winH,
          };
        },
      });
    });
  });
})();
