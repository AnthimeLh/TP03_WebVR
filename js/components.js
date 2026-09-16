/* global AFRAME, THREE */

/* -------------------------------------------------------------------- */
/* Helpers                                                               */
/* -------------------------------------------------------------------- */

/** Joue un son ponctuel (non positionnel-persistant) puis nettoie l'entité. */
function playOneShot(selector, position) {
  var scene = document.querySelector('a-scene');
  if (!scene) return;
  var soundEl = document.createElement('a-entity');
  soundEl.setAttribute('position', position);
  soundEl.setAttribute(
    'sound',
    'src: ' + selector + '; autoplay: true; positional: true; volume: 1; maxDistance: 25; rolloffFactor: 2'
  );
  scene.appendChild(soundEl);
  setTimeout(function () {
    if (soundEl.parentNode) soundEl.parentNode.removeChild(soundEl);
  }, 2000);
}

/** Petite explosion de particules (tétraèdres) à une position donnée. */
function spawnParticleBurst(position, color) {
  var scene = document.querySelector('a-scene');
  if (!scene) return;
  var count = 12;
  for (var i = 0; i < count; i++) {
    var p = document.createElement('a-entity');
    p.setAttribute('geometry', 'primitive: tetrahedron; radius: 0.045');
    p.setAttribute('material', 'color: ' + (color || '#ffcc00') + '; shader: flat; opacity: 1');
    p.setAttribute('position', position);

    var dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5)
      .normalize()
      .multiplyScalar(0.5 + Math.random() * 0.7);
    var end = new THREE.Vector3(position.x + dir.x, position.y + dir.y, position.z + dir.z);

    p.setAttribute('animation__move', 'property: position; to: ' + end.x + ' ' + end.y + ' ' + end.z + '; dur: 500; easing: easeOutQuad');
    p.setAttribute('animation__fade', 'property: material.opacity; to: 0; dur: 500; easing: linear');
    p.setAttribute('animation__scale', 'property: scale; to: 0.01 0.01 0.01; dur: 500; easing: easeInQuad');

    scene.appendChild(p);
    (function (el) {
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 550);
    })(p);
  }
}

/* -------------------------------------------------------------------- */
/* Exercice 1 - Déplacement au joystick (rig + 2 contrôleurs)            */
/* -------------------------------------------------------------------- */

/** Joystick gauche : déplacement avant/arrière/gauche/droite relatif à la caméra. */
AFRAME.registerComponent('thumb-move', {
  schema: {
    speed: { default: 2 },
    rig: { type: 'selector', default: '#rig' }
  },

  init: function () {
    this.x = 0;
    this.y = 0;
    this.dir = new THREE.Vector3();
    this.onThumbstick = this.onThumbstick.bind(this);
    this.el.addEventListener('thumbstickmoved', this.onThumbstick);
    this.el.addEventListener('axismove', this.onThumbstick);
  },

  onThumbstick: function (evt) {
    if (evt.detail == null) return;
    if (evt.detail.x !== undefined) {
      this.x = evt.detail.x;
      this.y = evt.detail.y;
    } else if (evt.detail.axis) {
      var axis = evt.detail.axis;
      this.x = axis.length >= 4 ? axis[2] : axis[0];
      this.y = axis.length >= 4 ? axis[3] : axis[1];
    }
  },

  tick: function (time, dt) {
    if (!this.data.rig || !dt) return;
    if (Math.abs(this.x) < 0.15 && Math.abs(this.y) < 0.15) return;

    var camera = this.el.sceneEl.camera;
    var camYaw = camera ? camera.rotation.y : 0;

    this.dir.set(this.x, 0, this.y);
    if (this.dir.lengthSq() > 1) this.dir.normalize();
    this.dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), camYaw);

    var rigObj = this.data.rig.object3D;
    rigObj.position.x += this.dir.x * this.data.speed * (dt / 1000);
    rigObj.position.z += this.dir.z * this.data.speed * (dt / 1000);
  }
});

/** Joystick droit : rotation fluide de la vue (rig) autour de l'axe Y. */
AFRAME.registerComponent('thumb-turn', {
  schema: {
    speed: { default: 100 },
    rig: { type: 'selector', default: '#rig' }
  },

  init: function () {
    this.x = 0;
    this.onThumbstick = this.onThumbstick.bind(this);
    this.el.addEventListener('thumbstickmoved', this.onThumbstick);
    this.el.addEventListener('axismove', this.onThumbstick);
  },

  onThumbstick: function (evt) {
    if (evt.detail == null) return;
    if (evt.detail.x !== undefined) {
      this.x = evt.detail.x;
    } else if (evt.detail.axis) {
      var axis = evt.detail.axis;
      this.x = axis.length >= 4 ? axis[2] : axis[0];
    }
  },

  tick: function (time, dt) {
    if (!this.data.rig || !dt) return;
    if (Math.abs(this.x) < 0.2) return;
    var rigObj = this.data.rig.object3D;
    rigObj.rotation.y -= THREE.MathUtils.degToRad(this.data.speed) * (dt / 1000) * this.x;
  }
});

