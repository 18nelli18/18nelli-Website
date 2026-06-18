#!/usr/bin/env bash
# =====================================================================
#  blog-gen.sh — 18nelli
#  Convertit les .md déposés dans ./blog/ en pages .html stylées site,
#  et (re)génère la liste des articles dans la page d'accueil blog.html.
#
#  Workflow :
#    1. Notion -> "Export" -> Markdown & CSV
#    2. tu déposes le .md (et son dossier d'images) dans blog/
#    3. tu lances :  ./blog-gen.sh
#
#  IMAGES :
#   - deux images collées dans le .md -> affichées CÔTE À CÔTE.
#   - taille par défaut 70% (réglable dans article.css).
#   - largeur forcée sur UNE image : tag w= dans la légende/alt,
#     ex : w=320 / w=100% / w=50%.
#
#  EMBED FALSTAD :
#   - un lien Falstad seul sur sa ligne dans le .md
#     [https://www.falstad.com/circuit/circuitjs.html?ctz=...](...même url...)
#     est transformé en circuit interactif intégré (iframe), en dark.
#
#  Compatible macOS (Bash 3.2, sed/stat/date BSD) ET Linux. Idempotent.
# =====================================================================

set -euo pipefail

# --- Config ----------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BLOG_DIR="$SCRIPT_DIR/blog"
INDEX_FILE="$SCRIPT_DIR/blog.html"
ASSETS="../assets"
# Paramètres d'intégration Falstad (modifie à ta sauce) :
FALSTAD_PARAMS="hideSidebar=true&hideMenu=true&running=true&whiteBackground=false&editable=false"
# ---------------------------------------------------------------------

c_ok=$'\033[0;32m'; c_warn=$'\033[0;33m'; c_err=$'\033[0;31m'; c_rst=$'\033[0m'
info() { printf '%s==>%s %s\n' "$c_ok"   "$c_rst" "$*"; }
warn() { printf '%s/!\\%s %s\n' "$c_warn" "$c_rst" "$*"; }
die()  { printf '%sX%s %s\n'   "$c_err"  "$c_rst" "$*" >&2; exit 1; }

[ -d "$BLOG_DIR" ]   || die "Dossier introuvable : $BLOG_DIR"
[ -f "$INDEX_FILE" ] || die "Page d'accueil introuvable : $INDEX_FILE"

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

html_escape() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g'; }

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
  awk "$@" "$f" > "$tmp" && mv "$tmp" "$f"
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
mds=("$BLOG_DIR"/*.md)
[ ${#mds[@]} -gt 0 ] || die "Aucun .md trouve dans $BLOG_DIR — rien a faire."

index_tmp="$(mktemp)"; block_tmp="$(mktemp)"
trap 'rm -f "$index_tmp" "$block_tmp"' EXIT
TAB="$(printf '\t')"

count=0
for md in "${mds[@]}"; do
  base="$(basename "$md")"; base="${base%.md}"
  slug="$(make_slug "$base")"; [ -n "$slug" ] || slug="article"
  html_name="$slug.html"
  html_path="$BLOG_DIR/$html_name"

  title="$(grep -m1 '^#\{1,\} ' "$md" 2>/dev/null | sed 's/^#\{1,\} *//' || true)"
  [ -n "$title" ] || title="$(printf '%s' "$base" | sed 's/ [0-9a-f]\{32\}$//')"
  title_esc="$(printf '%s' "$title" | html_escape)"

  mtime="$(stat -c %Y "$md" 2>/dev/null || stat -f %m "$md")"
  date_fr="$(date -d "@$mtime" '+%d/%m/%Y' 2>/dev/null || date -r "$mtime" '+%d/%m/%Y')"

  # 1) retire le 1er H1   2) images + embeds Falstad   3) convertit
  body_tmp="$(mktemp)"
  awk 'BEGIN{d=0} /^# /{ if(!d){d=1; next} } {print}' "$md" \
    | awk -v FALSTAD_PARAMS="$FALSTAD_PARAMS" "$PRE_AWK" > "$body_tmp"
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
  sort -t "$TAB" -k1,1nr "$index_tmp" | while IFS="$TAB" read -r _mt fhtml ftitle fdate; do
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

info "Index mis a jour : $count article(s) dans blog.html"
printf '%sTermine.%s\n' "$c_ok" "$c_rst"