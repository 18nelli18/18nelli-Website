#!/bin/bash
# =====================================================================
#  blog-trigger.sh — 18nelli
#  COPIE DE RÉFÉRENCE du déclencheur installé sur le serveur
#  (/root/blog-trigger.sh). Après modification, recopie-le :
#    scp tools/blog-trigger.sh root@<serveur>:/root/blog-trigger.sh
#
#  Lancé par le cron du serveur toutes les 5 min : demande à GitHub de
#  lancer la synchro Notion (.github/workflows/blog-sync.yml). Remplace
#  les tâches planifiées de GitHub, qui se déclenchent très irrégulièrement.
#
#  Token : fine-grained, « Actions : Read and write » sur ce seul dépôt,
#  lu dans /root/.github-blog-token (chmod 600). Silencieux si tout va
#  bien : seules les erreurs finissent dans /var/log/blog-trigger.log.
# =====================================================================

TOKEN_FILE="/root/.github-blog-token"
REPO="18nelli18/18nelli-Website"
WORKFLOW="blog-sync.yml"

if [ ! -r "$TOKEN_FILE" ]; then
    echo "$(date '+%F %T') ❌ Token introuvable : $TOKEN_FILE"
    exit 1
fi
TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"

RESPONSE="$(mktemp)"
trap 'rm -f "$RESPONSE"' EXIT

CODE="$(curl -s -m 30 -o "$RESPONSE" -w '%{http_code}' -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com/repos/$REPO/actions/workflows/$WORKFLOW/dispatches" \
    -d '{"ref":"main"}')"

case "$CODE" in
    200|204)
        # Lancé à la main dans un terminal : on confirme.
        [ -t 1 ] && echo "✅ Synchro Notion déclenchée sur GitHub."
        exit 0
        ;;
    401)
        echo "$(date '+%F %T') ❌ Token refusé ou expiré (401) : régénère-le et remplace $TOKEN_FILE"
        ;;
    *)
        echo "$(date '+%F %T') ❌ GitHub a répondu $CODE : $(head -c 300 "$RESPONSE")"
        ;;
esac
exit 1
