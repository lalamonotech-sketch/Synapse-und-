/**
 * SYNAPSE v99 — Phase 4: Sentience
 *
 * The network becomes self-aware. When enough Macro-Clusters are captured
 * and interconnected, emergent structures crystallise:
 *
 *   Macro-Nodes (Synergy Nodes)
 *     — Appear at cluster positions when ≥5 clusters are held simultaneously.
 *     — Each Macro-Node provides a passive income multiplier (+5 % per node,
 *       stacking up to 4 nodes = +20 %).
 *     — Destroyed on cluster loss; reappears when recaptured.
 *
 *   Network Synergies  (pattern-driven bonuses)
 *     — TRIAD       : Any 3 connected cores  → +15 % income 30 s
 *     — SPINE_LOCK  : Spine ≥ 5 cores        → heartbeat interval −20 % 20 s
 *     — RING        : Full ring of 8 cores   → all upkeep cost −50 % 25 s
 *     — GESTALT     : All 8 clusters held    → Gestalt Mind activates (permanent
 *                     until cluster lost), unlocking Epoch IV Sentience visuals
 *
 *   Sentience HUD badge updates via refreshSentienceUI() in phase4UI.js.
 *
 * Public API:
 *   initSentience()          — call on run start (after l3 init)
 *   tickSentience(t, dt)     — call from gameLoop every frame
 *   resetSentience()         — call on run end / restart
 *   getSentienceState()      — read-only snapshot for HUD
 *   onClusterCaptured(idx)   — called when a cluster capture event fires
 *   onClusterLost(idx)       — called when a cluster sync expires / boss steals
 */

import { G }          from '../state/gameState.js';
import { TUNING }     from '../state/tuning.js';
import { getLang }    from '../state/settings.js';
import { showToast }  from '../ui/hud/index.js';
import { spawnShock } from '../layers/network/index.js';
import { regTimer, clearTimer } from '../registries/timerRegistry.js';

// ── State ──────────────────────────────────────────────────────────────────

const _s = {
  active:            false,
  macroNodeCount:    0,      // current active synergy nodes (0-4)
  incomeBonus:       0,      // fraction, e.g. 0.20 = +20 %
  gestaltMind:       false,  // true when all 8 clusters held
  gestaltStartTime:  0,
  activeSynergies:   {},     // { id: { active, expiresAt } }
  capturedSet:       new Set(), // cluster indices currently held
  _lastCapturedCount: -1,
};

// Synergy timers (seconds duration)
const SYNERGY_DEFS = {
  triad:       { duration: 30,  label: { de: '✦ TRIAD', en: '✦ TRIAD' },
                 sub: { de: '+15% Einkommen · 3 Kerne verbunden', en: '+15% income · 3 cores linked' },
                 color: 0xffdd55, incomeMult: 0.15 },
  spine_lock:  { duration: 20,  label: { de: '⬟ SPINE LOCK', en: '⬟ SPINE LOCK' },
                 sub: { de: 'Heartbeat −20% · Spine≥5 aktiv', en: 'Heartbeat −20% · Spine≥5 active' },
                 color: 0x44ffcc, hbMult: 0.80 },
  ring:        { duration: 25,  label: { de: '⬡ FULL RING', en: '⬡ FULL RING' },
                 sub: { de: 'Upkeep −50% · Ring aller 8 Kerne', en: 'Upkeep −50% · Full 8-core ring' },
                 color: 0xff88ff, upkeepMult: 0.50 },
};

// ── Public API ─────────────────────────────────────────────────────────────

export function initSentience() {
  _s.active            = false;
  _s.macroNodeCount    = 0;
  _s.incomeBonus       = 0;
  _s.gestaltMind       = false;
  _s.gestaltStartTime  = 0;
  _s.activeSynergies   = {};
  _s.capturedSet       = new Set();
  _s._lastCapturedCount = -1;
}

export function resetSentience() {
  initSentience();
  _unapplyAllSynergies();
  _clearGestaltMind();
}