/* -------------------------------------------------------------------- */
/* Exercice 2 - Grab & release des objets 3D                             */
/* -------------------------------------------------------------------- */

/**
 * Attaché sur chaque main (contrôleur). Grip = saisir/relâcher.
 * Trigger = tirer si l'objet tenu est une arme (voir composant "weapon").
 */
AFRAME.registerComponent('grab-controls', {
  schema: {
    grabRadius: { default: 0.4 }
  },

  init: function () {
    this.grabbedEl = null;
    this.prevPos = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.handWorldPos = new THREE.Vector3();
    this.handWorldQuat = new THREE.Quaternion();

    this.onGripDown = this.onGripDown.bind(this);
    this.onGripUp = this.onGripUp.bind(this);
    this.onTriggerDown = this.onTriggerDown.bind(this);

    this.el.addEventListener('gripdown', this.onGripDown);
    this.el.addEventListener('gripup', this.onGripUp);
    this.el.addEventListener('triggerdown', this.onTriggerDown);
  },

  findClosestGrabbable: function () {
    var candidates = document.querySelectorAll('.grabbable');
    var closest = null;
    var closestDist = this.data.grabRadius;
    this.el.object3D.getWorldPosition(this.handWorldPos);

    for (var i = 0; i < candidates.length; i++) {
      var candidate = candidates[i];
      if (candidate.components['grab-controls-held']) continue;
      var pos = new THREE.Vector3();
      candidate.object3D.getWorldPosition(pos);
      var dist = pos.distanceTo(this.handWorldPos);
      if (dist < closestDist) {
        closestDist = dist;
        closest = candidate;
      }
    }
    return closest;
  },

  onGripDown: function () {
    if (this.grabbedEl) return;
    var target = this.findClosestGrabbable();
    if (!target) return;

    this.grabbedEl = target;
    target.setAttribute('grab-controls-held', '');
    this.savedBody = target.getAttribute('dynamic-body');
    if (this.savedBody) target.removeAttribute('dynamic-body');

    this.el.object3D.getWorldPosition(this.prevPos);
    target.emit('grab-start');
  },

  onGripUp: function () {
    if (!this.grabbedEl) return;
    var el = this.grabbedEl;
    this.grabbedEl = null;
    el.removeAttribute('grab-controls-held');

    var throwVelocity = this.velocity.clone();
    var bodyOptions = this.savedBody || { shape: 'auto', mass: 1 };
    el.setAttribute('dynamic-body', bodyOptions);

    el.addEventListener('body-loaded', function onLoaded() {
      el.removeEventListener('body-loaded', onLoaded);
      if (el.body) el.body.velocity.set(throwVelocity.x, throwVelocity.y, throwVelocity.z);
    });

    el.emit('grab-end');
  },

  onTriggerDown: function () {
    if (this.grabbedEl && this.grabbedEl.classList.contains('weapon') && this.grabbedEl.components.weapon) {
      this.grabbedEl.components.weapon.shoot();
    }
  },

  tick: function (time, dt) {
    if (!this.grabbedEl || !dt) return;

    this.el.object3D.getWorldPosition(this.handWorldPos);
    this.el.object3D.getWorldQuaternion(this.handWorldQuat);

    this.velocity.copy(this.handWorldPos).sub(this.prevPos).divideScalar(dt / 1000);
    this.prevPos.copy(this.handWorldPos);

    var grabbedObj = this.grabbedEl.object3D;
    if (grabbedObj.parent) {
      grabbedObj.parent.worldToLocal
        ? grabbedObj.position.copy(grabbedObj.parent.worldToLocal(this.handWorldPos.clone()))
        : grabbedObj.position.copy(this.handWorldPos);
    } else {
      grabbedObj.position.copy(this.handWorldPos);
    }
    grabbedObj.quaternion.copy(this.handWorldQuat);
  }
});

/** Marqueur vide posé sur l'objet actuellement saisi (évite le double-grab). */
AFRAME.registerComponent('grab-controls-held', {});

/* -------------------------------------------------------------------- */
/* Exercice 3 - Arme et tir de projectiles                               */
/* -------------------------------------------------------------------- */

