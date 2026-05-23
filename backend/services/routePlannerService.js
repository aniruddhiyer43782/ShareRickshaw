/**
 * Grounded route planning helpers for ShareRickshaw.
 *
 * This service deliberately keeps the deterministic transport logic separate
 * from the Gemini call. The paper can describe this as a grounded planning
 * layer: live stand data is scored first, then any LLM output is validated
 * against the same evidence before it is shown to a passenger.
 */

const MUMBAI_BOUNDS = {
  minLat: 18.8,
  maxLat: 19.3,
  minLng: 72.7,
  maxLng: 73.0,
};

const ALLOWED_MODES = new Set(["WALK", "TRAIN", "SHARED_AUTO", "AUTO"]);

const WESTERN_LINE_STATIONS = [
  { name: "Churchgate", latitude: 18.9322, longitude: 72.8264 },
  { name: "Marine Lines", latitude: 18.9440, longitude: 72.8236 },
  { name: "Charni Road", latitude: 18.9518, longitude: 72.8184 },
  { name: "Grant Road", latitude: 18.9629, longitude: 72.8145 },
  { name: "Mumbai Central", latitude: 18.9697, longitude: 72.8194 },
  { name: "Dadar", latitude: 19.0189, longitude: 72.8424 },
  { name: "Bandra", latitude: 19.0544, longitude: 72.8406 },
  { name: "Andheri", latitude: 19.1197, longitude: 72.8464 },
  { name: "Malad", latitude: 19.1869, longitude: 72.8486 },
  { name: "Borivali", latitude: 19.2307, longitude: 72.8567 },
];

const DEFAULT_RANKING_WEIGHTS = Object.freeze({
  time: 0.42,
  cost: 0.26,
  access: 0.18,
  trust: 0.14,
});

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCoordinateSet(startLat, startLng, endLat, endLng) {
  const coords = {
    startLat: toNumber(startLat),
    startLng: toNumber(startLng),
    endLat: toNumber(endLat),
    endLng: toNumber(endLng),
  };

  const invalid = Object.entries(coords).find(([, value]) => value === null);
  if (invalid) {
    return { valid: false, message: `${invalid[0]} must be a valid number.` };
  }

  const points = [
    { lat: coords.startLat, lng: coords.startLng, label: "start" },
    { lat: coords.endLat, lng: coords.endLng, label: "end" },
  ];
  const outOfBounds = points.find(
    (point) =>
      point.lat < MUMBAI_BOUNDS.minLat ||
      point.lat > MUMBAI_BOUNDS.maxLat ||
      point.lng < MUMBAI_BOUNDS.minLng ||
      point.lng > MUMBAI_BOUNDS.maxLng
  );
  if (outOfBounds) {
    return {
      valid: false,
      message: `${outOfBounds.label} coordinate is outside the supported Mumbai prototype bounds.`,
    };
  }

  return { valid: true, coords };
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const radiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseTravelMinutes(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const match = String(value || "").match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) : 12;
}

function estimateWalkMinutes(distanceKm) {
  return Math.max(1, Math.round(distanceKm * 14));
}

