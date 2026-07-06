// js/three-layer.js
// Three.js custom layer for MapLibre — turns the map into a 3D scene that
// 3D elements (glTF models, meshes, the radar tower) can be placed into,
// Baron Lynx style. Exposed as window.Radar3D.
//
// Usage from anywhere in the app:
//   Radar3D.addModel("truck", "models/chaser.glb", { lng, lat, scaleMeters: 30 })
//   Radar3D.addRadarTower({ lng: -85.54, lat: 42.89 })   // built-in mesh
//   Radar3D.addMesh("box", threeObject, { lng, lat })
//   Radar3D.remove("truck"); Radar3D.clear();

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const LAYER_ID = "radar-3d-objects";

const state = {
  map: null,
  renderer: null,
  scene: null,
  camera: null,
  objects: new Map(), // id -> { anchor: THREE.Group, lngLat, altitude }
  gltfLoader: new GLTFLoader(),
  clock: null,
  spinners: new Set(), // objects with userData.spinY (rad/s)
  billboards: new Set(), // objects re-oriented to face the camera each frame
  ready: false,
};

const _qTmp = new THREE.Quaternion();
const _qTmp2 = new THREE.Quaternion();
const _zAxis = new THREE.Vector3(0, 0, 1);
const _xAxis = new THREE.Vector3(1, 0, 0);
const _projMatrix = new THREE.Matrix4(); // reused each frame to avoid GC churn

function mercatorScale(lat, meters) {
  // meters -> mercator units at this latitude
  const mc = maplibregl.MercatorCoordinate.fromLngLat({ lng: 0, lat }, 0);
  return meters * mc.meterInMercatorCoordinateUnits();
}

function placeAnchor(anchor, lngLat, altitudeMeters = 0) {
  const mc = maplibregl.MercatorCoordinate.fromLngLat(lngLat, altitudeMeters);
  anchor.position.set(mc.x, mc.y, mc.z);
  const unitsPerMeter = mc.meterInMercatorCoordinateUnits();
  // Rotating +90° about X maps object-local +Y (model "up") onto mercator +Z
  // (world up). Mercator y grows southward, which the rotation also absorbs.
  anchor.scale.set(unitsPerMeter, unitsPerMeter, unitsPerMeter);
  anchor.rotation.x = Math.PI / 2;
}

const customLayer = {
  id: LAYER_ID,
  type: "custom",
  renderingMode: "3d",

  onAdd(map, gl) {
    state.map = map;
    state.camera = new THREE.Camera();
    state.scene = new THREE.Scene();

    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(0.5, -0.8, 1.0).normalize();
    state.scene.add(ambient, sun);

    state.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    });
    state.renderer.autoClear = false;
    state.ready = true;
  },

  render(gl, matrix) {
    if (!state.ready || state.objects.size === 0) return;
    if (!state.clock) state.clock = new THREE.Clock();
    const dt = Math.min(state.clock.getDelta(), 0.1);
    for (const obj of state.spinners) {
      obj.rotation.y += (obj.userData.spinY || 0) * dt;
      if (obj.userData.swayAmp) {
        obj.userData.swayT = (obj.userData.swayT || 0) + dt;
        obj.rotation.z = Math.sin(obj.userData.swayT * 0.9) * obj.userData.swayAmp;
      }
    }
    // billboards: face the camera's current bearing (markers stay readable
    // from any rotation/tilt)
    if (state.billboards.size) {
      const bearingRad = (state.map.getBearing() * Math.PI) / 180;
      _qTmp.setFromAxisAngle(_zAxis, bearingRad);
      _qTmp2.setFromAxisAngle(_xAxis, Math.PI / 2);
      _qTmp.multiply(_qTmp2);
      for (const obj of state.billboards) {
        obj.quaternion.copy(_qTmp);
      }
    }
    state.camera.projectionMatrix = _projMatrix.fromArray(matrix);
    state.renderer.resetState();
    state.renderer.render(state.scene, state.camera);
    // Only drive a continuous repaint loop when something is actually
    // animating (spinning TVS gauges). Static objects (fronts, tower, H/L
    // billboards) repaint on demand — MapLibre already repaints on camera
    // moves, which is when billboards need to re-orient. Forcing 60fps
    // repaints with only static objects pegged the GPU for nothing.
    if (state.spinners.size > 0) {
      state.map.triggerRepaint();
    }
  },
};

