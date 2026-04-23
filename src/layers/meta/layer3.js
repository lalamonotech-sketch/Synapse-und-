/**
 * SYNAPSE v99 — Layer 3 (legacy entry point)
 *
 * This file is kept for backwards-compatibility with any remaining callers
 * that import directly from 'layers/meta/layer3.js'.
 *
 * The implementation has been refactored into:
 *   index.js           — orchestrator + initLayer3
 *   _l3Materials.js    — MM, macNodes, macLinks, macCores
 *   _l3Elites.js       — ELITE_CLUSTER_DEFS, LAYER_CONDITIONS, selectLayerCondition
 *   _l3Projects.js     — STRATEGIC_PROJECTS + project API
 *   _l3ClusterLogic.js — countConnectedCorePairs, checkSpine, tryFusion,
 *                        captureOpenClusters, checkL3Objectives, updateL3ClusterHUD
 *   _l3Animate.js      — startSyncDecayBar, stopSyncDecayBar, animateLayer3
 */
export * from './index.js';
