#!/usr/bin/env bash
# =====================================================================
#  blog-gen.sh — 18nelli
#  Convertit les .md déposés dans blog/_sources/ en pages .html stylées
#  site (écrites dans blog/), et (re)génère la liste des articles dans la
#  page d'accueil blog.html.
#
#  Emplacement : tools/blog-gen.sh — à lancer depuis n'importe où, le
#  script retrouve seul la racine du site (dossier parent de tools/).
#
#  Workflow :
#    1. Notion -> "Export" -> Markdown & CSV
#    2. tu déposes le .md ET son dossier d'images dans blog/_sources/
#    3. tu lances :  ./tools/blog-gen.sh
#
#  BLOCS DE CODE (NOTION / GITHUB) :
#   - blocs ```lang ... ``` indentés ou racine correctement isolés et convertis.
#   - barre d'en-tête avec nom du langage et bouton "Copier" interactif.
#   - coloration syntaxique automatique intégrée.
#
#  DIAGRAMMES MERMAID :
#   - blocs ```mermaid ... ``` convertis automatiquement en diagrammes SVG (dark).
#
#  IMAGES :
#   - deux images collées dans le .md -> affichées CÔTE À CÔTE.
#   - taille par défaut 70% (réglable dans article.css).
#   - largeur forcée sur UNE image : tag w= dans la légende/alt,
#     ex : w=320 / w=100% / w=50%.
#   - clic sur n'importe quelle image pour l'afficher en grand,
#     puis reclic (ou Échap) pour la re-réduire.
#
#  EMBED FALSTAD :
#   - un lien Falstad seul sur sa ligne dans le .md
#     [https://www.falstad.com/circuit/circuitjs.html?ctz=...](...même url...)
#     est transformé en circuit interactif intégré (iframe), en dark.
#
#  INCREMENTAL / CACHE :
#   - Seuls les .md modifiés (ou nouveaux) sont régénérés en HTML.
#   - Si le .md n'a pas bougé depuis la dernière génération, le .html est ignoré.
#   - Pour forcer la régénération complète :  ./blog-gen.sh --force (ou -f)
#
#  Compatible macOS (Bash 3.2, sed/stat/date BSD) ET Linux. Idempotent.
# =====================================================================

set -euo pipefail

# --- Arguments CLI ---------------------------------------------------
FORCE_REBUILD=0
for arg in "${@:-}"; do
  case "$arg" in
    -f|--force)
      FORCE_REBUILD=1
      ;;
  esac
done

# --- Config ----------------------------------------------------------
# tools/ -> on remonte d'un cran pour atteindre la racine du site.
TOOLS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE_DIR="$(cd "$TOOLS_DIR/.." && pwd)"

BLOG_DIR="$SITE_DIR/blog"          # pages .html générées
SRC_DIR="$BLOG_DIR/_sources"       # exports Notion (.md + images)
INDEX_FILE="$SITE_DIR/blog.html"   # sommaire à mettre à jour

# Chemin des assets depuis un article (blog/xxx.html -> ../assets/...)
ASSETS="../assets"
# Dossier des images, relatif à un article généré.
IMG_PREFIX="_sources"
# Paramètres d'intégration Falstad (modifie à ta sauce) :
FALSTAD_PARAMS="hideSidebar=true&hideMenu=true&running=true&whiteBackground=false&editable=false"
# ---------------------------------------------------------------------

c_ok=$'\033[0;32m'; c_warn=$'\033[0;33m'; c_err=$'\033[0;31m'; c_rst=$'\033[0m'
info() { printf '%s==>%s %s\n' "$c_ok"   "$c_rst" "$*"; }
warn() { printf '%s/!\\%s %s\n' "$c_warn" "$c_rst" "$*"; }
die()  { printf '%sX%s %s\n'   "$c_err"  "$c_rst" "$*" >&2; exit 1; }

