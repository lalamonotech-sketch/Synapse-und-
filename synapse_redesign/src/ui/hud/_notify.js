/**
 * SYNAPSE — HUD notification primitives  (v99-r2 patched)
 *
 * Patches:
 *   2-E  setLayerTag → shimmer-v2 statt shimmer
 *   2-J  setPhaseName → epoch-flash bei Textänderung
 *   2-I  showConditionChip → Animation-Reset vor .vis (Chip-Slide)
 */

import { getLang } from '../../state/settings.js';
import { regTimer, clearTimer } from '../../registries/timerRegistry.js';
import { el } from './_domCache.js';

export function showToast(title, sub = '', dur = 2000) {
  const titleEl = el('t-title');
  const subEl   = el('t-sub');
  const toastEl = el('toast');
  if (!titleEl || !subEl || !toastEl) return;
  titleEl.innerText = title || '';
  subEl.innerText   = sub   || '';
  toastEl.classList.add('show');
  clearTimer('hudToast');
  regTimer('hudToast', setTimeout(() => {
    toastEl.classList.remove('show');
    clearTimer('hudToast');
  }, dur), 'timeout');
}

// 2-I — Animation-Reset vor .vis damit slide-down bei Re-Trigger wiederholt wird
export function showConditionChip(cond, lang = getLang()) {
  const chip = el('cond-chip');
  if (!chip) return;
  if (!cond) {
    chip.className   = '';
    chip.textContent = '';
    return;
  }
  const isStorm = cond.id === 'recursive_storm';
  // Reset: Klasse kurz entfernen → offsetWidth → neu setzen (Animation-Restart)
  chip.className = '';
  void chip.offsetWidth;
  chip.className = 'vis ' + (isStorm ? 'cc-storm' : 'cc-signal');
  const label = lang === 'de'
    ? (cond.nameDe || cond.name || cond.id)
    : (cond.nameEn || cond.name || cond.id);
  chip.textContent = '⟁ ' + label;
}

export function hideConditionChip() {
  const chip = el('cond-chip');
  if (!chip) return;
  chip.className   = '';
  chip.textContent = '';
}

export function showTip(cx, cy, txt) {
  const tip = el('node-tip');
  if (!tip) return;
  tip.innerText        = txt || '';
  tip.style.left       = (cx + 14) + 'px';
  tip.style.top        = (cy - 28) + 'px';
  tip.style.visibility = 'visible';
  tip.style.opacity    = '1';
}

export function hideTip() {
  const tip = el('node-tip');
  if (!tip) return;
  tip.style.opacity    = '0';
  tip.style.visibility = 'hidden';
}

// 2-E — shimmer-v2: intensiverer Glow-Burst beim Layer-Wechsel
export function setLayerTag(text) {
  const node = el('layer-tag');
  if (!node) return;
  node.innerText = text || '';
  // Beide Klassen entfernen + reflow → sauber neu starten
  node.classList.remove('shimmer', 'shimmer-v2');
  void node.offsetWidth;
  node.classList.add('shimmer-v2');
  clearTimer('hudLayerTagShimmer');
  regTimer('hudLayerTagShimmer', setTimeout(() => {
    node.classList.remove('shimmer-v2');
    clearTimer('hudLayerTagShimmer');
  }, 800), 'timeout');
}

// 2-J — epoch-flash: kurzer color-burst bei Textänderung
export function setPhaseName(text) {
  const node = el('phase-name');
  if (!node) return;
  const prev = node.innerText;
  node.innerText = text || '';
  // Nur flashen wenn sich der Text tatsächlich geändert hat
  if (prev !== node.innerText) {
    node.classList.remove('epoch-flash');
    void node.offsetWidth;
    node.classList.add('epoch-flash');
    clearTimer('hudPhaseFlash');
    regTimer('hudPhaseFlash', setTimeout(() => {
      node.classList.remove('epoch-flash');
      clearTimer('hudPhaseFlash');
    }, 850), 'timeout');
  }
}
