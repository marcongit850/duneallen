export const SUBJECT = "New message from Friends of Dune Allen";

const NAME_MAX = 100;
const EMAIL_MAX = 200;
const PHONE_MAX = 40;
const MESSAGE_MAX = 4000;
const MIN_THINK_MS = 2000;

const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} .,'’-]*$/u;
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const PHONE_PATTERN = /^[0-9+().\s-]{3,40}$/;

export type ContactFields = {
  name: string;
  email: string;
  phone: string;
  message: string;
};

export type ContactDecision =
  | { action: "drop" }
  | { action: "reject"; fields: string[] }
  | { action: "send"; fields: ContactFields };

export type ContactPayload = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  message?: unknown;
  fax_number?: unknown;
  startedAt?: unknown;
};

export function createRateLimiter(limit = 5, windowMs = 10 * 60 * 1000) {
  const hits = new Map<string, number[]>();
  return {
    allow(key: string, now = Date.now()): boolean {
      const recent = (hits.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 2000) {
        const oldest = hits.keys().next().value;
        if (oldest) hits.delete(oldest);
      }
      return true;
    },
  };
}

export function originAllowed(origin: string | null): boolean {
  if (!origin) return true;
  let host = "";
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (
    host === "friendsofduneallen.com" ||
    host === "www.friendsofduneallen.com" ||
    host === "localhost" ||
    host === "127.0.0.1"
  ) {
    return true;
  }
  return host.endsWith(".workers.dev") && host.includes("duneallen");
}

export function assessContact(input: ContactPayload, now = Date.now()): ContactDecision {
  if (filled(input.fax_number) || tooFast(input.startedAt, now)) {
    return { action: "drop" };
  }

  const fields: string[] = [];
  const name = cleanLine(input.name, NAME_MAX);
  const email = cleanLine(input.email, EMAIL_MAX).toLowerCase();
  const phone = cleanLine(input.phone, PHONE_MAX);
  const message = cleanMessage(input.message);

  if (!name || !NAME_PATTERN.test(name)) fields.push("name");
  if (!email || email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email) || email.includes("..")) {
    fields.push("email");
  }
  if (phone && (phone.length > PHONE_MAX || !PHONE_PATTERN.test(phone))) fields.push("phone");
  if (!message || message.length > MESSAGE_MAX) fields.push("message");

  if (fields.length > 0) return { action: "reject", fields };
  return { action: "send", fields: { name, email, phone, message } };
}

export function buildMessage(fields: ContactFields): string {
  const phone = fields.phone || "not given";
  return [
    "New message from the Friends of Dune Allen website",
    "",
    `Name: ${fields.name}`,
    `Email: ${fields.email}`,
    `Phone: ${phone}`,
    "",
    "Message:",
    fields.message,
  ].join("\n");
}

export async function readLimitedBody(request: Request, maxBytes: number): Promise<string | null> {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > maxBytes) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(buffer);
}

export function parsePayload(contentType: string, raw: string): ContactPayload | null {
  const type = contentType.toLowerCase();
  if (type.includes("application/json")) {
    try {
      const data: unknown = JSON.parse(raw);
      if (!data || typeof data !== "object") return null;
      return data as ContactPayload;
    } catch {
      return null;
    }
  }
  if (type.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(raw);
    return {
      name: params.get("name") ?? "",
      email: params.get("email") ?? "",
      phone: params.get("phone") ?? "",
      message: params.get("message") ?? "",
      fax_number: params.get("fax_number") ?? "",
      startedAt: params.get("startedAt") ?? "",
    };
  }
  return null;
}

function filled(value: unknown): boolean {
  if (typeof value === "string") return value.trim() !== "";
  return value != null && value !== false;
}

function tooFast(startedAt: unknown, now: number): boolean {
  const parsed =
    typeof startedAt === "number"
      ? startedAt
      : typeof startedAt === "string" && startedAt.trim() !== ""
        ? Number(startedAt)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return false;
  const delta = now - parsed;
  return delta >= 0 && delta < MIN_THINK_MS;
}

function cleanLine(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return stripControls(value).replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanMessage(value: unknown): string {
  if (typeof value !== "string") return "";
  return stripControls(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().slice(0, MESSAGE_MAX);
}

function stripControls(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}