export function tickSentience(t) {
  if (!G.l3On) return;

  // Expire timed synergies
  for (const [id, syn] of Object.entries(_s.activeSynergies)) {
    if (syn.active && t >= syn.expiresAt) {
      syn.active = false;
      _unapplySynergy(id);
    }
  }

  // Re-derive captured count from G.l3Clusters every tick
  // (authoritative source of truth)
  const capturedCount = (G.l3Clusters || []).filter(c => c.captured).length;
  if (capturedCount !== _s._lastCapturedCount) {
    _s._lastCapturedCount = capturedCount;
    _onCapturedCountChanged(capturedCount, t);
  }
}

/** Called by captureOpenClusters / boss mechanics when a cluster is taken. */
export function onClusterCaptured(idx, t) {
  _s.capturedSet.add(idx);
  _checkSynergies(t);
  _refreshMacroNodes();
}

/** Called when a cluster sync expires or is stolen. */
export function onClusterLost(idx, t) {
  _s.capturedSet.delete(idx);
  if (_s.gestaltMind) _clearGestaltMind();
  _refreshMacroNodes();
}

/** Read-only state for HUD / phase4UI. */
export function getSentienceState() {
  return {
    active:         _s.active,
    macroNodeCount: _s.macroNodeCount,
    incomeBonus:    _s.incomeBonus,
    gestaltMind:    _s.gestaltMind,
    activeSynergies: Object.entries(_s.activeSynergies)
      .filter(([, v]) => v.active)
      .map(([id]) => id),
  };
}

/**
 * Called by heartbeat.js to get the sentience income multiplier.
 * Returns a value like 1.20 (+20 % from macro-nodes + synergyBonuses).
 */
export function getSentienceIncomeMult() {
  let mult = 1.0 + _s.incomeBonus;
  for (const [id, syn] of Object.entries(_s.activeSynergies)) {
    if (!syn.active) continue;
    const def = SYNERGY_DEFS[id];
    if (def?.incomeMult) mult += def.incomeMult;
  }
  if (_s.gestaltMind) mult += 0.35; // Gestalt bonus
  return mult;
}

/**
 * Returns heartbeat interval multiplier from SPINE_LOCK synergy (< 1 = faster).
 * Applied in gameLoop.js (or tuning tweak) when the synergy is active.
 */
export function getSentienceHeartbeatMult() {
  const syn = _s.activeSynergies.spine_lock;
  if (syn?.active) return SYNERGY_DEFS.spine_lock.hbMult;
  return 1.0;
}

/**
 * Returns upkeep cost multiplier from RING synergy.
 * Applied in heartbeat._chargeUpkeep().
 */
export function getSentienceUpkeepMult() {
  const syn = _s.activeSynergies.ring;
  if (syn?.active) return SYNERGY_DEFS.ring.upkeepMult;
  return 1.0;
}

// ── Internal ───────────────────────────────────────────────────────────────

function _onCapturedCountChanged(count, t) {
  const wasActive = _s.active;
  _s.active = count >= 5;
  // P0 Fix 2.1/2.5 — sentience-unlocked class (once set, never removed in a run)
  if (_s.active && !wasActive) {
    document.body.classList.add('sentience-unlocked');
    // Also flag on G for applyUnlockBodyClasses() on save-restore
    try { G.sentienceEverActive = true; } catch (_) {}
  }
  _checkSynergies(t ?? 0);
  _refreshMacroNodes();

  // Gestalt Mind: all 8
  if (count >= 8 && !_s.gestaltMind) {
    _triggerGestaltMind(t);
  } else if (count < 8 && _s.gestaltMind) {
    _clearGestaltMind();
  }

  // Notify UI
  _notifyPhase4UI();
}