function ensureLayer() {
  if (!state.map || state.map.getLayer(LAYER_ID)) return;
  state.map.addLayer(customLayer);
}

// ---------------------------------------------------------------------------
// Built-in meshes
// ---------------------------------------------------------------------------

/** A stylized NEXRAD tower: lattice column + white radome. ~`heightMeters`
 *  tall. Built Y-up: the placement anchor converts Y-up to world-up. */
function buildRadarTowerMesh(heightMeters = 350) {
  const group = new THREE.Group();
  const towerH = heightMeters * 0.78;
  const domeR = heightMeters * 0.16;

  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(heightMeters * 0.025, heightMeters * 0.06, towerH, 8, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xb9c2cc, metalness: 0.6, roughness: 0.45, side: THREE.DoubleSide }),
  );
  tower.position.y = towerH / 2;
  group.add(tower);

  const struts = new THREE.Mesh(
    new THREE.CylinderGeometry(heightMeters * 0.012, heightMeters * 0.012, towerH * 0.99, 4),
    new THREE.MeshStandardMaterial({ color: 0x7a838c, metalness: 0.7, roughness: 0.4 }),
  );
  struts.rotation.y = Math.PI / 4;
  struts.position.y = towerH / 2;
  group.add(struts);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(domeR, 24, 18),
    new THREE.MeshStandardMaterial({ color: 0xf4f6f8, metalness: 0.05, roughness: 0.35 }),
  );
  dome.position.y = towerH + domeR * 0.7;
  group.add(dome);

  return group;
}

/** Canvas texture of slanted dark/light streaks — makes funnel rotation visible. */
function makeVortexTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#3a3a42";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 14; i++) {
    g.strokeStyle = i % 2 ? "rgba(190,190,205,0.55)" : "rgba(20,20,26,0.6)";
    g.lineWidth = 10 + Math.random() * 8;
    g.beginPath();
    const x = (i / 14) * 256;
    g.moveTo(x, 256);
    g.bezierCurveTo(x + 40, 180, x + 25, 90, x + 70, 0);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let vortexTexture = null;

