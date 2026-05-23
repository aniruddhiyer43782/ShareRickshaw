#!/usr/bin/env node
/**
 * API latency runner for the IEEE paper.
 *
 * Usage:
 *   node evaluation/run_api_latency.js --base http://localhost:3000/api --token JWT --iterations 100
 *
 * The script writes CSV to evaluation/results/api_latency_<timestamp>.csv.
 */

const fs = require("fs");
const path = require("path");
const { performance } = require("perf_hooks");

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const base = arg("base", "http://localhost:3000/api").replace(/\/$/, "");
const token = arg("token", process.env.SHARERICKSHAW_TOKEN || "");
const iterations = Number(arg("iterations", "30"));

const headers = {
  "Content-Type": "application/json",
};
if (token) headers.Authorization = `Bearer ${token}`;

const endpoints = [
  { name: "api_root", method: "GET", url: `${base}` },
  { name: "stands", method: "GET", url: `${base}/stands` },
  {
    name: "multimodal_route",
    method: "POST",
    url: `${base}/routes/multimodal`,
    body: {
      startLat: 19.1197,
      startLng: 72.8464,
      endLat: 19.1869,
      endLng: 72.8486,
    },
  },
];

async function callEndpoint(endpoint) {
  const start = performance.now();
  let status = 0;
  let ok = false;
  let error = "";
  try {
    const response = await fetch(endpoint.url, {
      method: endpoint.method,
      headers,
      body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
    });
    status = response.status;
    ok = response.ok;
    await response.text();
  } catch (err) {
    error = err.message.replaceAll(",", " ");
  }
  return {
    endpoint: endpoint.name,
    method: endpoint.method,
    status,
    ok,
    latency_ms: Number((performance.now() - start).toFixed(2)),
    error,
  };
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

async function main() {
  const rows = [];
  for (const endpoint of endpoints) {
    for (let i = 0; i < iterations; i++) {
      rows.push(await callEndpoint(endpoint));
    }
  }

  const resultsDir = path.join(__dirname, "results");
  fs.mkdirSync(resultsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(resultsDir, `api_latency_${stamp}.csv`);
  const csv = [
    "endpoint,method,status,ok,latency_ms,error",
    ...rows.map((row) =>
      [row.endpoint, row.method, row.status, row.ok, row.latency_ms, row.error].join(",")
    ),
  ].join("\n");
  fs.writeFileSync(outPath, csv);

  console.log(`Wrote ${outPath}`);
  for (const endpoint of endpoints) {
    const subset = rows.filter((row) => row.endpoint === endpoint.name);
    const latencies = subset.map((row) => row.latency_ms);
    console.log(
      `${endpoint.name}: n=${subset.length}, ok=${subset.filter((row) => row.ok).length}, median=${percentile(latencies, 50)}ms, p95=${percentile(latencies, 95)}ms`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});