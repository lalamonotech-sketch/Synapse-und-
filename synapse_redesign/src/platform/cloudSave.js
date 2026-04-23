/**
 * SYNAPSE v99 — Cloud Save (Google Drive)
 *
 * Optional sync button that exports the current save JSON to a single
 * Google Drive file ("Synapse Save") and can import it back.
 *
 * HOW IT WORKS
 *   - Uses the Google Drive REST API (v3) with a user-provided OAuth token.
 *   - The token is requested via a standard OAuth popup (minimal scope:
 *     drive.file — only files created by this app are accessible).
 *   - No backend required. The fetch goes directly from the browser.
 *   - The save file is stored as application/json, named "synapse_save.json".
 *   - On export: full localStorage save is written to Drive.
 *   - On import: the Drive file is read and applied via the normal
 *     applyRestoredState() path in saveSystem.js.
 *
 * USAGE
 *   import { initCloudSave } from './platform/cloudSave.js';
 *   initCloudSave();   // call once after DOMContentLoaded
 *
 * UI CONTRACT
 *   Expects two optional buttons in the DOM (e.g. in the Settings overlay):
 *     id="cloud-save-export"  → triggers export
 *     id="cloud-save-import"  → triggers import
 *   And a status element:
 *     id="cloud-save-status"  → receives status text
 *
 * ADDING THE OAUTH CLIENT ID
 *   Set window.SYNAPSE_DRIVE_CLIENT_ID before this module loads, or
 *   define VITE_DRIVE_CLIENT_ID in your .env and pass it via:
 *     window.SYNAPSE_DRIVE_CLIENT_ID = import.meta.env.VITE_DRIVE_CLIENT_ID;
 */

import { getLang } from '../state/settings.js';
import { LS_SAVE } from '../state/saveSystem.js';
import { showToast } from '../ui/hud/index.js';

const DRIVE_FILE_NAME = 'synapse_save.json';
const DRIVE_MIME      = 'application/json';
const DRIVE_SCOPE     = 'https://www.googleapis.com/auth/drive.file';

// ── Internal state ─────────────────────────────────────────────────────────

let _token        = null;   // OAuth access token
let _tokenExpiry  = 0;      // ms timestamp
let _driveFileId  = null;   // cached file ID after first upload
let _busy         = false;

// ── i18n ──────────────────────────────────────────────────────────────────

const T = {
  de: {
    noClientId:   'Cloud Save nicht konfiguriert (Client-ID fehlt).',
    tokenFail:    'Google-Anmeldung fehlgeschlagen.',
    exportOk:     'Cloud Save gespeichert.',
    exportFail:   'Cloud Save fehlgeschlagen.',
    importOk:     'Cloud Save geladen — Neustart erforderlich.',
    importFail:   'Cloud Save Import fehlgeschlagen.',
    importEmpty:  'Keine Cloud-Speicherdatei gefunden.',
    busy:         'Cloud Save läuft…',
  },
  en: {
    noClientId:   'Cloud Save not configured (Client ID missing).',
    tokenFail:    'Google sign-in failed.',
    exportOk:     'Cloud save exported.',
    exportFail:   'Cloud save failed.',
    importOk:     'Cloud save loaded — reload required.',
    importFail:   'Cloud save import failed.',
    importEmpty:  'No cloud save file found.',
    busy:         'Cloud save in progress…',
  },
};

function t(key) {
  const l = getLang?.() || 'de';
  return (T[l] || T.de)[key] || key;
}

function setStatus(msg, isError = false) {
  const el = document.getElementById('cloud-save-status');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? 'rgba(255,80,80,.9)' : 'rgba(100,220,160,.9)';
}

// ── OAuth token acquisition ────────────────────────────────────────────────

function _getClientId() {
  return window.SYNAPSE_DRIVE_CLIENT_ID
      || (typeof __DRIVE_CLIENT_ID__ !== 'undefined' ? __DRIVE_CLIENT_ID__ : null);
}

/**
 * Request an OAuth token via the browser's credential popup.
 * Uses the Google Identity Services (GIS) tokenClient if available,
 * falls back to a plain OAuth redirect popup for environments without GIS.
 */
