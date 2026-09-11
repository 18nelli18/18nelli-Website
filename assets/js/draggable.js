/* =====================================================================
   draggable.js — rendre un élément déplaçable à la souris
   ---------------------------------------------------------------------
   Petit utilitaire partagé, sans dépendance. Il expose une seule
   fonction globale :

       Draggable.make(element, poignee, options)

   Le déplacement se fait en `transform: translate(x, y)` (accéléré GPU)
   et non en `left/top` : la position d'origine définie en CSS est donc
   préservée, on ne fait que la décaler. Le décalage courant est mémorisé
   dans `dataset.dragX` / `dataset.dragY`.

   options :
     bounds   fonction() -> { minX, maxX, minY, maxY }
              Bornes du décalage autorisé. Par défaut on empêche
              seulement de perdre l'élément hors de l'écran (voir
              viewportBounds).
     onStart  fonction() appelée au début d'un déplacement
              (sert par exemple à passer l'élément au premier plan).

   Utilisé par : assets/js/windows.js, assets/js/cd-player.js
   ===================================================================== */

(function (global) {
  'use strict';

  /** Lit le décalage courant mémorisé sur l'élément. */
  function getOffset(el) {
    return {
      x: parseFloat(el.dataset.dragX) || 0,
      y: parseFloat(el.dataset.dragY) || 0,
    };
  }

  /** Applique un décalage et le mémorise. */
  function setOffset(el, x, y) {
    el.dataset.dragX = x;
    el.dataset.dragY = y;
    el.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
  }

  /** Nombre de pixels de l'élément qui doivent rester à l'écran. */
  var MIN_VISIBLE = 48;

  /**
   * Bornes par défaut : on garantit qu'au moins MIN_VISIBLE pixels de
   * l'élément restent dans la fenêtre, pour ne jamais pouvoir le perdre.
   *
   * On ne cherche PAS à le contenir entièrement : certains éléments
   * (le lecteur CD de l'accueil, par exemple) débordent volontairement
   * de l'écran au repos, et les forcer à rentrer les ferait sauter.
   *
   * On raisonne en DÉCALAGE, pas en position absolue. L'origine (la
   * position qu'aurait l'élément sans transform) se déduit de sa
   * position écran actuelle moins le décalage déjà appliqué. C'est ce
   * qui rend la fonction utilisable aussi bien sur un élément en
   * position:absolute que sur un élément resté dans le flux.
   */
  function viewportBounds(el) {
    var rect = el.getBoundingClientRect();
    var offset = getOffset(el);
    var originX = rect.left - offset.x;
    var originY = rect.top - offset.y;
    var keep = Math.min(MIN_VISIBLE, rect.width, rect.height);

    return {
      minX: keep - rect.width - originX,          // bord droit à `keep` du bord gauche
      maxX: window.innerWidth - keep - originX,   // bord gauche à `keep` du bord droit
      minY: keep - rect.height - originY,
      maxY: window.innerHeight - keep - originY,
    };
  }

  function clamp(value, min, max) {
    // Si la zone autorisée est vide (élément plus grand que l'écran),
    // min > max : on privilégie le bord haut/gauche.
    if (max < min) return min;
    return Math.max(min, Math.min(value, max));
  }

  /**
   * Rend `el` déplaçable en tirant sur `handle`.
   * @param {HTMLElement} el       élément à déplacer
   * @param {HTMLElement} handle   poignée (souvent la barre de titre)
   * @param {Object}      [options]
   */
  function make(el, handle, options) {
    if (!el || !handle) return;
    options = options || {};

    var isDragging = false;
    var grabX = 0; // écart curseur <-> décalage, figé au début du geste
    var grabY = 0;
    var limits = null;

    // Le drag natif HTML5 entrerait en conflit avec le nôtre.
    el.addEventListener('dragstart', function (e) { e.preventDefault(); });

    handle.addEventListener('mousedown', function (e) {
      // Bouton gauche uniquement : on laisse le clic droit tranquille.
      if (e.button !== 0) return;

      e.preventDefault();
      if (options.onStart) options.onStart();

      var offset = getOffset(el);
      isDragging = true;
      grabX = e.clientX - offset.x;
      grabY = e.clientY - offset.y;

      // Bornes calculées au début du geste : la taille de l'élément ne
      // change pas pendant le déplacement, inutile de recalculer.
      limits = options.bounds ? options.bounds() : viewportBounds(el);

      // On élargit les bornes pour qu'elles contiennent TOUJOURS la
      // position actuelle : sans ça, un élément déjà hors bornes au
      // repos sauterait dès le premier clic. On l'empêche d'aller plus
      // loin, sans jamais le repositionner tout seul.
      limits.minX = Math.min(limits.minX, offset.x);
      limits.maxX = Math.max(limits.maxX, offset.x);
      limits.minY = Math.min(limits.minY, offset.y);
      limits.maxY = Math.max(limits.maxY, offset.y);

      // Empêche la sélection de texte pendant le glissement.
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', function (e) {
      if (!isDragging) return;
      e.preventDefault();

      setOffset(
        el,
        clamp(e.clientX - grabX, limits.minX, limits.maxX),
        clamp(e.clientY - grabY, limits.minY, limits.maxY)
      );
    });

    document.addEventListener('mouseup', function () {
      if (!isDragging) return;
      isDragging = false;
      document.body.style.userSelect = '';
    });
  }

  global.Draggable = { make: make, setOffset: setOffset, getOffset: getOffset };
})(window);
