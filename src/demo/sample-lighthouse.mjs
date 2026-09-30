/**
 * A made-up Lighthouse report for the viewer's sample and for tests. Shaped like Lighthouse's JSON
 * (lighthouseVersion, configSettings, categories, audits) with URLs taken from the sample capture.
 * Nothing here was measured.
 */

export function buildSampleLighthouse(model) {
  const page = (model?.pages || []).find(p => p.url && !p.isBackground);
  const requests = (model?.requests || []).filter(r => !r.isBackground && /^https?:/.test(r.url || ""));
  const assets = requests.filter(r => r.requestType !== "main frame").slice(0, 3);
  const [first, second] = assets;
  const audit = (title, score, extra = {}) => ({ title, score, scoreDisplayMode: "numeric", ...extra });
  const items = (list, extra) => list.filter(Boolean).map(r => ({ url: r.url, totalBytes: 90000, ...extra }));
  return {
    lighthouseVersion: "13.0.0 (sample)",
    requestedUrl: page?.url || "https://portal.example.com/",
    finalDisplayedUrl: page?.url || "https://portal.example.com/",
    fetchTime: new Date((Date.parse(model?.environment?.captureStartedAt) || Date.UTC(2026, 8, 29, 12, 0, 0)) + 10 * 60000).toISOString(),
    runWarnings: ["This is a made-up sample. Nothing was measured."],
    configSettings: { formFactor: "mobile", throttlingMethod: "simulate", throttling: { rttMs: 150, throughputKbps: 1638.4, cpuSlowdownMultiplier: 4 } },
    categories: { performance: { id: "performance", title: "Performance", score: 0.58 } },
    audits: {
      "first-contentful-paint": audit("First Contentful Paint", 0.72, { numericValue: 2100, numericUnit: "millisecond" }),
      "largest-contentful-paint": audit("Largest Contentful Paint", 0.31, { numericValue: 4600, numericUnit: "millisecond" }),
      "total-blocking-time": audit("Total Blocking Time", 0.55, { numericValue: 380, numericUnit: "millisecond" }),
      "cumulative-layout-shift": audit("Cumulative Layout Shift", 0.96, { numericValue: 0.04, numericUnit: "unitless" }),
      "speed-index": audit("Speed Index", 0.6, { numericValue: 3900, numericUnit: "millisecond" }),
      "interactive": audit("Time to Interactive", 0.5, { numericValue: 5200, numericUnit: "millisecond" }),
      "unused-javascript": audit("Reduce unused JavaScript", 0.2, { scoreDisplayMode: "metricSavings", numericValue: 610, displayValue: "Est savings of 88 KiB", details: { type: "opportunity", overallSavingsMs: 610, overallSavingsBytes: 90112, items: items([first], { wastedBytes: 90112, totalBytes: 168000 }) } }),
      "render-blocking-insight": audit("Render blocking requests", 0.5, { scoreDisplayMode: "metricSavings", details: { type: "table", items: items([second, first], {}) } }),
      "cache-insight": audit("Use efficient cache lifetimes", 0.4, { scoreDisplayMode: "metricSavings", displayValue: "Est savings of 30 KiB", details: { type: "table", items: items([second], { cacheLifetimeMs: 0, wastedBytes: 30720 }) } }),
      "bootup-time": audit("Reduce JavaScript execution time", 0.5, { scoreDisplayMode: "metricSavings", numericValue: 1400, displayValue: "1.4 s", details: { type: "table", items: [first, second].filter(Boolean).map((r, i) => ({ url: r.url, total: 900 - i * 400, scripting: 700 - i * 300, scriptParseCompile: 120 })) } }),
      "mainthread-work-breakdown": audit("Minimize main-thread work", 0.6, { scoreDisplayMode: "metricSavings", numericValue: 2300, details: { type: "table", items: [{ group: "scriptEvaluation", groupLabel: "Script Evaluation", duration: 1100 }, { group: "styleLayout", groupLabel: "Style & Layout", duration: 620 }, { group: "other", groupLabel: "Other", duration: 380 }, { group: "paintCompositeRender", groupLabel: "Rendering", duration: 200 }] } }),
      "long-tasks": { title: "Avoid long main-thread tasks", score: 0.5, scoreDisplayMode: "informative", details: { type: "table", items: [{ url: first?.url, duration: 240, startTime: 1800 }, { url: second?.url, duration: 120, startTime: 2600 }] } },
      "total-byte-weight": audit("Avoid enormous network payloads", 1, { scoreDisplayMode: "metricSavings", numericValue: 612000, numericUnit: "byte" })
    }
  };
}
