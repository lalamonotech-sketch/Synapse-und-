/**
 * SYNAPSE v99 — Master UI Controller  (v99-r5)
 *
 * Dieses Modul ist ein Orchestrationslayer — es NICHT:
 *   ✗ repliziert den Idle-Fade  (→ dockCollapse.js besitzt das)
 *   ✗ repliziert den Dock-Toggle (→ dockCollapse.js)
 *   ✗ repliziert Epoch-Klassen  (→ progression.js / awakening.js)
 *
 * Es FÜGT HINZU:
 *   ✓ Öffentliche setBarProgress() API (Wrapper um das interne setNodeScaleX)
 *   ✓ Fixes: Heat-Bar style.width → scaleX (einzige verbleibende CPU-Breite)
 *   ✓ Scroll-Indikator für Type-Zone (Patch 8-A — der fehlende JS-Teil)
 *   ✓ Toast Exit-Animation Trigger (Patch 9-C — CSS hat .toast-exit, JS fehlte)
 *   ✓ Hint Fade+Slide Trigger (Patch 10-F — CSS hat .hint-update, JS fehlte)
 *   ✓ Öffentliche setEpoch() API + Glitch für externe Aufrufer
 *   ✓ isMobile-Flag + resize-Tracking für andere Module
 *
 * Import:
 *   import { ui } from './ui/uiController.js';
 *
 * Dann:
 *   ui.setBarProgress('prog-bar', 72);          // 0–100
 *   ui.setEpoch(3);                             // 1–4
 *   ui.triggerToastExit('toast');               // schließt Toast mit Animation
 */

import { el } from '../util/dom.js';

/* ══════════════════════════════════════════════════════════════════
   Interne Hilfsfunktion — identisch mit setNodeScaleX in _domCache.js,
   aber ohne den import-Zirkel für externe Nutzung
   ══════════════════════════════════════════════════════════════════ */
function _scaleX(node, ratio) {
  if (!node) return;
  const v = Math.max(0, Math.min(1, ratio));
  const next = `scaleX(${v})`;
  if (node._scaleX === next) return;    // dirty-check: kein unnötiger Reflow
  node._scaleX = next;
  node.style.transform = next;
}

/* ══════════════════════════════════════════════════════════════════
   EPOCH-MAP  (spiegelt awakening/state.js)
   ══════════════════════════════════════════════════════════════════ */
const EPOCH_CLASSES = ['epoch-mechanical', 'epoch-reactive', 'epoch-temporal', 'epoch-sentience'];

/* ══════════════════════════════════════════════════════════════════
   TOAST  — Exit-Dauer in ms (muss mit CSS .30s aus 9-C übereinstimmen)
   ══════════════════════════════════════════════════════════════════ */
const TOAST_EXIT_MS = 320;

/* ══════════════════════════════════════════════════════════════════
   HINT  — Animation-Dauer in ms (muss mit .32s aus 10-F übereinstimmen)
   ══════════════════════════════════════════════════════════════════ */
const HINT_UPDATE_MS = 380;


class UIController {

  constructor() {
    /** Ob der aktuelle Viewport als Mobile gilt (≤ 768 px) */
    this.isMobile = window.innerWidth <= 768;

    /** Ob Querformat auf einem kleinen Gerät aktiv ist */
    this.isLandscapeMobile = window.innerWidth <= 1024 &&
                             window.innerHeight <= 500 &&
                             window.innerWidth > window.innerHeight;

    this._hintTimer = null;

    this._init();
  }

  _init() {
    this._trackDevice();
    this._initScrollIndicator();
    this._interceptToastHide();
    this._interceptHintUpdate();
    this._fixHeatBar();
  }

  /* ──────────────────────────────────────────────────────────────
     1. ÖFFENTLICHE API: Progress Bars (GPU-beschleunigt via scaleX)
     ────────────────────────────────────────────────────────────── */

  /**
   * Setzt den Füllstand eines Balkens via transform: scaleX() (GPU, kein Layout-Reflow).
   * Das Fill-Element muss transform-origin: left gesetzt haben (in gpu-animations.css).
   *
   * @param {string} elementId - ID des Fill-Elements (nicht des Wrappers)
   * @param {number} percentage - 0 bis 100
   */
  setBarProgress(elementId, percentage) {
    _scaleX(el(elementId), percentage / 100);
  }