function _refreshMacroNodes() {
  // Macro-Nodes: 1 per cluster beyond the 4th, max 4
  const count = Math.min(4, Math.max(0, _s._lastCapturedCount - 4));
  const prev = _s.macroNodeCount;
  _s.macroNodeCount = count;
  _s.incomeBonus    = count * 0.05; // 5 % per node

  if (count !== prev) {
    const lang = getLang();
    if (count > prev) {
      showToast(
        lang === 'de' ? `◈ MAKRO-NODE +${count}` : `◈ MACRO-NODE +${count}`,
        lang === 'de'
          ? `Synergy-Knoten aktiv · +${Math.round(_s.incomeBonus * 100)}% Einkommen`
          : `Synergy nodes active · +${Math.round(_s.incomeBonus * 100)}% income`,
        2200
      );
      spawnShock(0xff88ff);
    }
    _notifyPhase4UI();
  }
}

function _checkSynergies(t) {
  const count = _s._lastCapturedCount;

  // TRIAD — any 3 captured + connected (G.l3ConnectedCores ≥ 3)
  const connectedCores = G.l3ConnectedCores || 0;
  if (count >= 3 && connectedCores >= 3) {
    _activateSynergy('triad', t);
  }

  // SPINE_LOCK — spine length ≥ 5
  if ((G.spineLength || 0) >= 5) {
    _activateSynergy('spine_lock', t);
  }

  // RING — all 8 captured + backbone active
  if (count >= 8 && G.backboneActive) {
    _activateSynergy('ring', t);
  }
}

function _activateSynergy(id, t) {
  const def = SYNERGY_DEFS[id];
  if (!def) return;
  const existing = _s.activeSynergies[id];
  // Refresh expiry if already active; don't re-toast
  if (existing?.active) {
    existing.expiresAt = t + def.duration;
    return;
  }

  const lang = getLang();
  _s.activeSynergies[id] = { active: true, expiresAt: t + def.duration };

  showToast(
    def.label[lang] || def.label.en,
    def.sub[lang] || def.sub.en,
    3200
  );
  spawnShock(def.color);
  spawnShock(def.color);

  _notifyPhase4UI();
}

function _unapplySynergy(id) {
  const def = SYNERGY_DEFS[id];
  if (!def) return;
  const lang = getLang();
  showToast(
    (def.label[lang] || def.label.en) + ' ENDED',
    lang === 'de' ? 'Synergie-Fenster abgelaufen' : 'Synergy window expired',
    1600
  );
  _notifyPhase4UI();
}

function _unapplyAllSynergies() {
  for (const id of Object.keys(_s.activeSynergies)) {
    if (_s.activeSynergies[id]?.active) _unapplySynergy(id);
  }
  _s.activeSynergies = {};
}

function _triggerGestaltMind(t) {
  _s.gestaltMind      = true;
  _s.gestaltStartTime = t;

  const lang = getLang();
  showToast(
    lang === 'de' ? '✦✦ GESTALT MIND AKTIV ✦✦' : '✦✦ GESTALT MIND ACTIVE ✦✦',
    lang === 'de'
      ? 'Alle 8 Cluster gehalten · Das Netz ist vollständig bewusst · +35% Einkommen permanent'
      : 'All 8 clusters held · The network is fully aware · +35% income permanent',
    6000
  );
  spawnShock(0xffffff);
  spawnShock(0xff88ff);
  spawnShock(0xaa44ff);

  document.body.classList.add('gestalt-mind-active');
  document.body.classList.add('sentience-unlocked'); // P0 Fix 2.5 + 2.1
  document.documentElement.style.setProperty('--gestalt-opacity', '1');

  // Dispatch custom event so other systems can react
  document.body.dispatchEvent(new CustomEvent('syn:gestalt-mind', { detail: { t } }));

  _notifyPhase4UI();
}

function _clearGestaltMind() {
  if (!_s.gestaltMind) return;
  _s.gestaltMind = false;
  document.body.classList.remove('gestalt-mind-active');
  document.documentElement.style.setProperty('--gestalt-opacity', '0');

  const lang = getLang();
  showToast(
    lang === 'de' ? '✦ GESTALT MIND GELÖSCHT' : '✦ GESTALT MIND LOST',
    lang === 'de' ? 'Cluster verloren — Bewusstsein fragmentiert' : 'Cluster lost — consciousness fragmented',
    3500
  );
  spawnShock(0x444444);

  _notifyPhase4UI();
}

