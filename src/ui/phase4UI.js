/**
 * SYNAPSE v100 — Phase 4 UI: Backward-Compat Shim
 *
 * Phase 4 Sentience UI is now embedded directly in systems/sentience.js
 * (initSentienceUI / refreshSentienceUI) — see P0 Fix 2.5 in RC roadmap.
 *
 * This file exists only so that existing import { initPhase4UI, refreshPhase4UI }
 * callers (e.g. main.js) continue to work without modification.
 * Once those callers are updated, this file can be deleted.
 */

import { initSentienceUI, refreshSentienceUI } from '../systems/sentience.js';

export const initPhase4UI    = initSentienceUI;
export const refreshPhase4UI = refreshSentienceUI;
