import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { buildPathLaunchers, renderPathLauncher } from "../src/renderer/path-launcher.mjs";
import { HELPER_SH, HELPER_PS1 } from "../src/renderer/helper-scripts.generated.mjs";

describe("offline helper launch commands", () => {
  it("embeds the exact bundled scripts without trusting captured command text", () => {
    const hosts = ["a.example.com", "a.example.com", "198.51.100.1", "$(touch /tmp/pwn)", "x'; whoami; '", "-NoProbe", "https://example.com/?token=secret", "bad\nhost"];
    const { sh, ps } = buildPathLaunchers(hosts);
    assert.equal(Buffer.from(sh.match(/printf '%s' '([^']+)'/)[1], "base64").toString("utf8"), HELPER_SH);
    assert.equal(Buffer.from(ps.match(/FromBase64String\('([^']+)'\)/)[1], "base64").toString("utf8"), HELPER_PS1);
    assert.ok(sh.endsWith("'a.example.com' '198.51.100.1'"));
    assert.ok(ps.endsWith("-Hosts @('a.example.com','198.51.100.1')"));
    for (const command of [sh, ps]) {
      assert.ok(!/[\r\n]/.test(command), "one pasted line");
      for (const invalid of hosts.slice(3)) assert.ok(!command.includes(invalid));
    }
  });

  it("passes the decoded script and literal arguments to bash", { skip: process.platform === "win32" }, () => {
    const folder = mkdtempSync(join(tmpdir(), "socketmap-launcher-"));
    try {
      // Replace only the final interpreter, so this check performs no helper probes or settings reads.
      writeFileSync(join(folder, "bash"), '#!/usr/bin/env node\nlet input=""; process.stdin.setEncoding("utf8"); process.stdin.on("data", x => input += x); process.stdin.on("end", () => console.log(JSON.stringify({ input, args: process.argv.slice(2) })));\n', { mode: 0o700 });
      const result = spawnSync("/bin/bash", ["-c", buildPathLaunchers(["a.example.com", "b.example.com"]).sh], { encoding: "utf8", env: { ...process.env, PATH: `${folder}:${dirname(process.execPath)}:/usr/bin:/bin` } });
      assert.equal(result.status, 0, result.stderr);
      const actual = JSON.parse(result.stdout);
      assert.equal(actual.input, HELPER_SH);
      assert.deepEqual(actual.args, ["-s", "--", "--out", `${process.env.HOME}/socketmap-path.json`, "a.example.com", "b.example.com"]);
    } finally { rmSync(folder, { recursive: true, force: true }); }
  });

  it("passes a literal host array to PowerShell without running the helper", { skip: process.platform !== "win32" && !process.env.SOCKETMAP_POWERSHELL }, () => {
    const harmless = "param([string[]]$Hosts,[string]$Out) @{hosts=@($Hosts);out=$Out} | ConvertTo-Json -Compress";
    const command = buildPathLaunchers(["a.example.com", "b.example.com"]).ps.replace(/FromBase64String\('[^']+'\)/, `FromBase64String('${Buffer.from(harmless).toString("base64")}')`);
    const result = spawnSync(process.env.SOCKETMAP_POWERSHELL || "powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const actual = JSON.parse(result.stdout.replace(/^\uFEFF/, ""));
    assert.deepEqual(actual.hosts, ["a.example.com", "b.example.com"]);
    assert.equal(actual.out, join(homedir(), "socketmap-path.json"));
  });

  it("keeps commands reviewable and manual copying available offline", () => {
    const html = renderPathLauncher(["example.com"]);
    assert.ok(html.includes('data-copy-from="path-launch-sh"'));
    assert.ok(html.includes('data-copy-from="path-launch-ps"'));
    assert.ok(html.includes('id="path-launch-sh"'));
    assert.ok(html.includes('id="path-launch-ps"'));
    assert.ok(!/\b(?:src|href)="https?:/i.test(html));
    assert.ok(html.includes("Commands run only when you paste them"));
  });
});