[ -d "$BLOG_DIR" ]   || die "Dossier introuvable : $BLOG_DIR"
[ -d "$SRC_DIR" ]    || die "Dossier des sources introuvable : $SRC_DIR"
[ -f "$INDEX_FILE" ] || die "Page d'accueil introuvable : $INDEX_FILE"

# --- Scripts JS article (zoom + mermaid) -----------------------------
ARTICLE_JS="$BLOG_DIR/article.js"
if [ ! -f "$ARTICLE_JS" ]; then
  cat > "$ARTICLE_JS" <<'JS'
// =====================================================================
//  article.js — 18nelli
//  - Zoom / Lightbox des images au clic (agrandir / re-réduire)
//  - Rendu des diagrammes Mermaid (dark theme)
// =====================================================================

(function () {
  'use strict';

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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initImageZoom();
      initMermaid();
      initCodeBlocks();
    });
  } else {
    initImageZoom();
    initMermaid();
    initCodeBlocks();
  }
})();
JS
  info "Fichier article.js initialise dans $BLOG_DIR"
fi

# --- Convertisseur markdown ------------------------------------------
MD_ENGINE=""
if command -v pandoc >/dev/null 2>&1; then
  MD_ENGINE="pandoc"
elif command -v python3 >/dev/null 2>&1 && python3 -c "import markdown" >/dev/null 2>&1; then
  MD_ENGINE="python"
else
  die "Aucun convertisseur markdown trouve. Installe l'un des deux :
     - pandoc           (macOS : brew install pandoc)
     - python markdown  (pip3 install markdown)"
fi
info "Moteur de conversion : $MD_ENGINE"
if [ "$MD_ENGINE" != "pandoc" ]; then
  warn "pandoc est absent : le HTML produit par python-markdown differe
     sensiblement (titres, listes, blocs de code). Les articles deja
     generes avec pandoc ne seront PAS retouches tant qu'ils sont a jour,
     mais evite --force sans pandoc installe (brew install pandoc)."
fi

md_to_html() {
  if [ "$MD_ENGINE" = "pandoc" ]; then
    # +autolink_bare_uris : rend cliquables les URLs collées sans [..](..)
    pandoc -f markdown+autolink_bare_uris -t html5 --no-highlight "$1"
  else
    python3 - "$1" <<'PY'
import sys, markdown
with open(sys.argv[1], encoding="utf-8") as f:
    src = f.read()
print(markdown.markdown(src, extensions=["fenced_code", "tables"]))
PY
  fi
}

html_escape() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g'; }

# Encode un nom de dossier en pourcent-encodage, comme le fait un
# convertisseur markdown :
#   "Setup IA"                    -> "Setup%20IA"
#   "Migser - mixer stereo"       -> "Migser%20-%20mixer%20stereo"
#   "...stereo 6 entrees" accentue -> "...st%C3%A9r%C3%A9o%206%20entr%C3%A9es"
# LC_ALL=C force un parcours OCTET par octet : indispensable pour que les
# caracteres accentues (UTF-8, 2 octets) soient encodes correctement.
url_encode_path() {
  local LC_ALL=C
  local s="$1" out="" i c
  for (( i = 0; i < ${#s}; i++ )); do
    c="${s:i:1}"
    case "$c" in
      [a-zA-Z0-9._~-]) out="$out$c" ;;
      /)               out="$out/" ;;
      *)               out="$out$(printf '%%%02X' "'$c")" ;;
    esac
  done
  printf '%s' "$out"
}

