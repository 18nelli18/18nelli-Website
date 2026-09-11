/* =====================================================================
   mp3-player.js — lecteur MP3 + visualiseur de la page musique
   ---------------------------------------------------------------------
   100 % côté navigateur : la liste des morceaux vient de data/songs.json
   et les fichiers de assets/media/song/.

   Le visualiseur utilise la Web Audio API :
     <audio> --> MediaElementSource --> AnalyserNode --> destination
   L'AnalyserNode est branché "en série" : il lit le signal sans le
   modifier, puis le renvoie vers les haut-parleurs.

   Balisage attendu (musique.html) :
     #playlist    <ul>     liste des morceaux
     #play        bouton lecture / pause
     #prev #next  navigation
     #visualizer  <canvas> spectre

   Styles associés : assets/css/pages/musique.css
   ===================================================================== */

(function () {
  'use strict';

  /** Index JSON des morceaux (tableau de noms de fichiers). */
  var SONGS_INDEX = 'data/songs.json';

  /** Dossier contenant les .mp3 listés dans SONGS_INDEX. */
  var SONGS_DIR = 'assets/media/song/';

  // --- État -----------------------------------------------------------
  var songs = [];
  var current = 0;

  var audio;       // élément <audio> (créé en JS, jamais dans le DOM)
  var audioCtx;    // AudioContext
  var analyser;    // AnalyserNode
  var dataArray;   // tampon des amplitudes par bande de fréquence
  var canvas;
  var canvasCtx;

  // --- Chargement de la liste ------------------------------------------

  async function fetchSongs() {
    try {
      var res = await fetch(SONGS_INDEX);
      if (!res.ok) throw new Error('Erreur ' + res.status);
      return await res.json();
    } catch (e) {
      console.error('Impossible de récupérer ' + SONGS_INDEX + ' :', e);
      return [];
    }
  }

  // --- Interface --------------------------------------------------------

  /** Remplit le <ul> avec un <li> cliquable par morceau. */
  function populatePlaylist() {
    var ul = document.getElementById('playlist');
    if (!ul) return;

    songs.forEach(function (name, i) {
      var li = document.createElement('li');
      li.textContent = name;
      li.dataset.index = i;
      li.onclick = function () { loadTrack(i); };
      ul.appendChild(li);
    });
  }

  /** Met en surbrillance le morceau en cours. */
  function updatePlaylistUI() {
    document.querySelectorAll('#playlist li').forEach(function (li) {
      li.classList.toggle('active', +li.dataset.index === current);
    });
  }

  // --- Audio ------------------------------------------------------------

  /** Construit la chaîne audio et branche les boutons. */
  function setupAudio() {
    audio = new Audio(SONGS_DIR + songs[current]);
    // Requis pour que l'AnalyserNode ait le droit de lire le signal.
    audio.crossOrigin = 'anonymous';

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256; // -> 128 bandes de fréquence

    var srcNode = audioCtx.createMediaElementSource(audio);
    srcNode.connect(analyser);
    analyser.connect(audioCtx.destination);

    dataArray = new Uint8Array(analyser.frequencyBinCount);

    canvas = document.getElementById('visualizer');
    canvasCtx = canvas.getContext('2d');

    document.getElementById('play').onclick = togglePlay;
    document.getElementById('prev').onclick = function () { changeTrack(-1); };
    document.getElementById('next').onclick = function () { changeTrack(+1); };

    drawVisualizer();
  }

  /** Charge et joue le morceau d'index `i`. */
  function loadTrack(i) {
    current = i;
    audio.src = SONGS_DIR + songs[current];
    audio.play();
    document.getElementById('play').textContent = 'Pause ❚❚';
    updatePlaylistUI();
  }

  /** Avance (+1) ou recule (-1) dans la playlist, en boucle. */
  function changeTrack(dir) {
    current = (current + dir + songs.length) % songs.length;
    loadTrack(current);
  }

  function togglePlay() {
    if (audio.paused) {
      audio.play();
      this.textContent = 'Pause ❚❚';
    } else {
      audio.pause();
      this.textContent = 'Play ▶';
    }
    updatePlaylistUI();
  }

  // --- Visualiseur ------------------------------------------------------

  /**
   * Redessine le spectre à chaque image.
   * Une barre verte par bande de fréquence, hauteur = amplitude / 2.
   */
  function drawVisualizer() {
    requestAnimationFrame(drawVisualizer);

    analyser.getByteFrequencyData(dataArray);
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

    var barWidth = (canvas.width / dataArray.length) * 1.5;
    var x = 0;

    dataArray.forEach(function (value) {
      var h = value / 2;
      canvasCtx.fillStyle = 'lime';
      canvasCtx.fillRect(x, canvas.height - h, barWidth, h);
      x += barWidth + 1; // 1px d'écart entre les barres
    });
  }

  // --- Démarrage --------------------------------------------------------

  async function init() {
    songs = await fetchSongs();
    if (songs.length === 0) return;

    populatePlaylist();
    setupAudio();
    updatePlaylistUI();
  }

  window.addEventListener('load', init);
})();
