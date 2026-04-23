/**
 * SYNAPSE v100 — Phase 2 · UI shim (Backward-Compat only)
 *
 * P2 Fix 4.3: Header updated — this is a shim, not the implementation.
 *
 * Progressive-UI logic now lives directly inside the system modules
 * (systems/pulseMode.js + systems/sectorVariables.js).
 * This file remains as a thin compatibility wrapper so existing
 * call-sites (`initPhase2UI`, `refreshPhase2UI`) keep working.
 */

import { initPulseModeUI, refreshPulseModeUI } from '../systems/pulseMode.js';
import { initSectorUI,    refreshSectorUI    } from '../systems/sectorVariables.js';

export function initPhase2UI() {
  initPulseModeUI();
  initSectorUI();
}

export function refreshPhase2UI() {
  refreshPulseModeUI();
  refreshSectorUI();
}
