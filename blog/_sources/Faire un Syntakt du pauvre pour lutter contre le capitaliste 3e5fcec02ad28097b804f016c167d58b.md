# Faire un Syntakt du pauvre pour lutter contre le capitaliste

<!-- date: 24/09/2026 -->
<!-- modified: 25/09/2026 -->

*Jeudi 24/09/2026*

En 2024 j’avais acheté d’occaz un Elektron Model : Cycles, que j’ai adoré. Le séquenceur était génial, les différents moteurs proposés était super original et la taille était parfaite pour gamberger et jammer dans mon lit trkl. Je l’ai revendu pour l’unique défaut que je lui ai trouvé: il ne propose aucune fonctionnalité de sortie multipistes. Si je veux récup ce que j’ai fait dans Ableton, je suis obligé de rec 1 par 1 à la main les pistes. La musique produite reste bloqué dans la machine. Donc je l’ai vendu (et il me manque depuis tout ce temps…)

![Capture_decran_2026-09-24_a_22.52.48.png](Faire%20un%20Syntakt%20du%20pauvre%20pour%20lutter%20contre%20le%20capitaliste/Capture_decran_2026-09-24_a_22.52.48.png)

J’ai d’abord regardé si depuis 2 ans, il n’y avait pas eu de nouvelles sortie dans les même tarifs, avec le out multipistes en plus. La seule machine que j’ai trouvé, et qui vient aussi d’Elektron, c’est le Syntakt. Sur le papier c’est PILE ce qu’il me faut. EXACTEMENT les même moteurs de batteries que le model cycles, mais avec 12 pistes de dispo au lieu de 6, plus d’effets dont certains analogiques, et surtout la sortie multipiste. Et aussi….. 929euro…..

![Capture_decran_2026-09-24_a_22.57.51.png](Faire%20un%20Syntakt%20du%20pauvre%20pour%20lutter%20contre%20le%20capitaliste/Capture_decran_2026-09-24_a_22.57.51.png)

Donc si on résume, pour 640euro de différences, on gagne juste un plus grands nombres de piste et des effets un peu cool. C’est du gros scam et ça me frustre. Soit le model cycles à des limitations matérielles, et n’a pas une puce assez puissante pour fournir 6 pistes, soit Elektron on fait exprès de bridé la machine pour qu’on paye leur grosse brique noire 3x plus cher (j’ai une intuition). Surtout qu’en plus, le model cycles peut marcher sur batterie externe, prends moins de place dans un sac à dos et est bcp moins lourd.

DONC, on est à l’ère d’internet et de l’IA, je pense qu’il faut en profiter pour libérer le hardware des capitalistes de merdes qui veulent nous faire acheter des trucs en boucles

J’ai trouvé sur github ce projet qui propose exactement ce que je veux, mais pour le model: samples. Ce ne sont pas exactement les mêmes machines, mais c’est quasi sur que c’est la même architecture interne, avec un firmware différents, car je penses que leurs bas prix est en partie dû à leurs productions quasi identiques (moins de différences matérielles = moins de coût en grande production) .

[https://github.com/scottmetoyer/ms-multi-output](https://github.com/scottmetoyer/ms-multi-output)

Depuis quelques jours il est indiqué que le firmware est compatible avec le model cycles également, mais n’a jamais été testé. Peu importe, la bonne nouvelle c’est que des gens ont réussi à écrire un outil custom fonctionnel, et ça ça ouvre toute les portes.

Il fonctionne en récupérant l’audio des différentes pistes juste avant la sommation en mix. Ce qui veut dire qu’on perds le delay et la reverb ce qui ne me pose pas vraiment de problème.

![Capture_decran_2026-09-24_a_23.24.35.png](Faire%20un%20Syntakt%20du%20pauvre%20pour%20lutter%20contre%20le%20capitaliste/Capture_decran_2026-09-24_a_23.24.35.png)

Claude estime la probabilité de réussite de 70 à 80%. Moi je dit 100% y’a aucun monde ou Elektron à mis un budget de fou dans la sécurisation de leur produit bas de gamme.

![Capture_decran_2026-09-24_a_23.32.34.png](Faire%20un%20Syntakt%20du%20pauvre%20pour%20lutter%20contre%20le%20capitaliste/Capture_decran_2026-09-24_a_23.32.34.png)

Il me reste donc plus qu’a acheter un model cycles, à surexploiter claude code jusqu’a avoir un truc qui marche. En attendant je vais essayer d’apprendre un peu comment tout marche pour ne pas tout faire à l’aveugle.

### Le processeur

Sur [ce topic](https://www.elektronauts.com/t/model-cycles-q-a-with-ess/122712/122?page=6) du forum d’Elektron, on apprends que le processeur de la série Elektron Model est un **Coldfire MCF5441**:

![Capture_decran_2026-09-24_a_23.42.59.png](Faire%20un%20Syntakt%20du%20pauvre%20pour%20lutter%20contre%20le%20capitaliste/Capture_decran_2026-09-24_a_23.42.59.png)

Voici le block-diagram de ce processeur, trouvé sur le [site officiel de NXP](https://www.nxp.com/products/MCF5441X)

![image.png](Faire%20un%20Syntakt%20du%20pauvre%20pour%20lutter%20contre%20le%20capitaliste/image.png)

Quelques détails sur les différents blocs de la puce:

- **V4m ColdFire Core** : CPU principale
- **MMU** (Memory Management Unit): Gestionnaire de mémoire
- **EMAC** (Enhanced Multiply-Accumulate): Bloc de calcul optimisé pour des opérations mathématiques lourdes utiles en traitement du signal et filtrage.
- **8K I-Cache / 8K D-Cache**: Mémoire cache d’instruction et de donnée
- **64K SRAM**: Mémoire vive
- **8-bit DDR1/2 SDRAM** : contrôleur qui permet de relier de la RAM externe
- NAND Flash Controller : interface pour relié une mémoire flash
- SDIO : interface pour relié une carte SD
- Serial Boot Facility : Bloc qui démarre la puce et démarre le premier code à executer au boot
- 64-ch. DMA : 64 canaux de transport mémoire ↔ périphériques

### Processus avec Claude Opus 5.5

J’ai d’abord donnée la page du forum Elektron concernant le Model:Cycles à claudes, et demandé de produire un fichier md qui regroupe les informations techniques utiles pour ce projet:

```
j'aimerai développé un mod pour la machine elektron model cycles, permettant dans un premier tant d'avoir via usb 6 piste au lieu des 2. 
Pour l'instant ne t'occupe pas de la réalisation. Dans un premier temps j'aimerai que tu analyse l'entiereté des réponse de ce fil forum : https://www.elektronauts.com/t/model-cycles-q-a-with-ess/122712
Analyse toute les réponse, et constitue un fichier "dossier-technique.md" qui regroupe toute les informations techniques utile pour ce projet. Tu rédigera ce doc en français, mais tu mettera a chaque fois en dessous la citation reel de laquelle tu a tirer cette info.
```
