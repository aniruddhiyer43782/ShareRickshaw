# Trust-Aware Routing Note

## Real-world problem

Informal shared-auto systems often work through local knowledge: passengers know which stand to use, which fixed destination name to ask for, and whether the first/last walking segment feels acceptable at a given time of day. New passengers do not have that context. A generic map route can find roads, but it usually cannot prove that a suggested shared-auto segment is tied to a real stand, fixed corridor, fare, and drop point.

ShareRickshaw addresses this gap as a controlled prototype for evidence-backed routing over informal paratransit data.

## Research contribution

The project now has two linked algorithmic layers:

1. **Grounded Structured Multimodal Planning**: rank known stand-route pairs, request optional structured LLM output, validate the LLM result against the stand registry, and fall back to deterministic routing.
2. **Trust-Aware Shared-Auto Ranking**: re-rank shared-auto candidates with a passenger-facing safety/trust score that penalizes long first/last-mile walking, especially at night.

This is more defensible than claiming "AI route planning" because every recommended shared-auto leg can be traced to a database stand and route.

## Trust-aware ranking

For each candidate stand-route pair, the planner computes:

- access distance from passenger origin to stand
- fixed shared-auto route time
- fixed shared-auto fare
- egress distance from route drop point to destination
- evidence completeness for stand name, route destination, and coordinates
- night travel risk flag

The composite ranking score is:

```text
score =
  0.42 * normalized_time +
  0.26 * normalized_cost +
  0.18 * normalized_access_distance +
  0.14 * normalized_trust_risk
```

Lower is better. The trust score is reported on a 0-100 scale and is not a crime prediction or absolute safety guarantee. It is a transparent heuristic for reducing weak, uncomfortable, or poorly grounded recommendations.

Implemented in:

- `backend/services/routePlannerService.js`
- `backend/controllers/routesController.js`
- `evaluation/run_offline_route_evaluation.js`

## What can be claimed

Safe paper wording:

> We implement a trust-aware grounded route planner for informal shared-auto corridors. The planner ranks stand-route candidates using access distance, egress distance, route fare, route time, and an evidence-derived trust score. LLM-generated routes are treated as optional candidates and are validated against the same structured registry before being shown to passengers.

Avoid claiming:

- city-wide coverage
- official fare compliance
- real-time traffic optimization
- verified safety prediction
- ALPR accuracy unless measured with a labeled test set

## Evaluation hooks

Run:

```powershell
node evaluation\run_offline_route_evaluation.js
```

The output includes:

- mean evidence recall
- mean trust score
- count of cases where trust-aware ranking changes the baseline top candidate
- top candidate score table for each test case

Use these as offline seeded-data results only. Live API latency and Gemini quality still require working MySQL credentials and valid API configuration.
