/**
 * SYNAPSE v99 — AI Combat Behaviours
 *
 * Per-frame combat sub-systems:
 *   - Phantom Misfires   (ghost signals when player is idle)
 *   - Predator SPOF      (bottleneck detection → link degradation)
 *   - Behavior Eval      (periodic coaching messages)
 *   - Architect Mirror   (structural pattern mirroring)
 *   - Training Immunity  (AI counters dominant build)
 */

import { G } from '../../state/gameState.js';
import { getLang } from '../../state/settings.js';
import { aiState } from '../../state/aiShared.js';
import { gameNodes, gameLinks, spawnShock, spawnSig } from '../../layers/network/index.js';
import { showToast } from '../../ui/hud/index.js';
import { showAgentMsg } from '../../meta/flow.js';
import { getLinkTypeCounts } from './_scoring.js';

// ── Phantom Misfires ──────────────────────────────────────────────────────

let _lastPhantomT = 0;
let _nextPhantomInterval = 6.0;

export function tickPhantomMisfires(t) {
  if (!G.autoOn || G.paused) return;
  if (gameLinks.length === 0) return;
  if (t - _lastPhantomT < _nextPhantomInterval) return;
  _lastPhantomT = t;
  _nextPhantomInterval = 4.0 + Math.random() * 5.0;

  const lk = gameLinks[Math.floor(Math.random() * gameLinks.length)];
  if (!lk || lk.sigs.length > 2) return;

  const s = spawnSig(lk, 0.5);
  if (s) {
    s._phantom = true;
    s._phantomOpacity = 0.10 + Math.random() * 0.06;
  }
}

// ── Predator SPOF Detection ───────────────────────────────────────────────

let _lastSpofCheck = 0;

export function tickPredatorSPOF(t, signals) {
  if (t - _lastSpofCheck < 4.0) return;
  _lastSpofCheck = t;
  if (aiState.dominantProfile !== 'predator') return;
  if (!signals || signals.length < 5) return;

  const nodeLoad = new Map();
  for (let i = 0; i < signals.length; i++) {
    const s = signals[i];
    if (s._phantom) continue;
    const a = s.lk.a, b = s.lk.b;
    if (a.type === 'relay') nodeLoad.set(a, (nodeLoad.get(a) || 0) + 1);
    if (b.type === 'relay') nodeLoad.set(b, (nodeLoad.get(b) || 0) + 1);
  }

  for (const [node, load] of nodeLoad) {
    const pct = load / signals.length;
    if (pct < 0.80) continue;

    const lang = getLang();
    showAgentMsg(
      lang === 'de' ? '◈ Kritischer Engpass. Destabilisierung.' : '◈ Critical bottleneck. Destabilising.',
      true, 'predator'
    );

    const nodeLinks = gameLinks.filter(lk => (lk.a === node || lk.b === node) && lk.type === 'stable');
    if (nodeLinks.length > 0) {
      const target = nodeLinks[Math.floor(Math.random() * nodeLinks.length)];
      target.type = 'fragile';
      target.lt = window.LT ? window.LT.fragile : target.lt;
      showToast(
        lang === 'de' ? '⚠ ENGPASS UNTER ANGRIFF' : '⚠ BOTTLENECK UNDER ATTACK',
        lang === 'de' ? 'Relay-Node überlastet · Link fragil' : 'Relay overloaded · Link turned fragile',
        2400
      );
    }
    break;
  }
}

// ── Behavior Evaluation ───────────────────────────────────────────────────

let _lastBehaviorEvalT = 0;