function _checkL4Objectives() {
  const objs = G.l4Objectives;
  if (!Array.isArray(objs)) return;

  const mark = (id) => {
    const obj = objs.find(o => o.id === id);
    if (obj && !obj.done) {
      obj.done = true;
      window.checkMetaObjectives?.();
    }
  };

  if (_s.macroNodeCount >= 1)       mark('macroNode1');
  if (_s.activeSynergies.triad)     mark('synergy_triad');
  if (_s.activeSynergies.spine_lock) mark('synergy_spine');
  if (_s.activeSynergies.ring)      mark('synergy_ring');
  if (_s.gestaltMind)               mark('gestalt');
}

// ── Embedded Sentience UI (P0 Fix 2.5 — mirrors phase2/3 embedding pattern) ─────

// Internal DOM refs (lazy-initialised by _ensureSentienceBadge)
let _ui = {
  badge: null, mnCount: null, incomeEl: null,
  synergyStrip: null, pips: {},
};

const _SYNERGY_IDS = ['triad', 'spine_lock', 'ring'];
const _PIP_LABELS  = {
  triad:      { de: 'TRIAD',      en: 'TRIAD'      },
  spine_lock: { de: 'SPINE LOCK', en: 'SPINE LOCK' },
  ring:       { de: 'RING',       en: 'FULL RING'   },
};

/** Idempotent badge mount. Falls back: pulse-mode-wrap sibling → hud-right → topbar. */
function _ensureSentienceBadge() {
  if (_ui.badge) return;
  if (document.getElementById('sentience-badge')) {
    _ui.badge       = document.getElementById('sentience-badge');
    _ui.mnCount     = document.getElementById('macronode-count');
    _ui.incomeEl    = document.getElementById('sentience-income');
    _ui.synergyStrip = document.getElementById('synergy-strip');
    for (const id of _SYNERGY_IDS) _ui.pips[id] = document.getElementById(`pip-${id}`);
    return;
  }

  // Find best mount point (P1 Fix 3.2 — defensive fallbacks)
  let mountParent = document.getElementById('hud-right');
  if (!mountParent) mountParent = document.getElementById('topbar');
  if (!mountParent) {
    console.warn('[Sentience] Cannot mount badge — #hud-right and #topbar not found');
    return;
  }

  const badge = document.createElement('div');
  badge.id = 'sentience-badge';
  badge.setAttribute('aria-live', 'polite');
  badge.setAttribute('aria-label', 'Sentience status');

  const iconSpan  = document.createElement('span'); iconSpan.className  = 'badge-icon';  iconSpan.textContent  = '◈';
  const labelSpan = document.createElement('span'); labelSpan.className = 'badge-label'; labelSpan.textContent = 'SENTIENCE';
  const mn        = document.createElement('span'); mn.id = 'macronode-count';
  const income    = document.createElement('span'); income.id = 'sentience-income';
  badge.append(iconSpan, labelSpan, mn, income);

  const strip = document.createElement('div'); strip.id = 'synergy-strip';
  for (const id of _SYNERGY_IDS) {
    const pip = document.createElement('div');
    pip.id = `pip-${id}`; pip.className = `synergy-pip pip-${id}`;
    pip.title = _PIP_LABELS[id].en;
    strip.appendChild(pip);
    _ui.pips[id] = pip;
  }
  badge.appendChild(strip);

  // Insert after pulse-mode-wrap if present
  const pulseModeWrap = document.getElementById('pulse-mode-wrap');
  if (pulseModeWrap && pulseModeWrap.nextSibling) {
    mountParent.insertBefore(badge, pulseModeWrap.nextSibling);
  } else {
    mountParent.appendChild(badge);
  }

  _ui.badge = badge; _ui.mnCount = mn; _ui.incomeEl = income; _ui.synergyStrip = strip;
}