# Repréfixe par $IMG_PREFIX/ tout src="..." / href="..." pointant vers un
# dossier d'images présent dans $SRC_DIR.
#   src="Setup%20IA/image.png"  ->  src="_sources/Setup%20IA/image.png"
# Les chemins déjà préfixés, les URL absolues et ../assets sont ignorés
# puisqu'ils ne commencent pas par un nom de dossier connu.
prefix_image_paths() {
  local html="$1" dir name enc
  for dir in "$SRC_DIR"/*/; do
    [ -d "$dir" ] || continue
    name="$(basename "$dir")"
    enc="$(url_encode_path "$name")"
    # On essaie le nom brut ET le nom encode : selon le convertisseur
    # (pandoc ou python-markdown) l'un ou l'autre apparait dans le HTML.
    for variant in "$name" "$enc"; do
      html="${html//src=\"$variant\//src=\"$IMG_PREFIX/$variant/}"
      html="${html//href=\"$variant\//href=\"$IMG_PREFIX/$variant/}"
      html="${html//src=\"./$variant\//src=\"$IMG_PREFIX/$variant/}"
      html="${html//href=\"./$variant\//href=\"$IMG_PREFIX/$variant/}"
    done
  done
  printf '%s' "$html"
}

make_slug() {
  printf '%s' "$1" \
    | sed 's/ [0-9a-f]\{32\}$//' \
    | tr '[:upper:]' '[:lower:]' \
    | sed 's/à/a/g; s/â/a/g; s/ä/a/g; s/á/a/g; s/é/e/g; s/è/e/g; s/ê/e/g; s/ë/e/g; s/î/i/g; s/ï/i/g; s/í/i/g; s/ô/o/g; s/ö/o/g; s/ó/o/g; s/û/u/g; s/ü/u/g; s/ù/u/g; s/ç/c/g; s/ñ/n/g' \
    | sed 's/[^a-z0-9]\{1,\}/-/g; s/^-*//; s/-*$//'
}

rewrite() {
  local f="$1"; shift
  local tmp="$f.tmp.$$"
  if awk "$@" "$f" > "$tmp"; then
    if cmp -s "$tmp" "$f"; then
      rm -f "$tmp"
    else
      mv "$tmp" "$f"
    fi
  else
    rm -f "$tmp"
    return 1
  fi
}

