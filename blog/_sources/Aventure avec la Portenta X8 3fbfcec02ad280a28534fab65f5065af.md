# Aventure avec la Portenta X8

<!-- date: 16/10/2026 -->
<!-- modified: 01/11/2026 -->

Dans le cadre de mon alternance je dois concevoir un système embarqué pour interfacer plusieurs machine médicales, capteurs bio etc pour pouvoir centralisé les mesures d’une opérations sensible. Le projet est pas dingue en gros c’est faire un hub. MAIS ça reste une occasion de passer du temps à manipuler du materiel nouveau.

En cherchant des SoM proposant des GPIO comme sur une raspi, mais gérer par un MCU indépendant pour éviter les interruptions, je suis tombé sur la Portenta X8:

![Capture_decran_2026-10-16_a_22.27.01.png](Aventure%20avec%20la%20Portenta%20X8/Capture_decran_2026-10-16_a_22.27.01.png)

Elle fait la taille d’une raspi zero mais est beaucoup plus puissante sur plein d’aspect (RAM, Processeur, MPU, puce graphique etc).

La philosophie du systeme est d’alimenter leurs image Yocto en ajoutant des containers dockers. J’ai jamais fait de docker donc je vais utiliser cette page comme prise de note sur ce que je fais.

## Linux sur la X8

Pour choper un terminal on a besoin d’adb, et de connecter en USB-C la carte à notre ordi. J’ai eu des galère car les ports du Macbook ne fournisse pas assez de courant pour que le proc de la Portenta démarre, donc je dois utiliser un hub usb-c alimenté pour pouvoir y accéder en filaire. Je vais vite installer openssh dessus mais pour la première connexion c’est chiant qd même.

L’image fournis par Arduino fait tourner une petite interface web sur le port 8080, on peut y accéder en tapant:

```shell
18nelli@MacBook-Pro-van-18nelli ~ % adb devices
List of devices attached
0A2A7209DABC16AC        device
18nelli@MacBook-Pro-van-18nelli ~ % adb forward tcp:8080 tcp:80
```

On a accès à pas grand chose d’interessant. Un truc payant, un autre truc payant un shell et les paramètre pour connecter la X8 en wifi, ethernet ou 4G/LTE

![Capture_decran_2026-10-16_a_22.32.50.png](Aventure%20avec%20la%20Portenta%20X8/Capture_decran_2026-10-16_a_22.32.50.png)

Dans board info on a un genre de tableau de bord assez pratique ou on notamment voir les 3 conteneurs natifs de l’OS.

![Capture_decran_2026-10-16_a_22.34.14.png](Aventure%20avec%20la%20Portenta%20X8/Capture_decran_2026-10-16_a_22.34.14.png)

- **`x8-provisioning`** et **`x8-devel`:** Containers qui s’occupe de l’identification auprès des services Arduino Cloud, des scripts pour les mise à jours OTA etc donc osef pr l’instant
- **`x8-webapp` :** Containers de l’interface web

### Explications approximative de docker et premier container.

Docker permet la creation de mini VM sur un systèmes. Mais la ou une VM est une émulation complète d’un système, un container docker partage le noyaux principal et les ressource avec les autre containers.

Ça permet une certaines modularités dans le systèmes, éviter les problèmes de compatibilité entre les outils etc, c’est mieux pour la reproductibilité etc. Tout ça j’en sais r juste c’est ce que je lit sur internet.

Comme premier container j’aimerai setup un environnement linux de dev classique pour retrouver une expérience comme sur raspberry pi os etc.

On crée notre petit dossier:

```shell
su 
mkdir ~/ssh-docker/
cd ~/ssh-docker/
```

Puis on écrit la config docker qui sera lu lors de la création du container. Vu qu’on est sur une image minimale il n’y a pas nano pour editer du texte donc on passe par un classique cat EOF:

```shell
cat > Dockerfile << 'EOF'

# Choisir la distribution sur laquel tournera le LXC.
# Mieux vaut fixer la version plutot que d'écrire :latest, ça assurera que les outils installé qui fonctionneront toujorus avec la bonne version
FROM alpine:3.24.2 

# RUN exectute une commande dans le LXC. 
RUN apk add --no-cache \ #apk = gestionnaire de paquets d'alpine linux (comme apt)
# on liste les outils qu'on veut installer
    openssh \
    nano \
    vim \
    curl \
    wget \
    git \
    htop \
    bash \
    python3 \
    py3-pip

RUN ssh-keygen -A # Génère les clés ssh
RUN echo 'root:changeme' | chpasswd # Définie le mot de passe root
RUN sed -i 's/#PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config # Modifie la config ssh pour authoriser la connexion en root

EXPOSE 22 # indique sur quel port écoute ce LXC
CMD ["/usr/sbin/sshd", "-D"] # définie le processus principal du conteneur (celui qui tourne tout le temps et par défaut)
```

Une fois qu’on a le Docker de prêt, on peut lancer la construction de l’image:

