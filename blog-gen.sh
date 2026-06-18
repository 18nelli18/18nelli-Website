#!/usr/bin/env bash
# =====================================================================
#  blog-gen.sh — 18nelli
#  Convertit les .md déposés dans ./blog/ en pages .html stylées site,
#  et (re)génère la liste des articles dans la page d'accueil blog.html.
#
#  Workflow :
#    1. tu rédiges sur Notion -> "Export" -> Markdown
#    2. tu déposes le .md (et son dossier d'images) dans blog/
#    3. tu lances :  ./blog-gen.sh
#
#  - Compatible macOS (Bash 3.2, sed/stat/date BSD) ET Linux.
#  - Idempotent : relançable à volonté, pas de doublons.
#  - Slugifie les noms Notion à rallonge en URLs propres.
# =====================================================================

set -euo pipefail

# --- Config ----------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BLOG_DIR="$SCRIPT_DIR/blog"          # dossier où tu déposes les .md
INDEX_FILE="$SCRIPT_DIR/blog.html"   # page d'accueil des articles (racine)
ASSETS="../assets"                   # chemin des assets depuis blog/
# ---------------------------------------------------------------------

c_ok=$'\033[0;32m'; c_warn=$'\033[0;33m'; c_err=$'\033[0;31m'; c_rst=$'\033[0m'
info() { printf '%s==>%s %s\n' "$c_ok"   "$c_rst" "$*"; }
warn() { printf '%s/!\\%s %s\n' "$c_warn" "$c_rst" "$*"; }
die()  { printf '%sX%s %s\n'   "$c_err"  "$c_rst" "$*" >&2; exit 1; }

[ -d "$BLOG_DIR" ]    || die "Dossier introuvable : $BLOG_DIR"
[ -f "$INDEX_FILE" ]  || die "Page d'accueil introuvable : $INDEX_FILE"

# --- Détection du convertisseur markdown -----------------------------
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

# md_to_html <fichier.md>  -> fragment HTML sur stdout
md_to_html() {
  if [ "$MD_ENGINE" = "pandoc" ]; then
    pandoc -f markdown -t html5 --no-highlight "$1"
  else
    python3 - "$1" <<'PY'
import sys, markdown
with open(sys.argv[1], encoding="utf-8") as f:
    src = f.read()
print(markdown.markdown(src, extensions=["fenced_code", "tables"]))
PY
  fi
}

# Echappe & < > " pour insertion sure dans le HTML
html_escape() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g'; }

# Nom de fichier Notion a rallonge -> slug propre :
#  "Migser - a 6ch mixer 37dfcec0...(32 hexa)" -> "migser-a-6ch-mixer"
make_slug() {
  printf '%s' "$1" \
    | sed 's/ [0-9a-f]\{32\}$//' \
    | tr '[:upper:]' '[:lower:]' \
    | sed 's/[^a-z0-9]\{1,\}/-/g; s/^-*//; s/-*$//'
}

# Reecrit un fichier "sur place" de facon portable (pas de sed -i BSD/GNU)
rewrite() {
  local f="$1"; shift
  local tmp="$f.tmp.$$"
  awk "$@" "$f" > "$tmp" && mv "$tmp" "$f"
}

# --- Génération des articles -----------------------------------------
shopt -s nullglob
mds=("$BLOG_DIR"/*.md)
[ ${#mds[@]} -gt 0 ] || die "Aucun .md trouve dans $BLOG_DIR — rien a faire."

index_tmp="$(mktemp)"; block_tmp="$(mktemp)"
trap 'rm -f "$index_tmp" "$block_tmp"' EXIT

TAB="$(printf '\t')"
count=0
for md in "${mds[@]}"; do
  base="$(basename "$md")"; base="${base%.md}"
  slug="$(make_slug "$base")"
  [ -n "$slug" ] || slug="article"
  html_name="$slug.html"
  html_path="$BLOG_DIR/$html_name"

  # Titre = 1er "# Titre"; sinon nom de fichier nettoye
  title="$(grep -m1 '^#\{1,\} ' "$md" 2>/dev/null | sed 's/^#\{1,\} *//' || true)"
  [ -n "$title" ] || title="$(printf '%s' "$base" | sed 's/ [0-9a-f]\{32\}$//')"
  title_esc="$(printf '%s' "$title" | html_escape)"

  # Date (modif du .md) : GNU d'abord, BSD ensuite
  mtime="$(stat -c %Y "$md" 2>/dev/null || stat -f %m "$md")"
  date_fr="$(date -d "@$mtime" '+%d/%m/%Y' 2>/dev/null || date -r "$mtime" '+%d/%m/%Y')"

  # Corps = markdown sans son 1er H1 (deja servi comme titre de page)
  body_tmp="$(mktemp)"
  awk 'BEGIN{d=0} /^# /{ if(!d){d=1; next} } {print}' "$md" > "$body_tmp"
  article_html="$(md_to_html "$body_tmp")"
  rm -f "$body_tmp"

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
    <a href="../blog.html" class="house-link">
      <img src="$ASSETS/img/retour.png" alt="Retour" class="house-icon" />
    </a>

    <article class="article">
      <p class="article-meta">$date_fr</p>
$article_html
    </article>
  </body>
</html>
HTML

  printf '%s%s%s%s%s%s%s\n' "$mtime" "$TAB" "$html_name" "$TAB" "$title_esc" "$TAB" "$date_fr" >> "$index_tmp"
  info "Article genere : blog/$html_name  -> \"$title\""
  count=$((count + 1))
done

# --- Mise à jour de blog.html (racine) -------------------------------

# 1) Lier article.css dans le <head> si absent (apres styles.css)
if ! grep -q 'blog/article.css' "$INDEX_FILE"; then
  rewrite "$INDEX_FILE" '
    { print }
    /href="assets\/css\/styles.css"/ {
      print "    <link rel=\"stylesheet\" href=\"./blog/article.css\" />"
    }'
  info "Lien vers blog/article.css ajoute dans blog.html"
fi

# 2) Poser les marqueurs avant </body> s'ils n'existent pas
if ! grep -q '<!-- BLOG:START -->' "$INDEX_FILE"; then
  rewrite "$INDEX_FILE" '
    /<\/body>/ && !done {
      print "    <!-- BLOG:START -->"
      print "    <!-- BLOG:END -->"
      done=1
    }
    { print }'
  info "Marqueurs BLOG:START/END poses dans blog.html"
fi

# 3) Construire le bloc liste (tri par date decroissante, plus recent en haut)
{
  echo '    <div class="blog-index">'
  echo '      <ul>'
  sort -t "$TAB" -k1,1nr "$index_tmp" | while IFS="$TAB" read -r _mt fhtml ftitle fdate; do
    printf '        <li><a href="./blog/%s">%s</a> <span class="date">%s</span></li>\n' \
      "$fhtml" "$ftitle" "$fdate"
  done
  echo '      </ul>'
  echo '    </div>'
} > "$block_tmp"

# 4) Remplacer ce qui est entre les marqueurs par le nouveau bloc
rewrite "$INDEX_FILE" -v blockfile="$block_tmp" '
  /<!-- BLOG:START -->/ {
    print
    while ((getline line < blockfile) > 0) print line
    close(blockfile)
    skip = 1
    next
  }
  /<!-- BLOG:END -->/ { skip = 0; print; next }
  !skip { print }'

info "Index mis a jour : $count article(s) dans blog.html"
printf '%sTermine.%s\n' "$c_ok" "$c_rst"