function estimateDirectAutoFare(distanceKm) {
  // Prototype fare heuristic for comparison only. It is intentionally labelled
  // as an estimate in API metadata and should not be cited as an RTO tariff.
  return Math.max(23, Math.round(23 + Math.max(0, distanceKm - 1.5) * 18));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isNightTravel(departureTime = new Date()) {
  const date = departureTime instanceof Date ? departureTime : new Date(departureTime);
  const hour = Number.isFinite(date.getHours()) ? date.getHours() : 12;
  return hour >= 22 || hour < 6;
}

function computeTrustFeatures(candidate, options = {}) {
  const nightTravel = Boolean(options.nightTravel);
  const accessKm = Number(candidate.walkToStandKm || 0);
  const egressKm = Number(candidate.walkFromDropKm || 0);
  const fixedRouteKnown = Boolean(candidate.route && candidate.route.destination);
  const standKnown = Boolean(candidate.stand && candidate.stand.name);
  const coordinateKnown =
    Number.isFinite(Number(candidate.route && candidate.route.destination_lat)) &&
    Number.isFinite(Number(candidate.route && candidate.route.destination_lng));

  const longAccessPenalty = clamp((accessKm - 0.7) / 1.8, 0, 1) * 18;
  const longEgressPenalty = clamp((egressKm - 0.7) / 1.8, 0, 1) * 18;
  const nightPenalty = nightTravel ? clamp((accessKm + egressKm) / 2, 0, 1.5) * 12 : 0;
  const evidenceBonus = (fixedRouteKnown ? 8 : 0) + (standKnown ? 8 : 0) + (coordinateKnown ? 6 : 0);

  const trustScore = clamp(74 + evidenceBonus - longAccessPenalty - longEgressPenalty - nightPenalty, 0, 100);

  return {
    trustScore: Number(trustScore.toFixed(1)),
    nightTravel,
    evidence: {
      fixedRouteKnown,
      standKnown,
      coordinateKnown,
    },
    riskFlags: [
      accessKm > 1.2 ? "long_walk_to_stand" : null,
      egressKm > 1.2 ? "long_walk_from_drop" : null,
      nightTravel && accessKm + egressKm > 1.2 ? "night_first_last_mile" : null,
    ].filter(Boolean),
  };
}

function rankRouteCandidates(candidates, options = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];

  const weights = { ...DEFAULT_RANKING_WEIGHTS, ...(options.weights || {}) };
  const maxTime = Math.max(...candidates.map((candidate) => candidate.totalTravelTimeMinutes || 1), 1);
  const maxCost = Math.max(...candidates.map((candidate) => candidate.estimatedCostRupees || 1), 1);
  const maxAccess = Math.max(
    ...candidates.map((candidate) => (candidate.walkToStandKm || 0) + (candidate.walkFromDropKm || 0)),
    1
  );

  return candidates
    .map((candidate) => {
      const trust = computeTrustFeatures(candidate, options);
      const accessKm = (candidate.walkToStandKm || 0) + (candidate.walkFromDropKm || 0);
      const normalizedTime = (candidate.totalTravelTimeMinutes || maxTime) / maxTime;
      const normalizedCost = (candidate.estimatedCostRupees || maxCost) / maxCost;
      const normalizedAccess = accessKm / maxAccess;
      const normalizedTrustRisk = 1 - trust.trustScore / 100;
      const compositeScore =
        weights.time * normalizedTime +
        weights.cost * normalizedCost +
        weights.access * normalizedAccess +
        weights.trust * normalizedTrustRisk;

      return {
        ...candidate,
        ranking: {
          algorithm: "trust-aware-shared-auto-ranking-v1",
          compositeScore: Number(compositeScore.toFixed(4)),
          trustScore: trust.trustScore,
          riskFlags: trust.riskFlags,
          weights,
        },
      };
    })
    .sort((a, b) => a.ranking.compositeScore - b.ranking.compositeScore);
}

function buildDirectAutoOption(coords) {
  const distanceKm = haversineKm(
    coords.startLat,
    coords.startLng,
    coords.endLat,
    coords.endLng
  );
  const roadFactor = 1.35;
  const estimatedRoadKm = distanceKm * roadFactor;
  const totalTravelTimeMinutes = Math.max(8, Math.round((estimatedRoadKm / 18) * 60));
  const estimatedCostRupees = estimateDirectAutoFare(estimatedRoadKm);

  return {
    icon: "AUTO",
    type: "Direct Auto Estimate",
    routeDescription:
      "Point-to-point auto estimate using geodesic distance with a road-network correction factor. The browser map can visualize this option with OSRM.",
    estimatedCostRupees,
    totalTravelTimeMinutes,
    lineColor: "#D94F45",
    evidence: {
      planner: "deterministic-direct-auto",
      distanceKm: Number(estimatedRoadKm.toFixed(2)),
      fareModel: "prototype-distance-heuristic",
      limitations: [
        "Backend does not call OSRM for this estimate.",
        "Traffic and official meter waiting charges are not modelled.",
      ],
    },
    steps: [
      {
        mode: "AUTO",
        instruction: "Take a direct private auto from pickup to destination.",
        durationMinutes: totalTravelTimeMinutes,
        costRupees: estimatedCostRupees,
      },
    ],
  };
}

function flattenStandRoutes(standsData) {
  const rows = [];
  for (const stand of standsData || []) {
    for (const route of stand.routes || []) {
      if (route.destination_lat == null || route.destination_lng == null) continue;
      rows.push({ stand, route });
    }
  }
  return rows;
}

