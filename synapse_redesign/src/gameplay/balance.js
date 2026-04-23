import { G } from '../state/gameState.js';
import { getComboDiscountMult } from '../systems/comboMilestones.js'; // Phase 1
import { getPulseModeMult }     from '../systems/pulseMode.js';       // Phase 2
import { getSectorMod }         from '../systems/sectorVariables.js'; // Phase 2
import { eventMods } from '../state/gameplayFlags.js';
import { aiState } from '../state/aiShared.js';

export function getEarlyPulseDiscount() {
  if (G.l2On || G.l3On) return 0;
  if ((G.pulseCount || 0) >= 3) return 0;
  return 4;
}

export function getEffectivePulseCost() {
  if ((eventMods.freePulses || 0) > 0) return 0;
  // FIX 8.1: Scale pulse cost with cluster count (12⬡ at 0-2 clusters, 18⬡ at 3-6, 22⬡ at 7-8)
  // This makes early L3 more accessible and late L3 appropriately costly.
  let scaledCost = G.pulseCost;
  if (G.l3On) {
    const cap = G.l3CapturedClusters || 0;
    if (cap <= 2) scaledCost = Math.min(scaledCost, 12);
    else if (cap <= 6) scaledCost = 18;
    else scaledCost = 22;
  }
  // Phase 1: Combo-Milestone Energie-Rabatt (x1.5 Combo = −30% für 8s)
  const comboDiscount = getComboDiscountMult();
  if (comboDiscount < 1.0) {
    scaledCost = Math.max(0, Math.round(scaledCost * comboDiscount));
  }
  // Phase 2: Pulse-Mode Kosten-Multiplikator
  const modeDef = getPulseModeMult();
  if (modeDef.costMult !== 1.0) {
    scaledCost = Math.max(0, Math.round(scaledCost * modeDef.costMult));
  }
  // Phase 2: Sektor pulseCdMult wirkt NICHT auf Kosten — aber Sektor energyMult
  // beeinflusst die wahrgenommene Erschwinglichkeit (bleibt in economy.js).
  return Math.max(2, scaledCost - getEarlyPulseDiscount());
}

export function getEarlyPulseCooldownBonus() {
  if (G.l2On || G.l3On) return 0;
  if ((G.pulseCount || 0) >= 3) return 0;
  return 1200;
}

export function getEffectivePulseCooldownBase() {
  const base = Math.max(1200, G.pulseCd - getEarlyPulseCooldownBonus());
  // Phase 2: Sektor pulseCdMult + Pulse-Mode cdMult
  const sectorMult = getSectorMod('pulseCdMult');
  const modeDef    = getPulseModeMult();
  return Math.max(800, Math.round(base * sectorMult * modeDef.cdMult));
}

export function getEarlyTrainDiscount() {
  if (G.l2On || G.l3On) return 0;
  if ((aiState.trainingRuns || 0) > 0) return 0;
  return Math.max(0, G.trainCost - 6);
}

export function getEffectiveTrainCost() {
  return Math.max(2, G.trainCost - getEarlyTrainDiscount());
}

export function getEarlyGameSupportSummary(lang = 'de') {
  const parts = [];
  const pulseDiscount = getEarlyPulseDiscount();
  const pulseCdBonus = getEarlyPulseCooldownBonus();
  const trainDiscount = getEarlyTrainDiscount();
  if (pulseDiscount > 0) parts.push(lang === 'de' ? `erste Pulse −${pulseDiscount}⬡` : `first pulses −${pulseDiscount}⬡`);
  if (pulseCdBonus > 0) parts.push(lang === 'de' ? `Pulse schneller` : `faster pulse cooldown`);
  if (trainDiscount > 0) parts.push(lang === 'de' ? `erstes Training −${trainDiscount}⬡` : `first training −${trainDiscount}⬡`);
  return parts.join(' · ');
}
