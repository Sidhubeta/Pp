const REMEMBERED_KEY_STORAGE = "zimbola-remembered-key";
const DEVICE_ID_STORAGE = "zimbola-device-id";
const DEVICE_ID_COOKIE = "zimbola_did";
const AUTO_LOGIN_STORAGE = "zimbola-auto-login";
const IDB_NAME = "zimbola_identity_db";
const IDB_STORE = "kv";

export type RememberedKeyData = {
  key: string;
  userName?: string;
};

function isValidDeviceId(val: string | null | undefined): val is string {
  if (!val) return false;
  const t = val.trim();
  return t.length >= 16 && t.length <= 128 && /^[A-Za-z0-9_-]+$/.test(t);
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  try {
    const raw = document.cookie || "";
    for (const part of raw.split(";")) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      if (part.slice(0, eq).trim() === name) {
        return decodeURIComponent(part.slice(eq + 1).trim()) || null;
      }
    }
  } catch {
    // Ignore cookie read error
  }
  return null;
}

function writeCookie(name: string, value: string, maxAgeSeconds = 60 * 60 * 24 * 365): void {
  if (typeof document === "undefined") return;
  try {
    const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
  } catch {
    // Ignore cookie write error
  }
}

function openIdentityDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet(key: string): Promise<string | null> {
  const db = await openIdentityDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(typeof req.result === "string" ? req.result : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet(key: string, value: string): Promise<void> {
  const db = await openIdentityDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export function getRememberedKey(): RememberedKeyData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(REMEMBERED_KEY_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberedKeyData>;
    const key = typeof parsed?.key === "string" ? parsed.key.trim().toUpperCase() : "";
    if (!key) return null;
    const userName =
      typeof parsed?.userName === "string" && parsed.userName.trim()
        ? parsed.userName.trim()
        : undefined;
    return userName ? { key, userName } : { key };
  } catch {
    return null;
  }
}

export function saveRememberedKey(data: RememberedKeyData): void {
  if (typeof window === "undefined") return;
  const key = data.key.replace(/[\u200B-\u200D\uFEFF]/g, "").trim().toUpperCase();
  if (!key) return;
  try {
    const existing = getRememberedKey();
    const userName = data.userName?.trim() || existing?.userName || undefined;
    window.localStorage.setItem(
      REMEMBERED_KEY_STORAGE,
      JSON.stringify(userName ? { key, userName } : { key }),
    );
  } catch {
    // Storage unavailable — ignore
  }
}

export function clearRememberedKey(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(REMEMBERED_KEY_STORAGE);
  } catch {
    // Ignore
  }
}

export function isAutoLoginEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(AUTO_LOGIN_STORAGE) === "1";
  } catch {
    return false;
  }
}

export function setAutoLoginEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AUTO_LOGIN_STORAGE, enabled ? "1" : "0");
  } catch {
    // Storage unavailable — ignore
  }
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined" || !text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below for WebView / non-HTTPS contexts
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function generateClientUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function saveClientDeviceId(deviceId: string | null | undefined): void {
  if (typeof window === "undefined" || !isValidDeviceId(deviceId)) return;
  const trimmed = deviceId.trim();
  try {
    window.localStorage.setItem(DEVICE_ID_STORAGE, trimmed);
  } catch {
    // Ignore
  }
  writeCookie(DEVICE_ID_COOKIE, trimmed);
  void idbSet(DEVICE_ID_STORAGE, trimmed);
}

export function getExistingClientDeviceId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const ls = window.localStorage.getItem(DEVICE_ID_STORAGE)?.trim();
    if (isValidDeviceId(ls)) {
      writeCookie(DEVICE_ID_COOKIE, ls);
      return ls;
    }
  } catch {
    // Ignore
  }
  const ck = readCookie(DEVICE_ID_COOKIE)?.trim();
  if (isValidDeviceId(ck)) {
    saveClientDeviceId(ck);
    return ck;
  }
  return undefined;
}

export async function getExistingClientDeviceIdAsync(): Promise<string | undefined> {
  const syncId = getExistingClientDeviceId();
  if (syncId) {
    void idbSet(DEVICE_ID_STORAGE, syncId);
    return syncId;
  }
  const dbId = (await idbGet(DEVICE_ID_STORAGE))?.trim();
  if (isValidDeviceId(dbId)) {
    saveClientDeviceId(dbId);
    return dbId;
  }
  return undefined;
}

export function getOrCreateClientDeviceId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const existing = getExistingClientDeviceId();
  if (existing) return existing;
  const created = generateClientUuid();
  saveClientDeviceId(created);
  return created;
}

export async function getOrCreateClientDeviceIdAsync(): Promise<string | undefined> {
  if (typeof window === "undefined") return undefined;
  const existing = await getExistingClientDeviceIdAsync();
  if (existing) return existing;
  const created = generateClientUuid();
  saveClientDeviceId(created);
  return created;
}
