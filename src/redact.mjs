/**
 * Secret redaction for captured traffic.
 *
 * Policy: strip credentials (passwords, auth headers, cookies, tokens, signed-URL
 * signatures) and keep everything else, including IP addresses and document paths.
 * Pure string functions so the same code runs in Node and in the browser.
 */

const MASK = "[REDACTED]";

// Query and fragment parameters whose values are credentials.
const SECRET_PARAMS = [
  "tempauth", "access_token", "id_token", "refresh_token", "token", "code", "client_secret",
  "samlrequest", "samlresponse", "sig", "signature", "x-amz-signature", "x-amz-credential",
  "x-amz-security-token", "password", "pwd", "passwd", "api_key", "apikey", "key", "secret",
  "session", "sessionid", "auth", "assertion"
];

const PARAM_RE = new RegExp(`([?&#;](?:${SECRET_PARAMS.map(p => p.replace(/[-]/g, "\\-")).join("|")})=)[^&#\\s"']*`, "gi");
const USERINFO_RE = /(\/\/[^/:@\s]+:)[^@/\s]+@/g;

// Header names whose values are credentials.
const SECRET_HEADER_RE = /cookie|authorization|token|secret|password|api[-_]?key|digest|signature|session/i;
const URL_HEADER_RE = /^(:path|location|referer|origin|content-location)$/i;

/** Masks secret parameter values and embedded passwords in a URL or path. */
export function redactUrl(url) {
  if (typeof url !== "string") return url;
  return url.replace(USERINFO_RE, `$1${MASK}@`).replace(PARAM_RE, `$1${MASK}`);
}

/** Masks credential headers in Chrome's "name: value" header line format. */
export function redactHeaderLines(lines) {
  if (!Array.isArray(lines)) return [];
  return lines.map(line => {
    if (typeof line !== "string") return line;
    const idx = line.indexOf(":", line.startsWith(":") ? 1 : 0);
    if (idx < 0) return line;
    const name = line.slice(0, idx).trim();
    if (SECRET_HEADER_RE.test(name)) return `${line.slice(0, idx)}: ${MASK}`;
    if (URL_HEADER_RE.test(name)) return `${line.slice(0, idx)}:${redactUrl(line.slice(idx + 1))}`;
    return line;
  });
}
