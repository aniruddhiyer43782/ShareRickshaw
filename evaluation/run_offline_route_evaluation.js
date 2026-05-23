#!/usr/bin/env node
/**
 * Offline evaluation for the grounded route-planning layer.
 *
 * This does not require MySQL, a JWT, or Gemini. It parses backend/database/seed.sql,
 * builds the same stand-route objects used by the API, and runs the deterministic
 * scoring/fallback functions. Use this when DB credentials are unavailable, and label
 * the result as "offline seeded-data evaluation" in the paper.
 */

const fs = require("fs");
const path = require("path");
const {
  normalizeCoordinateSet,
  buildDirectAutoOption,
  findSharedAutoCandidates,
  rankRouteCandidates,
  buildSharedAutoOption,
  buildFallbackMultimodalRoute,
} = require("../backend/services/routePlannerService");

const repoRoot = path.join(__dirname, "..");
const seedPath = path.join(repoRoot, "backend", "database", "seed.sql");
const defaultOfflineCases = path.join(__dirname, "offline_route_cases.json");
const casesPath = fs.existsSync(defaultOfflineCases)
  ? defaultOfflineCases
  : path.join(__dirname, "route_planner_cases.json");

function parseSqlTuple(tuple) {
  const values = [];
  let current = "";
  let inString = false;
  for (let i = 0; i < tuple.length; i++) {
    const char = tuple[i];
    if (char === "'" && tuple[i - 1] !== "\\") {
      inString = !inString;
      continue;
    }
    if (char === "," && !inString) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current.trim());
  return values.map((value) => {
    if (value.toUpperCase && value.toUpperCase() === "NULL") return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) && value !== "" ? numeric : value;
  });
}

function extractTuplesFromValues(valuesBlock) {
  const tuples = [];
  let depth = 0;
  let inString = false;
  let current = "";
  for (let i = 0; i < valuesBlock.length; i++) {
    const char = valuesBlock[i];
    if (char === "'" && valuesBlock[i - 1] !== "\\") {
      inString = !inString;
    }
    if (char === "(" && !inString) {
      if (depth === 0) {
        current = "";
      } else {
        current += char;
      }
      depth += 1;
      continue;
    }
    if (char === ")" && !inString) {
      depth -= 1;
      if (depth === 0) {
        tuples.push(parseSqlTuple(current));
        current = "";
      } else {
        current += char;
      }
      continue;
    }
    if (depth > 0) {
      current += char;
    }
  }
  return tuples;
}
function extractTuplesForTable(sql, tableName) {
  const tuples = [];
  const statementRegex = new RegExp(
    `INSERT\\s+INTO\\s+${tableName}\\s*\\([^)]*\\)\\s*VALUES\\s*([\\s\\S]*?);`,
    "gi"
  );
  let statement;
  while ((statement = statementRegex.exec(sql))) {
    const valuesBlock = statement[1];
    tuples.push(...extractTuplesFromValues(valuesBlock));
  }
  return tuples;
}

function loadSeededStands() {
  const sql = fs.readFileSync(seedPath, "utf8");
  const standRows = extractTuplesForTable(sql, "stands").filter(
    (row) => row.length >= 4 && Number.isFinite(Number(row[1])) && Number.isFinite(Number(row[2]))
  );
  const routeRows = extractTuplesForTable(sql, "routes").filter(
    (row) =>
      row.length >= 6 &&
      Number.isFinite(Number(row[0])) &&
      Number.isFinite(Number(row[2])) &&
      Number.isFinite(Number(row[4])) &&
      Number.isFinite(Number(row[5]))
  );

  const stands = standRows.map((row, index) => ({
    id: index + 1,
    name: row[0],
    latitude: Number(row[1]),
    longitude: Number(row[2]),
    operating_hours: row[3],
    routes: [],
  }));

  routeRows.forEach((row, index) => {
    const stand = stands.find((item) => item.id === Number(row[0]));
    if (!stand) return;
    stand.routes.push({
      id: index + 1,
      destination: row[1],
      fare: Number(row[2]),
      travel_time: row[3],
      destination_lat: Number(row[4]),
      destination_lng: Number(row[5]),
    });
  });

  return stands;
}

