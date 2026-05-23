#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const inputPath = process.argv[2] || path.join(__dirname, "user_study_responses_template.csv");

function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(",");
  return lines.map((line) => {
    const values = line.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sd(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1));
}

function metric(rows, key) {
  const values = rows
    .map((row) => Number(row[key]))
    .filter((value) => Number.isFinite(value) && value >= 1 && value <= 5);
  if (values.length === 0) return null;
  return {
    n: values.length,
    mean: Number(mean(values).toFixed(2)),
    sd: Number(sd(values).toFixed(2)),
  };
}

const rows = parseCsv(fs.readFileSync(inputPath, "utf8"));
const summary = {
  input: path.relative(process.cwd(), inputPath),
  generatedAt: new Date().toISOString(),
  routeUnderstandability: metric(rows, "route_understandability"),
  fareTransparencyTrust: metric(rows, "fare_transparency_trust"),
  sosNightTrackingSafety: metric(rows, "sos_night_tracking_safety"),
};

const missing = Object.entries(summary)
  .filter(([, value]) => value === null)
  .map(([key]) => key);

if (missing.length > 0) {
  console.error(
    `No complete Likert data found for: ${missing.join(", ")}. Fill ${inputPath} with real 1-5 responses first.`
  );
  process.exit(1);
}

console.log(JSON.stringify(summary, null, 2));
