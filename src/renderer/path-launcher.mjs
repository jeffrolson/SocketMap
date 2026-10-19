/** Offline helper launchers. Copying a command never runs it inside the browser. */
import { HELPER_SH, HELPER_PS1 } from "./helper-scripts.generated.mjs";

function base64(text) {
  const bytes = encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes.charCodeAt(i), b = bytes.charCodeAt(i + 1) || 0, c = bytes.charCodeAt(i + 2) || 0;
    out += alphabet[a >> 2] + alphabet[((a & 3) << 4) | (b >> 4)]
      + (i + 1 < bytes.length ? alphabet[((b & 15) << 2) | (c >> 6)] : "=")
      + (i + 2 < bytes.length ? alphabet[c & 63] : "=");
  }
  return out;
}

function esc(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Only literal hostnames are accepted; captured text must never become shell code. */
export function buildPathLaunchers(hosts) {
  const names = [...new Set((Array.isArray(hosts) ? hosts : []).filter(host => typeof host === "string" && /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/.test(host)))].slice(0, 5);
  const args = names.map(host => `'${host}'`).join(" ");
  return {
    sh: `printf '%s' '${base64(HELPER_SH)}' | base64 -d | bash -s -- --out "$HOME/socketmap-path.json"${args ? ` ${args}` : ""}`,
    ps: `& ([ScriptBlock]::Create([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${base64(HELPER_PS1)}')))) -Out (Join-Path ([Environment]::GetFolderPath('UserProfile')) 'socketmap-path.json')${names.length ? ` -Hosts @(${names.map(host => `'${host}'`).join(",")})` : ""}`
  };
}

export function renderPathLauncher(hosts) {
  const commands = buildPathLaunchers(hosts);
  const button = (key, label) => `<button type="button" data-copy-from="path-launch-${key}">${label}</button>`;
  const review = (key, label) => `<details><summary>Review or manually copy the ${label} command</summary><textarea id="path-launch-${key}" aria-label="${label} helper command" readonly rows="3" style="width:100%;box-sizing:border-box">${esc(commands[key])}</textarea></details>`;
  return `<div class="pth-card"><h3>Collect with one pasted command</h3><p>Copy the command for this computer, paste it into Terminal or PowerShell, and wait for it to finish. The command contains the same helper offered below; it does not download code or change browser settings. It reads network settings, looks up the public address, and sends connection and route probes to the listed hosts.</p><div class="tools">${button("sh", "Copy Mac / Linux command")}${button("ps", "Copy Windows command")}</div><p>The result is <code>socketmap-path.json</code> in your home folder. Choose <b>Add network path</b> and select that file. Commands run only when you paste them into a terminal.</p>${review("sh", "Mac / Linux")}${review("ps", "Windows PowerShell")}</div>`;
}