# Pré-processeur markdown (awk, syntaxe verbatim car heredoc quoté).
# FALSTAD_PARAMS est injecté via -v à l'appel.
read -r -d '' PRE_AWK <<'AWK' || true
function esc(s){ gsub(/&/,"\\&amp;",s); gsub(/</,"\\&lt;",s); gsub(/>/,"\\&gt;",s); gsub(/"/,"\\&quot;",s); return s }
function escurl(s){ gsub(/&/,"\\&amp;",s); return s }
function imgtag(i,   tag,w){
  w=a_w[i]
  tag="<img src=\"" a_src[i] "\" alt=\"" esc(a_alt[i]) "\""
  if(w!=""){
    if(rowmode) tag=tag " style=\"flex-basis:" w "; flex-grow:0\""
    else        tag=tag " style=\"width:" w "\""
  }
  return tag " />"
}
function flush(   i,row){
  if(n==0) return
  print ""
  if(n==1){ rowmode=0; print "<div class=\"img-single\">" imgtag(1) "</div>" }
  else {
    rowmode=1
    row="<div class=\"img-row\">"
    for(i=1;i<=n;i++) row=row imgtag(i)
    print row "</div>"
  }
  print ""
  n=0
}
function falstad(url,   sep,src){
  sep=(url ~ /\?/)?"&":"?"
  src=url sep FALSTAD_PARAMS
  return "<div class=\"embed-falstad\"><iframe src=\"" escurl(src) "\" loading=\"lazy\" allowfullscreen></iframe>" \
         "<a class=\"embed-link\" href=\"" escurl(url) "\" target=\"_blank\" rel=\"noopener\">Ouvrir dans Falstad &#8599;</a></div>"
}
{
  line=$0
  # 0) Blocs de code (fences ```) :
  # Si un bloc de code est indenté (ex: toggle ou liste Notion avec 4 espaces),
  # on supprime cette indentation pour que markdown le traite en vrai bloc de code clôturé.
  if (!in_fence && match(line, /^[[:space:]]+```/)){
    if(n>0) flush()
    in_fence = 1
    fence_indent = RLENGTH - 3
    sub(/^[[:space:]]+/, "", line)
    print ""
    print line
    next
  } else if (!in_fence && line ~ /^```/){
    if(n>0) flush()
    in_fence = 1
    fence_indent = 0
    print line
    next
  }

  if (in_fence){
    if (line ~ /^[[:space:]]*```[[:space:]]*$/){
      in_fence = 0
      fence_indent = 0
      print "```"
      print ""
      next
    }
    if (fence_indent > 0){
      pat = "^[[:space:]]{1," fence_indent "}"
      sub(pat, "", line)
    }
    print line
    next
  }
  # 1) Lien Falstad seul -> embed
  if (line ~ /^\[.*\]\(https?:\/\/[^)]*falstad\.com\/circuit\/circuitjs\.html[^)]*\)[[:space:]]*$/){
    if(n>0) flush()
    url=line; sub(/^\[.*\]\(/,"",url); sub(/\)[[:space:]]*$/,"",url)
    print ""; print falstad(url); print ""
    next
  }
  # 2) Image seule sur sa ligne
  if (line ~ /^!\[[^]]*\]\([^)]*\)[[:space:]]*$/){
    alt=line; sub(/^!\[/,"",alt); sub(/\].*$/,"",alt)
    src=line; sub(/^!\[[^]]*\]\(/,"",src); sub(/\)[[:space:]]*$/,"",src)
    w=""
    if (match(alt, /w=[0-9]+(px|%)?/)){
      tok=substr(alt,RSTART,RLENGTH); w=substr(tok,3)
      sub(/ *w=[0-9]+(px|%)?/,"",alt)
      if (w ~ /^[0-9]+$/) w=w "px"
    }
    n++; a_src[n]=src; a_alt[n]=alt; a_w[n]=w
    next
  }
  # 3) ligne vide : on garde le groupe d'images ouvert
  if (line ~ /^[[:space:]]*$/){ if(n>0) next; print line; next }
  # 4) ligne normale : on ferme un éventuel groupe puis on imprime
  if(n>0) flush()
  print line
}
END{ if(n>0) flush() }
AWK

