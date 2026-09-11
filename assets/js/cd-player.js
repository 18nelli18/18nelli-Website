/* =====================================================================
   cd-player.js — lecteur CD façon Windows 95 de la page d'accueil
   ---------------------------------------------------------------------
   Au chargement, pioche un morceau au hasard dans data/songs.json et
   tente de le lancer. Les boutons ▶ / ⏸ pilotent la lecture, ⏭ tire un
   nouveau morceau au hasard.

   Le balisage attendu se trouve dans index.html (.cd-player) :
     #audio     <audio>  élément de lecture
     #playBtn   ▶
     #pauseBtn  ⏸
     #title     nom du morceau affiché
     #artist    nom d'artiste affiché
     .controls button:last-child   ⏭

   Ce fichier remplace l'ancien assets/js/bs-init.js.
   ===================================================================== */

(function () {
  'use strict';

  /** Index JSON des morceaux (tableau de noms de fichiers). */
  var SONGS_INDEX = 'data/songs.json';

  /** Dossier contenant les .mp3 listés dans SONGS_INDEX. */
  var SONGS_DIR = 'assets/media/song/';

  /**
   * Charge un morceau au hasard et le met en lecture.
   * La lecture automatique est souvent bloquée par le navigateur tant
   * que l'utilisateur n'a pas interagi : on l'ignore silencieusement,
   * le bouton ▶ prend le relais.
   */
  async function loadRandomSong() {
    var audioElement = document.getElementById('audio');
    if (!audioElement) return;

    try {
      var res = await fetch(SONGS_INDEX);
      if (!res.ok) throw new Error('Erreur ' + res.status);

      var songs = await res.json();
      if (!Array.isArray(songs) || songs.length === 0) return;

      var randomSong = songs[Math.floor(Math.random() * songs.length)];
      audioElement.src = SONGS_DIR + randomSong;

      var title = document.getElementById('title');
      var artist = document.getElementById('artist');
      if (title) title.textContent = randomSong;
      if (artist) artist.textContent = '18nelli';

      audioElement.play().catch(function (err) {
        console.warn('Lecture auto bloquée :', err);
      });
    } catch (e) {
      console.error('Erreur lors du chargement des chansons :', e);
    }
  }

  /** Branche les boutons ▶ / ⏸ / ⏭ sur l'élément <audio>. */
  function bindControls() {
    var audio = document.getElementById('audio');
    if (!audio) return;

    var playBtn = document.getElementById('playBtn');
    var pauseBtn = document.getElementById('pauseBtn');
    var nextBtn = document.querySelector('.controls button:last-child');

    if (playBtn) playBtn.addEventListener('click', function () { audio.play(); });
    if (pauseBtn) pauseBtn.addEventListener('click', function () { audio.pause(); });
    if (nextBtn) nextBtn.addEventListener('click', loadRandomSong);
  }

  document.addEventListener('DOMContentLoaded', bindControls);

  // On attend `load` (et pas DOMContentLoaded) pour laisser l'élément
  // <audio> et sa source par défaut se initialiser complètement.
  window.addEventListener('load', loadRandomSong);
})();
