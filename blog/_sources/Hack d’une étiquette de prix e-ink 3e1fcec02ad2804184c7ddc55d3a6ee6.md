# Hack d’une étiquette de prix e-ink

*Dimanche 20/09/2026*

J’ai volé une étiquette de prix à Monoprix. Je vais essayer de voir si c’est possible de modifier son affichage ou s’il est bloqué par un code propriétaire. Si j’arrive à flasher un firmware custom j’aimerai bien en faire un petit module.

![Capture d’écran 2026-09-20 à 22.24.52.png](Hack%20d%E2%80%99une%20%C3%A9tiquette%20de%20prix%20e-ink/Capture_decran_2026-09-20_a_22.24.52.png)

Le démontage est assez simple il suffit de retirer le cache pile et la protection de la dalle e-ink. 

![Capture d’écran 2026-09-20 à 23.18.20.png](Hack%20d%E2%80%99une%20%C3%A9tiquette%20de%20prix%20e-ink/Capture_decran_2026-09-20_a_23.18.20.png)

![Capture d’écran 2026-09-20 à 23.18.47.png](Hack%20d%E2%80%99une%20%C3%A9tiquette%20de%20prix%20e-ink/Capture_decran_2026-09-20_a_23.18.47.png)

![Capture d’écran 2026-09-20 à 23.19.23.png](Hack%20d%E2%80%99une%20%C3%A9tiquette%20de%20prix%20e-ink/Capture_decran_2026-09-20_a_23.19.23.png)

![Capture d’écran 2026-09-20 à 23.18.35.png](Hack%20d%E2%80%99une%20%C3%A9tiquette%20de%20prix%20e-ink/Capture_decran_2026-09-20_a_23.18.35.png)

![Capture d’écran 2026-09-20 à 23.18.58.png](Hack%20d%E2%80%99une%20%C3%A9tiquette%20de%20prix%20e-ink/Capture_decran_2026-09-20_a_23.18.58.png)

J’ai envoyé la référence du SoC à Opus4.8 pour qu’il m’explique la procédure de débug avec un raspberry pico (j’en ai un qui traine autant l’utiliser).

Le branchement à faire pour dialoguer avec la puce est le suivant:

![Capture d’écran 2026-09-20 à 23.34.05.png](Hack%20d%E2%80%99une%20%C3%A9tiquette%20de%20prix%20e-ink/Capture_decran_2026-09-20_a_23.34.05.png)

Je trouve donc avec un multimètre les points de contacts nécessaires auquels je pourrais me souder sur le pcb, en suivant le pinout de la doc:

![Capture d’écran 2026-09-21 à 09.50.12.png](Hack%20d%E2%80%99une%20%C3%A9tiquette%20de%20prix%20e-ink/Capture_decran_2026-09-21_a_09.50.12.png)

![image.png](Hack%20d%E2%80%99une%20%C3%A9tiquette%20de%20prix%20e-ink/image.png)

### Transformer notre Pico en debugger CC:

1. Télécharger l’IDE arduino et arduino-pico:

