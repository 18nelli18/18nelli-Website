/* =====================================================================
   mobile-redirect.js — redirection des visiteurs mobiles
   ---------------------------------------------------------------------
   Le site est pensé pour un grand écran (positions absolues en pixels).
   Sur mobile on renvoie vers mobile.html plutôt que d'afficher une mise
   en page cassée.

   À charger dans le <head>, SANS `defer` : la redirection doit partir le
   plus tôt possible pour éviter un flash de la page desktop.

   Utilisé par : index.html, blog.html
   ===================================================================== */

(function () {
  'use strict';

  /** Largeur (px) en dessous de laquelle on considère être sur mobile. */
  var MOBILE_BREAKPOINT = 768;

  function redirectIfMobile() {
    var ua = navigator.userAgent.toLowerCase();
    var isMobileDevice =
      /android|iphone|ipad|ipod|blackberry|windows phone|opera mini|mobile/i.test(ua);
    var isSmallScreen = window.innerWidth <= MOBILE_BREAKPOINT;

    if (isMobileDevice || isSmallScreen) {
      // replace() au lieu de href : évite de pouvoir revenir en arrière
      // sur la version desktop via le bouton "précédent".
      window.location.replace('mobile.html');
    }
  }

  document.addEventListener('DOMContentLoaded', redirectIfMobile);
})();
