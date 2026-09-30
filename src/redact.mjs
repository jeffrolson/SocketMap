/**
 * Secret redaction for captured traffic.
 *
 * Policy: strip credentials (passwords, auth headers, cookies, tokens, signed-URL
 * signatures) and keep everything else, including IP addresses and document paths.
 * Pure string functions so the same code runs in Node and in the browser.
 */

const MASK = "[REDACTED]";

// Query and fragment parameters whose values are credentials. Matched by name pattern, not an
// exact list, so variants such as session_id, sessionToken or csrf_token are covered too.
const SECRET_PARAM_NAME = /token|secret|passw(?:or)?d|pwd|session|csrf|xsrf|signature|assertion|credential|api[-_]?key|^(?:tempauth|code|sig|key|auth|samlrequest|samlresponse)$|(?:^|[_-])auth(?:$|[_-])/i;
const PARAM_RE = /([?&#;])([^=&#;\s"']+)=([^&#\s"']*)/g;
// Credentials that are recognizable by their shape, wherever they appear (any parameter name, any header).
const TOKEN_SHAPE_RE = /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|\bAIza[0-9A-Za-z_-]{35}\b|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{30,}\b|\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g;
const USERINFO_RE = /(\/\/[^/:@\s]+:)[^@/\s]+@/g;

// Header names whose values are credentials.
const SECRET_HEADER_RE = /cookie|authorization|authenticat|token|secret|password|api[-_]?key|digest|signature|session/i;
const URL_HEADER_RE = /^(:path|location|referer|origin|content-location)$/i;
// NetLog metadata can include the Chrome command line. Keep useful non-secret
// switches, but never carry a credential passed as a switch value into a model
// or shareable report.
const COMMAND_SECRET_RE = /((?:--?)(?:access[-_]?token|auth[-_]?token|refresh[-_]?token|id[-_]?token|token|auth(?:orization)?|password|passwd|pwd|secret|api[-_]?key|cookie|session|credential)(?:=|\s+))(?:(?:"[^"]*")|(?:'[^']*')|\S+)/gi;

/** Masks secret parameter values and embedded passwords in a URL or path. */
export function redactUrl(url) {
  if (typeof url !== "string") return url;
  return url.replace(USERINFO_RE, `$1${MASK}@`).replace(PARAM_RE, (all, sep, name) => SECRET_PARAM_NAME.test(name) ? `${sep}${name}=${MASK}` : all).replace(TOKEN_SHAPE_RE, MASK);
}

/** Redacts URLs and credential-like command-line switches in captured metadata. */
export function redactCapturedText(value) {
  if (typeof value !== "string") return value;
  return redactUrl(value).replace(COMMAND_SECRET_RE, `$1${MASK}`);
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
    return line.replace(TOKEN_SHAPE_RE, MASK);
  });
}

/**
 * Recursive redaction for diagnostic snapshots and arbitrary NetLog parameters.
 * This factory is self-contained so the offline event inspector can embed the
 * exact same sanitizer without fetching code or retaining a raw event archive.
 */
export function createEvidenceSanitizer() {
  const mask = "[REDACTED]";
  const secretName = /authorization|authenticat|cookie|password|passwd|(?:^|[_-])pwd(?:$|[_-])|token|secret|credentials?|private[_-]?key|(?:^session$|session[_-]?(?:id|ticket)$)|api[_-]?key|digest|signature|saml|assertion|(?:^|[_-])auth(?:$|[_-]|entication)|auth[_-]?(?:data|value|challenge|response)|^challenge$/i;
  const secretParamName = /token|secret|passw(?:or)?d|pwd|session|csrf|xsrf|signature|assertion|credential|api[-_]?key|^(?:tempauth|code|sig|key|auth|samlrequest|samlresponse)$|(?:^|[_-])auth(?:$|[_-])/i;
  function text(value) {
    return value
      .replace(/(\/\/[^/:@\s]+:)[^@/\s]+@/g, "$1" + mask + "@")
      .replace(/([?&#;])([^=&#;\s"']+)=([^&#\s"']*)/g, (all, sep, name) => secretParamName.test(name) ? sep + name + "=" + mask : all)
      .replace(/((?:--?)(?:access[-_]?token|auth[-_]?token|refresh[-_]?token|id[-_]?token|token|auth(?:orization)?|password|passwd|pwd|secret|api[-_]?key|cookie|session|credential)(?:=|\s+))(?:(?:"[^"]*")|(?:'[^']*')|\S+)/gi, "$1" + mask)
      .replace(/eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|\bAIza[0-9A-Za-z_-]{35}\b|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{30,}\b|\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, mask)
      .replace(/\b(Bearer|Basic|Negotiate|NTLM)\s+[A-Za-z0-9+/_=.-]+/gi, "$1 " + mask)
      .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, mask)
      .split(/\r?\n/).map(line => {
        const colon = line.indexOf(":", line.startsWith(":") ? 1 : 0);
        return colon >= 0 && secretName.test(line.slice(0, colon).trim()) ? line.slice(0, colon + 1) + " " + mask : line;
      }).join("\n");
  }
  function sanitize(value, key = "", enumMap = false) {
    // Recorded enum dictionaries and explicit counters are metadata. A numeric
    // password or token value is still a credential and must be removed.
    const enumContainer = /^(?:logEventTypes|logSourceType|logEventPhase|netError|loadFlag|loadState|certStatusFlag|certVerifierFlags|certVerifyFlags|certPathBuilderDigestPolicy|addressFamily|dnsQueryType|secureDnsMode|logCaptureMode|quicError|quicRstStreamError)$/i.test(key);
    const metadata = enumMap || /(?:count|length|size|enabled|disabled|present|available|supported|digest_policy)$/i.test(key);
    if (!enumContainer && secretName.test(key) && value != null && typeof value !== "boolean" && !(metadata && typeof value === "number")) return mask;
    if (/^(?:bytes|hex_encoded_bytes|raw_bytes|payload|body|request_body|response_body|server_info)$/i.test(key) && value != null) return "[Payload omitted: may contain credentials]";
    if (typeof value === "string") return text(value);
    if (Array.isArray(value)) return value.map(item => sanitize(item, key, enumMap));
    if (value && typeof value === "object") {
      const namedSecret = [value.name, value.header, value.header_name, value.headerName, value.key]
        .some(name => typeof name === "string" && secretName.test(name));
      return Object.fromEntries(Object.entries(value).map(([name, item]) => [
        name,
        namedSecret && /^(value|values|header_value|headerValue)$/i.test(name) ? mask : sanitize(item, name, enumMap || enumContainer)
      ]));
    }
    return value;
  }
  return sanitize;
}
