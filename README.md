# 18nelli — site perso

Site statique : pas de build, pas de dépendances à installer, pas de
framework. On ouvre un `.html` et ça marche.

---

## Arborescence

```
.
├── index.html          Accueil : marquee, webcam, logo DVD, lecteur CD
├── photo.html          Sommaire des albums photo
├── projets.html        Sommaire des mini-projets
├── musique.html        Lecteur MP3 + visualiseur audio
├── blog.html           Sommaire du blog (liste auto-générée)
├── prediction.html     Faux chatbot rétro (page autonome)
├── mobile.html         Page d'arrivée des visiteurs mobiles
│
├── assets/
│   ├── css/
│   │   ├── styles.css      MANIFESTE : n'importe que les fichiers ci-dessous
│   │   ├── base.css        Reset + balises nues (h1, img, a, p) + @keyframes
│   │   ├── layout.css      Composants partagés (titres, bouton retour, fenêtres)
│   │   └── pages/
│   │       ├── home.css        index.html
│   │       ├── galerie.css     photo.html + projets.html
│   │       ├── musique.css     musique.html   (chargé à part)
│   │       └── prediction.css  prediction.html (chargé à part)
│   ├── js/
│   │   ├── mobile-redirect.js  Redirige les mobiles vers mobile.html
│   │   ├── camera.js           Flux webcam de l'accueil
│   │   ├── dvd-bounce.js       Logo DVD rebondissant
│   │   ├── cd-player.js        Lecteur CD de l'accueil
│   │   ├── mp3-player.js       Lecteur + visualiseur de musique.html
│   │   ├── prediction.js       Chatbot de prediction.html
│   │   └── windows.js          Fenêtres déplaçables des albums
│   ├── img/                Images et GIFs de l'interface
│   ├── media/
│   │   ├── song/           Les .mp3 listés dans data/songs.json
│   │   └── audio/          Sons divers
│   └── vendor/             Code tiers (Bootstrap, animate.css)
│
├── data/
│   ├── songs.json          Liste des morceaux (accueil + musique.html)
│   └── link-archive.json   Liens externes MORTS + leur copie (écrit par le serveur, non versionné)
│
├── albums/<nom>/
│   ├── <nom>.html          Galerie (blocs générés par tools/gen.sh)
│   ├── ico.png             Vignette affichée dans photo.html
│   └── img/                Les photos — NON versionnées
│
├── blog/
│   ├── <slug>.html         Articles générés — NE PAS ÉDITER À LA MAIN
│   ├── article.css         Styles des articles
│   ├── article.js          Zoom images, Mermaid, blocs de code
│   └── _sources/           Exports Notion : les .md et leurs images
│
├── projets/<nom>/          Mini-projets autonomes (HTML+CSS+JS chacun)
│
├── .github/workflows/
│   └── blog-sync.yml       Notion -> blog -> commit -> déploiement (auto)
│
└── tools/
    ├── notion-sync.mjs     Page Notion « Blog » -> blog/_sources/
    ├── blog-gen.sh         Markdown Notion -> articles HTML + sommaire
    ├── replace.sh          Copie de référence du script de déploiement serveur
    ├── archive-links.mjs   Archive les liens externes (Internet Archive + copies privées)
    ├── gen.sh              Dossier d'images -> blocs HTML de galerie
    └── check-links.mjs     Vérifie que tous les liens locaux résolvent
```

---

## Comment la CSS est organisée

Toutes les pages ne chargent qu'**un seul** fichier : `assets/css/styles.css`.
Celui-ci ne contient aucune règle, c'est un manifeste qui fait des
`@import` dans un ordre qui compte (cascade CSS) :

1. `base.css` — règles sur les balises nues
2. `layout.css` — composants partagés
3. `pages/*.css` — règles propres à une page

> Les règles de `base.css` ciblent des balises (`img`, `a`, `p`), donc
> **toute règle de classe les surcharge automatiquement**. C'est ce qui
> fait tenir la mise en page : ne transforme pas ces sélecteurs en classes.

