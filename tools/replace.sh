#!/bin/bash
# =====================================================================
#  replace.sh — 18nelli
#  COPIE DE RÉFÉRENCE du script de déploiement du serveur (/root/replace.sh).
#  Il n'est pas exécuté depuis le dépôt : après modification, recopie-le :
#    scp tools/replace.sh root@<serveur>:/root/replace.sh
#
#  Lancé par la GitHub Action .github/workflows/blog-sync.yml (via une clé
#  SSH bridée sur ce seul script, voir README) ou à la main.
# =====================================================================

# === Configuration ===
REPO_URL="https://github.com/18nelli18/18nelli-Website.git"
TARGET_DIR="/var/www/18nelli"
TMP_DIR="/tmp/site_update"

command -v rsync >/dev/null 2>&1 || { echo "❌ rsync manquant : apt install rsync"; exit 1; }

# === Un seul déploiement à la fois (push + synchro rapprochés) ===
exec 9>/tmp/site_update.lock
flock 9

# === Nettoyage et préparation ===
echo "🔧 Nettoyage de l'ancien dossier temporaire..."
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"

# === Clonage du dépôt ===
echo "📥 Clonage du dépôt Git..."
git clone --depth 1 "$REPO_URL" "$TMP_DIR"

if [ $? -ne 0 ]; then
    echo "❌ Erreur lors du clonage du dépôt."
    exit 1
fi

# === Suppression du dossier .git ===
rm -rf "$TMP_DIR/.git"

# === Copie avec écrasement ===
echo "📂 Copie des fichiers vers $TARGET_DIR..."
cp -rT "$TMP_DIR" "$TARGET_DIR"

if [ $? -ne 0 ]; then
    echo "❌ Erreur lors de la copie des fichiers."
    exit 1
fi

# === blog/ : miroir exact du dépôt ===
# cp -rT ne supprime jamais rien : un article retiré de Notion resterait
# accessible par son URL. blog/ étant entièrement issu du dépôt, on le
# synchronise AVEC suppression. Surtout pas tout le site : les photos
# des albums ne sont pas dans le dépôt et seraient effacées.
rsync -a --delete "$TMP_DIR/blog/" "$TARGET_DIR/blog/"

if [ $? -eq 0 ]; then
    echo "✅ Mise à jour du site réussie !"
else
    echo "❌ Erreur lors de la synchronisation de blog/."
    exit 1
fi

# === Nettoyage final ===
rm -rf "$TMP_DIR"
