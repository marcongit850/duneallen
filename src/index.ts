import {
  SUBJECT,
  assessContact,
  buildMessage,
  createRateLimiter,
  originAllowed,
  parsePayload,
  readLimitedBody,
} from "./contact";

const limiter = createRateLimiter();
const MAX_BODY = 20_000;

const COPY = {
  success: "Thank you. Your message has been sent.",
  validation: "Please check the form and try again.",
  rate: "Please wait a little while before sending another message.",
  send: "We could not send your message just now. Please try again in a few minutes.",
  rejected: "That request could not be completed.",
  large: "That message is too long to send.",
} as const;

type ErrorCode = "validation" | "rate" | "send" | "rejected" | "large";

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/api/contact") {
      return env.ASSETS.fetch(request);
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: securityHeaders() });
    }
    if (request.method !== "POST") {
      return respond(request, { ok: false, error: "rejected", message: COPY.rejected }, 405);
    }
    if (!originAllowed(request.headers.get("Origin"))) {
      console.log(JSON.stringify({ event: "contact_rejected", reason: "origin" }));
      return respond(request, { ok: false, error: "rejected", message: COPY.rejected }, 403);
    }

    const raw = await readLimitedBody(request, MAX_BODY);
    if (raw === null) {
      return respond(request, { ok: false, error: "large", message: COPY.large }, 413);
    }

    const payload = parsePayload(request.headers.get("content-type") ?? "", raw);
    if (!payload) {
      return respond(request, { ok: false, error: "rejected", message: COPY.rejected }, 415);
    }

    const decision = assessContact(payload);
    if (decision.action === "drop") {
      console.log(JSON.stringify({ event: "contact_dropped" }));
      return respond(request, { ok: true, message: COPY.success }, 200);
    }
    if (decision.action === "reject") {
      console.log(JSON.stringify({ event: "contact_rejected", reason: "validation", fields: decision.fields }));
      return respond(
        request,
        { ok: false, error: "validation", fields: decision.fields, message: COPY.validation },
        400,
      );
    }

    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    if (!limiter.allow(ip)) {
      console.log(JSON.stringify({ event: "contact_rejected", reason: "rate" }));
      return respond(request, { ok: false, error: "rate", message: COPY.rate }, 429);
    }

    try {
      const result = await env.EMAIL.send({
        to: env.CONTACT_TO,
        from: { email: env.CONTACT_FROM, name: "Friends of Dune Allen" },
        replyTo: { email: decision.fields.email, name: decision.fields.name },
        subject: SUBJECT,
        text: buildMessage(decision.fields),
      });
      console.log(JSON.stringify({ event: "contact_sent", messageId: result.messageId }));
      return respond(request, { ok: true, message: COPY.success }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "send failed";
      const code = error instanceof Error && "code" in error ? String(error.code) : undefined;
      console.error(JSON.stringify({ event: "contact_failed", message, code }));
      return respond(request, { ok: false, error: "send", message: COPY.send }, 502);
    }
  },
} satisfies ExportedHandler<Env>;

function respond(
  request: Request,
  body: { ok: boolean; error?: ErrorCode; message: string; fields?: string[] },
  status: number,
): Response {
  const accept = request.headers.get("accept") ?? "";
  const wantsHtml = accept.includes("text/html") && !accept.includes("application/json");
  if (wantsHtml) return html(body.message, status, body.ok);
  return json(body, status);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...securityHeaders(),
    },
  });
}

function html(message: string, status: number, ok: boolean): Response {
  const title = ok ? "Message sent" : "Message not sent";
  const page = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${escapeHtml(title)} | Friends of Dune Allen</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body class="result-page">
  <main>
    <p class="eyebrow">Friends of Dune Allen</p>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    <p><a class="btn btn-solid" href="/#contact">Return to the page</a></p>
  </main>
</body>
</html>`;
  return new Response(page, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      ...securityHeaders(),
    },
  });
}

function securityHeaders(): Record<string, string> {
  return {
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-frame-options": "DENY",
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
