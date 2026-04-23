/**
 * SYNAPSE v99 — Boss Combat Loop
 *
 * Core tick loop, vulnerability windows, boss attacks, phase transitions,
 * boss hit registration, win/lose handling.
 */

import { G } from '../../state/gameState.js';
import { getLang } from '../../state/settings.js';
import { regTimer, clearTimer } from '../../registries/timerRegistry.js';
import {
  BOSS, bossState, syncLegacyBossState,
  exportBossRuntimeState, restoreBossRuntimeState, resetBossRuntimeState,
} from '../../state/bossShared.js';
import { clock } from '../../engine/scene.js';
import { spawnShock, gameNodes, gameLinks } from '../../layers/network/index.js';
import { showToast } from '../../ui/hud/index.js';
import { signalBossChanged } from '../../platform/stateSignals.js';
import { clearNowAction, msgStack, setNowAction } from '../../ui/actionFlow.js';
import {
  transitionBossFightUI, hideBossUI, setBossHudVisible,
  updateBossHUDUI, setBossVulnerabilityUI, flashBossAttackUI,
} from '../../ui/overlays.js';
import { finalizeRunVictory, recordBossWindowHit, recordBossWindowOpen } from '../../meta/screens.js';
import { onBossDefeated } from '../../meta/flow.js';
import { setBossProfile, selectBossProfile } from './_profiles.js';
import { triggerBossRogueNode } from './_specials.js';
import { initBossEncounter, advanceBossPhase } from '../bossMechanics.js'; // Phase 3: Phase Dots & Corruption
import { ghostState, _ghostDecideFake, tickGhostMatrix, tickVortexArchitect } from './_specials.js';

// FIX: Epoch IV gating — bossAssimilated was never set on boss defeat.
function _markBossAssimilated() {
  if (G.awakening) G.awakening.bossAssimilated = true;
}

function shock(c) { spawnShock(c); }
function refresh() { signalBossChanged(); }

export { exportBossRuntimeState, restoreBossRuntimeState, resetBossRuntimeState };

// ── Vulnerability window ──────────────────────────────────────────────────

function openVulnerability(t) {
  BOSS.vulnOpen = true;
  recordBossWindowOpen();
  BOSS.vulnStart = t;
  setBossVulnerabilityUI({ open: true, title: 'VULNERABILITY', frac: 1 });
  msgStack.onVulnBarChange();
  setNowAction('boss', '⚔ BOSS-VERWUNDBAR — PULSE!', 'now-boss');
  signalBossChanged();
}

function closeVulnerability(missed = false) {
  BOSS.vulnOpen = false;
  setBossVulnerabilityUI({ open: false, title: 'VULNERABILITY', frac: 0 });
  msgStack.onVulnBarChange();
  clearNowAction('boss');
  signalBossChanged();
  if (missed) onBossWindowMissed();
}

// ── Boss attack ───────────────────────────────────────────────────────────

function bossAttack(t) {
  const dmg = BOSS.phase >= 3 ? 14 : BOSS.phase === 2 ? 9 : 6;
  G.energy = Math.max(0, G.energy - dmg);
  BOSS.lastAttack = t;
  flashBossAttackUI();
  const lang = getLang();
  showToast(
    lang === 'de' ? 'BOSS-ANGRIFF' : 'BOSS ATTACK',
    lang === 'de' ? '−' + dmg + '⬡ Integritätsdruck' : '−' + dmg + '⬡ integrity pressure',
    1200
  );
  shock(bossState.activeBossProfile?.color || 0xff2200);

  // Entropy Field special mechanic — emissive decay
  if (bossState.activeBossProfile?.specialMechanic === 'emissive_decay') {
    const decayAmt = bossState.activeBossProfile.emissiveDecayPerAttack || 0.4;
    const minEI = bossState.activeBossProfile.minEmissiveIntensity || 0.2;
    for (const n of gameNodes) {
      if (n.mat) n.mat.emissiveIntensity = Math.max(minEI, (n.mat.emissiveIntensity || 1) - decayAmt);
    }
    showToast('▽ ENTROPIE-ANGRIFF', 'Netz verdunkelt · Generiere Energie um die Helligkeit zurückzugewinnen', 2500);
  }
  refresh();
}

// ── Phase management ──────────────────────────────────────────────────────

