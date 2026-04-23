/**
 * SYNAPSE v98 — Scene Setup
 *
 * Owns the Three.js renderer, camera, scene, and EffectComposer.
 * Exports refs consumed by gameLoop.js, layers/, and dispose.js.
 */

import * as THREE from 'three';
import { OrbitControls }   from 'three/addons/controls/OrbitControls.js';
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { regListener }     from '../registries/listenerRegistry.js';

// ── Scene ──────────────────────────────────────────────────────────────────
export const scene = new THREE.Scene();

// ── Camera ─────────────────────────────────────────────────────────────────
export const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(1.5, 2.0, 18); // slight angle for immediate depth impression

// ── Renderer ───────────────────────────────────────────────────────────────
// Guard WebGL creation so the title screen and menu still work on browsers
// where WebGL is unavailable or blocked. Downstream code receives a stub
// renderer that no-ops and a warning banner is shown.
function _createRenderer() {
  try {
    const r = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    r.setSize(window.innerWidth, window.innerHeight);
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.1;
    document.body.appendChild(r.domElement);
    return r;
  } catch (err) {
    console.warn('[Synapse] WebGL unavailable — running without 3D rendering.', err);
    const banner = document.getElementById('prod-status-banner');
    if (banner) {
      banner.textContent = 'WebGL nicht verfügbar — 3D-Grafik deaktiviert. Menü weiterhin nutzbar.';
      banner.dataset.level = 'warn';
      banner.style.display = 'block';
    }
    const noop = () => {};
    const stubDom = document.createElement('canvas');
    stubDom.id = 'three-canvas-stub';
    stubDom.style.display = 'none';
    document.body.appendChild(stubDom);
    return {
      domElement: stubDom,
      setSize: noop,
      setPixelRatio: noop,
      setClearColor: noop,
      render: noop,
      dispose: noop,
      getContext: () => null,
      toneMapping: 0,
      toneMappingExposure: 1,
      info: { render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 } },
      capabilities: { isWebGL2: false, maxTextureSize: 0 },
      shadowMap: { enabled: false },
      __isStub: true,
    };
  }
}

export const renderer = _createRenderer();

// ── Lights ─────────────────────────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0x111e33, 1.2); // darker ambient = more contrast
scene.add(ambientLight);

const pLight = new THREE.PointLight(0x3366cc, 1.8, 45); // cooler, less intense key light
pLight.position.set(0, 8, 5);
scene.add(pLight);

const wLight = new THREE.PointLight(0xffeecc, 0.35, 70); // warm fill from below
wLight.position.set(0, -10, 8);
scene.add(wLight);

const rimLight = new THREE.PointLight(0x2244aa, 0.6, 30); // rim light for depth cueing
rimLight.position.set(-12, 3, -4);
scene.add(rimLight);

// ── Orbit Controls ─────────────────────────────────────────────────────────
function _safe(factory, fallback) {
  if (renderer.__isStub) return fallback;
  try { return factory(); } catch (e) { console.warn('[Synapse] init skipped:', e); return fallback; }
}

const _noopPass = { enabled: false, setSize() {}, render() {}, dispose() {} };
const _noopControls = { enabled: false, update() {}, dispose() {}, addEventListener() {}, removeEventListener() {} };

export const controls = _safe(() => {
  const c = new OrbitControls(camera, renderer.domElement);
  c.enableDamping = true;
  c.dampingFactor = 0.06;
  c.enableZoom = true;
  c.minDistance = 6;
  c.maxDistance = 35;
  c.enablePan = false;
  c.autoRotate = false;
  return c;
}, _noopControls);

// ── Post-processing: Bloom ─────────────────────────────────────────────────
export const bloomPass = _safe(() => new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.95, 0.32, 0.65
), { ..._noopPass, strength: 0, radius: 0, threshold: 1 });
export const renderPass = _safe(() => new RenderPass(scene, camera), _noopPass);

export const comp = _safe(() => {
  const c = new EffectComposer(renderer);
  c.addPass(renderPass);
  c.addPass(bloomPass);
  return c;
}, { setSize() {}, render() {}, dispose() {}, passes: [] });

// ── Shared base geometries ─────────────────────────────────────────────────
// These are SHARED across all node meshes — dispose only on full scene teardown.
export const GS  = new THREE.SphereGeometry(1, 26, 18);   // full-size nodes — lighter segment count
export const GS2 = new THREE.SphereGeometry(.11, 10, 8); // signal dots — lighter segment count

// ── Scene groups (one per layer) ───────────────────────────────────────────
export const microGroup = new THREE.Group(); scene.add(microGroup); // Layer 1
export const tGroup     = new THREE.Group(); scene.add(tGroup);     // Layer 2
export const macGroup   = new THREE.Group(); scene.add(macGroup);   // Layer 3
export const fxGroup    = new THREE.Group(); scene.add(fxGroup);    // pooled billboard FX

// ── Clock ──────────────────────────────────────────────────────────────────
// THREE.Clock is deprecated in favour of THREE.Timer. We wrap Timer in a
// thin shim that keeps the .getElapsedTime() API intact so no other module
// needs to change. Call clock.update() once per RAF frame (done in gameLoop).
const _timer = new THREE.Timer();
export const clock = {
  getElapsedTime() { return _timer.getElapsed(); },
  update(timestamp) { _timer.update(timestamp); },
};

// ── Resize handler ─────────────────────────────────────────────────────────
regListener(window, 'resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  comp.setSize(w, h);
  bloomPass.setSize(w, h);
});

// ── Material helper ────────────────────────────────────────────────────────
/**
 * Create a standard node material.
 * @param {number} color   - hex colour
 * @param {number} emissive - hex emissive colour
 * @param {number} emissiveIntensity
 * @returns {THREE.MeshLambertMaterial}
 */
const _presentationState = { calmness: 0 };

function _lerp(a, b, t) {
  return a + (b - a) * t;
}

export function applyPresentationProfile(calmness = 0) {
  const target = Math.max(0, Math.min(1, calmness || 0));
  _presentationState.calmness += (target - _presentationState.calmness) * 0.08;
  const k = _presentationState.calmness;

  bloomPass.strength = _lerp(0.95, 0.40, k);   // updated base
  bloomPass.radius = _lerp(0.32, 0.18, k);
  bloomPass.threshold = _lerp(0.65, 0.76, k);
  renderer.toneMappingExposure = _lerp(1.1, 0.96, k);
  ambientLight.intensity = _lerp(1.2, 0.95, k);
  pLight.intensity = _lerp(1.8, 1.35, k);
  wLight.intensity = _lerp(0.35, 0.22, k);
}

export function mkMat(color, emissive, emissiveIntensity) {
  return new THREE.MeshLambertMaterial({
    color,
    emissive,
    emissiveIntensity,
    transparent: true,
    opacity: 1,
  });
}

// ── Legacy window bridges (dispose.js + debug console access) ─────────────
window._scene    = scene;
window._camera   = camera;
window._renderer = renderer;
window._comp     = comp;
