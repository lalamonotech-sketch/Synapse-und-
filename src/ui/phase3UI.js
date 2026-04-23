/**
 * SYNAPSE v100 — Phase 3 · UI shim (Backward-Compat only)
 *
 * P2 Fix 4.3: Header updated — this is a shim, not the implementation.
 *
 * Progressive-UI logic now lives directly inside systems/overclocking.js.
 * This file remains as a thin compatibility wrapper so existing call-sites
 * (`initPhase3UI`, `refreshPhase3UI`) keep working without changes.
 */

import { initOverclockUI, refreshOverclockUI } from '../systems/overclocking.js';

export function initPhase3UI()    { initOverclockUI(); }
export function refreshPhase3UI() { refreshOverclockUI(); }