  /* ──────────────────────────────────────────────────────────────
     2. ÖFFENTLICHE API: Epoch setzen + Glitch auslösen
     ────────────────────────────────────────────────────────────── */

  /**
   * Wechselt die Spiel-Epoche und triggert den UI-Glitch-Effekt.
   * progression.js setzt die Klassen für den laufenden Spielzustand —
   * diese Methode ist für externe/explizite Aufrufer gedacht.
   *
   * @param {number} epochLevel - 1 (Mechanical) · 2 (Reactive) · 3 (Temporal) · 4 (Sentience)
   */
  setEpoch(epochLevel) {
    const body = document.body;

    // Alle Epoch-Klassen entfernen, dann neue setzen
    EPOCH_CLASSES.forEach(c => body.classList.remove(c));
    const newClass = EPOCH_CLASSES[epochLevel - 1];
    if (newClass) body.classList.add(newClass);

    // Glitch-Effekt auf HUD + Dock (CSS: v96-ui-glitch, 380ms)
    [el('hud'), el('ctrl-dock')].forEach(node => {
      if (!node) return;
      node.classList.add('v96-ui-glitch');
      setTimeout(() => node.classList.remove('v96-ui-glitch'), 400);
    });
  }

  /* ──────────────────────────────────────────────────────────────
     3. ÖFFENTLICHE API: Toast mit Exit-Animation schließen
     ────────────────────────────────────────────────────────────── */

  /**
   * Schließt den Toast via .toast-exit Animation (CSS Patch 9-C).
   * Das CSS animiert fade+slide-up, dann wird .show entfernt.
   *
   * @param {string} [toastId='toast']
   */
  triggerToastExit(toastId = 'toast') {
    const toast = el(toastId);
    if (!toast || !toast.classList.contains('show')) return;

    toast.classList.add('toast-exit');
    setTimeout(() => {
      toast.classList.remove('show', 'toast-exit');
    }, TOAST_EXIT_MS);
  }

  /* ──────────────────────────────────────────────────────────────
     4. INTERN: Hint-Text-Update mit Animation (CSS Patch 10-F)
     ────────────────────────────────────────────────────────────── */

  /**
   * Zeigt neuen Hint-Text mit der Fade+Slide Animation.
   * Ersatz für direktes #hint.textContent setzen.
   *
   * @param {string} text
   */
  setHint(text) {
    const hint = el('hint');
    if (!hint) return;

    // Kein Flash wenn Text sich nicht ändert
    if (hint._lastHintText === text) return;
    hint._lastHintText = text;

    // Vorherige Animation abbrechen
    if (this._hintTimer) clearTimeout(this._hintTimer);
    hint.classList.remove('hint-update');

    // Text setzen, dann Animation starten (next frame)
    hint.textContent = text;

    requestAnimationFrame(() => {
      hint.classList.add('hint-update');
      this._hintTimer = setTimeout(() => {
        hint.classList.remove('hint-update');
      }, HINT_UPDATE_MS);
    });
  }

  /* ──────────────────────────────────────────────────────────────
     5. INTERN: Type-Zone Scroll-Indikator (Patch 8-A)
        CSS hat .scrollable → ::after Fade-out; JS setzt/entfernt die Klasse
     ────────────────────────────────────────────────────────────── */

  _initScrollIndicator() {
    const zone = el('dock-type-zone');
    if (!zone) return;

    const update = () => {
      const hasMore = zone.scrollWidth > zone.clientWidth + 2; // 2px Toleranz
      zone.classList.toggle('scrollable', hasMore);
    };

    // Beim Scrollen in der Zone: Indikator ausblenden wenn am Ende
    zone.addEventListener('scroll', () => {
      const atEnd = zone.scrollLeft + zone.clientWidth >= zone.scrollWidth - 4;
      zone.classList.toggle('scrollable', !atEnd);
    }, { passive: true });

    // Initial + bei Resize prüfen
    update();
    window.addEventListener('resize', update, { passive: true });

    // MutationObserver: wenn neue tbtn-Elemente eingefügt werden
    const obs = new MutationObserver(update);
    obs.observe(zone, { childList: true, subtree: true });
    this._scrollObs = obs;
  }

