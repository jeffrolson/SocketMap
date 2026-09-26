import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { redactUrl, redactHeaderLines } from "../src/redact.mjs";
import { summarizeCertificateChain } from "../src/cert.mjs";
import { TEST_CERTS } from "../src/demo/sample-capture.mjs";

describe("URL redaction", () => {
  it("masks secret query and fragment values, keeps the rest", () => {
    const out = redactUrl("https://contoso.sharepoint.com/sites/HR/Doc.xlsx?tempauth=abc&web=1#access_token=xyz&state=ok");
    assert.equal(out, "https://contoso.sharepoint.com/sites/HR/Doc.xlsx?tempauth=[REDACTED]&web=1#access_token=[REDACTED]&state=ok");
  });

  it("covers OAuth, SAML, and signed-URL parameters", () => {
    for (const p of ["code", "id_token", "refresh_token", "SAMLResponse", "SAMLRequest", "sig", "X-Amz-Signature", "client_secret", "password", "api_key", "key"]) {
      assert.ok(redactUrl(`https://h.example.com/p?${p}=SECRETVALUE`).endsWith(`${p}=[REDACTED]`), p);
    }
  });

  it("masks passwords embedded in the URL", () => {
    assert.equal(redactUrl("https://user:hunter2@h.example.com/x"), "https://user:[REDACTED]@h.example.com/x");
  });

  it("leaves unparseable input untouched", () => {
    assert.equal(redactUrl("not a url"), "not a url");
    assert.equal(redactUrl(null), null);
  });
});

describe("Header redaction", () => {
  it("masks credential headers in 'name: value' form", () => {
    const out = redactHeaderLines([
      "Cookie: a=1", "set-cookie: FedAuth=2", "Authorization: Bearer x", "Proxy-Authorization: Negotiate y",
      "X-Api-Key: k", "x-requestdigest: d", "x-auth-token: t", "content-type: text/html", ":path: /a?code=zzz"
    ]);
    assert.deepEqual(out, [
      "Cookie: [REDACTED]", "set-cookie: [REDACTED]", "Authorization: [REDACTED]", "Proxy-Authorization: [REDACTED]",
      "X-Api-Key: [REDACTED]", "x-requestdigest: [REDACTED]", "x-auth-token: [REDACTED]", "content-type: text/html", ":path: /a?code=[REDACTED]"
    ]);
  });
});

describe("Certificate summary", () => {
  it("reads subject, issuer, and root from a PEM chain", () => {
    const s = summarizeCertificateChain([TEST_CERTS.apiLeaf, TEST_CERTS.inspectionCa]);
    assert.equal(s.subject, "api.example.org");
    assert.equal(s.issuer, "Contoso Inspection CA");
    assert.equal(s.issuerOrg, "Contoso Security");
    assert.equal(s.root, "Contoso Inspection CA");
    assert.ok(s.notAfter.startsWith("2027-"));
  });

  it("returns null for anything it cannot read", () => {
    assert.equal(summarizeCertificateChain(["garbage"]), null);
    assert.equal(summarizeCertificateChain([]), null);
  });
});
