/* =====================================================================
   camera.js — flux webcam en direct dans la page d'accueil
   ---------------------------------------------------------------------
   Branche la webcam sur l'élément <video id="camera"> (voir .camera-zone
   dans assets/css/pages/home.css). Le rendu noir & blanc surexposé est
   entièrement fait en CSS.

   Le script sort immédiatement si la page ne contient pas d'élément
   #camera : aucune demande d'autorisation n'est faite sur les autres
   pages. (Avant ce garde-fou, le script levait une TypeError.)

   Utilisé par : index.html
   ===================================================================== */

(function () {
  'use strict';

  var video = document.getElementById('camera');
  if (!video) return; // page sans zone webcam : rien à faire

  video.setAttribute('autoplay', '');
  video.setAttribute('playsinline', ''); // évite le plein écran forcé sur iOS

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.warn('getUserMedia non disponible sur ce navigateur.');
    return;
  }

  navigator.mediaDevices
    .getUserMedia({ video: true, audio: false })
    .then(function (stream) {
      video.srcObject = stream;
    })
    .catch(function (error) {
      // Refus de l'utilisateur ou absence de caméra : on laisse la zone
      // noire, ce qui reste cohérent avec le design.
      console.error('Erreur accès caméra :', error);
    });
})();