function updatePhase() {
  const ratio = BOSS.maxHP > 0 ? BOSS.hp / BOSS.maxHP : 0;
  const prev = BOSS.phase;
  if (ratio <= 0.33) {
    BOSS.phase = 3; bossState.bossP3SyncNerf = true; syncLegacyBossState();
  } else if (ratio <= 0.66) {
    BOSS.phase = 2; bossState.bossP3SyncNerf = false; syncLegacyBossState();
  } else {
    BOSS.phase = 1; bossState.bossP3SyncNerf = false; syncLegacyBossState();
  }
  if (BOSS.phase !== prev) {
    try { advanceBossPhase(); } catch(e) { if (import.meta.env.DEV) console.warn('[BossMechanics] advanceBossPhase failed:', e); } // Phase 3
    const lang = getLang();
    showToast(
      (lang === 'de' ? 'BOSS-PHASE ' : 'BOSS PHASE ') + BOSS.phase,
      BOSS.phase === 2
        ? (lang === 'de' ? 'Das Muster verdichtet sich' : 'The pattern is intensifying')
        : (lang === 'de' ? 'Finale Eskalation' : 'Final escalation'),
      2200
    );
    shock(bossState.activeBossProfile?.color || 0xff2200);
  }
}

// ── Win / Lose ────────────────────────────────────────────────────────────

function endBossFight(win) {
  closeVulnerability();
  bossState.bossActive = false;
  syncLegacyBossState();
  bossState.bossP3SyncNerf = false;
  syncLegacyBossState();
  G.paused = false;
  hideBossUI();
  msgStack.onBossEnd();

  if (win) {
    bossState.bossWinClass = bossState.activeBossProfile?.winClass || '';
    syncLegacyBossState();
    G.runWon = true;

    const spine = G.spineLength || 0;
    const clusters = G.l3CapturedClusters || 0;
    const telemetry = typeof metaState !== 'undefined' ? metaState.telemetry : null;
    const windowsHit = telemetry?.bossWindowsHit || 0;
    const windowsOpened = telemetry?.bossWindowsOpened || 0;
    const perfectBoss = windowsOpened >= 3 && windowsHit >= windowsOpened;
    const allClusters = clusters >= 8;

    if (spine >= 4 || perfectBoss || allClusters) {
      G.runTier = 3;
    } else if (spine >= 2 || G.backboneActive) {
      G.runTier = 2;
    } else {
      G.runTier = 1;
    }

    _markBossAssimilated();
    shock(0x00ff88);
    finalizeRunVictory();
    onBossDefeated();
  }
}

// ── Entropy energy recovery ───────────────────────────────────────────────

export function onEnergyGainDuringEntropy(amount) {
  if (!bossState.bossActive) return;
  if (bossState.activeBossProfile?.specialMechanic !== 'emissive_decay') return;
  const restore = amount * 0.02;
  for (const n of gameNodes) {
    if (n.mat) n.mat.emissiveIntensity = Math.min(4.0, (n.mat.emissiveIntensity || 0) + restore);
  }
}
window.onEnergyGainDuringEntropy = onEnergyGainDuringEntropy;

// ── Boss hit registration ─────────────────────────────────────────────────

export function bossHit() {
  if (!bossState.bossActive || !BOSS.vulnOpen) return false;

  // Ghost Matrix — random fake windows
  if (bossState.activeBossProfile?.id === 'ghost_matrix') {
    _ghostDecideFake();
    if (ghostState.fakeOpen) {
      const lang = getLang();
      const fakeDmg = 8;
      G.energy = Math.max(0, G.energy - fakeDmg);
      showToast(
        lang === 'de' ? '👻 GHOST-ECHO — FALSCHES MUSTER' : '👻 GHOST ECHO — WRONG PATTERN',
        lang === 'de' ? `−${fakeDmg}⬡ · Dieses Fenster war eine Falle` : `−${fakeDmg}⬡ · This window was a trap`,
        2000
      );
      document.getElementById('boss-hud')?.classList.remove('ghost-fake-hint');
      spawnShock(0x44ffcc);
      return false;
    }
  }

  recordBossWindowHit();
  BOSS.hp = Math.max(0, BOSS.hp - 1);
  BOSS.hitsTaken++;
  shock(bossState.activeBossProfile?.color || 0xff2200);
  updateBossHUD();
  if (BOSS.hp <= 0) endBossFight(true);
  return true;
}

export function onBossWindowMissed() {
  if (!bossState.bossActive) return;
  if (bossState.activeBossProfile?.id !== 'sigma_recursive') return;
  const extensions = bossState._sigmaExtensions || 0;
  if (extensions >= 2) return;
  bossState._sigmaExtensions = extensions + 1;
  BOSS.hp = Math.min(BOSS.maxHP + 2, BOSS.hp + 1);
  BOSS.maxHP = Math.max(BOSS.maxHP, BOSS.hp);
  const lang = getLang();
  showToast(
    lang === 'de' ? '∞ SIGMA-REKURSION' : '∞ SIGMA RECURSION',
    lang === 'de' ? 'Verfehltes Fenster verlängert die Schleife (+1 HP)' : 'Missed window extends the loop (+1 HP)',
    2200
  );
  spawnShock(0xcc44ff);
  updateBossHUD();
}