/** A spinning tornado funnel (Y-up, meters). */
function buildVortexMesh({ heightMeters = 7000, topRadius = 2000, baseRadius = 180 } = {}) {
  if (!vortexTexture) vortexTexture = makeVortexTexture();
  const group = new THREE.Group();

  // funnel profile: flared top, narrow base, slight curve
  const profile = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = baseRadius + (topRadius - baseRadius) * Math.pow(t, 1.8);
    profile.push(new THREE.Vector2(r, t * heightMeters));
  }

  const funnel = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 28),
    new THREE.MeshStandardMaterial({
      map: vortexTexture,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      roughness: 0.9,
    }),
  );
  funnel.userData.spinY = 3.2; // rad/s
  funnel.userData.swayAmp = 0.05;
  state.spinners.add(funnel);
  group.add(funnel);

  const shell = new THREE.Mesh(
    new THREE.LatheGeometry(profile.map((p) => new THREE.Vector2(p.x * 1.25 + 60, p.y)), 24),
    new THREE.MeshBasicMaterial({
      color: 0x9aa3ad,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  shell.userData.spinY = 1.6;
  state.spinners.add(shell);
  group.add(shell);

  const dust = new THREE.Mesh(
    new THREE.TorusGeometry(baseRadius * 3.2, baseRadius * 1.1, 10, 28),
    new THREE.MeshStandardMaterial({ color: 0x6b5a48, transparent: true, opacity: 0.5, roughness: 1 }),
  );
  dust.rotation.x = Math.PI / 2;
  dust.position.y = baseRadius * 0.9;
  const dustSpin = new THREE.Group();
  dustSpin.add(dust);
  dustSpin.userData.spinY = 2.2;
  state.spinners.add(dustSpin);
  group.add(dustSpin);

  return group;
}

// Baron-style rotation-detector colors (legend: weak -> strong -> extreme)
const TVS_STRENGTH_COLORS = {
  weak: 0x3ec45f,
  strong: 0xb01515,
  extreme: 0xe8c61a,
};

/** Baron-style 3D rotation gauge: metallic open cylinder + colored collar
 *  ring + spinning arc segments on top. Y-up, meters. */
function buildRotationGauge({ strength = "strong", heightMeters = 2600 } = {}) {
  const color = TVS_STRENGTH_COLORS[strength] || TVS_STRENGTH_COLORS.strong;
  const group = new THREE.Group();
  const r = heightMeters * 0.42;

  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, heightMeters, 28, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xc9ced4,
      metalness: 0.85,
      roughness: 0.3,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
    }),
  );
  shell.position.y = heightMeters / 2;
  group.add(shell);

  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.55, r * 0.55, heightMeters * 0.96, 20),
    new THREE.MeshStandardMaterial({ color: 0xe8ebee, metalness: 0.5, roughness: 0.45 }),
  );
  core.position.y = heightMeters * 0.48;
  group.add(core);

  // strength collar — colored band around the upper shell
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 1.08, r * 1.08, heightMeters * 0.22, 28, 1, true),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.45,
      metalness: 0.4,
      roughness: 0.4,
      side: THREE.DoubleSide,
    }),
  );
  collar.position.y = heightMeters * 0.78;
  collar.userData.spinY = 1.4;
  state.spinners.add(collar);
  group.add(collar);

  // spinning broken arcs on top (the rotating "gauge" elements)
  const arcSpin = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(r * 0.85, r * 0.075, 10, 32, Math.PI * 0.65),
      new THREE.MeshStandardMaterial({ color: 0xf2f4f6, metalness: 0.7, roughness: 0.3 }),
    );
    arc.rotation.x = -Math.PI / 2; // lay flat
    arc.rotation.z = i * Math.PI;
    arc.position.y = heightMeters * 1.06;
    arcSpin.add(arc);
  }
  arcSpin.userData.spinY = 2.6;
  state.spinners.add(arcSpin);
  group.add(arcSpin);

  return group;
}

// ---------------------------------------------------------------------------
// 3D surface fronts (built in absolute mercator space, not anchored)
// ---------------------------------------------------------------------------

// Heights are display-exaggerated so the walls read at synoptic zoom,
// the way broadcast systems draw fronts.
const FRONT_STYLE = {
  cold: { color: 0x2563ff, height: 45000, pip: "cone" },
  warm: { color: 0xff3b30, height: 45000, pip: "dome" },
  stnry: { color: 0x2563ff, color2: 0xff3b30, height: 45000, pip: "alternate" },
  ocfnt: { color: 0xb04ad8, height: 45000, pip: "alternate" },
  trof: { color: 0xffaa2b, height: 18000, pip: null, dashed: true },
  dryline: { color: 0xc98a2b, height: 22000, pip: "dome", dashed: true },
};

let frontsGroup = null;

function lngLatToMerc(lng, lat, altitude = 0) {
  const mc = maplibregl.MercatorCoordinate.fromLngLat({ lng, lat }, altitude);
  return new THREE.Vector3(mc.x, mc.y, mc.z);
}

