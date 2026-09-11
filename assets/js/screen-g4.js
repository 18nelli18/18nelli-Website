/* =====================================================================
   screen-g4.js — pose et pilote le voile « dalle LCD d'iMac G4 »
   ---------------------------------------------------------------------
   - construit le calque au chargement (3 couches, voir screen-g4.css)
   - touche C : active / désactive l'effet
   - le choix est mémorisé dans le navigateur (localStorage)

   Le calque est purement décoratif : `pointer-events: none` en CSS,
   donc il n'intercepte jamais un clic. Aucune animation non plus, ce
   qui laisse la webcam et le logo DVD de l'accueil à pleine vitesse.

   Styles associés : assets/css/screen-g4.css
   Utilisé par     : toutes les pages du site
   ===================================================================== */

(function () {
  'use strict';

  /** Clé de mémorisation du choix du visiteur. */
  var STORAGE_KEY = '18nelli:screen-g4';

  /** Touche de bascule. */
  var TOGGLE_KEY = 'c';

  var layer = null;

  // --- Mémorisation -----------------------------------------------------
  // localStorage peut lever (navigation privée, cookies bloqués) :
  // dans ce cas on retombe silencieusement sur « effet activé ».

  function isEnabled() {
    try {
      return localStorage.getItem(STORAGE_KEY) !== 'off';
    } catch (e) {
      return true;
    }
  }

  function remember(enabled) {
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
    } catch (e) {
      /* stockage indisponible : le choix vaut pour la session seulement */
    }
  }

  // --- Construction du calque -------------------------------------------

  function build() {
    if (layer) return;

    layer = document.createElement('div');
    layer.className = 'screen-g4';
    // Décoratif : on le retire de l'arbre d'accessibilité.
    layer.setAttribute('aria-hidden', 'true');

    ['backlight', 'grid', 'glass'].forEach(function (nom) {
      var couche = document.createElement('div');
      couche.className = 'screen-g4__' + nom;
      layer.appendChild(couche);
    });

    document.body.appendChild(layer);
  }

  function apply(enabled) {
    if (enabled) {
      build();
      layer.style.display = '';
    } else if (layer) {
      layer.style.display = 'none';
    }
  }

  // --- Bascule au clavier -----------------------------------------------

  /**
   * Vrai si le visiteur est en train de saisir du texte.
   * Sans ce garde-fou, taper « c » dans le chat de prediction.html
   * couperait l'effet au lieu d'écrire la lettre.
   */
  function isTyping(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;
    var tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  document.addEventListener('keydown', function (e) {
    if (e.key.toLowerCase() !== TOGGLE_KEY) return;
    // On laisse passer les raccourcis système (Cmd+C, Ctrl+C...).
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTyping(e.target)) return;

    var next = !isEnabled();
    remember(next);
    apply(next);
  });

  // --- Démarrage --------------------------------------------------------

  function start() {
    apply(isEnabled());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
