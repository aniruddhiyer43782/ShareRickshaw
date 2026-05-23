#!/usr/bin/env node
/**
 * Runs route-planner test cases and saves raw JSON outputs for manual scoring.
 */

const fs = require("fs");
const path = require("path");

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const base = arg("base", "http://localhost:3000/api").replace(/\/$/, "");
const token = arg("token", process.env.SHARERICKSHAW_TOKEN || "");
const casesPath = arg("cases", path.join(__dirname, "route_planner_cases.json"));
const cases = JSON.parse(fs.readFileSync(casesPath, "utf8"));

async function main() {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const results = [];
  for (const testCase of cases) {
    const response = await fetch(`${base}/routes/multimodal`, {
      method: "POST",
      headers,
      body: JSON.stringify(testCase),
    });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
    results.push({
      id: testCase.id,
      status: response.status,
      ok: response.ok,
      expectedEvidence: testCase.expectedEvidence,
      response: body,
    });
    console.log(`${testCase.id}: HTTP ${response.status}`);
  }

  const resultsDir = path.join(__dirname, "results");
  fs.mkdirSync(resultsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(resultsDir, `route_cases_${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});