```shell
sudo docker build -t ssh-server .
```

puis le démarrer:

```shell
sudo docker run -d --name ssh-server -p 2222:22 ssh-server 
```

Si on souhaite rendre notre container persistant, c’est à dire qu’il démarre automatiquement quand la X8 se lance, on doit ajouter:

```shell
sudo docker update --restart unless-stopped ssh-server
```

On peut voir notre LXC crée en taper `docker ps`  ou bien sur l’interface web comme tout à l’heure.

![Capture_decran_2026-10-16_a_23.06.08.png](Aventure%20avec%20la%20Portenta%20X8/Capture_decran_2026-10-16_a_23.06.08.png)

![Capture_decran_2026-10-16_a_23.06.36.png](Aventure%20avec%20la%20Portenta%20X8/Capture_decran_2026-10-16_a_23.06.36.png)

On peut maintenant se connecter à notre container en ssh youpi !!!

![Capture_decran_2026-10-16_a_23.08.17.png](Aventure%20avec%20la%20Portenta%20X8/Capture_decran_2026-10-16_a_23.08.17.png)

### Ajouter et modifier le contenue d’un LXC.

Imaginons que je souhaite installer `bluetoothctl` dans ce nouveau containers. Je peux l’installer simplement via `apk add bluez` et ça marcherait. Mais imaginons que je souhaite installer sur une autre carte exactement le même container, en garantissant qu’il soit fonctionnel. Notre configuration précédente n’incluait pas bluez, donc il faudra à chaque reconstruction de l’image ecrire `apk add bluez` . Pour que bluez soit un outil natif à notre LXC, on doit l’ajouter dans notre Dockerfile.

Mainenant qu’on a un container avec nano on va pouvoir éditer plus simplement notre fichier de config. Sur la console adb (donc hors de tout container), on éteins notre LXC ssh et on le relance en montant le dossier qui contient le Dockerfile :

```shell
sudo docker stop ssh-server
sudo docker rm ssh-server
sudo docker run -d --name ssh-server --restart unless-stopped \
  -p 2222:22 \
  -v /root/dockerfiles:/dockerfiles \
  ssh-server
```

Via le container ssh, on peut maintenant accéder à notre fichier de config et le modifier avec nano pour ajouter bluez à notre LXC :

![Capture_decran_2026-10-16_a_23.47.06.png](Aventure%20avec%20la%20Portenta%20X8/Capture_decran_2026-10-16_a_23.47.06.png)

on met à jour notre image:

```shell
sudo docker build -t ssh-server .
```

Puis on supprime l’ancien containers pour le remplacer par le nouveau à partir de l’image:

```shell
sudo docker stop ssh-server
sudo docker rm ssh-server
```

On relance le container avec les autorisation d’accès au bus matériel requis pour l’outil bluez

```
sudo docker run -d --name ssh-server --restart unless-stopped \
  -p 2222:22 \
  -v /run/dbus:/run/dbus:ro \
  ssh-server
```

## Conception d’une carrier board

*29/10/2026*

Je vais détailler ici mes notes de conceptions sur la carrier board que je compte faire.

### Ethernet PoE

J’ai besoin d’un port Ethernet 1000Base-T pour avoir du GbE. Je veux aussi que tout le système soit alimenté en PoE. Je pars sur le **V8BR-1AX1-GH** qui est un connecteur MagJack (donc les transfo d’isolation sont intégrés dans la prise) vertical et compatible PoE.

#### Centertaps

Dans le schéma de la carrier board max d’arduino, les center-taps sont non connecté. Ils laissent la possibilité de les connectés au 3V3 car les Portenta précédentes ont un PHY qui le demande.

![Capture_decran_2026-10-29_a_23.33.28.png](Aventure%20avec%20la%20Portenta%20X8/Capture_decran_2026-10-29_a_23.33.28.png)

