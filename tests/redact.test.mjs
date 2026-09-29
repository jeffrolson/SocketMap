import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createEvidenceSanitizer, redactCapturedText, redactUrl, redactHeaderLines } from "../src/redact.mjs";
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

describe("Captured metadata redaction", () => {
  it("masks secrets in a command line while preserving non-secret switches", () => {
    const out = redactCapturedText('chrome --proxy-pac-url=https://pac.example/pac?token=PACSECRET --auth-token=COMMANDSECRET --profile-directory=Work');
    assert.ok(out.includes("token=[REDACTED]"));
    assert.ok(out.includes("--auth-token=[REDACTED]"));
    assert.ok(out.includes("--profile-directory=Work"));
    assert.ok(!out.includes("PACSECRET"));
    assert.ok(!out.includes("COMMANDSECRET"));
  });

  it("scrubs nested diagnostic snapshots without dropping addresses or paths", () => {
    const sanitize = createEvidenceSanitizer();
    const snapshot = sanitize({
      remote_ip: "198.51.100.9",
      url: "https://api.example.test/a/path?token=URLSECRET",
      auth: "AUTHSECRET",
      session: { id: "SESSIONSECRET" },
      nested: {
        headers: [
          "Cookie: COOKIESECRET",
          { name: "Authorization", value: "Bearer HEADERSECRET" },
          { header_name: "X-RequestDigest", header_value: "DIGESTSECRET" },
          { key: "X-Api-Key", value: "KEYSECRET" }
        ],
        error: { response_body: "BODYSECRET", access_token: "TOKENSECRET" }
      }
    });
    const text = JSON.stringify(snapshot);
    for (const secret of ["URLSECRET", "AUTHSECRET", "SESSIONSECRET", "COOKIESECRET", "HEADERSECRET", "DIGESTSECRET", "KEYSECRET", "BODYSECRET", "TOKENSECRET"]) {
      assert.ok(!text.includes(secret), secret);
    }
    assert.equal(snapshot.remote_ip, "198.51.100.9");
    assert.ok(snapshot.url.includes("api.example.test/a/path"));
    assert.equal(snapshot.nested.headers[1].value, "[REDACTED]");
    assert.equal(snapshot.nested.headers[2].header_value, "[REDACTED]");
    assert.equal(snapshot.nested.headers[3].value, "[REDACTED]");
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

it("preserves protocol session snapshots and enum IDs while removing numeric credentials", () => {
  const sanitize = createEvidenceSanitizer();
  const result = sanitize({
    spdySessionInfo: [{ host_port_pair: "portal.example.test:443" }],
    quicInfo: { sessions: [{ peer_address: "198.51.100.44:443" }] },
    constants: { logEventTypes: { AUTH_TOKEN_GENERATED: 105 }, logSourceType: { HTTP2_SESSION: 12 } },
    token: 123456, password: 678910, token_count: 2, has_token: true, digest_policy: 2, certPathBuilderDigestPolicy: { WEAK_ALLOW_SHA1: 2 }
  });
  assert.equal(result.spdySessionInfo[0].host_port_pair, "portal.example.test:443");
  assert.equal(result.quicInfo.sessions[0].peer_address, "198.51.100.44:443");
  assert.equal(result.constants.logEventTypes.AUTH_TOKEN_GENERATED, 105);
  assert.equal(result.constants.logSourceType.HTTP2_SESSION, 12);
  assert.equal(result.token, "[REDACTED]");
  assert.equal(result.password, "[REDACTED]");
  assert.equal(result.token_count, 2);
  assert.equal(result.digest_policy, 2);
  assert.equal(result.certPathBuilderDigestPolicy.WEAK_ALLOW_SHA1, 2);
  assert.equal(result.has_token, true);
});

describe("secret parameter names, by pattern", () => {
  const secrets = ["session_id", "session-id", "sessionToken", "SessionKey", "csrf_token", "xsrf_token", "auth_token", "authToken", "refreshToken", "accessToken", "api-key", "apiKey", "client_secret", "passwd", "userPassword", "x-amz-credential", "Signature", "assertion", "tempauth", "code", "sig", "key", "auth"];
  const benign = ["page", "customer", "CustomerId", "ctx", "author", "wl", "id", "v", "locale", "returnUrl"];
  it("masks the value of any parameter whose name says it is a secret", () => {
    for (const name of secrets) {
      const out = redactUrl(`https://a.example.com/x?${name}=VALUE123&page=2`);
      assert.ok(!out.includes("VALUE123"), `${name} should be masked`);
      assert.ok(out.includes("page=2"));
    }
  });
  it("leaves ordinary parameters alone", () => {
    for (const name of benign) assert.ok(redactUrl(`https://a.example.com/x?${name}=keepme`).includes(`${name}=keepme`), name);
  });
  it("applies the same rule inside diagnostic parameters", () => {
    const sanitize = createEvidenceSanitizer();
    const out = JSON.stringify(sanitize({ url: "https://fpt.example.com/?session_id=SECRETSESSION&CustomerId=42&csrf_token=CSRFVAL" }));
    assert.ok(!out.includes("SECRETSESSION") && !out.includes("CSRFVAL"));
    assert.ok(out.includes("CustomerId=42"));
  });
});
