#!/usr/bin/env bash
# =====================================================================
#  blog-gen.sh — 18nelli
#  Convertit les .md déposés dans ./blog/ en pages .html stylées site,
#  et (re)génère la liste des articles dans blog/blog.html.
#
#  Workflow :
#    1. tu rédiges sur Notion -> export markdown
#    2. tu déposes le .md dans le dossier blog/
#    3. tu lances :  ./blog-gen.sh
#
#  Idempotent : tu peux le relancer autant que tu veux, ça met juste
#  à jour. Réécrit les articles, jamais de doublons dans l'index.
# =====================================================================

set -euo pipefail

# --- Config ----------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BLOG_DIR="$SCRIPT_DIR/blog"          # où tu déposes les .md
INDEX_FILE="$BLOG_DIR/blog.html"     # page d'accueil des articles
CSS_FILE="$BLOG_DIR/article.css"     # style des articles (généré 1x)
ASSETS="../assets"                   # chemin des assets depuis blog/
# ---------------------------------------------------------------------

# Couleurs console (juste pour le confort de lecture)
c_ok=$'\033[0;32m'; c_warn=$'\033[0;33m'; c_err=$'\033[0;31m'; c_rst=$'\033[0m'
info()  { printf '%s==>%s %s\n' "$c_ok"   "$c_rst" "$*"; }
warn()  { printf '%s/!\\%s %s\n' "$c_warn" "$c_rst" "$*"; }
die()   { printf '%sX%s %s\n'   "$c_err"  "$c_rst" "$*" >&2; exit 1; }

[ -d "$BLOG_DIR" ] || die "Dossier introuvable : $BLOG_DIR"

# --- Détection du convertisseur markdown -----------------------------
# Priorité à pandoc (meilleur rendu), sinon python3 + module markdown.
MD_ENGINE=""
if command -v pandoc >/dev/null 2>&1; then
  MD_ENGINE="pandoc"
elif command -v python3 >/dev/null 2>&1 && python3 -c "import markdown" 2>/dev/null; then
  MD_ENGINE="python"
else
  die "Aucun convertisseur markdown trouvé.
   Installe l'un des deux :
     - pandoc         (Debian/Ubuntu : sudo apt install pandoc)
     - python markdown (pip install markdown)"
fi
info "Moteur de conversion : $MD_ENGINE"

# md_to_html <fichier.md>  -> écrit le fragment HTML sur stdout
md_to_html() {
  local md="$1"
  if [ "$MD_ENGINE" = "pandoc" ]; then
    pandoc -f markdown -t html5 --no-highlight "$md"
  else
    python3 - "$md" <<'PY'
import sys, markdown
with open(sys.argv[1], encoding="utf-8") as f:
    src = f.read()
print(markdown.markdown(src, extensions=["fenced_code", "tables"]))
PY
  fi
}

# Échappe les caractères HTML d'une chaîne (pour le <title> et l'index)
html_escape() {
  sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g'
}

# --- Création du CSS si absent (tu peux ensuite le bidouiller) --------
if [ ! -f "$CSS_FILE" ]; then
  warn "article.css absent — pense à le récupérer (style des articles)."
fi