function findSharedAutoCandidates(coords, standsData, limit = 3) {
  return flattenStandRoutes(standsData)
    .map(({ stand, route }) => {
      const walkToStandKm = haversineKm(
        coords.startLat,
        coords.startLng,
        stand.latitude,
        stand.longitude
      );
      const walkFromDropKm = haversineKm(
        route.destination_lat,
        route.destination_lng,
        coords.endLat,
        coords.endLng
      );
      const routeKm = haversineKm(
        stand.latitude,
        stand.longitude,
        route.destination_lat,
        route.destination_lng
      );
      const walkMinutes = estimateWalkMinutes(walkToStandKm) + estimateWalkMinutes(walkFromDropKm);
      const routeMinutes = parseTravelMinutes(route.travel_time);
      const totalTravelTimeMinutes = walkMinutes + routeMinutes;
      const estimatedCostRupees = Number(route.fare);
      const accessPenalty = walkToStandKm + walkFromDropKm;
      const score = totalTravelTimeMinutes + estimatedCostRupees * 0.35 + accessPenalty * 12;

      return {
        stand,
        route,
        score: Number(score.toFixed(2)),
        walkToStandKm: Number(walkToStandKm.toFixed(2)),
        walkFromDropKm: Number(walkFromDropKm.toFixed(2)),
        routeKm: Number(routeKm.toFixed(2)),
        totalTravelTimeMinutes,
        estimatedCostRupees,
      };
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, limit);
}

function buildSharedAutoOption(candidate) {
  if (!candidate) return null;
  const { stand, route } = candidate;
  const accessMinutes = estimateWalkMinutes(candidate.walkToStandKm);
  const egressMinutes = estimateWalkMinutes(candidate.walkFromDropKm);
  const routeMinutes = parseTravelMinutes(route.travel_time);

  return {
    icon: "SHARED_AUTO",
    type: "Grounded Shared Auto Candidate",
    routeDescription: `Walk to ${stand.name}, take the shared auto towards ${route.destination}, then walk from the drop point to the destination.`,
    estimatedCostRupees: candidate.estimatedCostRupees,
    totalTravelTimeMinutes: candidate.totalTravelTimeMinutes,
    lineColor: "#2E8B57",
    evidence: {
      planner: "deterministic-stand-route-score",
      standId: stand.id,
      standName: stand.name,
      routeId: route.id,
      destination: route.destination,
      score: candidate.score,
      walkToStandKm: candidate.walkToStandKm,
      sharedRouteKm: candidate.routeKm,
      walkFromDropKm: candidate.walkFromDropKm,
      ranking: candidate.ranking || null,
    },
    steps: [
      {
        mode: "WALK",
        instruction: `Walk to ${stand.name}.`,
        durationMinutes: accessMinutes,
        costRupees: 0,
      },
      {
        mode: "SHARED_AUTO",
        instruction: `Take shared auto from ${stand.name} to ${route.destination}.`,
        durationMinutes: routeMinutes,
        costRupees: Number(route.fare),
      },
      {
        mode: "WALK",
        instruction: "Walk from the shared-auto drop point to the destination.",
        durationMinutes: egressMinutes,
        costRupees: 0,
      },
    ],
  };
}

function nearestWesternLineStation(lat, lng) {
  return WESTERN_LINE_STATIONS.map((station) => ({
    ...station,
    distanceKm: haversineKm(lat, lng, station.latitude, station.longitude),
  })).sort((a, b) => a.distanceKm - b.distanceKm)[0];
}

function buildFallbackMultimodalRoute(coords, standsData) {
  const candidates = findSharedAutoCandidates(coords, standsData, 1);
  if (candidates.length > 0) {
    const option = buildSharedAutoOption(candidates[0]);
    option.type = "Grounded Multimodal Fallback";
    option.routeDescription =
      `${option.routeDescription} This fallback was generated without an external LLM call.`;
    option.evidence.planner = "deterministic-fallback";
    return option;
  }

  const startStation = nearestWesternLineStation(coords.startLat, coords.startLng);
  const endStation = nearestWesternLineStation(coords.endLat, coords.endLng);
  const trainKm = haversineKm(
    startStation.latitude,
    startStation.longitude,
    endStation.latitude,
    endStation.longitude
  );
  const trainMinutes = Math.max(8, Math.round((trainKm / 32) * 60));
  const walkStartMinutes = estimateWalkMinutes(startStation.distanceKm);
  const walkEndMinutes = estimateWalkMinutes(endStation.distanceKm);

  return {
    icon: "TRAIN",
    type: "Grounded Train Fallback",
    routeDescription: `Walk to ${startStation.name}, take the Western Line to ${endStation.name}, then walk to the destination.`,
    estimatedCostRupees: 15,
    totalTravelTimeMinutes: walkStartMinutes + trainMinutes + walkEndMinutes,
    lineColor: "#F2A900",
    evidence: {
      planner: "deterministic-train-fallback",
      startStation: startStation.name,
      endStation: endStation.name,
      trainDistanceKm: Number(trainKm.toFixed(2)),
    },
    steps: [
      {
        mode: "WALK",
        instruction: `Walk to ${startStation.name} station.`,
        durationMinutes: walkStartMinutes,
        costRupees: 0,
      },
      {
        mode: "TRAIN",
        instruction: `Take the Western Line from ${startStation.name} to ${endStation.name}.`,
        durationMinutes: trainMinutes,
        costRupees: 15,
      },
      {
        mode: "WALK",
        instruction: `Walk from ${endStation.name} station to the destination.`,
        durationMinutes: walkEndMinutes,
        costRupees: 0,
      },
    ],
  };
}

function validateAiRoute(aiRoute, standsData) {
  const warnings = [];
  const knownStandNames = new Set((standsData || []).map((stand) => stand.name.toLowerCase()));
  const knownDestinations = new Set(
    flattenStandRoutes(standsData).map(({ route }) => route.destination.toLowerCase())
  );
  const text = JSON.stringify(aiRoute || {}).toLowerCase();

  if (!aiRoute || typeof aiRoute !== "object") {
    return { valid: false, groundingScore: 0, warnings: ["AI route is not an object."] };
  }

  if (!Array.isArray(aiRoute.steps) || aiRoute.steps.length === 0) {
    warnings.push("AI route contains no executable steps.");
  }

  for (const step of aiRoute.steps || []) {
    if (!ALLOWED_MODES.has(step.mode)) {
      warnings.push(`Unsupported transport mode returned: ${step.mode}`);
    }
  }

  const sharedAutoSteps = (aiRoute.steps || []).filter((step) => step.mode === "SHARED_AUTO");
  if (sharedAutoSteps.length > 0) {
    const mentionsKnownStand = Array.from(knownStandNames).some((name) => text.includes(name));
    const mentionsKnownDestination = Array.from(knownDestinations).some((name) => text.includes(name));
    if (!mentionsKnownStand) warnings.push("Shared-auto step does not mention a known stand.");
    if (!mentionsKnownDestination) warnings.push("Shared-auto step does not mention a known database destination.");
  }

  const stepCost = (aiRoute.steps || []).reduce((sum, step) => sum + (Number(step.costRupees) || 0), 0);
  const stepTime = (aiRoute.steps || []).reduce((sum, step) => sum + (Number(step.durationMinutes) || 0), 0);

  if (stepCost > 0 && Math.abs(stepCost - Number(aiRoute.estimatedCostRupees || 0)) > 5) {
    warnings.push("Total cost does not match the sum of step costs.");
  }
  if (stepTime > 0 && Math.abs(stepTime - Number(aiRoute.totalTravelTimeMinutes || 0)) > 5) {
    warnings.push("Total time does not match the sum of step durations.");
  }

  const groundingScore = Math.max(0, 1 - warnings.length * 0.2);
  return {
    valid: groundingScore >= 0.6,
    groundingScore: Number(groundingScore.toFixed(2)),
    warnings,
    normalizedTotals: {
      estimatedCostRupees: stepCost || Number(aiRoute.estimatedCostRupees || 0),
      totalTravelTimeMinutes: stepTime || Number(aiRoute.totalTravelTimeMinutes || 0),
    },
  };
}

function attachValidation(aiRoute, standsData) {
  const validation = validateAiRoute(aiRoute, standsData);
  return {
    ...aiRoute,
    estimatedCostRupees: Math.round(validation.normalizedTotals.estimatedCostRupees),
    totalTravelTimeMinutes: Math.round(validation.normalizedTotals.totalTravelTimeMinutes),
    evidence: {
      planner: "gemini-structured-output",
      groundingScore: validation.groundingScore,
      validationWarnings: validation.warnings,
      accepted: validation.valid,
    },
  };
}

module.exports = {
  normalizeCoordinateSet,
  buildDirectAutoOption,
  findSharedAutoCandidates,
  rankRouteCandidates,
  computeTrustFeatures,
  isNightTravel,
  buildSharedAutoOption,
  buildFallbackMultimodalRoute,
  attachValidation,
  validateAiRoute,
  haversineKm,
  parseTravelMinutes,
};
