import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { SUBJECT, assessContact, buildMessage, createRateLimiter, originAllowed } from "../src/contact.ts";

const valid = {
  name: "Ada Allen",
  email: "ada@example.com",
  phone: "(850) 555-0100",
  message: "We walk that beach every winter.",
  fax_number: "",
  startedAt: Date.now() - 5000,
};

describe("assessContact", () => {
  it("accepts a complete message", () => {
    const decision = assessContact(valid);
    assert.equal(decision.action, "send");
    if (decision.action !== "send") return;
    assert.equal(decision.fields.email, "ada@example.com");
    assert.match(buildMessage(decision.fields), /Ada Allen/);
    assert.equal(SUBJECT, "New message from Friends of Dune Allen");
  });

  it("allows a missing phone number", () => {
    const decision = assessContact({ ...valid, phone: "  " });
    assert.equal(decision.action, "send");
  });

  it("rejects a bad email and an empty message", () => {
    const decision = assessContact({ ...valid, email: "not-an-email", message: "   " });
    assert.equal(decision.action, "reject");
    if (decision.action !== "reject") return;
    assert.deepEqual(decision.fields, ["email", "message"]);
  });

  it("drops a filled honeypot without calling it an error", () => {
    assert.deepEqual(assessContact({ ...valid, fax_number: "spam" }), { action: "drop" });
  });

  it("drops a form filled in too quickly", () => {
    assert.equal(assessContact({ ...valid, startedAt: Date.now() }).action, "drop");
  });

  it("strips line breaks from the name so headers stay single line", () => {
    const decision = assessContact({ ...valid, name: "Ada\nAllen" });
    assert.equal(decision.action, "send");
    if (decision.action !== "send") return;
    assert.equal(decision.fields.name, "Ada Allen");
  });
});

describe("rate limiter", () => {
  it("allows five messages and then waits", () => {
    const limiter = createRateLimiter(5, 1000);
    for (let i = 0; i < 5; i += 1) assert.equal(limiter.allow("1.2.3.4", 0), true);
    assert.equal(limiter.allow("1.2.3.4", 500), false);
    assert.equal(limiter.allow("5.6.7.8", 500), true);
    assert.equal(limiter.allow("1.2.3.4", 1000), true);
  });
});

describe("origin", () => {
  it("allows the public site, local dev, and this worker's preview hosts", () => {
    assert.equal(originAllowed(null), true);
    assert.equal(originAllowed("https://friendsofduneallen.com"), true);
    assert.equal(originAllowed("https://www.friendsofduneallen.com"), true);
    assert.equal(originAllowed("http://localhost:8787"), true);
    assert.equal(originAllowed("https://duneallen.example.workers.dev"), true);
    assert.equal(originAllowed("https://evil.example"), false);
    assert.equal(originAllowed("https://not-ours.workers.dev"), false);
  });
});

describe("public copy", () => {
  it("has no long dashes and no email address in the pages", () => {
    const files = walk("public").filter((file) => /\.(html|css|js|txt|xml)$/.test(file) && !file.includes("/fonts/"));
    const dash = /\u2014|\u2013/;
    const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      assert.equal(dash.test(text), false, file);
      assert.equal(email.test(text), false, file);
    }
  });
});

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...walk(path));
    else found.push(path);
  }
  return found;
}