function _renderSentienceBadge() {
  if (!_ui.badge) return;
  const st   = getSentienceState();
  const lang = getLang();

  _ui.badge.classList.toggle('badge-active', st.active || st.gestaltMind);

  if (_ui.mnCount) {
    _ui.mnCount.textContent = `×${st.macroNodeCount}`;
    _ui.mnCount.classList.toggle('mn-visible', st.macroNodeCount > 0);
  }

  if (_ui.incomeEl) {
    const synIncome = st.activeSynergies.reduce((acc, id) => acc + ({ triad: 0.15, ring: 0 }[id] || 0), 0);
    const total = Math.round((st.incomeBonus + (st.gestaltMind ? 0.35 : 0) + synIncome) * 100);
    _ui.incomeEl.textContent = total > 0 ? `+${total}%` : st.gestaltMind ? '+35%' : '';
  }

  for (const id of _SYNERGY_IDS) {
    const pip = _ui.pips[id];
    if (!pip) continue;
    const active = st.activeSynergies.includes(id);
    pip.classList.toggle('pip-active', active);
    pip.title = `${_PIP_LABELS[id][lang] || _PIP_LABELS[id].en}${active ? ' \u2713' : ''}`;
  }

  if (_ui.synergyStrip) {
    _ui.synergyStrip.classList.toggle('strip-visible', st.activeSynergies.length > 0);
  }

  const icon = _ui.badge.querySelector('.badge-icon');
  if (icon) icon.textContent = st.gestaltMind ? '\u2726\u2726' : st.active ? `◈${st.macroNodeCount > 0 ? st.macroNodeCount : ''}` : '◈';

  const lbl = _ui.badge.querySelector('.badge-label');
  if (lbl) lbl.textContent = st.gestaltMind ? 'GESTALT MIND' : lang === 'de' ? 'SENTIENCE' : 'SENTIENCE';
}

/** Called whenever sentience state changes or language changes. */
export function refreshSentienceUI() {
  _ensureSentienceBadge();
  _renderSentienceBadge();
}

/** Called once on DOMContentLoaded (via initPhase4UI shim or boot). */
export function initSentienceUI() {
  _ensureSentienceBadge();
  _renderSentienceBadge();
}

function _notifyPhase4UI() {
  _checkL4Objectives();
  refreshSentienceUI();
}

// ── Phase 4 Elite event bridges ────────────────────────────────────────────

(function _bindSentienceEliteListeners() {
  // syn:synergy-extend — extend all active synergies by N seconds (Gestalt Fragment elite)
  document.body.addEventListener('syn:synergy-extend', function(e) {
    const extra = e.detail?.seconds || 10;
    for (const syn of Object.values(_s.activeSynergies)) {
      if (syn.active) syn.expiresAt += extra;
    }
    const lang = getLang();
    showToast(
      lang === 'de' ? '⟳ SYNERGIEN VERLÄNGERT' : '⟳ SYNERGIES EXTENDED',
      lang === 'de' ? `Alle Synergien +${extra}s` : `All synergies +${extra}s`,
      1800
    );
    _notifyPhase4UI();
  });

  // syn:resonance-pulse — temporarily boost heartbeat speed via TUNING tweak (Resonance Anchor elite)
  document.body.addEventListener('syn:resonance-pulse', function(e) {
    const dur = e.detail?.duration || 15;
    const origInterval = TUNING.heartbeatInterval;
    TUNING.heartbeatInterval = origInterval * 0.75;
    setTimeout(() => {
      TUNING.heartbeatInterval = origInterval;
    }, dur * 1000);
  });

  // syn:sentience-boost — fired by Hive Nexus success
  document.body.addEventListener('syn:sentience-boost', function(e) {
    // Treat as a temporary macro-node bonus (+1 count for 20 s)
    _s.macroNodeCount = Math.min(4, _s.macroNodeCount + 1);
    _s.incomeBonus = _s.macroNodeCount * 0.05;
    _notifyPhase4UI();
    setTimeout(() => {
      _s.macroNodeCount = Math.max(0, _s.macroNodeCount - 1);
      _s.incomeBonus = _s.macroNodeCount * 0.05;
      _notifyPhase4UI();
    }, 20000);
  });
})();