async function _requestToken() {
  const clientId = _getClientId();
  if (!clientId) {
    setStatus(t('noClientId'), true);
    return false;
  }

  // If we have a non-expired token, reuse it
  if (_token && Date.now() < _tokenExpiry - 30_000) return true;

  return new Promise(resolve => {
    // Use Google Identity Services if loaded
    if (window.google?.accounts?.oauth2) {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope:     DRIVE_SCOPE,
        callback:  resp => {
          if (resp.access_token) {
            _token       = resp.access_token;
            _tokenExpiry = Date.now() + (resp.expires_in || 3600) * 1000;
            resolve(true);
          } else {
            setStatus(t('tokenFail'), true);
            resolve(false);
          }
        },
      });
      client.requestAccessToken();
      return;
    }

    // Fallback: manual popup
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id',     clientId);
    url.searchParams.set('redirect_uri',  window.location.origin + '/oauth-callback');
    url.searchParams.set('response_type', 'token');
    url.searchParams.set('scope',         DRIVE_SCOPE);
    const popup = window.open(url, 'drive_auth', 'width=520,height=620');

    const timer = setInterval(() => {
      try {
        if (!popup || popup.closed) { clearInterval(timer); resolve(false); return; }
        const params = new URLSearchParams(popup.location.hash.slice(1));
        const tok = params.get('access_token');
        if (tok) {
          _token = tok;
          _tokenExpiry = Date.now() + Number(params.get('expires_in') || 3600) * 1000;
          popup.close();
          clearInterval(timer);
          resolve(true);
        }
      } catch (_) { /* cross-origin — wait */ }
    }, 300);
  });
}

// ── Drive API helpers ─────────────────────────────────────────────────────

async function _findFile() {
  const q = `name='${DRIVE_FILE_NAME}' and mimeType='${DRIVE_MIME}' and trashed=false`;
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${_token}` } }
  );
  if (!resp.ok) return null;
  const { files } = await resp.json();
  return files?.[0]?.id || null;
}

async function _uploadFile(jsonString) {
  // Multipart upload: metadata + body in one request
  const meta     = JSON.stringify({ name: DRIVE_FILE_NAME, mimeType: DRIVE_MIME });
  const boundary = '---SynapseCloudBoundary';
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8', '',
    meta, '',
    `--${boundary}`,
    `Content-Type: ${DRIVE_MIME}`, '',
    jsonString,
    `--${boundary}--`,
  ].join('\r\n');

  const method = _driveFileId ? 'PATCH' : 'POST';
  const url = _driveFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${_driveFileId}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

  const resp = await fetch(url, {
    method,
    headers: {
      Authorization:  `Bearer ${_token}`,
      'Content-Type': `multipart/related; boundary="${boundary}"`,
    },
    body,
  });
  if (!resp.ok) throw new Error(`Drive upload failed: ${resp.status}`);
  const file = await resp.json();
  _driveFileId = file.id;
  return file;
}

async function _downloadFile(fileId) {
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${_token}` } }
  );
  if (!resp.ok) throw new Error(`Drive download failed: ${resp.status}`);
  return resp.text();
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Export current localStorage save to Google Drive.
 */
export async function cloudExport() {
  if (_busy) { setStatus(t('busy')); return; }
  _busy = true;
  setStatus('…');
  try {
    const ok = await _requestToken();
    if (!ok) { _busy = false; return; }

    const raw = localStorage.getItem(LS_SAVE);
    if (!raw) { setStatus(t('exportFail'), true); _busy = false; return; }

    if (!_driveFileId) _driveFileId = await _findFile();
    await _uploadFile(raw);

    setStatus(t('exportOk'));
    showToast('☁ CLOUD SAVE', t('exportOk'), 2200);
  } catch (e) {
    setStatus(t('exportFail'), true);
    console.error('[cloudSave] export error:', e);
  }
  _busy = false;
}

/**
 * Import a save from Google Drive and write it to localStorage.
 * The caller must reload/restart the run for changes to take effect.
 */
export async function cloudImport() {
  if (_busy) { setStatus(t('busy')); return; }
  _busy = true;
  setStatus('…');
  try {
    const ok = await _requestToken();
    if (!ok) { _busy = false; return; }

    const fileId = _driveFileId || await _findFile();
    if (!fileId) { setStatus(t('importEmpty'), true); _busy = false; return; }
    _driveFileId = fileId;

    const raw = await _downloadFile(fileId);
    // Validate JSON before writing
    JSON.parse(raw);
    localStorage.setItem(LS_SAVE, raw);

    setStatus(t('importOk'));
    showToast('☁ CLOUD IMPORT', t('importOk'), 3000);
  } catch (e) {
    setStatus(t('importFail'), true);
    console.error('[cloudSave] import error:', e);
  }
  _busy = false;
}

/**
 * Wire up DOM buttons. Call once after DOMContentLoaded.
 */
export function initCloudSave() {
  const exportBtn = document.getElementById('cloud-save-export');
  const importBtn = document.getElementById('cloud-save-import');
  if (exportBtn) exportBtn.addEventListener('click', cloudExport);
  if (importBtn) importBtn.addEventListener('click', cloudImport);
  // Expose as window bridge for legacy callers
  window._cloudExport = cloudExport;
  window._cloudImport = cloudImport;
}

// Auto-init if buttons exist at load time
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initCloudSave, { once: true });
  } else {
    queueMicrotask(initCloudSave);
  }
}