  /* ──────────────────────────────────────────────────────────────
     6. INTERN: Toast schließen — existierende showToast-Aufrufe
        patchen ohne den bestehenden Code zu verändern
     ────────────────────────────────────────────────────────────── */

  _interceptToastHide() {
    // hud/_notify.js ruft #toast.classList.remove('show') nach einem Timeout auf.
    // Wir patchen den nativen classList.remove auf dem Toast-Element, um
    // sicherzustellen dass unsere Exit-Animation zuerst läuft.
    //
    // Das ist ein minimalinvasiver Monkey-Patch — nur auf diesem einen Element.
    const setupPatch = () => {
      const toast = el('toast');
      if (!toast) return;

      const origRemove = toast.classList.remove.bind(toast.classList);
      toast.classList.remove = (...classes) => {
        // Wenn 'show' entfernt werden soll und Toast gerade sichtbar ist
        if (classes.includes('show') && toast.classList.contains('show') &&
            !toast.classList.contains('toast-exit')) {
          // Statt sofort zu entfernen: Exit-Animation laufen lassen
          toast.classList.add('toast-exit');
          setTimeout(() => {
            origRemove(...classes);
            toast.classList.remove('toast-exit');
          }, TOAST_EXIT_MS);
          return;
        }
        origRemove(...classes);
      };
    };

    if (document.readyState !== 'loading') setupPatch();
    else document.addEventListener('DOMContentLoaded', setupPatch, { once: true });
  }

  /* ──────────────────────────────────────────────────────────────
     7. INTERN: Hint-Text-Änderungen automatisch erkennen (Patch 10-F)
        Beobachtet Textänderungen auf #hint via MutationObserver
     ────────────────────────────────────────────────────────────── */

  _interceptHintUpdate() {
    const setup = () => {
      const hint = el('hint');
      if (!hint) return;

      // Beobachte Text-Änderungen im #hint-Element
      const obs = new MutationObserver(mutations => {
        for (const m of mutations) {
          if (m.type === 'characterData' || m.type === 'childList') {
            // Text hat sich geändert — Animation triggern
            if (hint._lastHintText === hint.textContent) continue;
            hint._lastHintText = hint.textContent;

            hint.classList.remove('hint-update');
            requestAnimationFrame(() => {
              hint.classList.add('hint-update');
              if (this._hintTimer) clearTimeout(this._hintTimer);
              this._hintTimer = setTimeout(() =>
                hint.classList.remove('hint-update'), HINT_UPDATE_MS);
            });
            break;
          }
        }
      });
      obs.observe(hint, { childList: true, subtree: true, characterData: true });
    };

    if (document.readyState !== 'loading') setup();
    else document.addEventListener('DOMContentLoaded', setup, { once: true });
  }

  /* ──────────────────────────────────────────────────────────────
     8. INTERN: Heat-Bar scaleX-Fix (overclocking.js:234 benutzt style.width)
        Der Heat-Bar-Fill braucht transform-origin: left (in gpu-animations.css)
     ────────────────────────────────────────────────────────────── */

  _fixHeatBar() {
    // Wir patchen das Rendering nicht direkt — stattdessen beobachten wir
    // style.width-Änderungen via MutationObserver und konvertieren sie zu scaleX.
    const setup = () => {
      const fill = document.querySelector('#oc-heat-fill, .heat-fill, #heat-bar-fill');
      if (!fill) return;

      const obs = new MutationObserver(() => {
        const w = fill.style.width;
        if (!w || !w.endsWith('%')) return;
        const pct = parseFloat(w);
        if (isNaN(pct)) return;
        // width entfernen, scaleX setzen
        fill.style.width = '';
        _scaleX(fill, pct / 100);
      });
      obs.observe(fill, { attributes: true, attributeFilter: ['style'] });
    };

    if (document.readyState !== 'loading') setup();
    else document.addEventListener('DOMContentLoaded', setup, { once: true });
  }

  /* ──────────────────────────────────────────────────────────────
     9. INTERN: Device-Typ tracking
     ────────────────────────────────────────────────────────────── */