# --- Génération des articles -----------------------------------------
shopt -s nullglob
mds=("$SRC_DIR"/*.md)
[ ${#mds[@]} -gt 0 ] || die "Aucun .md trouve dans $SRC_DIR — rien a faire."

index_tmp="$(mktemp)"; block_tmp="$(mktemp)"
trap 'rm -f "$index_tmp" "$block_tmp"' EXIT
TAB="$(printf '\t')"

# Récupère l'index blog.html committed dans git (s'il existe) pour préserver les dates d'origine
HEAD_BLOG="$(git show HEAD:blog.html 2>/dev/null || true)"

count_total=0
count_gen=0
count_skip=0

for md in "${mds[@]}"; do
  base="$(basename "$md")"; base="${base%.md}"
  slug="$(make_slug "$base")"; [ -n "$slug" ] || slug="article"
  html_name="$slug.html"
  html_path="$BLOG_DIR/$html_name"

  title="$(grep -m1 '^#\{1,\} ' "$md" 2>/dev/null | sed 's/^#\{1,\} *//' || true)"
  [ -n "$title" ] || title="$(printf '%s' "$base" | sed 's/ [0-9a-f]\{32\}$//')"
  title_esc="$(printf '%s' "$title" | html_escape)"

  # Résolution intelligente de la date de l'article :
  # 1) Si le .md est suivi dans Git et n'a pas été modifié localement :
  #    a) date d'origine déjà enregistrée dans HEAD:blog.html
  #    b) sinon date du dernier commit Git
  # 2) Si le .md est nouveau ou modifié localement : date du fichier sur le disque (stat)
  mtime=""
  date_fr=""

  if git ls-files --error-unmatch "$md" >/dev/null 2>&1 && git diff --quiet "$md" 2>/dev/null; then
    if [ -n "$HEAD_BLOG" ]; then
      old_date="$(printf '%s\n' "$HEAD_BLOG" | sed -n "s/.*>${title_esc}<\/a>[[:space:]]*<span class=\"date\">\([0-9/]*\)<\/span>.*/\1/p" | head -n1 || true)"
      if [ -n "$old_date" ]; then
        date_fr="$old_date"
      fi
    fi
    # --follow : retrouve l'historique meme apres un deplacement du .md
    mtime="$(git log -1 --follow --format=%ct -- "$md" 2>/dev/null || true)"
    if [ -n "$mtime" ] && [ -z "$date_fr" ]; then
      date_fr="$(date -d "@$mtime" '+%d/%m/%Y' 2>/dev/null || date -r "$mtime" '+%d/%m/%Y')"
    fi
  fi

  # Replis INDEPENDANTS.
  # (Avant : un seul bloc `if vide(mtime) OU vide(date)`, qui ecrasait une
  #  date correctement lue dans HEAD:blog.html des que mtime manquait --
  #  ce qui arrive pour un .md deplace mais pas encore commite.)
  if [ -z "$mtime" ]; then
    mtime="$(stat -c %Y "$md" 2>/dev/null || stat -f %m "$md")"
  fi
  if [ -z "$date_fr" ]; then
    date_fr="$(date -d "@$mtime" '+%d/%m/%Y' 2>/dev/null || date -r "$mtime" '+%d/%m/%Y')"
  fi

  # Cle de tri = date AFFICHEE (JJ/MM/AAAA -> AAAAMMJJ), pas la date de
  # commit : le sommaire doit suivre l'ordre que voit le lecteur.
  # A date egale, on departage sur le titre (ordre alphabetique inverse) :
  # c'est arbitraire mais STABLE d'une generation a l'autre, contrairement
  # au mtime qui bouge a chaque copie/clone du depot.
  sort_key="$(printf '%s' "$date_fr" | awk -F/ '{ printf "%04d%02d%02d", $3, $2, $1 }')"
  [ -n "$sort_key" ] || sort_key="00000000"

  printf '%s%s%s%s%s%s%s%s%s\n' \
    "$sort_key" "$TAB" "$mtime" "$TAB" "$html_name" "$TAB" "$title_esc" "$TAB" "$date_fr" \
    >> "$index_tmp"
  count_total=$((count_total + 1))

  # Si le HTML existe déjà, est plus récent que le .md et porte la bonne date : on saute
  if [ "$FORCE_REBUILD" -eq 0 ] && [ -f "$html_path" ] && [ "$html_path" -nt "$md" ] && grep -q "last modified: $date_fr" "$html_path" 2>/dev/null; then
    info "Article a jour (ignore) : blog/$html_name"
    count_skip=$((count_skip + 1))
    continue
  fi

  # 1) retire le 1er H1   2) images + embeds Falstad   3) convertit
  body_tmp="$(mktemp)"
  awk 'BEGIN{d=0} /^# /{ if(!d){d=1; next} } {print}' "$md" \
    | awk -v FALSTAD_PARAMS="$FALSTAD_PARAMS" "$PRE_AWK" > "$body_tmp"
  article_html="$(md_to_html "$body_tmp")"
  rm -f "$body_tmp"

  # Les images vivent dans blog/_sources/<Dossier Notion>/ alors que la
  # page générée est dans blog/. On repréfixe donc les src/href qui
  # pointent vers le dossier d'images de CET article.
  # On liste les vrais dossiers présents plutôt que de deviner : c'est
  # exact même avec espaces, accents ou tirets dans le nom.
  article_html="$(prefix_image_paths "$article_html")"

  # Détection présence de diagrammes Mermaid
  mermaid_tag=""
  if grep -qE '^[[:space:]]*```[[:space:]]*mermaid' "$md" || grep -qE '(class="[^"]*mermaid"|language-mermaid)' <<< "$article_html"; then
    mermaid_tag="    <script type=\"module\">
      import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
      import elkLayouts from 'https://cdn.jsdelivr.net/npm/@mermaid-js/layout-elk@0/dist/mermaid-layout-elk.esm.min.mjs';
      if (typeof mermaid.registerLayoutLoaders === 'function') {
        mermaid.registerLayoutLoaders(elkLayouts);
        window._elkRegistered = true;
      }
      window.mermaid = mermaid;
    </script>"
  fi

  cat > "$html_path" <<HTML