function buildFrontWall(coords, style) {
  const group = new THREE.Group();
  if (coords.length < 2) return group;

  // smooth the coarse 1° polyline into a broadcast-style curve
  const pts = coords.map(([lng, lat]) => lngLatToMerc(lng, lat, 0));
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.5);
  const samples = curve.getPoints(Math.min(coords.length * 8, 400));

  const midLat = coords[Math.floor(coords.length / 2)][1];
  const u = maplibregl.MercatorCoordinate.fromLngLat({ lng: 0, lat: midLat }, 0)
    .meterInMercatorCoordinateUnits();
  const h = style.height * u;

  const isStationary = !!style.color2;
  const dashed = !!style.dashed;
  const positions = [];
  const colors = [];
  const cA = new THREE.Color(style.color);
  const cB = new THREE.Color(style.color2 || style.color);

  for (let i = 0; i < samples.length - 1; i++) {
    if (dashed && i % 6 >= 3) continue; // dash pattern for troughs
    const p0 = samples[i];
    const p1 = samples[i + 1];
    const seg = isStationary ? (Math.floor(i / 8) % 2 ? cB : cA) : cA;
    // two triangles: bottom0, bottom1, top1 / bottom0, top1, top0
    positions.push(
      p0.x, p0.y, 0, p1.x, p1.y, 0, p1.x, p1.y, h,
      p0.x, p0.y, 0, p1.x, p1.y, h, p0.x, p0.y, h,
    );
    for (let k = 0; k < 6; k++) colors.push(seg.r, seg.g, seg.b);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const wall = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  group.add(wall);

  // sculpted crest + base tubes give the front a solid ridged 3D body
  // (not just a translucent color wall)
  if (!dashed) {
    try {
      const crestCurve = new THREE.CatmullRomCurve3(
        samples.map((p) => new THREE.Vector3(p.x, p.y, h)),
      );
      const crest = new THREE.Mesh(
        new THREE.TubeGeometry(crestCurve, Math.min(samples.length, 200), 3200 * u, 8, false),
        new THREE.MeshStandardMaterial({ color: cA, metalness: 0.15, roughness: 0.55 }),
      );
      group.add(crest);

      const baseCurve = new THREE.CatmullRomCurve3(
        samples.map((p) => new THREE.Vector3(p.x, p.y, 2200 * u)),
      );
      const baseTube = new THREE.Mesh(
        new THREE.TubeGeometry(baseCurve, Math.min(samples.length, 200), 2600 * u, 8, false),
        new THREE.MeshStandardMaterial({
          color: isStationary ? cB : cA,
          metalness: 0.15,
          roughness: 0.55,
        }),
      );
      group.add(baseTube);
    } catch (e) {
      /* degenerate curve */
    }
  }

  // ridges along the crest (cones = cold, domes = warm), lit + denser so
  // the front reads as sculpted geometry
  if (style.pip) {
    const pipEvery = 12;
    for (let i = pipEvery; i < samples.length - 1; i += pipEvery) {
      const p = samples[i];
      const kind =
        style.pip === "alternate"
          ? (i / pipEvery) % 2
            ? "dome"
            : "cone"
          : style.pip;
      const color = isStationary ? ((i / pipEvery) % 2 ? cB : cA) : new THREE.Color(style.color);
      const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.2, roughness: 0.5 });
      let pip;
      if (kind === "cone") {
        pip = new THREE.Mesh(new THREE.ConeGeometry(9000 * u, 18000 * u, 10), mat);
        // cone Y-up -> mercator Z-up
        pip.rotation.x = Math.PI / 2;
        pip.rotation.y = Math.PI; // point up
      } else {
        pip = new THREE.Mesh(
          new THREE.SphereGeometry(8000 * u, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
          mat,
        );
        pip.rotation.x = -Math.PI / 2;
      }
      pip.position.set(p.x, p.y, h);
      group.add(pip);
    }
  }
  return group;
}

