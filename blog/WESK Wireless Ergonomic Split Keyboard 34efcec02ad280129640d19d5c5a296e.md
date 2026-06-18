# WESK: Wireless Ergonomic Split Keyboard

![image.png](WESK%20Wireless%20Ergonomic%20Split%20Keyboard/image.png)

### Fonctionnalités :

- Clavier 100% sans fils basé sur le firmware ZMK
- Design ergonomique : clavier en 2 partie séparée (main gauche main droite) et adapté à la forme de la main
- Switch interchangeable
- Conception réversible du PCB : la même carte sert pour la main droite et la main gauche pour économiser le cout
- Encodeur programmable

### Todo liste :

- [x]  Lister les pièces nécessaire
- [x]  Concevoir le PCB
- [x]  Imprimer en 3D le rendu final pour valider les proportion et la disposition des touches
- [x]  Commander le PCB et les pièces requient
- [ ]  Imprimer la coque du clavier en PETG
- [x]  Faire une switch plate pour maintenir les switch
- [ ]  Souder les composants
- [x]  Vérifier si les carte ont un circuit de protection pour la batterie
- [ ]  Configurer le firmware ZMK (mappage des touches, configuration de l’encodeur)
- [ ]  Validation / Modification selon le premier montage:
    - [ ]  Modifier empreinte bouton reset
    - [ ]  Modifier connexion bouton on/off
    - [ ]  Ajouter connexion plus sur pour les batterie
    - [ ]  Ajouter sériegraphie indicative pour le sens de du controleur
    - [ ]  Changer emplacement des vis
    - [ ]  Décaler la diode pret du bouton RST vers le haut pour ne pas toucher la faceplace
- [ ]  Finition bonus :
    - [ ]  Ajouter Pogopin pour faire contact avec les pad de batterie des micro controlleur + ajout connecteur pour switcher les batterie
    - [ ]  Usinage dans un matériau plus finie avec la CNC de l’école (Aluminium ou Bois)
    - [ ]  Adaptation des la batterie en fonction des capacités observées
    - [ ]  Rétro-éclairage ? (probablement une mauvaise idée pour l’autonomie du clavier)
    - [ ]  Remplacement de la carte NRF par un microcontrolleur intégré au PCB du clavier **MDBT50Q-1MV2**

### Pièces à acheter (total : 119,74e):

| **Pièces  xQuantitées** | **Cout** | **Liens** |
| --- | --- | --- |
| Supermini NRF528402 x2 | 10e | https://fr.aliexpress.com/item/1005006019812115.html?gatewayAdapt=glo2fra |
| Kailh Choc V2 Low Profile RED x60 | 27,59e | https://fr.aliexpress.com/item/1005008651091078.html?pdp_ext_f=%7B%22order%22%3A%22448%22%2C%22eval%22%3A%221%22%2C%22fromPage%22%3A%22search%22%7D |
| NuPhy COAST Twilight x1 | 25,27e | https://nuphy.com/collections/keycaps/products/coast-twilight-nsa |
| Hotswap Choc V2 50pc x2 | 12,78e | https://fr.aliexpress.com/item/1005008543325730.html?pdp_ext_f=%7B%22order%22%3A%22572%22%2C%22eval%22%3A%221%22%2C%22fromPage%22%3A%22search%22%7D |
| Diode 1N4148 SOD123 x150 | 2,79e | https://fr.aliexpress.com/item/1005009371789599.html?pdp_ext_f=%7B%22order%22%3A%226%22%2C%22eval%22%3A%221%22%2C%22fromPage%22%3A%22search%22%7D |
| Batterie 500mAh 902030 2pc x1 | 6,59e | https://fr.aliexpress.com/item/1005007341161722.html?pdp_ext_f=%7B%22order%22%3A%221200%22%2C%22spu_best_type%22%3A%22price%22%2C%22eval%22%3A%221%22%2C%22fromPage%22%3A%22search%22%7D |
| Switch MSK-12C02 x100 | 2,42e | https://fr.aliexpress.com/item/4001295557976.html?pdp_ext_f=%7B%22order%22%3A%22239%22%2C%22eval%22%3A%221%22%2C%22fromPage%22%3A%22search%22%7D |
| Micro-bouton 3x3x1,50 x50 | 1,52e | https://fr.aliexpress.com/item/1005005912890792.html?pdp_ext_f=%7B%22order%22%3A%2283%22%2C%22eval%22%3A%221%22%2C%22fromPage%22%3A%22search%22%7D |
| Connecteur 1x40 Female | 3,29e | https://fr.aliexpress.com/item/32896689725.html?aem_p4p_detail=20260429035811770000047837500004691416&pdp_ext_f=%7B%22order%22%3A%22685%22%2C%22spu_best_type%22%3A%22price%22%2C%22eval%22%3A%221%22%2C%22fromPage%22%3A%22search%22%7D&search_p4p_id=20260429035811770000047837500004691416_2 |
| Connecteur 1x40 Male | 5,39e | https://fr.aliexpress.com/item/32896689725.html?aem_p4p_detail=20260429035811770000047837500004691416&pdp_ext_f=%7B%22order%22%3A%22685%22%2C%22spu_best_type%22%3A%22price%22%2C%22eval%22%3A%221%22%2C%22fromPage%22%3A%22search%22%7D&search_p4p_id=20260429035811770000047837500004691416_2 |
| Insert M2 x50 | 1,90e | https://fr.aliexpress.com/item/1005004431154591.html?gatewayAdapt=glo2fra |
| Adhésif anti-dérapants x100 | 1,56e | https://fr.aliexpress.com/item/1005010264300914.html?pdp_ext_f=%7B%22order%22%3A%2235%22%2C%22spu_best_type%22%3A%22price%22%2C%22eval%22%3A%221%22%2C%22fromPage%22%3A%22search%22%7D |
| Encodeur Demi 15mm x5 | 2,38e | https://fr.aliexpress.com/item/1005001468341496.html?gatewayAdapt=glo2fra |
| Vis M2 3mm x50 | 1,39e | https://fr.aliexpress.com/item/1005006713197144.html?pdp_ext_f=%7B%22order%22%3A%224362%22%2C%22fromPage%22%3A%22search%22%7D |
| PCB Custom x5 | 14,87e | https://jlcpcb.com/ |

https://wiki.icbbuy.com/doku.php?id=developmentboard:nrf52840

https://zmk.dev/docs/user-setup

### Conseil de montage

1. Souder les diode avant les swap
2. Utiliser une faceplace et placer les hotswap avec les switch avant de les souder 

### Première version

![image.png](WESK%20Wireless%20Ergonomic%20Split%20Keyboard/image%201.png)

![image.png](WESK%20Wireless%20Ergonomic%20Split%20Keyboard/image%202.png)

![10778.jpg](WESK%20Wireless%20Ergonomic%20Split%20Keyboard/10778.jpg)

La première version comporte quelques erreurs mineure à corriger dans le schéma (montage du switch on/off incorrect et bouton reset mal monté). La PCB est bien réversible, donc ça nous éviter d’avoir 2 commande chez JLCPCB. 

J’ai pu quand même tester le flash de ZMK custom, et vérifier si le son des switch me plait bien. J’ai designer plusieurs modèle 3D de case pour fermer le clavier, mais au final je préfère garder le PCB nu et apparent. Je la fixe juste sur un socle en dessous avec des patin anti-dérapant.

### Todo:

- [ ]  Retravailler le firmware ZMK pour un layout adapté MacOS
- [ ]  Corrigé les défaut du PCB sur KiCAD