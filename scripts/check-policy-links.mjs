/**
 * Dev-time check: every vendor link in the policy catalog still resolves.
 * Not part of `npm run verify` (it needs the network) and never shipped in a report.
 */
import { POLICY_CATALOG, CATALOG_REVIEWED } from "../src/policy/catalog.mjs";

const urls = [...new Set(POLICY_CATALOG.flatMap(policy => Object.values(policy.browsers).map(info => info.url)))];
console.log(`Checking ${urls.length} policy links (catalog reviewed ${CATALOG_REVIEWED})`);
let failed = 0;
for (const url of urls) {
  try {
    const response = await fetch(url, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0 SocketMap link check" } });
    const ok = response.status >= 200 && response.status < 300;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${response.status} ${url}`);
  } catch (error) {
    failed++;
    console.log(`FAIL ${error.cause?.code || error.message} ${url}`);
  }
}
console.log(failed ? `${failed} link(s) need attention` : "All links resolve");
process.exit(failed ? 1 : 0);