  _trackDevice() {
    const update = () => {
      const wasMobile = this.isMobile;
      this.isMobile = window.innerWidth <= 768;
      this.isLandscapeMobile = window.innerWidth <= 1024 &&
                               window.innerHeight <= 500 &&
                               window.innerWidth > window.innerHeight;

      // Von Mobile auf Desktop gewechselt: Types-Open sicherstellen
      if (wasMobile && !this.isMobile) {
        document.body.classList.add('v92-types-open');
      }
    };

    window.addEventListener('resize', update, { passive: true });
  }
}

/* ══════════════════════════════════════════════════════════════════
   Singleton-Export — wird in main.js importiert
   ══════════════════════════════════════════════════════════════════ */
export const ui = new UIController();

/* ══════════════════════════════════════════════════════════════════
   REDESIGN v10 — Type-tile ↔ legacy tbtn sync
   Keeps the new type-tile UI in sync with the hidden legacy buttons
   ══════════════════════════════════════════════════════════════════ */
const TYPE_TILE_MAP = {
  'tile-src': 'bn-src',
  'tile-rly': 'bn-rly',
  'tile-amp': 'bn-amp',
  'tile-mem': 'bn-mem',
  'tile-stb': 'bl-stb',
  'tile-fst': 'bl-fst',
  'tile-res': 'bl-res',
  'tile-frg': 'bl-frg',
};

function ready10(fn) {
  if (document.readyState !== 'loading') fn();
  else document.addEventListener('DOMContentLoaded', fn, { once: true });
}

