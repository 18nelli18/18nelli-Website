#!/usr/bin/env bash
# =====================================================================
#  gen.sh — 18nelli
#  Génère les blocs <div class="window"> d'une galerie photo à partir
#  d'un dossier d'images.
#
#  Usage :
#      ./tools/gen.sh albums/vercors/img
#      ./tools/gen.sh albums/vercors/img > /tmp/blocs.html
#
#  Le résultat s'affiche sur la sortie standard : il faut ensuite le
#  coller dans <div id="windows-container"> de la page de l'album.
#  (Le script ne modifie AUCUN fichier, il ne fait qu'écrire du HTML.)
#
#  Les chemins produits sont de la forme ./<dossier>/<image>, relatifs
#  à la page de l'album — d'où la contrainte : le dossier d'images doit
#  être un sous-dossier direct de la page HTML.
#
#  Comportement à l'exécution :
#      .window       positionnée aléatoirement par assets/js/windows.js
#      .titlebar     nom du fichier (sans extension) + croix de fermeture
#      draggable=false  désactive le drag natif du navigateur
#
#  Extensions prises en compte : jpg, jpeg, png, gif
# =====================================================================

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <dossier_images>" >&2
  echo "Exemple: $0 albums/vercors/img" >&2
  exit 1
fi

dir="$1"

if [ ! -d "$dir" ]; then
  echo "Erreur : dossier introuvable -> $dir" >&2
  exit 1
fi

# Nom du dossier seul (ex. "img"), même si un chemin absolu a été fourni :
# c'est lui qui sert de préfixe dans les src générés.
out_dir=$(basename "$dir")

# Évite que les motifs '*.jpg' sans correspondance ressortent littéralement.
shopt -s nullglob

count=0

for img in "$dir"/*.{jpg,jpeg,png,gif,JPG,JPEG,PNG,GIF}; do
  [ -f "$img" ] || continue

  fname=$(basename "$img")   # ex. "P1110977.jpg"
  title="${fname%.*}"        # ex. "P1110977"

  cat <<HTML
<div class="window">
  <div class="titlebar">
    <span>$title</span>
    <span class="close-btn">✕</span>
  </div>
  <div class="content"></div>
  <img src="./$out_dir/$fname" alt="$title" draggable="false">
</div>
HTML

  count=$((count + 1))
done

# Bilan sur stderr : n'pollue pas le HTML redirigé vers un fichier.
echo "$count fenetre(s) generee(s) depuis $dir" >&2
