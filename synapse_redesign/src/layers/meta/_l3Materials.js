/**
 * SYNAPSE v99 — Layer 3: Shared Arrays + Material Pack
 *
 * Extracted from layer3.js (was inlined at lines 82-146).
 * Owns:
 *   MM         – shared material pack (7 Three.js materials)
 *   macNodes   – macro-node mesh array
 *   macLinks   – macro-link line array
 *   macCores   – macro-core mesh array
 *
 * Also provides internal render helpers (_setCoreMaterial, _setCoreEmissiveHex)
 * and the HUD-change signal throttle (_signalL3HudIfChanged).
 */

import * as THREE from 'three';
import { G }                   from '../../state/gameState.js';
import { signalLayer3Changed } from '../../platform/stateSignals.js';

// ─── Shared geometry arrays ───────────────────────────────────────────────
export const macNodes = [];
export const macLinks = [];
export const macCores = [];

/**
 * Shared Layer-3 material pack.
 * Exposed as window.MM so dispose.js → disposeMaterialPack(window.MM) works
 * without a direct import.
 */
export const MM = {
  core:  new THREE.MeshLambertMaterial({ color:0x4499ff, emissive:0x2255ee, emissiveIntensity:2.5, transparent:true, opacity:0 }),
  sat:   new THREE.MeshLambertMaterial({ color:0x33bbff, emissive:0x1166cc, emissiveIntensity:1.8, transparent:true, opacity:0 }),
  purp:  new THREE.MeshLambertMaterial({ color:0xcc77ff, emissive:0xaa33ee, emissiveIntensity:2.2, transparent:true, opacity:0 }),
  line:  new THREE.LineBasicMaterial({ color:0x2255dd, transparent:true, opacity:0, blending:THREE.AdditiveBlending }),
  hw:    new THREE.LineBasicMaterial({ color:0xaa44ff, transparent:true, opacity:0, blending:THREE.AdditiveBlending }),
  fuse:  new THREE.MeshLambertMaterial({ color:0xff9900, emissive:0xff6600, emissiveIntensity:4.5, transparent:true, opacity:0 }),
  spine: new THREE.MeshLambertMaterial({ color:0xffcc44, emissive:0xffaa00, emissiveIntensity:3.5, transparent:true, opacity:0 }),
};

// ─── Window bridges (legacy callers, dispose.js) ──────────────────────────
window.MM       = MM;
window.macNodes = macNodes;
window.macLinks = macLinks;
window.macCores = macCores;

// ─── Internal render helpers ──────────────────────────────────────────────

/** Swap material only when actually different — avoids dirty flag thrash. */
export function setCoreMaterial(mesh, material) {
  if (!mesh || mesh.material === material) return;
  mesh.material = material;
}

/** Set emissive hex only when changed — skips setHex() if already matching. */
export function setCoreEmissiveHex(mesh, hex) {
  if (!mesh) return;
  if (mesh.userData._emissiveHex === hex) return;
  mesh.userData._emissiveHex = hex;
  mesh.material.emissive.setHex(hex);
}

// ─── HUD change-signal throttle ───────────────────────────────────────────

let _l3HudStateSig  = '';
let _l3HudStateTick = 0;

function _buildL3HudStateSig() {
  const clusters = G.l3Clusters || [];
  // countConnectedCorePairs is accessed via window bridge to avoid circular deps
  let sig = `${G.l3CapturedClusters}:${G.spineLength}:${G.l3BonusActive ? 1 : 0}:${G.fusedPairs.size}:${window._countConnectedCorePairs?.() ?? 0}:`;
  for (let i = 0; i < clusters.length; i++) {
    const cl = clusters[i];
    if (!cl) continue;
    sig += cl.captured ? 'c' : cl.syncWindowOpen ? 'o' : cl.syncReady ? 'r' : '_';
    sig += cl._dormant   ? 'd' : '-';
    sig += cl._eliteActive ? 'e' : '-';
    sig += G.spineNodes?.has?.(i) ? 's' : '-';
    sig += '|';
  }
  return sig;
}

/** Emit a layer-3 changed signal at most once every 120 ms. */
export function signalL3HudIfChanged(t) {
  if (t - _l3HudStateTick < 0.12) return;
  _l3HudStateTick = t;
  const sig = _buildL3HudStateSig();
  if (sig === _l3HudStateSig) return;
  _l3HudStateSig = sig;
  signalLayer3Changed();
}
