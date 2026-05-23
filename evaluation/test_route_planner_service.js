#!/usr/bin/env node
const assert = require("assert");
const {
  normalizeCoordinateSet,
  findSharedAutoCandidates,
  rankRouteCandidates,
  buildSharedAutoOption,
  validateAiRoute,
} = require("../backend/services/routePlannerService");

const stands = [
  {
    id: 1,
    name: "Bandra Station West",
    latitude: 19.0544,
    longitude: 72.8406,
    routes: [
      {
        id: 1,
        destination: "Pali Hill",
        fare: 25,
        travel_time: "12 mins",
        destination_lat: 19.063,
        destination_lng: 72.829,
      },
    ],
  },
  {
    id: 2,
    name: "Andheri Station East",
    latitude: 19.1197,
    longitude: 72.8464,
    routes: [
      {
        id: 2,
        destination: "MIDC",
        fare: 20,
        travel_time: "15 mins",
        destination_lat: 19.1203,
        destination_lng: 72.868,
      },
    ],
  },
];

const normalized = normalizeCoordinateSet(19.0544, 72.8406, 19.063, 72.829);
assert.strictEqual(normalized.valid, true);

const candidates = findSharedAutoCandidates(normalized.coords, stands, 2);
assert.strictEqual(candidates.length, 2);
assert.strictEqual(candidates[0].stand.name, "Bandra Station West");

const ranked = rankRouteCandidates(candidates, { nightTravel: true });
assert.ok(ranked[0].ranking.trustScore >= 0);
assert.ok(ranked[0].ranking.compositeScore >= 0);

const option = buildSharedAutoOption(ranked[0]);
assert.strictEqual(option.evidence.ranking.algorithm, "trust-aware-shared-auto-ranking-v1");
assert.ok(Array.isArray(option.evidence.ranking.riskFlags));

const aiValidation = validateAiRoute(
  {
    steps: [
      {
        mode: "WALK",
        instruction: "Walk to Bandra Station West.",
        durationMinutes: 2,
        costRupees: 0,
      },
      {
        mode: "SHARED_AUTO",
        instruction: "Take shared auto from Bandra Station West to Pali Hill.",
        durationMinutes: 12,
        costRupees: 25,
      },
    ],
    estimatedCostRupees: 25,
    totalTravelTimeMinutes: 14,
  },
  stands
);
assert.strictEqual(aiValidation.valid, true);

console.log("routePlannerService regression checks passed");
