/**
 * Minimal X.509 reader: pulls subject, issuer, and expiry out of PEM certificates.
 *
 * NetLog records the certificate chain each server presented. The issuer of that
 * chain is how TLS inspection shows up: an inspecting proxy re-signs traffic with
 * its own root. Only the few DER fields needed are decoded, with no dependencies,
 * so this also runs in the browser.
 */

const OID_CN = "2.5.4.3";
const OID_O = "2.5.4.10";

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Reads one DER TLV at `pos`: returns tag, content start, and end offset. */
function readTlv(bytes, pos) {
  const tag = bytes[pos];
  let len = bytes[pos + 1];
  let start = pos + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | bytes[start + i];
    start += n;
  }
  if (tag === undefined || start + len > bytes.length) throw new Error("truncated DER");
  return { tag, start, end: start + len };
}

function children(bytes, tlv) {
  const out = [];
  for (let p = tlv.start; p < tlv.end;) {
    const c = readTlv(bytes, p);
    out.push(c);
    p = c.end;
  }
  return out;
}

function decodeOid(bytes, tlv) {
  const parts = [Math.floor(bytes[tlv.start] / 40), bytes[tlv.start] % 40];
  let v = 0;
  for (let i = tlv.start + 1; i < tlv.end; i++) {
    v = (v << 7) | (bytes[i] & 0x7f);
    if (!(bytes[i] & 0x80)) { parts.push(v); v = 0; }
  }
  return parts.join(".");
}

function decodeText(bytes, tlv) {
  return new TextDecoder().decode(bytes.subarray(tlv.start, tlv.end));
}

function readName(bytes, tlv) {
  const name = {};
  for (const set of children(bytes, tlv)) {
    for (const attr of children(bytes, set)) {
      const [oid, value] = children(bytes, attr);
      const id = decodeOid(bytes, oid);
      if (id === OID_CN && !name.cn) name.cn = decodeText(bytes, value);
      if (id === OID_O && !name.o) name.o = decodeText(bytes, value);
    }
  }
  return name;
}

function readTime(bytes, tlv) {
  const s = decodeText(bytes, tlv);
  const full = tlv.tag === 0x17 ? (Number(s.slice(0, 2)) >= 50 ? "19" : "20") + s : s;
  return `${full.slice(0, 4)}-${full.slice(4, 6)}-${full.slice(6, 8)}T${full.slice(8, 10)}:${full.slice(10, 12)}:${full.slice(12, 14)}Z`;
}

/** Parses one PEM certificate. Throws on malformed input. */
export function parseCertificate(pem) {
  const b64 = String(pem).replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bytes = base64ToBytes(b64);
  const cert = readTlv(bytes, 0);
  const tbs = children(bytes, cert)[0];
  const fields = children(bytes, tbs);
  const offset = fields[0].tag === 0xa0 ? 1 : 0; // optional explicit version
  const issuer = readName(bytes, fields[offset + 2]);
  const validity = children(bytes, fields[offset + 3]);
  const subject = readName(bytes, fields[offset + 4]);
  return { subject, issuer, notAfter: readTime(bytes, validity[1]) };
}

/**
 * Summarizes a presented chain (leaf first). Returns null when nothing is readable.
 */
export function summarizeCertificateChain(pems) {
  if (!Array.isArray(pems) || pems.length === 0) return null;
  try {
    const chain = pems.map(parseCertificate);
    const leaf = chain[0];
    const top = chain[chain.length - 1];
    return {
      subject: leaf.subject.cn || null,
      issuer: leaf.issuer.cn || leaf.issuer.o || null,
      issuerOrg: leaf.issuer.o || null,
      root: top.issuer.cn || top.issuer.o || null,
      notAfter: leaf.notAfter
    };
  } catch {
    return null;
  }
}
