# TP03 - WebVR avec A-Frame

Projet réalisé dans le cadre du TP ST2AWD « WebVR avec A-Frame ». Il implémente les
4 exercices du sujet : une scène VR de base, la saisie d'objets (grab/release), une
arme qui tire des projectiles physiques, et un système de cibles aléatoires avec
impacts (particules + son).

## Structure du projet

```
TP03_WebVR/
├── index.html                 # Scène finale complète (regroupe les 4 exercices)
├── exercises/
│   ├── exercice1.html         # Ex.1 : scène, lumières, ombres, déplacement joystick
│   ├── exercice2.html         # Ex.2 : grab / release avec physique
│   ├── exercice3.html         # Ex.3 : arme + tir de projectiles
│   └── exercice4.html         # Ex.4 : cibles aléatoires, particules, sons
├── js/
│   └── components.js          # Tous les composants A-Frame custom (partagés)
├── assets/
│   └── sounds/
│       ├── shoot.wav          # Son de tir (généré par synthèse, aucun droit d'auteur)
│       └── hit.wav            # Son d'impact sur une cible
└── README.md
```

Chaque page d'exercice charge le même fichier `js/components.js` et n'active que les
entités nécessaires à son niveau, pour pouvoir tester chaque étape indépendamment.
`index.html` est la démo finale qui cumule les quatre exercices.

## Bibliothèques utilisées

- **[A-Frame 1.5.0](https://aframe.io/)** (CDN officiel) : moteur WebVR/WebXR.
- **[aframe-physics-system](https://github.com/c-frame/aframe-physics-system)** (CDN jsDelivr) :
  gravité, corps dynamiques/statiques (`dynamic-body`, `static-body`) et détection de
  collisions (`collide`), utilisés pour les objets saisissables, les projectiles et les
  cibles.

Aucun modèle 3D externe n'est requis : le cube, la sphère et l'arme sont construits avec
les primitives géométriques natives d'A-Frame. Les sons sont deux fichiers `.wav` générés
par synthèse (voir ci-dessous), donc libres de droits.

## Composants custom (`js/components.js`)

### Exercice 1 — Scène et déplacement
- **`thumb-move`** (sur la main gauche) : lit les événements `thumbstickmoved`/`axismove`
  du joystick gauche et déplace le rig (avant/arrière/gauche/droite) relativement à
  l'orientation de la caméra.
- **`thumb-turn`** (sur la main droite) : lit le joystick droit et fait pivoter le rig
  autour de l'axe Y (rotation fluide de la vue).
- Éclairage : une lumière `directional` (ombres portées) + une lumière `ambient`
  (éclairage uniforme). Les objets et le sol ont `shadow="cast/receive"`.

### Exercice 2 — Grab & release
- **`grab-controls`** (sur chaque main) : au bouton **Grip**, cherche l'objet `.grabbable`
  le plus proche dans un rayon donné, le détache de la physique et le fait suivre la
  position/rotation de la main à chaque frame (`tick`). Au relâchement du Grip, l'objet
  récupère un corps physique (`dynamic-body`) avec une vitesse calculée à partir du
  mouvement de la main (effet de lancer), puis retombe sous l'effet de la gravité globale
  de la scène.

### Exercice 3 — Arme
- L'entité `#gun` est un assemblage de primitives (canon, crosse, poignée) avec la classe
  `grabbable weapon`.
- **`weapon`** : composant qui, sur `shoot()`, instancie une entité `.bullet` (sphère avec
  `dynamic-body`), calcule la direction du canon (`.muzzle`) et lui applique une vitesse
  initiale (`bulletSpeed`). Le projectile est ensuite soumis à la gravité de la scène
  (trajectoire balistique réaliste), avec un délai anti-répétition (`cooldown`).
- Dans `grab-controls`, le bouton **Trigger** appelle `weapon.shoot()` si la main tient
  actuellement une entité `.weapon`.

### Exercice 4 — Cibles et particules
- **`target-spawner`** (sur `#targets-container`) : génère aléatoirement des cubes/cônes
  colorés à intervalle aléatoire (`minDelay`/`maxDelay`), dans une zone donnée, avec un
  plafond (`maxTargets`) pour ne pas surcharger la scène.
- **`target`** : écoute l'événement `collide` (fourni par `aframe-physics-system`). Si
  l'objet en collision est un `.bullet`, la cible :
  1. déclenche une explosion de particules (`spawnParticleBurst`, fonction utilitaire —
     petits tétraèdres qui s'écartent puis disparaissent, animés avec le composant
     `animation` natif d'A-Frame) ;
  2. joue un son d'impact positionnel (`playOneShot`, utilise `#hitSound`) ;
  3. supprime le projectile et la cible touchée.

## Contrôles

| Action | Entrée |
|---|---|
| Se déplacer (avant/arrière/gauche/droite) | Joystick **gauche** |
| Tourner la vue | Joystick **droit** |
| Saisir / relâcher un objet ou l'arme | Bouton **Grip** (préhension) sur l'une ou l'autre main |
| Tirer (si l'arme est tenue) | **Trigger** (gâchette) de la main qui tient l'arme |

Le choix Grip = saisir / Trigger = tirer évite tout conflit entre la saisie d'objets et
le déclenchement de l'arme lorsqu'elle est en main.

## Lancer le projet

Les API WebXR nécessitent une origine sécurisée (HTTPS ou `localhost`) : ouvrir les
fichiers directement en `file://` ne fonctionnera pas. Depuis la racine du projet :

```bash
python3 -m http.server 8080
# ou
npx http-server -p 8080
```

Puis ouvrir `http://localhost:8080/` dans un navigateur compatible WebXR :

- **Casque autonome (ex. Meta Quest)** : servir le projet sur le réseau local
  (`python3 -m http.server 8080 --bind 0.0.0.0`) puis ouvrir `http://<IP-locale>:8080`
  dans le navigateur du casque, ou exposer le port via un tunnel HTTPS (ngrok, etc.).
- **Sans casque (bureau)** : installer l'extension
  [WebXR API Emulator](https://github.com/MozillaReality/WebXR-emulator-extension) pour
  simuler un casque et des contrôleurs directement dans le navigateur de bureau.

## Notes / limites connues

- L'arme est modélisée avec des primitives A-Frame plutôt qu'un modèle glTF externe,
  pour ne dépendre d'aucun asset tiers ; elle peut être remplacée par un modèle `.glb`
  en ajoutant un composant `gltf-model` sur `#gun` tout en conservant les classes
  `grabbable weapon` et l'enfant `.muzzle`.
- Le système de grab utilise une détection par proximité (distance main/objet), pas un
  raycasting ni des colliders physiques dédiés, afin de rester simple et fiable sur
  tous les navigateurs WebXR.
- `oculus-touch-controls` cible en priorité les contrôleurs Meta Quest / Touch ; sur
  d'autres matériels, A-Frame retombe sur `generic-tracked-controller-controls`, qui
  émet toujours `triggerdown`/`gripdown`/`thumbstickmoved`.
