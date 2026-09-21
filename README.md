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
│   └── songs.json          Liste des morceaux (accueil + musique.html)
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
15 minutes, la GitHub Action `blog-sync.yml` la récupère, la convertit,
commite et déploie. Pour publier tout de suite : onglet **Actions** du
dépôt → **Blog Notion** → **Run workflow** (marche aussi depuis l'appli
GitHub).

| Dans Notion                        | Sur le site                         |
| ---------------------------------- | ----------------------------------- |
| page glissée dans Blog             | article publié                      |
| page modifiée (déjà dans Blog)     | article mis à jour                  |
| page retirée de Blog               | article supprimé                    |
| page renommée                      | article déplacé vers le nouveau slug |

Tout ce qui est dans Blog est public : écrire les brouillons ailleurs.
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

### En local

```bash
NOTION_TOKEN=ntn_xxx NOTION_BLOG_PAGE_ID=<lien de Blog> node tools/notion-sync.mjs && ./tools/blog-gen.sh
```

Options : `--force` (tout reconvertir), `--allow-empty` (voir garde-fou).

### Bon à savoir

- GitHub **met en pause les tâches planifiées** d'un dépôt public après
  60 jours sans activité (un mail prévient) : un clic dans l'onglet
  Actions les réactive.
- Blocs Notion non gérés (sous-pages, bases de données, table des
  matières…) : ignorés, avec un avertissement dans le log de l'Action.
- Si une page échoue (image introuvable…), les autres sont quand même
  publiées et l'Action finit en rouge : GitHub t'envoie un mail.

### Méthode manuelle (toujours possible)

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

## Vérifier qu'on n'a rien cassé

```bash
node tools/check-links.mjs
```

Parcourt tous les `.html` et signale les liens locaux qui ne résolvent
pas. Les seuls signalements normaux sont les photos de `albums/*/img/`,
absentes du dépôt par conception.
