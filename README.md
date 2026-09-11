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
│   │   ├── screen-g4.css   Voile « dalle LCD d'iMac G4 » (chargé à part)
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
│   │   ├── draggable.js        Déplacement à la souris (partagé)
│   │   ├── windows.js          Fenêtres déplaçables des albums
│   │   └── screen-g4.js        Pose le voile LCD + bascule clavier
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
└── tools/
    ├── blog-gen.sh         Markdown Notion -> articles HTML + sommaire
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

## L'effet « écran d'iMac G4 »

Toutes les pages sont recouvertes d'un voile qui simule une dalle TFT
d'iMac G4 (2002) : noirs légèrement remontés et bleutés, halo central du
rétroéclairage, fine trame de sous-pixels R/V/B, voile diffus de dalle
mate, bords assombris.

**Touche `C`** pour l'activer / le désactiver. Le choix est retenu dans
le navigateur (`localStorage`).

Quelques partis pris, au cas où tu voudrais l'ajuster :

- **Ni scanlines, ni courbure, ni scintillement.** Le G4 avait un écran
  plat LCD, pas un tube cathodique — c'était même son argument de vente.
  Pour un rendu CRT à l'ancienne, c'est l'iMac **G3** qu'il faut imiter.
- **Voile diffus et non reflet net** : la dalle du G4 était mate. Le
  verre brillant n'arrive qu'avec l'iMac alu de 2007.
- **C'est un calque posé par-dessus, pas un `filter` sur le contenu.**
  Un `filter` sur un ancêtre casserait les six éléments en
  `position: fixed` du site (bouton retour, webcam, logo DVD, visionneuse
  photo, barre d'état). C'est aussi pour ça qu'une vraie déformation
  géométrique d'écran bombé n'est pas possible sans tout casser.
- **Aucune animation** : rien ne bouge, donc aucun coût par image, et la
  webcam de l'accueil garde sa fluidité.
- L'effet s'efface tout seul si le visiteur a demandé un contraste élevé
  ou moins de transparence dans son système, et à l'impression.

Pour le retirer d'une page : supprimer les deux lignes `screen-g4` de son
`<head>` et de sa fin de `<body>`. Pour l'enlever des articles de blog,
penser aussi à `tools/blog-gen.sh`, qui les réinjecte à chaque génération.

---

## Ajouter un article de blog

1. Dans Notion : **Export → Markdown & CSV**
2. Déposer le `.md` **et son dossier d'images** dans `blog/_sources/`
3. Lancer :

```bash
./tools/blog-gen.sh
```

Le script écrit `blog/<slug>.html` et met à jour la liste dans
`blog.html` (entre les marqueurs `BLOG:START` / `BLOG:END`).

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

Pour inspecter une page sans le voile LCD, appuyer sur `C`.