<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0, shrink-to-fit=no"
    />
    <title>$title_esc</title>
    <link rel="stylesheet" href="$ASSETS/vendor/bootstrap/css/bootstrap.min.css" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Iceland&display=swap"
      rel="stylesheet"
    />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css?family=Comic+Neue&amp;display=swap"
    />
    <link rel="stylesheet" href="$ASSETS/vendor/animate.min.css" />
    <link rel="stylesheet" href="$ASSETS/css/styles.css" />
    <link rel="stylesheet" href="article.css" />
    <link rel="stylesheet" href="$ASSETS/css/screen-g4.css" />
${mermaid_tag:+$mermaid_tag
}    <script defer src="article.js"></script>
  </head>
  <body
    style="
      background: url('$ASSETS/img/dmontag.png') center / contain, rgb(0, 0, 0);
    "
  >
    <h1 class="photoh1">$title_esc</h1>
    <a href="../blog.html" class="house-link">
      <img src="$ASSETS/img/retour.png" alt="Retour" class="house-icon" />
    </a>

    <article class="article">
      <p class="article-meta">last modified: $date_fr</p>
$article_html
    </article>
    <script src="$ASSETS/js/screen-g4.js"></script>
  </body>
</html>
HTML

  info "Article genere : blog/$html_name  -> \"$title\""
  count_gen=$((count_gen + 1))
done

# --- Mise à jour de blog.html ----------------------------------------
if ! grep -q 'blog/article.css' "$INDEX_FILE"; then
  rewrite "$INDEX_FILE" '
    { print }
    /href="assets\/css\/styles.css"/ { print "    <link rel=\"stylesheet\" href=\"./blog/article.css\" />" }'
  info "Lien vers blog/article.css ajoute dans blog.html"
fi

if ! grep -q '<!-- BLOG:START -->' "$INDEX_FILE"; then
  rewrite "$INDEX_FILE" '
    /<\/body>/ && !done { print "    <!-- BLOG:START -->"; print "    <!-- BLOG:END -->"; done=1 }
    { print }'
  info "Marqueurs BLOG:START/END poses dans blog.html"
fi

{
  echo '    <div class="blog-index">'
  echo '      <ul>'
  LC_ALL=C sort -t "$TAB" -k1,1nr -k4,4r "$index_tmp" | while IFS="$TAB" read -r _key _mt fhtml ftitle fdate; do
    printf '        <li><a href="./blog/%s">%s</a> <span class="date">%s</span></li>\n' \
      "$fhtml" "$ftitle" "$fdate"
  done
  echo '      </ul>'
  echo '    </div>'
} > "$block_tmp"

rewrite "$INDEX_FILE" -v blockfile="$block_tmp" '
  /<!-- BLOG:START -->/ { print; while ((getline line < blockfile) > 0) print line; close(blockfile); skip=1; next }
  /<!-- BLOG:END -->/   { skip=0; print; next }
  !skip { print }'

if [ "$count_gen" -gt 0 ]; then
  info "$count_gen article(s) genere(s), $count_skip deja a jour."
else
  info "Tous les articles sont deja a jour ($count_skip/$count_total)."
fi
printf '%sTermine.%s\n' "$c_ok" "$c_rst"