function evaluateCase(testCase, standsData) {
  const normalized = normalizeCoordinateSet(
    testCase.startLat,
    testCase.startLng,
    testCase.endLat,
    testCase.endLng
  );
  if (!normalized.valid) {
    return {
      id: testCase.id,
      valid: false,
      reason: normalized.message,
    };
  }

  const direct = buildDirectAutoOption(normalized.coords);
  const baselineCandidates = findSharedAutoCandidates(normalized.coords, standsData, 5);
  const rankedCandidates = rankRouteCandidates(baselineCandidates, {
    nightTravel: Boolean(testCase.nightTravel),
  });
  const shared = buildSharedAutoOption(rankedCandidates[0]);
  const fallback = buildFallbackMultimodalRoute(normalized.coords, standsData);

  const expected = testCase.expectedEvidence || [];
  const routeText = JSON.stringify({ shared, fallback }).toLowerCase();
  const matchedEvidence = expected.filter((term) =>
    routeText.includes(String(term).toLowerCase())
  );

  return {
    id: testCase.id,
    valid: true,
    expectedEvidence: expected,
    matchedEvidence,
    evidenceRecall:
      expected.length === 0 ? 1 : Number((matchedEvidence.length / expected.length).toFixed(2)),
    direct: {
      type: direct.type,
      estimatedCostRupees: direct.estimatedCostRupees,
      totalTravelTimeMinutes: direct.totalTravelTimeMinutes,
      distanceKm: direct.evidence.distanceKm,
    },
    bestSharedAuto: shared
      ? {
          type: shared.type,
          routeDescription: shared.routeDescription,
          estimatedCostRupees: shared.estimatedCostRupees,
          totalTravelTimeMinutes: shared.totalTravelTimeMinutes,
          evidence: shared.evidence,
        }
      : null,
    fallback: {
      type: fallback.type,
      estimatedCostRupees: fallback.estimatedCostRupees,
      totalTravelTimeMinutes: fallback.totalTravelTimeMinutes,
      evidence: fallback.evidence,
    },
    baselineBest: baselineCandidates[0]
      ? {
          standName: baselineCandidates[0].stand.name,
          destination: baselineCandidates[0].route.destination,
          score: baselineCandidates[0].score,
          trustScore: rankRouteCandidates([baselineCandidates[0]], {
            nightTravel: Boolean(testCase.nightTravel),
          })[0].ranking.trustScore,
        }
      : null,
    trustAwareBest: rankedCandidates[0]
      ? {
          standName: rankedCandidates[0].stand.name,
          destination: rankedCandidates[0].route.destination,
          compositeScore: rankedCandidates[0].ranking.compositeScore,
          trustScore: rankedCandidates[0].ranking.trustScore,
          riskFlags: rankedCandidates[0].ranking.riskFlags,
        }
      : null,
    topCandidateScores: rankedCandidates.slice(0, 3).map((candidate) => ({
      standName: candidate.stand.name,
      destination: candidate.route.destination,
      score: candidate.score,
      compositeScore: candidate.ranking.compositeScore,
      trustScore: candidate.ranking.trustScore,
      riskFlags: candidate.ranking.riskFlags,
      walkToStandKm: candidate.walkToStandKm,
      walkFromDropKm: candidate.walkFromDropKm,
      fare: candidate.estimatedCostRupees,
      minutes: candidate.totalTravelTimeMinutes,
    })),
  };
}

function mean(values) {
  if (!values.length) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function main() {
  const standsData = loadSeededStands();
  const cases = JSON.parse(fs.readFileSync(casesPath, "utf8"));
  const results = cases.map((testCase) => evaluateCase(testCase, standsData));

  const summary = {
    evaluationType: "offline seeded-data route-planner evaluation",
    generatedAt: new Date().toISOString(),
    standsLoaded: standsData.length,
    standRoutesLoaded: standsData.reduce((total, stand) => total + stand.routes.length, 0),
    cases: results.length,
    validCases: results.filter((result) => result.valid).length,
    meanEvidenceRecall: mean(results.filter((r) => r.valid).map((r) => r.evidenceRecall)),
    meanTrustScore: mean(
      results
        .filter((r) => r.valid && r.trustAwareBest)
        .map((r) => r.trustAwareBest.trustScore)
    ),
    baselineChangedByTrustRanking: results.filter(
      (r) =>
        r.valid &&
        r.baselineBest &&
        r.trustAwareBest &&
        (r.baselineBest.standName !== r.trustAwareBest.standName ||
          r.baselineBest.destination !== r.trustAwareBest.destination)
    ).length,
    limitation:
      "This evaluates deterministic planner grounding and trust-aware ranking on seed data only; it does not measure live API latency, MySQL availability, or Gemini response quality.",
  };

  const resultsDir = path.join(__dirname, "results");
  fs.mkdirSync(resultsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(resultsDir, `offline_route_eval_${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ summary, results }, null, 2));

  console.log(JSON.stringify(summary, null, 2));
  console.log(`Wrote ${outPath}`);
}

main();