export function tickBehaviorEval(t) {
  if (t - _lastBehaviorEvalT < 9.0) return;
  _lastBehaviorEvalT = t;

  const timeSinceLastPulse = aiState.lastPulseTime ? (Date.now() - aiState.lastPulseTime) / 1000 : 999;
  const lang = getLang();
  const ltc = getLinkTypeCounts();

  if (timeSinceLastPulse > 22 && G.autoOn) {
    const msgs = lang === 'de'
      ? ['Synaptische Stagnation. Aktion erforderlich.', 'Inaktivität registriert.', 'Netz in Ruhezustand. Intervall kritisch.']
      : ['Synaptic stagnation. Action required.', 'Inactivity threshold exceeded.', 'Network idle. Interval critical.'];
    showAgentMsg(msgs[Math.floor(Math.random() * msgs.length)], false, aiState.dominantProfile);
    return;
  }
  if (G.tris.size >= 3 && ltc.total > 0 && ltc.stable > ltc.fragile * 2) {
    const msgs = lang === 'de'
      ? ['Strukturelle Integrität bemerkenswert.', 'Effiziente Topologie erkannt.', 'Triangulation optimal.']
      : ['Structural integrity remarkable.', 'Efficient topology noted.', 'Triangulation optimal.'];
    showAgentMsg(msgs[Math.floor(Math.random() * msgs.length)], false, 'analyst');
    return;
  }
  if (ltc.total > 0 && ltc.fragile / ltc.total > 0.5 && aiState.fragileLinksLost > 3) {
    const msgs = lang === 'de'
      ? ['Ineffizienter Signalfluss registriert.', 'Energieverlust durch fragile Links.', 'Instabile Routing-Muster erkannt.']
      : ['Inefficient signal flow registered.', 'Energy overhead detected.', 'Suboptimal routing observed.'];
    showAgentMsg(msgs[Math.floor(Math.random() * msgs.length)], false, aiState.dominantProfile);
  }
}

// ── Architect Mirror ──────────────────────────────────────────────────────

let _lastArchitectMirror = 0;
const _ARCHITECT_MIRROR_COOLDOWN = 20000;

export function _tickArchitectMirror() {
  if (aiState.dominantProfile !== 'architect') return;
  const now = Date.now();
  if (now - _lastArchitectMirror < _ARCHITECT_MIRROR_COOLDOWN) return;
  if (G.tris.size < 2) return;

  _lastArchitectMirror = now;
  const lang = getLang();
  showAgentMsg(
    lang === 'de' ? '◈ Strukturmuster analysiert. Repliziere.' : '◈ Structural pattern analysed. Replicating.',
    true, 'architect'
  );

  for (let i = 0; i < gameNodes.length; i++) {
    const n = gameNodes[i];
    if (n._isSpine || n.type === 'relay') {
      const origSz = n.sz;
      if (n.m) {
        n.m.scale.setScalar(origSz * 1.5);
        setTimeout(() => { if (n.m) n.m.scale.setScalar(origSz); }, 280);
      }
    }
  }
  spawnShock(0xffcc44, 1);
}

// ── Training Build Immunity ───────────────────────────────────────────────

function _detectBuildSignature() {
  const counts = {};
  for (let i = 0; i < gameNodes.length; i++) {
    const t = gameNodes[i].type;
    counts[t] = (counts[t] || 0) + 1;
  }
  let best = null, bestCount = 0;
  for (const [type, count] of Object.entries(counts)) {
    if (type === 'core' || type === 'source') continue;
    if (count > bestCount) { bestCount = count; best = type; }
  }
  return bestCount >= 3 ? best : null;
}

export function applyTrainingImmunity(now) {
  const buildSig = _detectBuildSignature();
  if (!buildSig) return;

  aiState.trainingImmunities = (aiState.trainingImmunities || []).filter(im => im.expiresAt > now);
  const alreadyImmune = aiState.trainingImmunities.some(im => im.type === buildSig);
  if (!alreadyImmune) {
    aiState.trainingImmunities.push({ type: buildSig, expiresAt: now + 120000 });
    const lang = getLang();
    showToast(
      lang === 'de' ? '◈ KI LERNT DEINE TAKTIK' : '◈ AI LEARNS YOUR TACTIC',
      lang === 'de' ? `${buildSig}-Build für 2min konterkariert` : `${buildSig}-build countered for 2 min`,
      3200
    );
  }
}

export function isNodeTypeCountered(type) {
  const now = Date.now();
  return (aiState.trainingImmunities || []).some(im => im.type === type && im.expiresAt > now);
}