// ── HUD helper ────────────────────────────────────────────────────────────

export function updateBossHUD() {
  updateBossHUDUI({ hp: BOSS.hp, maxHP: BOSS.maxHP, phase: BOSS.phase, vulnOpen: BOSS.vulnOpen });
}

// ── Intro / Start ─────────────────────────────────────────────────────────

export function triggerBossIntro() {
  if (bossState.bossTriggered) return;
  bossState.bossTriggered = true;
  syncLegacyBossState();

  const profile = selectBossProfile();
  setBossProfile(profile);
  const lang = getLang();
  showToast(
    lang === 'de' ? '8 CLUSTER KONTROLLIERT' : '8 CLUSTERS CAPTURED',
    lang === 'de' ? 'Etwas erwacht im Netz…' : 'Something awakens in the network…',
    3800
  );
  shock(profile.color);

  clearTimer('bossIntroOpen');
  regTimer('bossIntroOpen', setTimeout(() => {
    G.paused = true;
    import('../../ui/overlays.js').then(({ showBossIntroUI }) => showBossIntroUI());
    msgStack.onBossIntroOpen();
    clearTimer('bossIntroOpen');
  }, 900), 'timeout');
}

export function startBossFight() {
  clearNowAction('event');
  clearNowAction('sync');
  msgStack.onBossFightStart();
  transitionBossFightUI();

  clearTimer('bossFightStart');
  regTimer('bossFightStart', setTimeout(() => {
    bossState.bossActive = true;
    syncLegacyBossState();
    G.paused = false;
    initBossFromDifficulty();
    if (bossState.activeBossProfile) setBossProfile(bossState.activeBossProfile);
    BOSS.hp = BOSS.maxHP;
    BOSS.phase = 1;
    BOSS.hitsTaken = 0;
    BOSS.vulnOpen = false;
    BOSS.lastAttack = clock.getElapsedTime() + 5;
    BOSS.lastVuln = clock.getElapsedTime() + 8;
    BOSS.bossStartTime = Date.now();
    // Phase 3: initialise phase dots UI and corruption tracker
    try {
      const _pid = bossState.activeBossProfile?.id || 'null_cortex';
      initBossEncounter(_pid, 3);
    } catch(e) { if (import.meta.env.DEV) console.warn('[BossMechanics] initBossEncounter failed:', e); }
    updateBossHUD();
    setBossHudVisible(true);
    const lang = getLang();
    showToast(
      (bossState.activeBossProfile?.name || 'THE NULL CORTEX') + (lang === 'de' ? ' ERWACHT' : ' AWAKENS'),
      lang === 'de' ? 'Treffe seine Verwundbarkeits-Fenster mit Pulse!' : 'Hit its vulnerability windows with Pulse!',
      3600
    );
    shock(bossState.activeBossProfile?.color || 0xff2200);
    clearTimer('bossFightStart');
  }, 700), 'timeout');
}

import { initBossFromDifficulty } from './_profiles.js';
let _rogueNodeTriggered = false;

export function tickBoss(t) {
  if (!bossState.bossTriggered && G.l3CapturedClusters >= 8 && !G.runWon) triggerBossIntro();
  if (!bossState.bossActive || G.runWon || G.paused) return;

  updatePhase();

  if (BOSS.vulnOpen) {
    const frac = 1 - ((t - BOSS.vulnStart) / (BOSS.vulnDuration || 1));
    setBossVulnerabilityUI({ open: true, title: 'VULNERABILITY', frac });
    if (t - BOSS.vulnStart >= BOSS.vulnDuration) { closeVulnerability(true); BOSS.lastVuln = t; }
  } else if (t - BOSS.lastVuln >= BOSS.vulnInterval) {
    openVulnerability(t);
  }

  const interval = BOSS.phase >= 3 ? Math.max(5, BOSS.attackInterval - 4) : BOSS.phase === 2 ? Math.max(7, BOSS.attackInterval - 2) : BOSS.attackInterval;
  if (!BOSS.vulnOpen && t - BOSS.lastAttack >= interval) bossAttack(t);

  const profile = bossState.activeBossProfile;
  if (profile?.id === 'ghost_matrix') tickGhostMatrix(t);
  else if (profile?.id === 'vortex_architect') tickVortexArchitect(t);

  if (BOSS.phase >= 2 && !_rogueActive && !_rogueNodeTriggered) {
    _rogueNodeTriggered = true;
    regTimer('bossRogueDelay', setTimeout(() => { triggerBossRogueNode(); clearTimer('bossRogueDelay'); }, 2500), 'timeout');
  }

  updateBossHUD();
}
let _rogueActive = false;
