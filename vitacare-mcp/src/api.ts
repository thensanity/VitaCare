const base = () =>
  (process.env.VITACARE_API_URL || "http://127.0.0.1:3001").replace(/\/$/, "");

export async function vitacareFetch(
  path: string,
  init?: RequestInit
): Promise<unknown> {
  const url = `${base()}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${res.status} ${text || res.statusText}`.trim());
  }
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function apiBaseDisplay(): string {
  return base();
}

/**
 * Calls `/api/finetune/*` routes. Set `VITACARE_FINETUNE_SECRET` in the MCP process
 * to the same value as `FINETUNE_ADMIN_SECRET` on the VitaCare API.
 */
export async function vitacareFetchFinetune(
  path: string,
  init?: RequestInit
): Promise<unknown> {
  const secret = process.env.VITACARE_FINETUNE_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "Set VITACARE_FINETUNE_SECRET in the MCP environment (must match FINETUNE_ADMIN_SECRET on the VitaCare API)."
    );
  }
  const headers = {
    "X-Finetune-Secret": secret,
    ...(init?.headers as Record<string, string> | undefined),
  };
  return vitacareFetch(path, { ...init, headers });
}
