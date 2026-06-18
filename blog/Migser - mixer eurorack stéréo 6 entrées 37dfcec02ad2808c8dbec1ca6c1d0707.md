# Migser - mixer eurorack stéréo 6 entrées

![Capture d’écran 2026-06-12 à 13.26.07.png](Migser%20-%20mixer%20eurorack%20st%C3%A9r%C3%A9o%206%20entr%C3%A9es/Capture_decran_2026-06-12_a_13.26.07.png)

Je voulais faire un module moi même depuis longtemps. J’avais vu pas mal de kit diy ou de tuto type Moritz Klein etc mais j’était pas méga hypé jsp pq. Jpense que quand je me lance dans un truc nouveau qui me demande un minimum d’effort, j’ai besoin que la récompense aille au dela de reussir à faire ce qui était prévu. J’ai besoin de me sentir légitime à revendiquer le projet de “personnel”. C’est surement un problème d’égo ou ptet que c’est pas si deep et que tt le monde est comme ça mais on s’en fout.

J’ai actuellement dans mon [systeme eurorack actuel](https://modulargrid.net/e/racks/view/3014739) un Behringer 305. ****Il est moche, il est gros (24hp) mais il est pas cher.  J’en m’en fou de son EQ et il n’a que 4 entrées donc je pense que je peux le remplacer facilement.

![image.png](Migser%20-%20mixer%20eurorack%20st%C3%A9r%C3%A9o%206%20entr%C3%A9es/image.png)

J’ai donc essayé de faire un mixeur plus simple, pas trop cher, plus petit et avec plus d’entrées! Il est disponible sur github ici : [https://github.com/maxime-jcnl/migser](https://github.com/maxime-jcnl/migser) . J’estime (selon un calcul au pif car j’ai la flemme de lister les cout unitaire) qu’il coute environ au total un 15zaines d’euro à fabriquer à l’unité, en commandant chez JLCPCB pour le circuit imprimé et le panel, et aliexpress pour les composant électronique ou alibaba pour les connecteurs jacks 3.5. 

- 5x2 PCB - 20euro
- [20x Jack connectors -](https://www.alibaba.com/product-detail/PJ-301F-3-5mm-Headphone-Jack_1601395340090.html?spm=a2756.order-detail-ta-bn-b.0.0.3faff19cP0oB8v) 6,48euro
- Panier aliexpress - 25,83

### Explication circuit

Premièrement on a besoin d’un montage d’ampli suiveur. En gros  chaques entrées jacks est relié a un op-amp. Voici le bloc type pour 1 entrée (je l’ai juste dupliqué 6 fois pour avoir 6 sorties):

![Capture d’écran 2026-06-18 à 01.29.33.png](Migser%20-%20mixer%20eurorack%20st%C3%A9r%C3%A9o%206%20entr%C3%A9es/Capture_decran_2026-06-18_a_01.29.33.png)

L’Op amp se force avoir la différence de ses borne + et - égale à 0. Monter en suiveur (sortie relié à la borne -), il ajuste sa sortie pour que sa borne - ait exactement la même tension que sa borne +. Il crée donc en sortie une copie de la tension du signal audio d'entrée, mais isolée. On relie la sortie de notre op-amp a une résistance qui va permet d’avoir un courant à ses bornes. Dans un mixeur, on traite et additionne les courants provenant des tension d’entrée, et on les retransforme en tension une fois additionnée en sortie. En fin de montage, on split le signal en 2  et on envoie chaque partie sur son bus correspondant, pour avoir un paramètre de pan sur les entrées. 

Ensuite, il faut récupérer ces courants qui se sont additionnés sur les bus. On utilise pour ça un montage d'ampli "sommateur inverseur". Voici le bloc pour un bus (il y en a un pour le BUS_L et un pour le BUS_R) :

![Capture d’écran 2026-06-18 à 10.39.09.png](Migser%20-%20mixer%20eurorack%20st%C3%A9r%C3%A9o%206%20entr%C3%A9es/Capture_decran_2026-06-18_a_10.39.09.png)

Ici, la borne + de l'op-amp est reliée directement à la masse (GND, donc 0 Volt). Toujours avec la même règle, l'op-amp force la différence entre ses bornes à 0, donc sa borne - devient une "masse virtuelle" (elle est à 0 Volt aussi mais pas physiquement reliée à GND). Tous les courants venant de nos 6 pistes par le bus se déversent dans ce point à 0V. Ça permet de les additionner parfaitement sans qu'ils ne remontent dans les pistes des autres (ils sont isolés).

Comme le courant total ne peut pas rentrer dans la borne - de l'op-amp, il est obligé de passer par la boucle et de traverser la résistance (47k). C'est cette résistance qui fait le travail inverse de l'étape précédente : elle retransforme notre grande somme de courants en une tension audio finale pour notre sortie Add_L. Enfin, le petit condensateur (33pF) en parallèle avec la résistance sert juste de filtre pour bloquer les parasites très aigus ou les ondes radio qui peuvent s'incruster dans le circuit.

Pour finir le mixeur, on a besoin de pouvoir contrôler le volume général. Donc on récupère nos signaux finaux  provenant de l'étage de sommation. On les fait passer dans un potentiomètre double. C'est notre bouton de volume : en tournant un seul bouton, on atténue le volume de la gauche et de la droite en même temps et de façon égale.

![Capture d’écran 2026-06-18 à 10.44.33.png](Migser%20-%20mixer%20eurorack%20st%C3%A9r%C3%A9o%206%20entr%C3%A9es/Capture_decran_2026-06-18_a_10.44.33.png)

Ensuite, le signal passe à nouveau dans un montage d'ampli suiveur (U2C et U2D). Comme dans le montage des entrées, l'op-amp crée une copie parfaite de notre tension audio sortant du potentiomètre, mais de manière isolée et avec beaucoup de courant. Enfin, juste avant les prises jacks de sortie, on ajoute une petite résistance de 1k par sécurité. Si on branche un câble défectueux ou qu'il y a un court-circuit au niveau du jack, cette résistance va limiter le courant et empêcher nos op-amps de griller. Elle aide aussi à garder le circuit stable si on utilise de très longs câbles audio pour relier le mixeur aux enceintes.

### Simulation (exemple simplifié mono à 2 entrées)

[https://www.falstad.com/circuit/circuitjs.html?ctz=DwYwlgTgBAZgvAIgIwKgFwM6IAwDpsHZICsAbAEzGpgiJLn7HbnYDMAHPeQCxLsCcVKCABGiAOylUABzEJurVADcIiIQFtMagKYBaJCgB8AKChRgAJSgAPRC3ZRyPKPQdPuqeMilQA7l5RYVWQWVHUAQ2slOlxebnIkVjJyVnFWbEEUAHoTM2BpNBs7bAdWFkcyR25sTzow8LpCAhkAexxY9PFUDAAbRAttDDAMNHCAOxBtBBzTcwBzIoR7KDLsRxKV4nJahBqZvPDF8nZS7G4oarX0j1hEfnq6DTBEfSE5huQmvdzzaFt5AgrM4XdhXM47GpQYLccSEaY-YCHf7cUErcqkDarHbsB7IJ4vEiod6NJrw2bAP6IFFrSikKAYtxkCGoaGw5r7cwgRbU9YOBm85nCRCsXCsPQGajRXb4IjdYKQpQAE3aZyQMMkq0ERFY8TJeQKi35q3pmPYNwCuKYcKg0ja0oIQl6-UGw1GEymHOAC3+-MuJocvB8Xm+5MpCHEZpWpAcZtK0cFwSQcM9AGUQC1pNpFjTKkhJCtWEGcAgfnkWlBtGNi1AMNJEKRzYhrIobQSS7MzPqoFLIRhaEtcFQOZ3zNJu8Luv28E1+JJkkPS+Ysi0EVk0xntAj15nFqxC7yLg3HOJtrddu2R8By5Wqd06wgGztmzI24uuz3JzFSBwPMPO-lxwQFs+xVAhskXYBl1XbdN3Jb07noKMHH4RDA2ZT0IF8Q0NmWflaWZQwGQAGnsABuYjaUgzCEUwxYI3OQs+RPFYzQI+iiMY0j2MDciTyInjSD4n8qN8GisJ9U1zl9ZozxqQiSg4s1yIUy4RLE7lUT3OkeSSU9gxLakOMLUjDN0tTQ3E+tnF0+lmN0giKG4Ditl48hnPIcyDkNOzoygeikJ2e4oAiR4wmeBBXiJD4k1JT1LKWE5HES2kkpxWS9XMeKUuORk6XIE90IRLLEuNfLyDRSF9Lio47PKMqAvS6r-nqxiLkBRjCvJeK-VanrwUahF4PkVE-R5NCBq6jS1lGzStk6vJutRZYeXwiaFqmiptM0-qqqK7Dcv9Cr5syxYUPK1rYwa3byRgujfJ4NZ+AxAsi3PCDryrT473rRsEGfVsIqMDt-zHD8a37BgF2B98J3B0DWHoKHLyg8k13TTMEWsRZdHiRwnCgfhyqcIR9JrcK+FQNBtEQFMwDmMZwh6KBFQAMnCdRpFI8JbQwUjKzQCAAEus3A8ksea8RziQfgA1IJB1kCUmhjoNKqcQABhDMwCzYYWh6YXmazHo2Y5rmeb5sYBeFjLgHFxBQVYRxpagAR5acPTq2V5BVephBafpxnYDABmehtu3AcBeJ5Z1C4eEFL2KfQX3-ZD5mTc57mWl5-mhazbYmuFfcyCufduCe47gCyjZi5eqBi4rquHGIRDlnrtaTua5xm6J6v6AbxZpfKnlB8PX6Q3WzvzmHwmQUq4sMN3UunouJBtPL9KoSpNlx-MJE7GcMu6S0i5168IKQrxMKCTeaKvhtoa1XObuXG4J-X4rg1-kfuvEJHhQPeQLiGK1pbTtA4PQL4kD+pOgQAMIYIxxiTBtlYL+r8V50iPONAIPh-B1CCHYdI9QogxDiAkJIFBUjpEyDbRaYIp6aVCO3SuG1jTcCPFiJh3V2HlDYVPU+889rIlXifbSmD+HnhmJBcAEATBAA](https://www.falstad.com/circuit/circuitjs.html?ctz=DwYwlgTgBAZgvAIgIwKgFwM6IAwDpsHZICsAbAEzGpgiJLn7HbnYDMAHPeQCxLsCcVKCABGiAOylUABzEJurVADcIiIQFtMagKYBaJCgB8AKChRgAJSgAPRC3ZRyPKPQdPuqeMilQA7l5RYVWQWVHUAQ2slOlxebnIkVjJyVnFWbEEUAHoTM2BpNBs7bAdWFkcyR25sTzow8LpCAhkAexxY9PFUDAAbRAttDDAMNHCAOxBtBBzTcwBzIoR7KDLsRxKV4nJahBqZvPDF8nZS7G4oarX0j1hEfnq6DTBEfSE5huQmvdzzaFt5AgrM4XdhXM47GpQYLccSEaY-YCHf7cUErcqkDarHbsB7IJ4vEiod6NJrw2bAP6IFFrSikKAYtxkCGoaGw5r7cwgRbU9YOBm85nCRCsXCsPQGajRXb4IjdYKQpQAE3aZyQMMkq0ERFY8TJeQKi35q3pmPYNwCuKYcKg0ja0oIQl6-UGw1GEymHOAC3+-MuJocvB8Xm+5MpCHEZpWpAcZtK0cFwSQcM9AGUQC1pNpFjTKkhJCtWEGcAgfnkWlBtGNi1AMNJEKRzYhrIobQSS7MzPqoFLIRhaEtcFQOZ3zNJu8Luv28E1+JJkkPS+Ysi0EVk0xntAj15nFqxC7yLg3HOJtrddu2R8By5Wqd06wgGztmzI24uuz3JzFSBwPMPO-lxwQFs+xVAhskXYBl1XbdN3Jb07noKMHH4RDA2ZT0IF8Q0NmWflaWZQwGQAGnsABuYjaUgzCEUwxYI3OQs+RPFYzQI+iiMY0j2MDciTyInjSD4n8qN8GisJ9U1zl9ZozxqQiSg4s1yIUy4RLE7lUT3OkeSSU9gxLakOMLUjDN0tTQ3E+tnF0+lmN0giKG4Ditl48hnPIcyDkNOzoygeikJ2e4oAiR4wmeBBXiJD4k1JT1LKWE5HES2kkpxWS9XMeKUuORk6XIE90IRLLEuNfLyDRSF9Lio47PKMqAvS6r-nqxiLkBRjCvJeK-VanrwUahF4PkVE-R5NCBq6jS1lGzStk6vJutRZYeXwiaFqmiptM0-qqqK7Dcv9Cr5syxYUPK1rYwa3byRgujfJ4NZ+AxAsi3PCDryrT473rRsEGfVsIqMDt-zHD8a37BgF2B98J3B0DWHoKHLyg8k13TTMEWsRZdHiRwnCgfhyqcIR9JrcK+FQNBtEQFMwDmMZwh6KBFQAMnCdRpFI8JbQwUjKzQCAAEus3A8ksea8RziQfgA1IJB1kCUmhjoNKqcQABhDMwCzYYWh6YXmazHo2Y5rmeb5sYBeFjLgHFxBQVYRxpagAR5acPTq2V5BVephBafpxnYDABmehtu3AcBeJ5Z1C4eEFL2KfQX3-ZD5mTc57mWl5-mhazbYmuFfcyCufduCe47gCyjZi5eqBi4rquHGIRDlnrtaTua5xm6J6v6AbxZpfKnlB8PX6Q3WzvzmHwmQUq4sMN3UunouJBtPL9KoSpNlx-MJE7GcMu6S0i5168IKQrxMKCTeaKvhtoa1XObuXG4J-X4rg1-kfuvEJHhQPeQLiGK1pbTtA4PQL4kD+pOgQAMIYIxxiTBtlYL+r8V50iPONAIPh-B1CCHYdI9QogxDiAkJIFBUjpEyDbRaYIp6aVCO3SuG1jTcCPFiJh3V2HlDYVPU+889rIlXifbSmD+HnhmJBcAEATBAA)

### Conception du panel

J’ai exporter en .step le pcb complet depuis KiCAD. Puis je l’ai importer sur Fusion360 pour modéliser la facade du module. Je l’ai ré-exporter en DXF pour la réimporter ensuite sur KiCAD. Pour le design, je sais que la plupart des gens utilisent inkscape donc j’ai essayer. Le logiciel est pas intuitif je comprends rien et j’ai la flemme d’apprendre. Je sais bien utiliser photoshop mais j’avais pas de place pour le réinstaller donc j’ai fait tout le design sur KiCAD de manière très aléatoire et instinctive. 

![Capture d’écran 2026-06-18 à 11.40.39.png](Migser%20-%20mixer%20eurorack%20st%C3%A9r%C3%A9o%206%20entr%C3%A9es/Capture_decran_2026-06-18_a_11.40.39.png)

![Capture d’écran 2026-06-18 à 01.15.55.png](Migser%20-%20mixer%20eurorack%20st%C3%A9r%C3%A9o%206%20entr%C3%A9es/Capture_decran_2026-06-18_a_01.15.55.png)

### Assemblage

Au total j’ai payé

- 5x2 PCB  (panel et circuit) - 20euro
- [20x Jack connectors -](https://www.alibaba.com/product-detail/PJ-301F-3-5mm-Headphone-Jack_1601395340090.html?spm=a2756.order-detail-ta-bn-b.0.0.3faff19cP0oB8v) 6,48euro
- Panier Aliexpress - 25,83 (les potentiomètre double sont chiant à trouver et rentre pas dans la livraison gratuite pardon)

![Capture d’écran 2026-06-18 à 01.16.47.png](Migser%20-%20mixer%20eurorack%20st%C3%A9r%C3%A9o%206%20entr%C3%A9es/Capture_decran_2026-06-18_a_01.16.47.png)