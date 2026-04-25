/**
 * Lightweight client-side user settings (signature, etc).
 * Persisted to localStorage so it survives reloads, with a small
 * pub/sub so any component can react to changes.
 */

export const DEFAULT_SIGNATURE = 'Auto build in public post crafted by @shipublic';
const STORAGE_KEY = 'shipublic.settings.v1';

export interface UserSettings {
  signature: string;
  signatureEnabled: boolean;
}

const defaults: UserSettings = {
  signature: DEFAULT_SIGNATURE,
  signatureEnabled: true,
};

type Listener = (s: UserSettings) => void;
const listeners = new Set<Listener>();

function read(): UserSettings {
  if (typeof window === 'undefined') return { ...defaults };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw);
    return {
      signature: typeof parsed.signature === 'string' ? parsed.signature : DEFAULT_SIGNATURE,
      signatureEnabled:
        typeof parsed.signatureEnabled === 'boolean' ? parsed.signatureEnabled : true,
    };
  } catch {
    return { ...defaults };
  }
}

function write(next: UserSettings) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  for (const fn of listeners) {
    try { fn(next); } catch {}
  }
}

export function getSettings(): UserSettings {
  return read();
}

export function updateSettings(patch: Partial<UserSettings>): UserSettings {
  const next = { ...read(), ...patch };
  write(next);
  return next;
}

export function onSettingsChange(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Strips any previously appended signature from a piece of content so we can
 * append the latest one without duplicating. Treats both the active signature
 * and the default signature as removable.
 */
export function stripSignature(content: string, currentSig: string): string {
  if (!content) return content;
  let trimmed = content.replace(/\s+$/, '');
  for (const sig of [currentSig, DEFAULT_SIGNATURE]) {
    if (!sig) continue;
    if (trimmed.endsWith(sig)) {
      trimmed = trimmed.slice(0, trimmed.length - sig.length).replace(/\s+$/, '');
    }
  }
  return trimmed;
}

export function appendSignature(content: string, signature: string): string {
  const sig = (signature || '').trim();
  if (!sig) return content;
  const cleaned = stripSignature(content || '', sig);
  return `${cleaned}\n\n${sig}`;
}
