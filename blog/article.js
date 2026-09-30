// =====================================================================
//  article.js — 18nelli
//  - Zoom / Lightbox des images au clic (agrandir / re-réduire)
//  - Rendu des diagrammes Mermaid (dark theme)
//  - Liens morts -> copie archivée (Internet Archive)
// =====================================================================

(function () {
  'use strict';

  // Adresse de ce script, pour retrouver ../data/ d'où que l'article soit servi.
  const SCRIPT_SRC = document.currentScript && document.currentScript.src;

  // --- 1. ZOOM / LIGHTBOX DES IMAGES ---------------------------------
  function initImageZoom() {
    let lightbox = document.getElementById('image-lightbox');
    if (!lightbox) {
      lightbox = document.createElement('div');
      lightbox.id = 'image-lightbox';
      lightbox.className = 'image-lightbox';
      lightbox.setAttribute('role', 'dialog');
      lightbox.setAttribute('aria-modal', 'true');
      lightbox.setAttribute('aria-label', 'Image agrandie');
      lightbox.innerHTML =
        '<div class="image-lightbox-close" title="Fermer (Échap)">&times;</div>' +
        '<img class="image-lightbox-img" src="" alt="" />';
      document.body.appendChild(lightbox);
    }

    const lightboxImg = lightbox.querySelector('.image-lightbox-img');

    function openLightbox(img) {
      lightboxImg.src = img.currentSrc || img.src;
      lightboxImg.alt = img.alt || 'Image agrandie';
      lightboxImg.style.position = 'static';
      lightboxImg.style.left = 'auto';
      lightboxImg.style.right = 'auto';
      lightboxImg.style.margin = '0 auto';
      lightboxImg.style.display = 'block';
      lightbox.classList.add('active');
      document.body.classList.add('lightbox-open');
    }

    function closeLightbox() {
      lightbox.classList.remove('active');
      document.body.classList.remove('lightbox-open');
    }

    // Clic sur une image de l'article -> agrandir
    document.addEventListener('click', function (e) {
      const articleImg = e.target.closest('.article img');
      if (articleImg) {
        e.preventDefault();
        openLightbox(articleImg);
        return;
      }

      // Clic sur l'image agrandie, le fond ou le bouton fermer -> réduire
      if (lightbox.classList.contains('active')) {
        if (
          e.target === lightbox ||
          e.target === lightboxImg ||
          e.target.closest('.image-lightbox-close')
        ) {
          closeLightbox();
        }
      }
    });

    // Touche Échap pour refermer
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (lightbox.classList.contains('active')) {
          closeLightbox();
        }
        const fsMermaid = document.querySelector('.mermaid-block.is-fullscreen');
        if (fsMermaid) {
          fsMermaid.classList.remove('is-fullscreen');
          document.body.classList.remove('lightbox-open');
          const btn = fsMermaid.querySelector('.btn-fullscreen');
          if (btn) btn.innerHTML = '⛶ Plein écran';
        }
      }
    });
  }

  // --- 2. SUPPORT DES DIAGRAMMES MERMAID STYLE NOTION -------------
  function initMermaid() {
    const rawBlocks = document.querySelectorAll(
      'pre code.language-mermaid, pre.mermaid code, pre.mermaid, code.language-mermaid, div.mermaid'
    );
    if (!rawBlocks.length) return;

    const containers = [];
    rawBlocks.forEach(function (el) {
      if (el.closest('.mermaid-block')) {
        containers.push(el);
        return;
      }

      const pre = el.closest('pre') || el;
      if (!pre.parentNode) return;

      // Construction du bloc style Notion avec barre d'outils
      const block = document.createElement('div');
      block.className = 'mermaid-block';

      const toolbar = document.createElement('div');
      toolbar.className = 'mermaid-toolbar';

      const title = document.createElement('div');
      title.className = 'mermaid-title';
      title.innerHTML = '<span>◇</span> MERMAID';

      const controls = document.createElement('div');
      controls.className = 'mermaid-controls';

      const btnZoomOut = document.createElement('button');
      btnZoomOut.type = 'button';
      btnZoomOut.className = 'mermaid-btn btn-zoom-out';
      btnZoomOut.title = 'Zoom arrière';
      btnZoomOut.textContent = '−';

      const btnReset = document.createElement('button');
      btnReset.type = 'button';
      btnReset.className = 'mermaid-btn btn-zoom-reset';
      btnReset.title = 'Réinitialiser';
      btnReset.textContent = '100%';

      const btnZoomIn = document.createElement('button');
      btnZoomIn.type = 'button';
      btnZoomIn.className = 'mermaid-btn btn-zoom-in';
      btnZoomIn.title = 'Zoom avant';
      btnZoomIn.textContent = '+';

      const btnFs = document.createElement('button');
      btnFs.type = 'button';
      btnFs.className = 'mermaid-btn btn-fullscreen';
      btnFs.title = 'Basculer en plein écran';
      btnFs.innerHTML = '⛶ Plein écran';

      controls.appendChild(btnZoomOut);
      controls.appendChild(btnReset);
      controls.appendChild(btnZoomIn);
      controls.appendChild(btnFs);

      toolbar.appendChild(title);
      toolbar.appendChild(controls);

      const viewport = document.createElement('div');
      viewport.className = 'mermaid-viewport';

      const wrapper = document.createElement('div');
      wrapper.className = 'mermaid-wrapper';

      let codeText = el.textContent.trim();
      if (!codeText.includes('layout: elk') && !codeText.includes('layout:elk')) {
        codeText = '---\nconfig:\n  layout: elk\n---\n' + codeText;
      }

      const div = document.createElement('div');
      div.className = 'mermaid';
      div.textContent = codeText;

      wrapper.appendChild(div);
      viewport.appendChild(wrapper);
      block.appendChild(toolbar);
      block.appendChild(viewport);

      pre.parentNode.insertBefore(block, pre);
      pre.remove();
      containers.push(div);

      // Gestion du Zoom
      let currentZoom = 1.0;
      function setZoom(z) {
        currentZoom = Math.min(3.0, Math.max(0.4, z));
        wrapper.style.transform = currentZoom === 1.0 ? 'none' : 'scale(' + currentZoom + ')';
        btnReset.textContent = Math.round(currentZoom * 100) + '%';
      }

      btnZoomIn.addEventListener('click', function () { setZoom(currentZoom + 0.2); });
      btnZoomOut.addEventListener('click', function () { setZoom(currentZoom - 0.2); });
      btnReset.addEventListener('click', function () { setZoom(1.0); });

      // Gestion du Plein Écran
      function toggleFullscreen() {
        if (!document.fullscreenElement && !block.classList.contains('is-fullscreen')) {
          if (block.requestFullscreen) {
            block.requestFullscreen().catch(function () {
              block.classList.add('is-fullscreen');
              document.body.classList.add('lightbox-open');
            });
          } else {
            block.classList.add('is-fullscreen');
            document.body.classList.add('lightbox-open');
          }
          btnFs.innerHTML = '✕ Quitter';
        } else {
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(function () {});
          }
          block.classList.remove('is-fullscreen');
          document.body.classList.remove('lightbox-open');
          btnFs.innerHTML = '⛶ Plein écran';
        }
      }
      btnFs.addEventListener('click', toggleFullscreen);

      document.addEventListener('fullscreenchange', function () {
        if (!document.fullscreenElement && block.classList.contains('is-fullscreen')) {
          block.classList.remove('is-fullscreen');
          document.body.classList.remove('lightbox-open');
          btnFs.innerHTML = '⛶ Plein écran';
        } else if (document.fullscreenElement === block) {
          block.classList.add('is-fullscreen');
          btnFs.innerHTML = '✕ Quitter';
        }
      });

      // Gestion du déplacement à la souris (Pan / Grab)
      let isDown = false;
      let startX = 0;
      let startY = 0;
      let scrollLeft = 0;
      let scrollTop = 0;

      viewport.addEventListener('mousedown', function (e) {
        if (e.target.closest('button')) return;
        isDown = true;
        startX = e.pageX - viewport.offsetLeft;
        startY = e.pageY - viewport.offsetTop;
        scrollLeft = viewport.scrollLeft;
        scrollTop = viewport.scrollTop;
      });

      window.addEventListener('mouseup', function () { isDown = false; });
      viewport.addEventListener('mouseleave', function () { isDown = false; });

      viewport.addEventListener('mousemove', function (e) {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - viewport.offsetLeft;
        const y = e.pageY - viewport.offsetTop;
        viewport.scrollLeft = scrollLeft - (x - startX);
        viewport.scrollTop = scrollTop - (y - startY);
      });
    });

    if (!containers.length) return;

    function renderDiagrams(mermaidInstance) {
      try {
        mermaidInstance.initialize({
          startOnLoad: false,
          layout: 'elk',
          flowchart: {
            defaultRenderer: 'elk'
          },
          theme: 'base',
          themeVariables: {
            darkMode: true,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Helvetica, Arial, sans-serif',
            fontSize: '13.5px',
            background: '#191919',
            mainBkg: '#262626',
            nodeBorder: '#555555',
            primaryColor: '#262626',
            primaryBorderColor: '#555555',
            primaryTextColor: '#ffffff',
            secondaryColor: '#2a2a2a',
            secondaryBorderColor: '#666666',
            secondaryTextColor: '#ffffff',
            tertiaryColor: '#202020',
            tertiaryBorderColor: '#444444',
            tertiaryTextColor: '#ffffff',
            lineColor: '#8b949e',
            textColor: '#ffffff',
            edgeLabelBackground: '#2b2b2b',
            labelBackground: '#2b2b2b',
            labelTextColor: '#ffffff',
            clusterBkg: '#1c1c1c',
            clusterBorder: '#444444',
            titleColor: '#ffffff'
          },
          securityLevel: 'loose'
        });
        if (typeof mermaidInstance.run === 'function') {
          mermaidInstance.run({ nodes: containers });
        } else if (typeof mermaidInstance.init === 'function') {
          mermaidInstance.init(undefined, containers);
        }
      } catch (err) {
        console.error('Erreur rendu Mermaid:', err);
      }
    }

    async function getMermaidInstance() {
      if (window.mermaid && window._elkRegistered) {
        return window.mermaid;
      }
      try {
        const [mermaidMod, elkMod] = await Promise.all([
          import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs'),
          import('https://cdn.jsdelivr.net/npm/@mermaid-js/layout-elk@0/dist/mermaid-layout-elk.esm.min.mjs')
        ]);
        const m = mermaidMod.default;
        const elk = elkMod.default;
        if (typeof m.registerLayoutLoaders === 'function') {
          m.registerLayoutLoaders(elk);
          window._elkRegistered = true;
        }
        window.mermaid = m;
        return m;
      } catch (e) {
        console.warn('Chargement secours Mermaid:', e);
        if (!window.mermaid) {
          await new Promise(function (resolve, reject) {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
          });
        }
        return window.mermaid;
      }
    }

    getMermaidInstance().then(function (instance) {
      if (instance) {
        renderDiagrams(instance);
      }
    });
  }

  // --- 3. BLOCS DE CODE STYLE NOTION / GITHUB -----------------------
  function initCodeBlocks() {
    const codeBlocks = document.querySelectorAll('.article pre > code');
    if (!codeBlocks.length) return;

    let hasNormalCode = false;

    codeBlocks.forEach(function (code) {
      // Ignore les diagrammes Mermaid
      if (
        code.classList.contains('language-mermaid') ||
        (code.parentElement && code.parentElement.classList.contains('mermaid'))
      ) {
        return;
      }

      hasNormalCode = true;
      const pre = code.parentElement;
      if (!pre || (pre.parentElement && pre.parentElement.classList.contains('code-block'))) return;

      // Détection du nom de langage
      let lang = '';
      code.classList.forEach(function (cls) {
        if (cls.startsWith('language-')) {
          lang = cls.replace('language-', '');
        }
      });
      // pandoc (--no-highlight) met le langage sur <pre class="bash">
      // et non sur <code> : on le récupère, et on le recopie sur <code>
      // pour que highlight.js colore dans le bon langage.
      if (!lang) {
        pre.classList.forEach(function (cls) {
          if (!lang && cls !== 'sourceCode' && cls !== 'mermaid') lang = cls;
        });
        if (lang) code.classList.add('language-' + lang);
      }

      // Création du conteneur Notion / GitHub
      const wrapper = document.createElement('div');
      wrapper.className = 'code-block';

      const header = document.createElement('div');
      header.className = 'code-block-header';

      const langBadge = document.createElement('span');
      langBadge.className = 'code-block-lang';
      langBadge.textContent = lang ? lang.toUpperCase() : 'CODE';

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'code-block-copy';
      copyBtn.setAttribute('title', 'Copier le code');
      copyBtn.innerHTML = '<span class="copy-icon">📋</span> Copier';

      copyBtn.addEventListener('click', function () {
        const text = code.textContent;
        navigator.clipboard.writeText(text).then(function () {
          copyBtn.innerHTML = '<span class="copy-icon">✓</span> Copié !';
          copyBtn.classList.add('copied');
          setTimeout(function () {
            copyBtn.innerHTML = '<span class="copy-icon">📋</span> Copier';
            copyBtn.classList.remove('copied');
          }, 2000);
        }).catch(function () {
          copyBtn.textContent = 'Erreur';
        });
      });

      header.appendChild(langBadge);
      header.appendChild(copyBtn);

      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(header);
      wrapper.appendChild(pre);
    });

    // Coloration syntaxique via highlight.js
    if (hasNormalCode && !window.hljs) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github-dark.min.css';
      document.head.appendChild(link);

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js';
      script.onload = function () {
        document.querySelectorAll('.code-block pre code').forEach(function (block) {
          window.hljs.highlightElement(block);
        });
      };
      document.head.appendChild(script);
    } else if (hasNormalCode && window.hljs) {
      document.querySelectorAll('.code-block pre code').forEach(function (block) {
        window.hljs.highlightElement(block);
      });
    }
  }

  // --- 4. LIENS MORTS -> COPIE ARCHIVÉE -----------------------------
  // tools/archive-links.mjs (lancé chaque nuit par le serveur) publie
  // data/link-archive.json : les liens externes MORTS y figurent avec leur
  // copie de l'Internet Archive. Un lien mort est redirigé vers cette copie,
  // et marqué « archive » pour que le lecteur sache où il atterrit.
  // Fichier absent (site ouvert en local...) ou vide : rien ne change.
  function initArchivedLinks() {
    const links = document.querySelectorAll('.article a[href^="http"]');
    if (!links.length) return;

    const dataUrl = new URL('../data/link-archive.json', SCRIPT_SRC || location.href).href;
    fetch(dataUrl, { cache: 'no-cache' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        const dead = data && data.dead;
        if (!dead) return;

        links.forEach(function (a) {
          let key;
          try {
            // Même clé que l'archiveur : URL normalisée, sans le #fragment.
            const u = new URL(a.href);
            u.hash = '';
            key = u.href;
          } catch (e) {
            return;
          }
          const hit = Object.prototype.hasOwnProperty.call(dead, key) ? dead[key] : null;
          // Seules des copies de l'Internet Archive sont acceptées comme destination.
          if (!hit || !/^https:\/\/web\.archive\.org\/web\//.test(hit.archive)) return;

          const date = String(hit.date || '').split('-').reverse().join('/');
          const note = 'Le lien d’origine est mort — copie du ' + date + ' (Internet Archive)';
          a.dataset.originalHref = a.href;
          a.href = hit.archive;
          a.classList.add('lien-archive');
          a.title = note;

          const tag = document.createElement('span');
          tag.className = 'lien-archive-tag';
          tag.textContent = 'archive';
          tag.title = note;
          a.after(tag);
        });
      })
      .catch(function () { /* pas d'archive disponible : les liens restent tels quels */ });
  }

  function init() {
    initImageZoom();
    initMermaid();
    initCodeBlocks();
    initArchivedLinks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
