/* DVD Logo Bouncer — autonome, ne dépend pas d'autres scripts */
(function () {
  const logo = document.getElementById('dvdLogo');
  if (!logo) return;

  // ---- Paramètres ajustables ----
  const SPEED = 300; // pixels par seconde (modifie pour accélérer/ralentir)
  const EDGE_MARGIN = 0; // marge optionnelle aux bords (px)

  let vw = window.innerWidth;
  let vh = window.innerHeight;

  // On attend que l'image connaisse sa taille réelle
  function getLogoSize() {
    const rect = logo.getBoundingClientRect();
    return { w: rect.width || 120, h: rect.height || 120 };
  }

  // Position et vitesse initiales
  let { w: lw, h: lh } = getLogoSize();
  let x = Math.random() * Math.max(1, vw - lw - EDGE_MARGIN * 2) + EDGE_MARGIN;
  let y = Math.random() * Math.max(1, vh - lh - EDGE_MARGIN * 2) + EDGE_MARGIN;

  // Direction initiale aléatoire (vx, vy normalisés)
  let angle = Math.random() * Math.PI * 2;
  let vx = Math.cos(angle);
  let vy = Math.sin(angle);

  // Normalisation (au cas où cos/sin ~0)
  const len = Math.hypot(vx, vy) || 1;
  vx /= len;
  vy /= len;

  // Pilotage via requestAnimationFrame
  let lastTime = performance.now();
  let pausedForVisibility = false;

  function tick(now) {
    if (pausedForVisibility) {
      lastTime = now;
      requestAnimationFrame(tick);
      return;
    }

    const dt = (now - lastTime) / 1000; // sec
    lastTime = now;

    // Avance
    x += vx * SPEED * dt;
    y += vy * SPEED * dt;

    // Recalcule la taille du logo si l'image vient de se charger
    ({ w: lw, h: lh } = getLogoSize());

    // Limites
    const maxX = vw - lw - EDGE_MARGIN;
    const maxY = vh - lh - EDGE_MARGIN;
    const minX = EDGE_MARGIN;
    const minY = EDGE_MARGIN;

    // Rebonds X
    if (x <= minX) {
      x = minX;
      vx = -vx;
      nudgeAngle();
      tintOnCorner();
    } else if (x >= maxX) {
      x = maxX;
      vx = -vx;
      nudgeAngle();
      tintOnCorner();
    }

    // Rebonds Y
    if (y <= minY) {
      y = minY;
      vy = -vy;
      nudgeAngle();
      tintOnCorner();
    } else if (y >= maxY) {
      y = maxY;
      vy = -vy;
      nudgeAngle();
      tintOnCorner();
    }

    // Applique la position
    logo.style.transform = `translate3d(${x}px, ${y}px, 0)`;

    requestAnimationFrame(tick);
  }

  // Évite les boucles horizontales/verticales parfaites
  function nudgeAngle() {
    const jitter = (Math.random() - 0.5) * 0.15; // petit bruit
    const speed = Math.hypot(vx, vy) || 1;
    let angle = Math.atan2(vy, vx) + jitter;
    vx = Math.cos(angle);
    vy = Math.sin(angle);
    // renormalise (garde la même vitesse relative)
    const L = Math.hypot(vx, vy) || 1;
    vx /= L;
    vy /= L;
  }

  // Petit effet visuel quand on touche un bord (optionnel)
  let tintTimeout = null;
function tintOnCorner() {
  // Génère une teinte aléatoire
  const randomHue = Math.floor(Math.random() * 360);

  // On conserve le glow et on ajoute la teinte
  logo.style.filter = `
    hue-rotate(${randomHue}deg) saturate(1.2)
    drop-shadow(0 0 4px white)
    
  `;
}

  // Réagit au resize
  function onResize() {
    vw = window.innerWidth;
    vh = window.innerHeight;

    // S'assure que le logo reste dans l'écran après redimensionnement
    ({ w: lw, h: lh } = getLogoSize());
    x = Math.min(Math.max(x, EDGE_MARGIN), vw - lw - EDGE_MARGIN);
    y = Math.min(Math.max(y, EDGE_MARGIN), vh - lh - EDGE_MARGIN);
  }
  window.addEventListener('resize', onResize);

  // Met en pause quand l’onglet est caché (économie d’énergie)
  document.addEventListener('visibilitychange', () => {
    pausedForVisibility = document.hidden;
  });

  // Si l’image n’est pas encore chargée, on attend, sinon on lance direct
  if (logo.complete) {
    requestAnimationFrame((t) => {
      lastTime = t;
      tick(t);
    });
  } else {
    logo.addEventListener('load', () => {
      requestAnimationFrame((t) => {
        lastTime = t;
        tick(t);
      });
    });
  }
})();