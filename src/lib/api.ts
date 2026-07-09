/**
 * Editor API client — one tiny fetch layer, shared by every page.
 *
 * The admin token (v0.1 auth) lives in localStorage; ApiError carries
 * the status so pages can route 401s to the token gate instead of
 * showing a dead end.
 */

export const TOKEN_KEY = "links-admin-token";
export const ADDRESS_KEY = "links-address";
export const EMAIL_KEY = "links-email";

/** Deployment config — which product this is. Fetched once, cached. */
export interface AppConfig {
  authMode: "wallet" | "email";
  brandLogoUrl?: string;
  brandName: string;
  defaultTheme: string;
  fiatDoor: boolean;
  limitEnabled: boolean;
  uploads: boolean;
  /** Public policy numbers — the homepage ledger states the deal with
   *  the same figures the gates enforce. Optional: older servers. */
  freeProfileLimit?: number;
  freeBlockLimit?: number;
  premiumProfileLimit?: number;
}

let appConfig: AppConfig | null = null;
let appConfigPromise: Promise<AppConfig> | null = null;

export function getAppConfig(): Promise<AppConfig> {
  if (appConfig) return Promise.resolve(appConfig);
  appConfigPromise ??= fetch("/api/config")
    .then((r) => r.json() as Promise<AppConfig>)
    .then((c) => (appConfig = c))
    .catch(() => {
      appConfigPromise = null;
      // Unreachable server: assume wallet (the default product) so the
      // UI still renders; the gate's own requests will surface errors.
      return { authMode: "wallet" as const, brandName: "NEDB Links", defaultTheme: "pro", fiatDoor: false, limitEnabled: false, uploads: false };
    });
  return appConfigPromise;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Server's machine-readable code (e.g. "premium_required"). */
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable — requests proceed unauthenticated */
  }
}

export function getAddress(): string | null {
  try {
    return localStorage.getItem(ADDRESS_KEY);
  } catch {
    return null;
  }
}

/**
 * Session phase bus — login and logout are EVENTS, not just storage
 * writes. The `storage` event only fires in *other* tabs; this one
 * covers the tab where the sign-in actually happened, so the Nav
 * account chip, the signed-in strip, and the billing badge all flip
 * live — no reload between "signed out" and "signed in".
 */
const SESSION_EVENT = "links:session-changed";

function notifySessionChanged(): void {
  try {
    window.dispatchEvent(new Event(SESSION_EVENT));
  } catch {
    /* no window (tests) — nothing to notify */
  }
}

/** Subscribe to session phase changes; returns the unsubscribe. */
export function onSessionChanged(fn: () => void): () => void {
  window.addEventListener(SESSION_EVENT, fn);
  return () => window.removeEventListener(SESSION_EVENT, fn);
}

/** Persist a session. Wallet mode passes the itc1… address; email mode
 *  passes the eml_ principal plus the human-readable email for display. */
export function setSession(token: string, address: string, email?: string): void {
  setToken(token);
  try {
    localStorage.setItem(ADDRESS_KEY, address);
    if (email) localStorage.setItem(EMAIL_KEY, email);
    else localStorage.removeItem(EMAIL_KEY);
  } catch {
    /* storage unavailable */
  }
  notifySessionChanged();
}

export function getEmail(): string | null {
  try {
    return localStorage.getItem(EMAIL_KEY);
  } catch {
    return null;
  }
}

export function clearSession(): void {
  setToken("");
  try {
    localStorage.removeItem(ADDRESS_KEY);
    localStorage.removeItem(EMAIL_KEY);
  } catch {
    /* storage unavailable */
  }
  notifySessionChanged();
}

/**
 * Sign out — ONE code path everywhere (nav chip, mobile strip), so the
 * logout phase can never differ by surface: best-effort server-side
 * revoke, local wipe, land on the homepage signed out.
 */
export function signOut(): void {
  void fetch("/api/auth/logout", {
    method: "POST",
    headers: { authorization: `Bearer ${getToken() ?? ""}` },
  }).catch(() => undefined);
  clearSession();
  window.location.href = "/";
}

export function adminHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...adminHeaders(),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `${res.status}`;
    let code: string | undefined;
    try {
      const j = (await res.json()) as { error?: string; code?: string };
      if (j.error) message = j.error;
      code = j.code;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message, code);
  }
  return (await res.json()) as T;
}

export function getJson<T>(path: string): Promise<T> {
  return request<T>(path);
}

export function postJson<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
}

export function putJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "PUT", body: JSON.stringify(body) });
}

/** POST a draft manifest, get back the real renderer's HTML. */
export async function fetchPreviewHtml(draft: unknown): Promise<string> {
  const res = await fetch("/api/preview", {
    method: "POST",
    headers: { "content-type": "application/json", ...adminHeaders() },
    body: JSON.stringify(draft),
  });
  if (!res.ok) {
    let message = `${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) message = j.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }
  return res.text();
}
