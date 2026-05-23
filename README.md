# ShareRickshaw

ShareRickshaw is a web prototype for digitising Mumbai-style shared autorickshaw travel. It combines passenger booking, driver workflows, fixed-route stand data, fare estimation, safety tools, and an AI-assisted multimodal route planner.

## Research-safe positioning

This repository should be described as a controlled prototype, not a production deployment. The strongest research contribution is the grounded route-planning pipeline:

1. Load live stand and fixed-route data from MySQL.
2. Score deterministic shared-auto candidates from access distance, fixed route fare, route time, and destination distance.
3. Generate an optional structured Gemini route.
4. Validate AI output against known stands, destinations, allowed modes, and cost/time totals.
5. Fall back to deterministic routing when the AI call is unavailable or weakly grounded.
6. Re-rank shared-auto candidates with a trust-aware heuristic that exposes long first/last-mile walking and night-travel risk.

See:

- `backend/services/routePlannerService.js`
- `docs/IEEE_RESEARCH_UPGRADE_PLAN.md`
- `docs/TRUST_AWARE_ROUTING.md`
- `docs/CONFERENCE_READINESS_CHECKLIST.md`
- `docs/PAPER_CLAIM_AUDIT.md`
- `docs/EXPERIMENT_PROTOCOL.md`

## Main modules

- `backend/` - Node.js/Express API, Socket.IO, MySQL controllers, Gemini service.
- `route-finder.html` and `route-finder.js` - browser route finder using Leaflet.
- `booking.html`, `driver-dashboard.html`, `js/booking*.js` - passenger and driver booking flows.
- `safety.html`, `safety.js` - SOS, emergency contacts, license-plate capture, night tracking.
- `admin/` - stand and route management.
- `evaluation/` - scripts and templates for generating real paper evidence.

## Local backend

```powershell
cd backend
npm install
npm start
```

The API runs on `http://localhost:3000/api` by default.

## Local frontend

Serve the repository root with a static server, for example:

```powershell
py -m http.server 5500
```

Then open `http://localhost:5500`.

## Evidence collection for paper

Do not invent performance or accuracy numbers. Use:

```powershell
node evaluation\run_offline_route_evaluation.js
node evaluation\run_ieee_evidence_analysis.js
node evaluation\run_api_latency.js --token YOUR_JWT --iterations 100
node evaluation\run_route_cases.js --token YOUR_JWT
```

Latest offline seeded-data result:

- 7 valid route cases
- mean evidence recall: 1.0
- mean trust score: 94.99
- trust-aware ranking changed the baseline top candidate in 3 cases
- selected shared-auto options showed 53% to 71% fare savings over direct-auto estimates, with 58% mean saving
- file: `evaluation/results/offline_route_eval_2026-05-23T14-45-16-694Z.json`
- IEEE evidence summary: `evaluation/results/ieee_evidence_summary_2026-05-23T14-45-16-782Z.md`
- scatter figure: `docs/figures/trust_composite_scatter_2026-05-23T14-45-16-782Z.svg`

## Paper draft

Generated IEEE-style draft:

- `docs/ShareRickshaw_IEEE_camera_ready_draft.docx`
- `docs/ShareRickshaw_IEEE_camera_ready_draft.pdf`

Regenerate the draft after evidence updates:

```powershell
py -m pip install -r docs\paper_requirements.txt
py docs\build_ieee_paper.py
```

The paper includes embedded architecture, trust-ranking pipeline, and scatter-plot figures. It does not fabricate usability-study results; collect real responses with `docs/MICRO_USER_STUDY_PACKET.md`, enter them in `evaluation/user_study_responses_template.csv`, then run:

```powershell
node evaluation\run_user_study_analysis.js evaluation\user_study_responses_template.csv
```

Label this honestly as offline seeded-data evaluation. Then score routes with `evaluation/route_quality_rubric.md`, fill ALPR results in `evaluation/alpr_results_template.csv`, and use `evaluation/user_study_form.md` for a small formative user study.
