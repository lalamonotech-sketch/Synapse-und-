/**
 * SYNAPSE v99 — AI Meta Persistence
 *
 * Handles localStorage-backed AI meta cache:
 *   - loadAIMeta / saveAIMeta
 *   - invalidation + cached access
 */

const LS_AI_META = 'synapse_ai_meta';

export const META_DEFAULT = {
  totalRuns: 0,
  profileHistory: [],
  avgSpineLength: 0,
  fusionRuns: 0,
  avgPulseFreq: 0,
  avgStableRatio: 0,
  bestTrainingScores: { routing: 0, timing: 0, stability: 0, memory: 0 },
  unlockedTraits: [],
  dominantOverall: null,
  metaObjectivesGenerated: [],
  totalElitesCaptured: 0,
  eliteSuccesses: 0,
  eliteFailures: 0,
  eliteTimeouts: 0,
  conditionsSeen: 0,
  conditionWins: 0,
  questlinesCompleted: 0,
  bossConditionWins: 0,
};

let _aiMetaCache = null;
let _aiMetaDirty = true;

export function invalidateAIMetaCache() {
  _aiMetaDirty = true;
}

export function loadAIMeta() {
  try {
    const raw = localStorage.getItem(LS_AI_META);
    if (raw) return Object.assign({}, META_DEFAULT, JSON.parse(raw));
  } catch (_) {}
  return Object.assign({}, META_DEFAULT);
}

export function loadAIMetaCached() {
  if (_aiMetaDirty || !_aiMetaCache) {
    _aiMetaCache = loadAIMeta();
    _aiMetaDirty = false;
  }
  return _aiMetaCache;
}

export function saveAIMeta(meta) {
  invalidateAIMetaCache();
  try { localStorage.setItem(LS_AI_META, JSON.stringify(meta)); } catch (_) {}
}