Pour vérifier comment bien connecter les CT, on peut regarder la docs du PHY du NXP® [i.MX](http://i.mx/) 8M Mini (le coeur de la Portenta X8). Sa ref est documenté dans la datasheet de la PX8:

![Capture_decran_2026-10-29_a_23.40.39.png](Aventure%20avec%20la%20Portenta%20X8/Capture_decran_2026-10-29_a_23.40.39.png)

Le brochage recommandé dans la doc du KSZ9031RNXIA indique que les CT ne doivent être reliés à aucune source d’alimentation et recommande de les découplé à la masse:

![Capture_decran_2026-10-29_a_23.42.33.png](Aventure%20avec%20la%20Portenta%20X8/Capture_decran_2026-10-29_a_23.42.33.png)

Pour ce qui concerne les LED, elle nécessite, en plus des résistance de protection classique, des résistance de pull up/down car le PHY lis l’état des broche LED pour démarrer. La LED1 est active sur l’état bas. Quand ETH\_LED1 (pilotée par le PHY) vaut 3V3, la tension dans la LED s’annule (3V3 contre 3V3). Si ETH\_LED1 vaut 0V, le 3V3 circule dans la résistance R1 puis allume en 1.8V la LED. Pour la LED2 c’est l’inverse. Je reprends exactement le même montage que sur la Carrier Board Max:

![Capture_decran_2026-10-30_a_02.12.54.png](Aventure%20avec%20la%20Portenta%20X8/Capture_decran_2026-10-30_a_02.12.54.png)

![Capture_decran_2026-10-31_a_13.06.41.png](Aventure%20avec%20la%20Portenta%20X8/Capture_decran_2026-10-31_a_13.06.41.png)

Voici à quoi ressemble le câblage final du connecteur:

![74fd65b5-282a-412f-a2dc-e163574d0b88.png](Aventure%20avec%20la%20Portenta%20X8/74fd65b5-282a-412f-a2dc-e163574d0b88.png)

#### Récupération du PoE

La carte sera entièrement alimenté via le PoE. La PX8 fonctionne en 5V, donc le AG9905-MTB est adapté. Pour le redressement je met 2 MB10S car ils sont en stock partout et que j’en ai déjà utilisé. Je met une TVS SMAJ58A qui bloquera le courant en cas de surtension histoire de pas cramé ma carte.

![image.png](Aventure%20avec%20la%20Portenta%20X8/image.png)

![image 1.png](Aventure%20avec%20la%20Portenta%20X8/image%201.png)

![image 2.png](Aventure%20avec%20la%20Portenta%20X8/image%202.png)

Le schema du block PoE:

- récupère le signal PoE via les broche VC12 VC36 et VC45 VC78 et le redresse via 2 MB10S
- convertit ce signal en 5V, avec une diode de protection contre la surtension (D1) en entrée du PD (AG9905), qui alimente la PX8

![Capture_decran_2026-10-30_a_02.04.10.png](Aventure%20avec%20la%20Portenta%20X8/Capture_decran_2026-10-30_a_02.04.10.png)

### Port USB

Pour l’USB de la carte, je souhaite mettre un port micro-usb en branchement par le haut, comme pour le RJ45. J’en ai trouvé chez Molex qui conviendrait bien. J’utilise l’ESD USBLC6-2SC6Y pour la protection contre les décharge,

![Capture_decran_2026-10-31_a_17.05.55.png](Aventure%20avec%20la%20Portenta%20X8/Capture_decran_2026-10-31_a_17.05.55.png)

![Capture_decran_2026-10-31_a_17.09.13.png](Aventure%20avec%20la%20Portenta%20X8/Capture_decran_2026-10-31_a_17.09.13.png)

Le schéma est super simple, on met les 2 VBUS au VBUS\_USB de la PX8, les D+ et D- du connecteur en entrée de la protection ESD et la sortie vers les pin USB de la PX8

![Capture_decran_2026-10-31_a_17.29.48.png](Aventure%20avec%20la%20Portenta%20X8/Capture_decran_2026-10-31_a_17.29.48.png)

### Connecteur Camera

La carte que je fais doit comporter une interface pour brancher une nappe de camera type Raspberry Pi Cam.

![image 3.png](Aventure%20avec%20la%20Portenta%20X8/image%203.png)

La caméra passe par en MIPI CSI-2, qui transit les données haute vitesse sur des paires différentielles. On doit donc brancher CAM\_D0 +/-, CAM\_D1 +/-  (les paires diff), et la clock CAM\_CLK à l’interface MIPI CSI de la PX8. En plus de ces broche la camera utilise de l’i2c pour échanger avec la PX8 (déclanchement d’image, paramètre de résolution, etc). On peut rattacher l’I2C SCL et SDC à n’importe quelle interface de la PX8, mais par défaut l’OS Yocto fournis par Arduino définie la camera sur l’i2c2, donc autant faire pareil ça nous evite de devoir modifier l’OS et de le recompiler.

![Capture_decran_2026-11-01_a_14.34.26.png](Aventure%20avec%20la%20Portenta%20X8/Capture_decran_2026-11-01_a_14.34.26.png)

![Capture_decran_2026-11-01_a_14.46.16.png](Aventure%20avec%20la%20Portenta%20X8/Capture_decran_2026-11-01_a_14.46.16.png)

### Console sur UART

Une interface série qui permet d’accéder à la console linux de la carte est exposée sur l’UART4 de la PX8. Avoir accès à cette interface sera utile en cas de problème avec l’ethernet.

![Capture_decran_2026-11-01_a_16.57.33.png](Aventure%20avec%20la%20Portenta%20X8/Capture_decran_2026-11-01_a_16.57.33.png)

J’aimerai exposé la console en USB-C plutôt que des pin physique rx/tx, car on a pas tous sur nous des adaptateurs TTY vers USB. La puce FTDI FT230X permet justement de convertir en USB les signaux UART.

![Capture_decran_2026-11-01_a_18.03.27.png](Aventure%20avec%20la%20Portenta%20X8/Capture_decran_2026-11-01_a_18.03.27.png)
