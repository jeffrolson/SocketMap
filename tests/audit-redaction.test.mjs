import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { harvestSecrets, findLeaks, detectKind } from "../scripts/audit-redaction.mjs";
import { redactUrl, redactHeaderLines, createEvidenceSanitizer } from "../src/redact.mjs";

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.c2lnbmF0dXJlLXZhbHVl";
const GOOGLE_KEY = `AIza${"B".repeat(35)}`;

describe("redaction audit: harvesting secrets from a raw capture", () => {
  const raw = JSON.stringify({
    headers: ["authorization: Bearer abcdef0123456789xyz", "cookie: sid=cookievalue12345; theme=dark", "set-cookie: auth=setcookievalue999; Path=/", "x-request-id: 11112222-3333-4444-5555-666677778888"],
    url: `https://app.example.com/cb?access_token=tok0123456789&color=blue&sugkey=${GOOGLE_KEY}#id_token=frag0123456789`,
    jwt: JWT,
    har: { request: { headers: [{ name: "Authorization", value: "Basic dXNlcjpwYXNzd29yZA==" }], cookies: [{ name: "session", value: "harcookie123456" }] } }
  });
  const secrets = harvestSecrets(raw);
  const values = secrets.map(s => s.value);
  it("finds header, cookie, parameter and token-shaped secrets", () => {
    for (const expected of ["abcdef0123456789xyz", "cookievalue12345", "setcookievalue999", "tok0123456789", "frag0123456789", GOOGLE_KEY, JWT, "dXNlcjpwYXNzd29yZA==", "harcookie123456"]) assert.ok(values.includes(expected), expected);
  });
  it("does not treat harmless values or request IDs as secrets", () => {
    assert.ok(!values.includes("dark") && !values.includes("blue"));
    assert.ok(!values.includes("11112222-3333-4444-5555-666677778888"), "request IDs are kept on purpose");
  });
  it("reports a leak only when a harvested value appears in the output, masked", () => {
    const leaks = findLeaks(secrets, `<p>fine</p><p>${JWT}</p><p>x?a=tok0123456789&amp;b=1</p>`);
    assert.equal(leaks.length, 2);
    assert.ok(leaks.every(l => !l.marker.includes("tok0123456789") && /chars\)$/.test(l.marker)));
    assert.equal(findLeaks(secrets, "<p>[REDACTED]</p>").length, 0);
  });
  it("recognizes each kind of capture", () => {
    assert.equal(detectKind('{"constants":{},"events":['), "netlog");
    assert.equal(detectKind('{"log":{"version":"1.2","creator":{}'), "har");
    assert.equal(detectKind('{"traceEvents":[{"ph":"M"'), "trace");
    assert.equal(detectKind('{"hello":1}'), null);
  });
});

describe("redaction by token shape", () => {
  it("masks well-known token shapes under any parameter name", () => {
    const out = redactUrl(`https://x.example.com/s?sugkey=${GOOGLE_KEY}&q=1&t=${JWT}`);
    assert.ok(!out.includes(GOOGLE_KEY) && !out.includes(JWT));
    assert.ok(out.includes("q=1"));
  });
  it("masks them in header lines and in evidence text, and leaves ordinary text alone", () => {
    assert.ok(!redactHeaderLines([`x-thing: ${GOOGLE_KEY}`])[0].includes(GOOGLE_KEY));
    const sanitize = createEvidenceSanitizer();
    assert.ok(!sanitize(`GET /a?x=${GOOGLE_KEY} HTTP/1.1`).includes(GOOGLE_KEY));
    assert.ok(!sanitize({ note: JWT }).note.includes(JWT));
    assert.equal(sanitize("GET /AIzaShort HTTP/1.1"), "GET /AIzaShort HTTP/1.1");
  });
});

describe("authentication response headers", () => {
  it("masks challenge and authentication-info headers, which carry nonces and session data", () => {
    const lines = redactHeaderLines(["www-authenticate: Digest realm=\"r\", nonce=\"abc123\"", "authentication-info: nextnonce=\"def456\"", "proxy-authenticate: NTLM TlRMTVNTUAAB", "content-type: text/html"]);
    assert.deepEqual(lines.map(l => l.split(": ")[1]), ["[REDACTED]", "[REDACTED]", "[REDACTED]", "text/html"]);
    const sanitize = createEvidenceSanitizer();
    assert.equal(sanitize({ name: "WWW-Authenticate", value: "Digest nonce=abc" }).value, "[REDACTED]");
  });
});