AFRAME.registerComponent('weapon', {
  schema: {
    bulletSpeed: { default: 18 },
    bulletSize: { default: 0.04 },
    bulletMass: { default: 0.05 },
    cooldown: { default: 250 }
  },

  init: function () {
    this.lastShot = 0;
  },

  shoot: function () {
    var now = performance.now ? performance.now() : Date.now();
    if (now - this.lastShot < this.data.cooldown) return;
    this.lastShot = now;

    var muzzle = this.el.querySelector('.muzzle') || this.el;
    var worldPos = new THREE.Vector3();
    var worldQuat = new THREE.Quaternion();
    muzzle.object3D.getWorldPosition(worldPos);
    this.el.object3D.getWorldQuaternion(worldQuat);

    var dir = new THREE.Vector3(0, 0, -1).applyQuaternion(worldQuat).normalize();

    var bullet = document.createElement('a-entity');
    bullet.setAttribute('class', 'bullet');
    bullet.setAttribute('geometry', 'primitive: sphere; radius: ' + this.data.bulletSize);
    bullet.setAttribute('material', 'color: #222831; metalness: 0.7; roughness: 0.3');
    bullet.setAttribute('position', worldPos);
    bullet.setAttribute('shadow', 'cast: true');
    bullet.setAttribute('dynamic-body', 'shape: sphere; sphereRadius: ' + this.data.bulletSize + '; mass: ' + this.data.bulletMass + '; linearDamping: 0.01');

    this.el.sceneEl.appendChild(bullet);

    var speed = this.data.bulletSpeed;
    bullet.addEventListener('body-loaded', function onLoaded() {
      bullet.removeEventListener('body-loaded', onLoaded);
      if (bullet.body) bullet.body.velocity.set(dir.x * speed, dir.y * speed, dir.z * speed);
    });

    playOneShot('#shootSound', worldPos);

    setTimeout(function () {
      if (bullet.parentNode) bullet.parentNode.removeChild(bullet);
    }, 5000);
  }
});

/* -------------------------------------------------------------------- */
/* Exercice 4 - Cibles aléatoires + impacts + particules + son           */
/* -------------------------------------------------------------------- */

AFRAME.registerComponent('target', {
  init: function () {
    this.onCollide = this.onCollide.bind(this);
    this.el.addEventListener('collide', this.onCollide);
    this.hit = false;
  },

  onCollide: function (evt) {
    if (this.hit) return;
    var otherEl = evt.detail && evt.detail.body ? evt.detail.body.el : null;
    if (!otherEl || !otherEl.classList.contains('bullet')) return;
    this.hit = true;

    var pos = new THREE.Vector3();
    this.el.object3D.getWorldPosition(pos);
    var color = (this.el.getAttribute('material') || {}).color || '#ffcc00';

    spawnParticleBurst(pos, color);
    playOneShot('#hitSound', pos);

    if (otherEl.parentNode) otherEl.parentNode.removeChild(otherEl);

    this.el.emit('target-hit');
    var el = this.el;
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 0);
  }
});

AFRAME.registerComponent('target-spawner', {
  schema: {
    minDelay: { default: 2000 },
    maxDelay: { default: 4000 },
    maxTargets: { default: 5 },
    areaWidth: { default: 6 },
    areaDepth: { default: 2 },
    baseHeight: { default: 1.1 },
    distance: { default: -6 },
    container: { type: 'selector', default: '#targets-container' }
  },

  init: function () {
    this.activeCount = 0;
    this.colors = ['#ff5555', '#55ff88', '#ffaa33', '#5599ff', '#c77dff'];
    this.scheduleNext();
  },

  scheduleNext: function () {
    var delay = THREE.MathUtils.lerp(this.data.minDelay, this.data.maxDelay, Math.random());
    this.timeout = setTimeout(this.spawnAndReschedule.bind(this), delay);
  },

  spawnAndReschedule: function () {
    this.spawn();
    this.scheduleNext();
  },

  spawn: function () {
    if (this.activeCount >= this.data.maxTargets) return;
    var container = this.data.container || this.el.sceneEl;

    var type = Math.random() > 0.5 ? 'box' : 'cone';
    var el = document.createElement('a-entity');
    var x = (Math.random() - 0.5) * this.data.areaWidth;
    var y = this.data.baseHeight + Math.random() * 1.5;
    var z = this.data.distance + (Math.random() - 0.5) * this.data.areaDepth;
    var color = this.colors[Math.floor(Math.random() * this.colors.length)];

    if (type === 'box') {
      el.setAttribute('geometry', 'primitive: box; width: 0.5; height: 0.5; depth: 0.5');
      el.setAttribute('static-body', 'shape: box');
    } else {
      el.setAttribute('geometry', 'primitive: cone; radiusBottom: 0.3; radiusTop: 0; height: 0.6');
      el.setAttribute('static-body', 'shape: box');
    }

    el.setAttribute('material', 'color: ' + color + '; roughness: 0.4');
    el.setAttribute('position', x + ' ' + y + ' ' + z);
    el.setAttribute('shadow', 'cast: true; receive: true');
    el.setAttribute('class', 'target-el');
    el.setAttribute('target', '');

    var self = this;
    el.addEventListener('target-hit', function () {
      self.activeCount--;
    });

    container.appendChild(el);
    this.activeCount++;
  },

  remove: function () {
    clearTimeout(this.timeout);
  }
});