[https://github.com/earlephilhower/arduino-pico/](https://github.com/earlephilhower/arduino-pico/)

1. Récupérer un fork de CCLib pour CC2510: 

`git clone https://github.com/wavesoft/CCLib.git`

1. Ouvrir le fichier ino dans Examples/CCLib_proxy et définir le branchement:

```cpp
// Pinout configuration (Configured for Arduino Leonardo)

int CC_RST   = 3;
int CC_DD_I  = 6;
int CC_DD_O  = 7;
int CC_DC    = 4;
```

1. Flasher le Pico:

![Capture d’écran 2026-09-21 à 11.48.29.png](Hack%20d%E2%80%99une%20%C3%A9tiquette%20de%20prix%20e-ink/Capture_decran_2026-09-21_a_11.48.29.png)

![Capture d’écran 2026-09-21 à 11.48.34.png](Hack%20d%E2%80%99une%20%C3%A9tiquette%20de%20prix%20e-ink/Capture_decran_2026-09-21_a_11.48.34.png)

1. Tester le python:

```
cd ~/Downloads/CCLib/Python
pip3 install pyserial
python3 cc_info.py -E
18nelli@MacBook-Pro-van-18nelli Python % python3 cc_info.py -E
```

> Deux corrections dans cclib/ccproxy.py à faire: 
ligne 203: self.ser.write( bytes([cmd, c1, c2, c3]) )
ligne 399: self.ser.write( bytes([b & 0xFF]) )
> 

Le retour obtenu donne ceci:

![Capture d’écran 2026-09-21 à 11.55.49.png](Hack%20d%E2%80%99une%20%C3%A9tiquette%20de%20prix%20e-ink/Capture_decran_2026-09-21_a_11.55.49.png)

On apprends donc que le DEBUG_LOCKED est actif, donc impossible de récupérer le firmware d’origine. Mais ça n’empêche pas l’effacement et la réécriture pour autant.

Il y a une erreur dans la taille de la flash (noté 16Kb au lieu de 16). C’est une valeurs à modif dans cclib/chip/cc2510.py:

```python
self.chipInfo = {    'flash' : 32,   # était 16    'usb'   : 0,    'sram'  : 2}
```

Il faut aussi adapté la division flottante de python3

```bash
words_per_flash_page = self.flashPageSize // self.flashWordSize 
```

```bash
routine8_1 = [
			#see http://www.ti.com/lit/ug/swra124/swra124.pdf page 11
			0x75, 0xAD, ((address >> 8) // self.flashWordSize) & 0x7E,   #MOV FADDRH, #imm;
			0x75, 0xAC, 0x00						#MOV FADDRL, #00;
		]
```

et ajouter une fonction setPC:

```bash
def setPC(self, address):
			aHigh = (address >> 8) & 0xFF
			aLow  = address & 0xFF
			return self.instr(0x02, aHigh, aLow)   # LJMP #address
```

J’ai fais générer le code de flash à Claude:

```bash
#!/usr/bin/env python3
import sys
from cclib import CCHEXFile, getOptions, openCCDebugger

opts = getOptions("CC2510 page-based flash writer", hexIn=True)
dbg = openCCDebugger(opts['port'], enterDebug=opts['enter'])

PAGE = dbg.flashPageSize          # 0x400 = 1024
FLASH = dbg.flashSize             # 32768

# 1. Charger le .hex et l'aplatir en une image mémoire continue
hexFile = CCHEXFile(opts['in'])
hexFile.load()

image = bytearray([0xFF] * FLASH)   # flash vierge = 0xFF
for mb in hexFile.memBlocks:
    for i in range(mb.size):
        image[mb.addr + i] = mb.bytes[i]

# 2. Écrire page par page, seulement les pages qui contiennent du code

dbg.enter()
dbg.debug_active = True        # <-- le garde-fou attend ce flag
dbg.show_debug_info = False      # <-- ajoute cette ligne

for page in range(FLASH // PAGE):
    start = page * PAGE
    chunk = image[start:start + PAGE]
    if all(b == 0xFF for b in chunk):
        continue                      # page vide -> on saute
    print(f" - Page {page} @ 0x{start:04x} ...", end=" ", flush=True)
    dbg.writeFlashPage(start, chunk, erase_page=True)
    print("ok")

print("Terminé.")
```

### Programmer la puce

On teste d’abord un blink en C.

```c
// Déclaration des registres du CC2510 (adresses tirées du datasheet TI)
__sfr __at (0x80) P0;
__sfr __at (0x90) P1;
__sfr __at (0xA0) P2;

__sfr __at (0xFD) P0DIR;
__sfr __at (0xFE) P1DIR;
__sfr __at (0xFF) P2DIR;

__sfr __at (0xF3) P0SEL;
__sfr __at (0xF4) P1SEL;
__sfr __at (0xF5) P2SEL;

void delay(void) {
    volatile unsigned long i;
    for (i = 0; i < 60000UL; i++);
}

void main(void) {
    P0SEL = 0x00;  P1SEL = 0x00;  P2SEL = 0x00;   // tout en GPIO
    P0DIR = 0xFF;  P1DIR = 0xFF;  P2DIR = 0xFF;   // tout en sortie

    while (1) {
        P0 = 0xFF; P1 = 0xFF; P2 = 0xFF;
        delay();
        P0 = 0x00; P1 = 0x00; P2 = 0x00;
        delay();
    }
}
```

Puis on compile:

```bash
sdcc -mmcs51 --model-small --code-size 0x8000 --xram-size 0x1000 blink.c
```

On convertie en .hex:

```bash
cp blink.ihx blink.hex
```

Puis on utilise le script d’écriture de Claude:

```bash
python3 ~/Downloads/CCLib/Python/flash_page.py -i blink.hex -p /dev/cu.usbmodem101
```

[20476.mp4](Hack%20d%E2%80%99une%20%C3%A9tiquette%20de%20prix%20e-ink/20476.mp4)

### Test de l’écriture de la dalle

On d’abord utiliser le firware de angrymew pour écrire sur l’écran: https://github.com/angrymew/firmware-cc2510. J’ai modifié avec Claude Opus 4.8 la structure et le fichier de flash pour l’adapter à mon cas car le repo est prévu pour Windows. Je mettrais surement un .zip de mon dossier avec toute les modifications à la fin.

![20479.jpg](Hack%20d%E2%80%99une%20%C3%A9tiquette%20de%20prix%20e-ink/20479.jpg)

![20485.jpg](Hack%20d%E2%80%99une%20%C3%A9tiquette%20de%20prix%20e-ink/20485.jpg)

*Lundi 21/09/2026*

J’ai fournis à Claude Code (model Opus5 ultracode) l’ensemble des modifs et des démarches qui ont été faites pour la réécriture du firmware, puis je lui ai demandé de me fournir un outil web complet qui permet de flash le SoC avec le Pico en usb, et de mettre sur l’étiquette une image custom. Le résultat est vraiment satisfaisant.

[https://github.com/18nelli18/Monopink](https://github.com/18nelli18/Monopink)

![Capture d’écran 2026-09-21 à 15.57.25.png](Hack%20d%E2%80%99une%20%C3%A9tiquette%20de%20prix%20e-ink/Capture_decran_2026-09-21_a_15.57.25.png)

La prochaine étape pourrais être d’essayer d’utiliser la fonction NFC du SoC pour transmettre via son téléphone l’images à upload, ou bien d’acheter un petit module émetteur radio pour automatiser des affichage avec une esp32

![Capture d’écran 2026-09-21 à 16.25.29.png](Hack%20d%E2%80%99une%20%C3%A9tiquette%20de%20prix%20e-ink/Capture_decran_2026-09-21_a_16.25.29.png)