`musique.html` et `prediction.html` ont leur propre feuille chargée
directement dans leur `<head>`, car elles redéfinissent entièrement le
fond et la typographie. Elles ne sont volontairement pas importées.

---

## Ajouter un article de blog

**Glisser la page dans la page Notion « Blog ».** C'est tout : dans les
5 minutes, la GitHub Action `blog-sync.yml` la récupère, la convertit,
commite et déploie (c'est le cron du serveur qui la lance, voir étape 6
de la mise en place). Pour publier tout de suite : onglet **Actions** du
dépôt → **Blog Notion** → **Run workflow** (marche aussi depuis l'appli
GitHub).

| Dans Notion                        | Sur le site                         |
| ---------------------------------- | ----------------------------------- |
| page glissée dans Blog             | article publié                      |
| page modifiée (déjà dans Blog)     | article mis à jour                  |
| page retirée de Blog               | article supprimé                    |
| page renommée                      | article déplacé vers le nouveau slug |

**Blog est la seule référence** : le site contient exactement ses
sous-pages, rien de plus. Tout ce qui est dans Blog est public (écrire les
brouillons ailleurs), et tout ce qui n'y est pas est retiré du site.
Seules les sous-pages **directes** de Blog sont publiées (les sous-pages
d'un article sont ignorées).

Chaque push sur `main` déclenche aussi le déploiement : plus besoin de
lancer `replace.sh` à la main.

### Comment ça marche

1. `tools/notion-sync.mjs` lit les sous-pages de Blog via l'API Notion et
   écrit dans `blog/_sources/` un `.md` + un dossier d'images **au même
   format que l'export « Markdown & CSV »**. Les images sont téléchargées
   (leurs URL Notion expirent au bout d'une heure). Seules les pages
   modifiées depuis la dernière synchro sont reconverties (état dans
   `blog/_sources/.notion-sync.json`).
   Dates : le sommaire affiche la **création de la page Notion**, et
   « last modified: » en tête d'article sa **dernière modification**
   (écrites sous le titre du `.md` : `<!-- date: … -->` et
   `<!-- modified: … -->`).
2. `tools/blog-gen.sh` génère le HTML (voir plus bas).
3. L'Action commite, pousse, puis lance `replace.sh` sur le serveur en SSH.

Un ancien export manuel dont la page est glissée dans Blog est **adopté
tel quel** (même URL, même date) ; il sera reconverti à sa prochaine
modification dans Notion.

Garde-fou : si Blog apparaît vide alors que des articles sont publiés
(intégration déconnectée par erreur…), la synchro refuse de tout
supprimer. Si c'est voulu, la lancer une fois à la main avec
`--allow-empty` (voir « En local » ci-dessous).

### Mise en place (une seule fois)

**1. Notion**
- Sur <https://www.notion.so/profile/integrations> : **Nouvelle
  intégration** → type **Interne** → capacités : **Lire le contenu**
  uniquement. Copier le token (`ntn_…`).
- Créer la page **Blog**, puis `•••` → **Connexions** → ajouter
  l'intégration. Les sous-pages héritent de l'accès.
- Copier le lien de la page Blog (`•••` → **Copier le lien**).

**2. Secrets GitHub** (chaque commande demande la valeur à coller) :

```bash
gh secret set NOTION_TOKEN
```

```bash
gh secret set NOTION_BLOG_PAGE_ID
```

**3. Déploiement automatique** : une clé SSH dédiée, bridée côté serveur
pour ne pouvoir lancer **que** `replace.sh` (même volée, elle ne donne
aucun shell).

```bash
ssh-keygen -t ed25519 -N "" -C github-deploy -f ~/.ssh/18nelli_deploy
```

```bash
echo "restrict,command=\"/root/replace.sh\" $(cat ~/.ssh/18nelli_deploy.pub)" | ssh root@SERVEUR 'cat >> ~/.ssh/authorized_keys'
```

```bash
gh secret set DEPLOY_HOST --body "SERVEUR"
```

```bash
gh secret set DEPLOY_SSH_KEY < ~/.ssh/18nelli_deploy
```

```bash
ssh-keyscan SERVEUR 2>/dev/null | gh secret set DEPLOY_KNOWN_HOSTS
```

(`SERVEUR` = IP ou nom de domaine. Port SSH autre que 22 : ajouter
`-p PORT` à `ssh-keyscan` et un secret `DEPLOY_PORT`.)

**4. Mettre à jour `replace.sh` sur le serveur** : la version de
`tools/replace.sh` supprime aussi du site les articles retirés (miroir
de `blog/` uniquement, les photos des albums ne sont pas touchées).

```bash
scp tools/replace.sh root@SERVEUR:/root/replace.sh
```

**5. Migrer les anciens articles** : glisser leurs pages Notion dans Blog.

**6. Déclencheur sur le serveur** : les tâches planifiées de GitHub
(`schedule`) se lancent très irrégulièrement, parfois jamais. Le serveur
lance donc lui-même la synchro toutes les 5 min via
`tools/blog-trigger.sh`. Il lui faut un token GitHub **fine-grained** :
<https://github.com/settings/personal-access-tokens/new> → Repository
access : *Only select repositories* → `18nelli-Website` → Permissions →
*Actions* : **Read and write**. Puis, depuis le Mac :

```bash
read -rs "TOKEN?Token GitHub : " && echo "$TOKEN" | ssh root@SERVEUR 'umask 077; cat > /root/.github-blog-token' && unset TOKEN
```

```bash
scp tools/blog-trigger.sh root@SERVEUR:/root/blog-trigger.sh
```

```bash
ssh root@SERVEUR 'chmod 700 /root/blog-trigger.sh && (crontab -l 2>/dev/null | grep -v blog-trigger; echo "*/5 * * * * /root/blog-trigger.sh >> /var/log/blog-trigger.log 2>&1") | crontab - && /root/blog-trigger.sh'
```

La dernière commande doit afficher « ✅ Synchro Notion déclenchée ». Les
erreurs éventuelles (token expiré…) sont notées dans
`/var/log/blog-trigger.log` sur le serveur.

### En local

```bash
NOTION_TOKEN=ntn_xxx NOTION_BLOG_PAGE_ID=<lien de Blog> node tools/notion-sync.mjs && ./tools/blog-gen.sh
```

Options : `--force` (tout reconvertir), `--allow-empty` (voir garde-fou).

### Bon à savoir

- Le token du déclencheur a une date d'expiration : GitHub envoie un
  mail avant. Il suffit d'en créer un nouveau et de relancer la
  première commande de l'étape 6.
- Blocs Notion non gérés (sous-pages, bases de données, table des
  matières…) : ignorés, avec un avertissement dans le log de l'Action.
- Si une page échoue (image introuvable…), les autres sont quand même
  publiées et l'Action finit en rouge : GitHub t'envoie un mail.

### Ancienne méthode (export manuel)

Elle ne sert plus qu'en dépannage : un export déposé à la main dans
`blog/_sources/` est **retiré à la synchro suivante** si sa page n'est
pas aussi dans Blog.

1. Dans Notion : **Export → Markdown & CSV**
2. Déposer le `.md` **et son dossier d'images** dans `blog/_sources/`
3. Lancer :

```bash
./tools/blog-gen.sh
```

### blog-gen.sh

Le script écrit `blog/<slug>.html` et met à jour la liste dans
`blog.html` (entre les marqueurs `BLOG:START` / `BLOG:END`). Un
`blog/*.html` dont le `.md` a disparu est supprimé.

**Il est incrémental** : un article dont le `.md` n'a pas bougé n'est pas
régénéré. Pour tout reconstruire : `./tools/blog-gen.sh --force`.

Fonctionnalités prises en charge dans le markdown : blocs de code avec
coloration et bouton « Copier », diagrammes Mermaid, images côte à côte,
zoom au clic, largeur forcée via `w=320` dans la légende, et intégration
de circuits Falstad.

> ⚠️ **Installe pandoc** (`brew install pandoc`). Sans lui le script
> bascule sur python-markdown, qui produit un HTML sensiblement
> différent. Les articles existants sont protégés (ils ne sont pas
> régénérés tant qu'ils sont à jour), mais évite `--force` sans pandoc.

---

## Ajouter un album photo

1. Créer `albums/<nom>/` avec un `ico.png` et un sous-dossier `img/`
2. Générer les blocs de fenêtres :

```bash
./tools/gen.sh albums/<nom>/img
```

3. Coller la sortie dans `<div id="windows-container">` de la page
4. Ajouter un lien vers l'album dans `photo.html`

Les photos de `img/` ne sont **pas versionnées** (trop lourdes) : il faut
les uploader séparément sur le serveur.

---

## Ajouter un morceau

Déposer le `.mp3` dans `assets/media/song/`, puis ajouter son nom de
fichier dans `data/songs.json`. Il apparaîtra dans `musique.html` et dans
la rotation aléatoire du lecteur CD de l'accueil.

---

## Archiver les liens externes

Le site cite beaucoup de choses qui ne sont pas à lui : fiches AliExpress,
dépôts GitHub, vidéos YouTube, datasheets PDF… Dans dix ans, une bonne part
aura disparu. `tools/archive-links.mjs` en garde une trace, chaque nuit.

Pour chaque lien externe des pages du site (liens, iframes, et URLs écrites
dans le texte ou les blocs de code) il :

| Étape                                     | Où ça va                                    |
| ----------------------------------------- | ------------------------------------------- |
| vérifie que le lien répond encore         | rien n'est stocké, sauf son état            |
| demande une copie à l'**Internet Archive** | archive.org, **publique**                   |
| garde une **copie locale**                | dossier d'archive du serveur, **privée**    |
| publie les liens morts et leur copie      | `data/link-archive.json`, lu par `blog/article.js` |

La copie locale contient, selon le lien : le HTML de la page et son texte, le
fichier tel quel (PDF, script…), le code source d'un dépôt GitHub, la fiche
et la miniature d'une vidéo YouTube (et la vidéo elle-même si `yt-dlp` est
installé sur le serveur).

**Quand un lien est mort**, l'article renvoie automatiquement le lecteur vers
la copie de l'Internet Archive, avec une pastille « archive » à côté. Un
lien n'est déclaré mort qu'après **3 constats « introuvable »** (404/410 ou
domaine disparu) espacés d'au moins un jour. Un site qui refuse les robots
(403, 429, délai dépassé…) reste « non vérifiable », jamais « mort ». Si le
réseau du serveur est malade (beaucoup de liens « disparus » d'un coup), les
constats du passage sont ignorés.

Les copies locales sont **privées** : ce sont des reproductions de sites
tiers, le site ne publie que des liens vers l'Internet Archive. Le dossier
d'archive doit rester hors du site (le script refuse un dossier situé
dedans) et rien n'y est jamais supprimé automatiquement.

### Essayer (aucun risque)

```bash
node tools/archive-links.mjs --scan
```

Liste les liens trouvés, sans aucun accès réseau.

```bash
node tools/archive-links.mjs --dry-run
```

Vérifie les liens et regarde chez l'Internet Archive ce qui existe déjà, mais
ne demande aucune capture et n'écrit rien sur le disque : affiche ce qu'un vrai
passage ferait.

### Mise en place sur le serveur (une seule fois)

`replace.sh` copie tout le dépôt dans `/var/www/18nelli` : le script arrive
donc tout seul avec le prochain déploiement, il n'y a rien à copier. Il lui
faut Node 18 ou plus sur le serveur. Depuis le Mac :

**1. Vérifier Node** (doit afficher v18 ou plus) :

```bash
ssh root@87.106.217.25 'node --version'
```

S'il est absent : `ssh root@87.106.217.25 'apt-get update && apt-get install -y nodejs'`,
puis relancer la commande ci-dessus.

**2. Premier passage.** Long (compte environ une heure : l'Internet Archive est
lente) : il tourne en arrière-plan sur le serveur et écrit dans un journal.

```bash
ssh root@87.106.217.25 'mkdir -p /var/lib/18nelli-link-archive && chmod 700 /var/lib/18nelli-link-archive && nohup node /var/www/18nelli/tools/archive-links.mjs --archive-dir /var/lib/18nelli-link-archive --max-saves 100 >> /var/log/link-archive.log 2>&1 < /dev/null &'
```

Pour suivre l'avancement (Ctrl-C quitte le suivi, pas le passage) :

```bash
ssh root@87.106.217.25 'tail -f /var/log/link-archive.log'
```

**3. Passage automatique chaque nuit** (04h17), sans doublon si le précédent
n'est pas fini :

```bash
ssh root@87.106.217.25 '(crontab -l 2>/dev/null | grep -v archive-links; echo "17 4 * * * flock -n /tmp/link-archive.lock node /var/www/18nelli/tools/archive-links.mjs --archive-dir /var/lib/18nelli-link-archive >> /var/log/link-archive.log 2>&1") | crontab -'
```

Chaque nuit, le script ne traite que ce qui est nouveau ou à revérifier ; les
demandes à l'Internet Archive sont plafonnées à 20 par passage (`--max-saves`),
le reste attend la nuit suivante.

### Consulter l'archive

Sur le serveur, `/var/lib/18nelli-link-archive/` contient `index.html` (le
rapport : état de chaque lien, copie Internet Archive, copies locales) et
`copies/`. Pour tout rapatrier sur le Mac (c'est aussi ta sauvegarde, à
refaire quand tu veux) :

```bash
rsync -av root@87.106.217.25:/var/lib/18nelli-link-archive/ ~/Documents/PiDir/18nelli-link-archive/
```

Puis ouvrir `~/Documents/PiDir/18nelli-link-archive/index.html` : tout marche
hors-ligne, le dossier se garde tel quel sur n'importe quel disque. Pour lire
une page, préférer son `text.txt` : `page.html` est le HTML brut du site
d'origine, l'ouvrir exécute ses scripts.

### Bon à savoir

- **Le journal** (`/var/log/link-archive.log`) affiche `💀 LIEN MORT` à chaque
  nouveau lien mort, et signale ceux qui n'ont aucune copie nulle part.
- **Lien « vivant » mais en réalité disparu** (une fiche AliExpress qui répond
  200 avec « produit indisponible » : le script ne peut pas le deviner) :
  le marquer à la main, `alive` pour l'inverse, `auto` pour redonner la main au
  script.

  ```bash
  ssh root@87.106.217.25 'node /var/www/18nelli/tools/archive-links.mjs --archive-dir /var/lib/18nelli-link-archive --mark "https://fr.aliexpress.com/item/32896689725.html" dead'
  ```

- **Pages très dynamiques** (AliExpress, Printables…) : la copie locale est
  « pauvre » (peu de texte, repérée dans le rapport). La copie Internet
  Archive reste alors la référence.
- **Vidéos YouTube** : sans `yt-dlp`, on garde la fiche (titre, chaîne,
  miniature) et la copie Internet Archive de la page, pas le film. Pour
  garder aussi la vidéo (720p max, 800 Mo max), installer le binaire officiel
  de `yt-dlp` sur le serveur :

  ```bash
  ssh root@87.106.217.25 'curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp && chmod a+rx /usr/local/bin/yt-dlp && yt-dlp --version'
  ```

  YouTube change souvent : `ssh root@87.106.217.25 'yt-dlp -U'` de temps en
  temps. Avec `ffmpeg` (`apt-get install -y ffmpeg`), la qualité est meilleure.
  Les vidéos déjà vues sans `yt-dlp` sont reprises toutes seules au passage suivant.
- **Ce qui n'est pas archivé** : les dépendances du site (polices Google,
  Mermaid et highlight.js chargés depuis jsDelivr) ne sont pas des liens de
  contenu. `--scan` liste celles qui figurent dans les pages.
- Toutes les options : `node tools/archive-links.mjs --help`.

---

## Vérifier qu'on n'a rien cassé

```bash
node tools/check-links.mjs
```

Parcourt tous les `.html` et signale les liens locaux qui ne résolvent
pas. Les seuls signalements normaux sont les photos de `albums/*/img/`,
absentes du dépôt par conception.