function makeTextBillboard(text, color) {
  // A single vertical plane re-oriented toward the camera every frame
  // (THREE.Sprite can't billboard against MapLibre's matrices, so the
  // render loop rotates these by the map bearing instead).
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d");
  g.font = "bold 100px Arial";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 14;
  g.strokeStyle = "rgba(255,255,255,0.95)";
  g.strokeText(text, 64, 70);
  g.fillStyle = color;
  g.fillText(text, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  state.billboards.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const Radar3D = {
  /** Attach the 3D layer to a MapLibre map (idempotent). */
  init(map) {
    state.map = map;
    if (map.isStyleLoaded()) {
      ensureLayer();
    } else {
      map.once("load", ensureLayer);
    }
    // re-add after style changes wipe custom layers
    map.on("styledata", () => {
      try {
        ensureLayer();
      } catch (e) {
        /* style mid-load */
      }
    });
  },

  /** Place any THREE.Object3D at lng/lat. Object units are meters, Z-up. */
  addMesh(id, object3d, { lng, lat, altitude = 0 } = {}) {
    this.remove(id);
    const anchor = new THREE.Group();
    placeAnchor(anchor, { lng, lat }, altitude);
    anchor.add(object3d);
    state.scene.add(anchor);
    state.objects.set(id, { anchor, lngLat: { lng, lat }, altitude });
    state.map && state.map.triggerRepaint();
    return anchor;
  },

  /** Load a glTF/GLB model and place it. scaleMeters sizes the model's
   *  largest dimension; rotationDeg spins it around vertical. */
  async addModel(id, url, { lng, lat, altitude = 0, scaleMeters = 50, rotationDeg = 0 } = {}) {
    const gltf = await state.gltfLoader.loadAsync(url);
    const model = gltf.scene;
    const bbox = new THREE.Box3().setFromObject(model);
    const size = bbox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const s = scaleMeters / maxDim;
    model.scale.setScalar(s);
    // glTF models are Y-up, which matches the anchor space
    model.rotation.y = (rotationDeg * Math.PI) / 180;
    return this.addMesh(id, model, { lng, lat, altitude });
  },

  /** Built-in stylized WSR-88D tower + radome. */
  addRadarTower({ lng, lat, heightMeters = 350, id = "radar-tower" } = {}) {
    return this.addMesh(id, buildRadarTowerMesh(heightMeters), { lng, lat });
  },

  move(id, { lng, lat, altitude = 0 }) {
    const entry = state.objects.get(id);
    if (!entry) return;
    placeAnchor(entry.anchor, { lng, lat }, altitude);
    entry.lngLat = { lng, lat };
    state.map && state.map.triggerRepaint();
  },

  remove(id) {
    const entry = state.objects.get(id);
    if (!entry) return;
    entry.anchor.traverse((o) => {
      state.spinners.delete(o);
      state.billboards.delete(o);
    });
    state.scene.remove(entry.anchor);
    state.objects.delete(id);
    state.map && state.map.triggerRepaint();
  },

  clear() {
    for (const id of Array.from(state.objects.keys())) this.remove(id);
  },

  has(id) {
    return state.objects.has(id);
  },

  /** Spinning tornado funnel at lng/lat. Size scales mildly with strength. */
  addVortex(id, { lng, lat, strength = 50 } = {}) {
    const numericStrength =
      typeof strength === "number"
        ? strength
        : String(strength).toLowerCase() === "extreme"
          ? 95
          : String(strength).toLowerCase() === "strong"
            ? 72
            : 48;
    const k = Math.max(0.7, Math.min(1.8, numericStrength / 60));
    return this.addMesh(
      id,
      buildVortexMesh({
        heightMeters: 6500 * k,
        topRadius: 1800 * k,
        baseRadius: 170 * k,
      }),
      { lng, lat },
    );
  },

  /** Baron-style rotation gauge at a detection site. */
  addRotationGauge(id, { lng, lat, strength = "strong" } = {}) {
    return this.addMesh(id, buildRotationGauge({ strength }), { lng, lat });
  },

  /** Sync 3D markers to TDA detections
   *  [{lon, lat, strength: 'weak'|'strong'|'extreme', class: 'TVS'|'ETVS'}]. */
  updateTVS(tvsList) {
    const wanted = new Set();
    (tvsList || []).forEach((tvs, i) => {
      const id = `tvs-vortex-${i}`;
      wanted.add(id);
      const existing = state.objects.get(id);
      if (existing &&
          existing.strengthKey === String(tvs.strength) &&
          Math.abs(existing.lngLat.lng - tvs.lon) < 1e-4 &&
          Math.abs(existing.lngLat.lat - tvs.lat) < 1e-4) {
        return; // unchanged
      }
      this.addVortex(id, { lng: tvs.lon, lat: tvs.lat, strength: tvs.strength });
      const entry = state.objects.get(id);
      if (entry) entry.strengthKey = String(tvs.strength);
    });
    for (const id of Array.from(state.objects.keys())) {
      if (id.startsWith("tvs-vortex-") && !wanted.has(id)) this.remove(id);
    }
  },

  /** Build 3D front walls + H/L markers from /api/fronts data. */
  showFronts(data) {
    this.hideFronts();
    if (!data || !state.scene) return;
    frontsGroup = new THREE.Group();
    for (const front of data.fronts || []) {
      const style = FRONT_STYLE[front.type];
      if (!style) continue;
      frontsGroup.add(buildFrontWall(front.coords, style));
    }
    const midU = (lat) =>
      maplibregl.MercatorCoordinate.fromLngLat({ lng: 0, lat }, 0).meterInMercatorCoordinateUnits();
    const addCenterMark = (text, color, lon, lat) => {
      const s = makeTextBillboard(text, color);
      const u = midU(lat);
      const size = 150000 * u;
      s.position.copy(lngLatToMerc(lon, lat, 80000));
      s.scale.set(size, size, size);
      frontsGroup.add(s);
    };
    for (const hi of data.highs || []) addCenterMark("H", "#2563ff", hi.lon, hi.lat);
    for (const lo of data.lows || []) addCenterMark("L", "#ff3b30", lo.lon, lo.lat);
    state.scene.add(frontsGroup);
    // register as an object so the render loop stays active
    state.objects.set("__fronts__", { anchor: frontsGroup, lngLat: null, altitude: 0 });
    state.map && state.map.triggerRepaint();
  },

  hideFronts() {
    if (frontsGroup) {
      frontsGroup.traverse((o) => {
        state.spinners.delete(o);
        state.billboards.delete(o);
      });
      state.scene.remove(frontsGroup);
      frontsGroup = null;
      state.objects.delete("__fronts__");
      state.map && state.map.triggerRepaint();
    }
  },

  get THREE() {
    return THREE;
  },
};

window.Radar3D = Radar3D;

// ---------------------------------------------------------------------------
// Auto-wiring: attach to the app's map and follow the selected radar site
// ---------------------------------------------------------------------------

function tryAttach() {
  const map = window.radarMapInstance;
  if (!map) return false;
  Radar3D.init(map);

  // Keep a radar tower on the selected site while 3D tilt is on,
  // mirror TVS detections as spinning vortices, and manage 3D fronts.
  let lastSiteKey = null;
  let frontsData = null;
  let frontsFetchedAt = 0;
  let frontsShown = false;

  setInterval(async () => {
    try {
      const tiltOn =
        !!window.__enable3DTilt ||
        !!document.getElementById("enable3DTilt")?.checked;
      const loc = window.__radarSiteLocation || null;

      // --- Radar tower + TVS vortices: 3D-tilt only (meaningless flat) ---
      if (tiltOn) {
        if (loc) {
          const key = `${loc.longitude.toFixed(4)},${loc.latitude.toFixed(4)}`;
          if (key !== lastSiteKey) {
            Radar3D.addRadarTower({ lng: loc.longitude, lat: loc.latitude });
            lastSiteKey = key;
          }
        }
        Radar3D.updateTVS(window.__tvsLocations || []);
      } else {
        if (Radar3D.has("radar-tower")) Radar3D.remove("radar-tower");
        Radar3D.updateTVS([]);
        lastSiteKey = null;
      }

      // --- 3D surface fronts: shown whenever the checkbox is on, in flat
      // OR tilted view. Refreshed every 10 min; failed fetches back off 30s
      // instead of hammering a down API. ---
      const wantFronts = !!document.getElementById("show3DFronts")?.checked;
      if (wantFronts) {
        const sinceAttempt = Date.now() - frontsFetchedAt;
        const shouldFetch = frontsData
          ? sinceAttempt > 10 * 60 * 1000
          : sinceAttempt > 30 * 1000 || frontsFetchedAt === 0;
        if (shouldFetch) {
          frontsFetchedAt = Date.now();
          try {
            const resp = await fetch("http://localhost:5100/api/fronts");
            if (resp.ok) {
              frontsData = await resp.json();
              if (frontsShown) Radar3D.showFronts(frontsData); // refresh in place
            }
          } catch (e) {
            /* api offline — retry after backoff */
          }
        }
        if (!frontsShown && frontsData) {
          Radar3D.showFronts(frontsData);
          frontsShown = true;
        }
      } else if (frontsShown) {
        Radar3D.hideFronts();
        frontsShown = false;
      }
    } catch (e) {
      /* app globals not ready yet */
    }
  }, 1500);
  return true;
}

if (!tryAttach()) {
  window.addEventListener("radar-map-ready", tryAttach, { once: true });
}