ready10(() => {
  const $ = id => document.getElementById(id);

  // Tile → legacy button click forwarding
  Object.entries(TYPE_TILE_MAP).forEach(([tileId, btnId]) => {
    const tile = $(tileId);
    const btn  = $(btnId);
    if (!tile || !btn) return;

    tile.addEventListener('click', () => {
      if (!tile.classList.contains('tile-disabled')) btn.click();
    });

    // Observe legacy btn state → mirror to tile
    new MutationObserver(() => {
      tile.classList.toggle('active',       btn.classList.contains('on'));
      tile.classList.toggle('tile-disabled', btn.classList.contains('tbtn-disabled'));
      tile.style.display = btn.style.display === 'none' ? 'none' : '';
    }).observe(btn, { attributes: true, attributeFilter: ['class', 'style'] });

    // Initial sync
    tile.classList.toggle('active',       btn.classList.contains('on'));
    tile.classList.toggle('tile-disabled', btn.classList.contains('tbtn-disabled'));
  });

  // Mode-aware type grid visibility:
  // Node types visible in Place mode, Link types in Connect mode
  const htmlEl = document.documentElement;
  function syncTypeGridMode() {
    const mode = htmlEl.getAttribute('data-mode') || 'place';
    const nodeRow = $('node-type-row');
    const linkRow = $('link-type-row');
    if (nodeRow) nodeRow.style.display = (mode === 'connect') ? 'none' : 'flex';
    if (linkRow) linkRow.style.display = (mode === 'connect') ? 'flex' : 'none';
  }
  new MutationObserver(syncTypeGridMode)
    .observe(htmlEl, { attributes: true, attributeFilter: ['data-mode'] });
  syncTypeGridMode();

  // Sync verbose drawer stats from HUD spans
  function syncVerboseDrawer() {
    const map = {
      'vd-nodes': 'node-stat',
      'vd-links': 'link-stat',
      'vd-energy': 'energy-stat',
      'vd-tri':   'tri-stat',
      'vd-br':    'br-stat',
      'vd-l3':    'l3-stat',
      'vd-spine': 'spine-stat',
      'vd-data':  'data-stat',
    };
    Object.entries(map).forEach(([vId, sId]) => {
      const vEl = $(vId);
      const sEl = $(sId);
      if (vEl && sEl) vEl.textContent = sEl.textContent || '—';
    });
  }
  // Sync on each animation frame when verbose is open
  let syncRaf = null;
  function startSync() {
    if (syncRaf) return;
    const tick = () => {
      if (document.body.classList.contains('hud-verbose-open')) {
        syncVerboseDrawer();
        syncRaf = requestAnimationFrame(tick);
      } else {
        syncRaf = null;
      }
    };
    syncRaf = requestAnimationFrame(tick);
  }
  new MutationObserver(() => {
    if (document.body.classList.contains('hud-verbose-open')) startSync();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // Update side-panel stats when it opens
  function syncSidePanelStats() {
    const G = window.G || {};
    const sp = id => $(id);
    if (sp('sp-stat-layer'))  sp('sp-stat-layer').textContent  = G.layer  !== undefined ? `Layer ${G.layer}`  : '—';
    if (sp('sp-stat-epoch'))  sp('sp-stat-epoch').textContent  = G.epoch  !== undefined ? `Epoch ${G.epoch}`   : '—';
    if (sp('sp-stat-energy')) sp('sp-stat-energy').textContent = G.energy !== undefined ? G.energy.toFixed(0)  : '—';
    if (sp('sp-stat-nodes'))  sp('sp-stat-nodes').textContent  = G.nodes  !== undefined ? G.nodes              : '—';
    const energyStat = $('energy-stat');
    if (energyStat && sp('sp-stat-energy') && !G.energy) {
      sp('sp-stat-energy').textContent = energyStat.textContent || '—';
    }
  }
  new MutationObserver(() => {
    if (document.body.classList.contains('side-panel-open')) syncSidePanelStats();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // Wire up sp-footer-continue = same as sp-btn-continue
  const spFC = $('sp-footer-continue');
  const spBC = $('sp-btn-continue');
  if (spFC && spBC) spFC.addEventListener('click', () => spBC.click());

  // Wire sp-btn-settings → btn-settings
  const spSet = $('sp-btn-settings');
  if (spSet) spSet.addEventListener('click', () => {
    const bs = $('btn-settings');
    if (bs) bs.click();
    document.body.classList.remove('side-panel-open');
    $('side-panel')?.classList.remove('open');
  });

  // Wire sp-btn-quit → pause p-title button
  const spQuit = $('sp-btn-quit');
  if (spQuit) spQuit.addEventListener('click', () => {
    const qt = document.querySelector('.p-title');
    if (qt) qt.click();
  });

  // Update hint labels
  function updateDockHints() {
    const pBtn  = $('btn-pulse');
    const tBtn  = $('btn-train');
    const aBtn  = $('btn-autoroute');
    const hP    = $('hint-pulse');
    const hT    = $('hint-train');
    const hA    = $('hint-auto');

    if (hP && pBtn) {
      hP.textContent = pBtn.disabled ? '—' : 'READY';
    }
    if (hT && tBtn) {
      hT.textContent = tBtn.disabled ? '—' : 'READY';
    }
    if (hA && aBtn) {
      hA.textContent = aBtn.classList.contains('on') ? 'ON' : '—';
    }
  }

  // Observe pulse/train/auto buttons for state changes
  ['btn-pulse','btn-train','btn-autoroute'].forEach(id => {
    const btn = $(id);
    if (btn) new MutationObserver(updateDockHints)
      .observe(btn, { attributes: true, attributeFilter: ['disabled','class'] });
  });
  updateDockHints();

  // Save card v2 sync
  const sc2 = $('save-card-v2');
  const sc1 = $('save-card');
  if (sc2 && sc1) {
    new MutationObserver(() => {
      // Show sc2 if sc1 is visible
      sc2.style.display = (sc1.style.display !== 'none') ? 'grid' : 'none';
      // Sync content
      const diff     = sc1.querySelector('#sc-diff');
      const clusters = sc1.querySelector('#sc-clusters');
      const energy   = sc1.querySelector('#sc-energy');
      const layer    = sc1.querySelector('#sc-layer');
      const age      = sc1.querySelector('#sc-age');
      const details  = $('sc2-details');
      if (details && clusters && layer) {
        details.textContent = [clusters.textContent, layer.textContent, age?.textContent].filter(Boolean).join(' · ');
      }
      const t = $('sc2-time');
      if (t && age) t.textContent = age.textContent || '—';
    }).observe(sc1, { attributes: true, attributeFilter: ['style'], subtree: true, childList: true });
  }
});