# --- Génération des articles -----------------------------------------
shopt -s nullglob
mds=("$BLOG_DIR"/*.md)
[ ${#mds[@]} -gt 0 ] || die "Aucun .md trouvé dans $BLOG_DIR — rien à faire."

# On collecte (mtime <TAB> html_basename <TAB> titre) pour trier l'index.
index_tmp="$(mktemp)"
trap 'rm -f "$index_tmp"' EXIT

count=0
for md in "${mds[@]}"; do
  base="$(basename "${md%.md}")"
  html_name="$base.html"
  html_path="$BLOG_DIR/$html_name"

  # Titre = 1er "# Titre" du markdown, sinon nom de fichier lisible.
  title="$(grep -m1 '^# ' "$md" 2>/dev/null | sed 's/^#\+ *//' || true)"
  if [ -z "$title" ]; then
    title="$(echo "$base" | tr '-_' '  ')"
  fi
  title_esc="$(printf '%s' "$title" | html_escape)"

  # Date (modif du .md), pour l'affichage + le tri.
  mtime="$(stat -c %Y "$md" 2>/dev/null || stat -f %m "$md")"
  date_fr="$(date -d "@$mtime" '+%d/%m/%Y' 2>/dev/null || date -r "$mtime" '+%d/%m/%Y')"

  # Corps : on retire le 1er H1 (déjà utilisé comme titre de page) puis on convertit.
  body_tmp="$(mktemp)"
  awk 'BEGIN{done=0} /^# /{ if(!done){done=1; next} } {print}' "$md" > "$body_tmp"
  article_html="$(md_to_html "$body_tmp")"
  rm -f "$body_tmp"

  # Écriture de la page d'article (mêmes head/fond/bouton retour que le site).
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
    <link rel="stylesheet" href="$ASSETS/bootstrap/css/bootstrap.min.css" />
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
    <link rel="stylesheet" href="$ASSETS/css/animate.min.css" />
    <link rel="stylesheet" href="$ASSETS/css/styles.css" />
    <link rel="stylesheet" href="article.css" />
  </head>
  <body
    style="
      background: url('$ASSETS/img/dmontag.png') center / contain, rgb(0, 0, 0);
    "
  >
    <h1 class="photoh1">$title_esc</h1>
    <a href="./blog.html" class="house-link">
      <img src="$ASSETS/img/retour.png" alt="Retour" class="house-icon" />
    </a>

    <article class="article">
      <p class="article-meta">$date_fr</p>
$article_html
    </article>
  </body>
</html>
HTML

  printf '%s\t%s\t%s\t%s\n' "$mtime" "$html_name" "$title_esc" "$date_fr" >> "$index_tmp"
  info "Article généré : blog/$html_name  («$title»)"
  count=$((count + 1))
done

# --- (Re)génération de la liste dans blog/blog.html ------------------
[ -f "$INDEX_FILE" ] || die "Page d'accueil introuvable : $INDEX_FILE"

# 1) S'assurer que article.css est bien lié dans le <head> de l'index.
if ! grep -q 'href="article.css"' "$INDEX_FILE"; then
  # on l'insère juste après le link vers styles.css
  sed -i 's#\(<link rel="stylesheet" href="\.\./assets/css/styles.css" />\)#\1\n    <link rel="stylesheet" href="article.css" />#' "$INDEX_FILE"
  info "Lien vers article.css ajouté dans blog.html"
fi

# 2) S'assurer que les marqueurs existent (sinon on les pose avant </body>).
if ! grep -q '<!-- BLOG:START -->' "$INDEX_FILE"; then
  sed -i 's#\(</body>\)#    <!-- BLOG:START -->\n    <!-- BLOG:END -->\n  \1#' "$INDEX_FILE"
  info "Marqueurs BLOG:START/END posés dans blog.html"
fi

# 3) Construire le bloc liste (trié par date décroissante = plus récent en haut).
block_tmp="$(mktemp)"
trap 'rm -f "$index_tmp" "$block_tmp"' EXIT
{
  echo '    <div class="blog-index">'
  echo '      <ul>'
  sort -t$'\t' -k1,1nr "$index_tmp" | while IFS=$'\t' read -r _mt html title date_fr; do
    printf '        <li><a href="./%s">%s</a> <span class="date">%s</span></li>\n' \
      "$html" "$title" "$date_fr"
  done
  echo '      </ul>'
  echo '    </div>'
} > "$block_tmp"

# 4) Remplacer tout ce qui est entre les marqueurs par le nouveau bloc.
awk -v blockfile="$block_tmp" '
  /<!-- BLOG:START -->/ {
    print
    while ((getline line < blockfile) > 0) print line
    close(blockfile)
    skip = 1
    next
  }
  /<!-- BLOG:END -->/ { skip = 0; print; next }
  !skip { print }
' "$INDEX_FILE" > "$INDEX_FILE.tmp" && mv "$INDEX_FILE.tmp" "$INDEX_FILE"

info "Index mis à jour : $count article(s) listé(s) dans blog/blog.html"
printf '%sTerminé.%s\n' "$c_ok" "$c_rst"
