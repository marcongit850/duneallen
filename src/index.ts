/**
 * Friends of Dune Allen contact handler.
 * Static pages are served from public/. This script runs first for /api/*.
 */

const MAX_BODY_BYTES = 20_000;
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const SUBJECT = "New message from Friends of Dune Allen";

// Best-effort limiter for this isolate. It is not shared across the edge,
// and it stores only timestamps, never message contents.
const recentHits = new Map<string, number[]>();

interface ContactFields {
  name: string;
  email: string;
  phone: string;
  message: string;
  companyWebsite: string;
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== "/api/contact") {
      return text("Not found", 404);
    }

    if (request.method !== "POST") {
      return text("Method not allowed", 405, { allow: "POST" });
    }

    const lengthHeader = request.headers.get("content-length");
    if (lengthHeader && Number(lengthHeader) > MAX_BODY_BYTES) {
      return fail(request, "That message is too long. Please shorten it and try again.", 413);
    }

    const origin = request.headers.get("origin");
    if (origin) {
      let originHost = "";
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = "";
      }
      if (originHost !== url.host) {
        console.log(JSON.stringify({ event: "contact_rejected", reason: "cross_origin" }));
        return fail(request, "We could not send that from this page.", 403);
      }
    }

    let fields: ContactFields;
    let wantsJson = false;
    try {
      const parsed = await readFields(request);
      fields = parsed.fields;
      wantsJson = parsed.wantsJson;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "bad_request";
      console.log(JSON.stringify({ event: "contact_rejected", reason }));
      if (reason === "too_large") {
        return fail(request, "That message is too long. Please shorten it and try again.", 413);
      }
      return fail(request, "Please check the form and try again.", 400);
    }

    if (limited(clientIp(request))) {
      console.log(JSON.stringify({ event: "contact_rejected", reason: "rate_limit" }));
      return fail(
        request,
        "Please wait a few minutes before sending another message.",
        429,
        wantsJson,
      );
    }

    // Filled honeypot: acknowledge it and do not send.
    if (fields.companyWebsite) {
      console.log(JSON.stringify({ event: "contact_ignored", reason: "honeypot" }));
      return succeed(request, wantsJson);
    }

    const problem = validate(fields);
    if (problem) {
      console.log(JSON.stringify({ event: "contact_rejected", reason: problem.code }));
      return fail(request, problem.message, 400, wantsJson);
    }

    const phone = fields.phone ? fields.phone : "Not provided";
    const textBody = [
      "A message arrived through the Friends of Dune Allen website.",
      "",
      `Name: ${fields.name}`,
      `Email: ${fields.email}`,
      `Phone: ${phone}`,
      "",
      "Message:",
      fields.message,
    ].join("\n");

    try {
      const result = await env.EMAIL.send({
        to: env.CONTACT_TO,
        from: {
          email: env.CONTACT_FROM,
          name: "Friends of Dune Allen",
        },
        replyTo: fields.email,
        subject: SUBJECT,
        text: textBody,
      });
      console.log(JSON.stringify({ event: "contact_sent", messageId: result.messageId }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "send_failed";
      console.error(JSON.stringify({ event: "contact_send_failed", error: message }));
      return fail(
        request,
        "We could not send that just now. Please try again in a few minutes.",
        502,
        wantsJson,
      );
    }

    return succeed(request, wantsJson);
  },
} satisfies ExportedHandler<Env>;

function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") || "unknown";
}

function limited(ip: string): boolean {
  const now = Date.now();
  const stamps = (recentHits.get(ip) || []).filter((stamp) => now - stamp < RATE_WINDOW_MS);
  if (stamps.length >= RATE_LIMIT) {
    recentHits.set(ip, stamps);
    return true;
  }
  stamps.push(now);
  recentHits.set(ip, stamps);
  return false;
}

async function readFields(request: Request): Promise<{ fields: ContactFields; wantsJson: boolean }> {
  const type = request.headers.get("content-type") || "";
  const wantsJson = type.includes("application/json");
  const raw = await readBoundedText(request);

  if (wantsJson) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("invalid_json");
    }
    if (!isRecord(parsed)) {
      throw new Error("invalid_json");
    }
    return {
      wantsJson,
      fields: {
        name: stringField(parsed.name),
        email: stringField(parsed.email),
        phone: stringField(parsed.phone),
        message: stringField(parsed.message),
        companyWebsite: stringField(parsed.company_website),
      },
    };
  }

  const params = new URLSearchParams(raw);
  return {
    wantsJson,
    fields: {
      name: params.get("name") || "",
      email: params.get("email") || "",
      phone: params.get("phone") || "",
      message: params.get("message") || "",
      companyWebsite: params.get("company_website") || "",
    },
  };
}

async function readBoundedText(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) {
    return "";
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("too_large");
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function validate(fields: ContactFields): { code: string; message: string } | null {
  const name = oneLine(fields.name);
  const email = oneLine(fields.email).toLowerCase();
  const phone = oneLine(fields.phone);
  const message = cleanMessage(fields.message);

  fields.name = name;
  fields.email = email;
  fields.phone = phone;
  fields.message = message;

  if (!name || name.length > 80) {
    return { code: "name", message: "Please add your name." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { code: "email", message: "Please add a valid email address so we can write back." };
  }
  if (!validPhone(phone)) {
    return { code: "phone", message: "Please check the phone number and try again." };
  }
  if (!message) {
    return { code: "message", message: "Please add a message." };
  }
  if (message.length > 4000) {
    return { code: "message", message: "That message is too long. Please shorten it and try again." };
  }
  return null;
}

function oneLine(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
}

function cleanMessage(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

function validPhone(value: string): boolean {
  if (!value) return true;
  if (value.length > 40 || !/^[0-9+().\-\s]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, "").length;
  return digits >= 7 && digits <= 15;
}

function succeed(request: Request, wantsJson: boolean): Response {
  if (wantsJson) {
    return Response.json(
      { ok: true, message: "Thank you. Your message is on its way." },
      { headers: jsonHeaders() },
    );
  }
  return htmlPage(
    "Message sent",
    "Thank you. Your message is on its way.",
    "Someone will read it and write back.",
    200,
  );
}

function fail(request: Request, message: string, status: number, wantsJson = prefersJson(request)): Response {
  if (wantsJson) {
    return Response.json({ ok: false, message }, { status, headers: jsonHeaders() });
  }
  return htmlPage("Message not sent", message, "You can return to the form and try again.", status);
}

function prefersJson(request: Request): boolean {
  const type = request.headers.get("content-type") || "";
  const accept = request.headers.get("accept") || "";
  return type.includes("application/json") || accept.includes("application/json");
}

function jsonHeaders(): HeadersInit {
  return {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  };
}

function text(message: string, status: number, extra?: HeadersInit): Response {
  return new Response(message, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extra,
    },
  });
}

function htmlPage(title: string, message: string, detail: string, status: number): Response {
  const body = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-ZSZ5S9MWE6"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-ZSZ5S9MWE6');
  </script>
  <title>${escapeHtml(title)} | Friends of Dune Allen</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <main class="result-page">
    <p class="kicker">Friends of Dune Allen</p>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    <p>${escapeHtml(detail)}</p>
    <p><a class="btn btn-solid" href="/#contact">Back to the page</a></p>
  </main>
</body>
</html>`;
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
