# Pompe ultralight

L’idée de ce projet est de concevoir une pompe pour matelas de randonnée, ultralight en dessous des 15 grammes et le moins cher possible. 

La solution commercialisé actuelle est la padpal v5. Mais 45euro pour un moteur et une hélice flemme un peu.

![image.png](Pompe%20ultralight/image.png)

### Liste des pièces et prévisions

![image.png](Pompe%20ultralight/image%201.png)

Total de la commande: 24,86euro pour normalement 8 pompes - 3,10 par pompes. + 0.45 de filament 3D → 3,45.

Poids visé : max 15 grammes

MOTOR 8520 → 6g (à vérif)

Hélice → 0.67g

USBC → 3g

3D canalisateur → 6g max

![image.png](Pompe%20ultralight/image%202.png)

### Design 3D sur fusion

V1 non percée: 9g théorique

![image.png](Pompe%20ultralight/image%203.png)

V2: Face percée Varanoi:  5g théorique

![image.png](Pompe%20ultralight/image%204.png)

V3: 2g théorique

![image.png](Pompe%20ultralight/image%205.png)

### Premier prototype imprimé en 3D

Apres impression des 2 version (avec maillage Voronoï et sans): poids quasi similaire (environ 4g)

Voici la V0 de la pompe

![1000050939.jpg](Pompe%20ultralight/1000050939.jpg)

La pompe fonctionne, et gonfle mon matelas en 2min environ. 

Mais → soucis d’alimentation: l’usb-c ne délivre pas automatiquement du 5V lorsqu’il est branché sur un téléphone / batterie portable. Il faut le mettre en mode “charge” grace à une résistance 5.1k entre le GND et CC1. Donc il faut que je change de module USB. 

Voici celui que j’ai commandé:

![image.png](Pompe%20ultralight/image%206.png)

En plus de fonctionner bien avec le téléphone, il devrait être + léger et + simple à intégrer au design.

A faire:

- [x]  Tester fonctionnement avec le nouveau module avec téléphone/batterie portable
- [x]  Augmenter très legerement rayon interieur du la case principale
- [x]  Faire systeme de clip pour les different embout (actuellement colle chaude pr les prototype)
- [ ]  Tester PETG pour la durabilité

### Pompe Ultralight version 2:

Objectif:

- Passer à une modélisation fiable (éviter la colle chaude)
- Diminuer le poids
- Avoir un meilleurs. Poids

![temp_1776850418184.jpg](Pompe%20ultralight/temp_1776850418184.jpg)

![temp_1776850452224.jpg](Pompe%20ultralight/temp_1776850452224.jpg)

La pièce est maintenant imprimé complètement en une et ne nécessite plus de colle chaude. Le porte usb-c fonctionne sur les appareil pouvant fournir 2A 

Prochaine amélioration:

- Embout amovible
- Mettre les redresseur de flux devant l’helice
- Voire la piste de turbine centrifuge
- Creuser un montage RC pour éviter le pic de courant nécessaire pour démarrer le moteur
- Passer sur une hélice avec 4 ou 5 lames pour comparer les pression et debit obtenu
- Impression en TPU de l’embout