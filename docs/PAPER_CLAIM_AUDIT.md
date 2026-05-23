# Paper Claim Audit

This file separates claims that are implemented from claims that still need evidence.

## Implemented and defensible

| Claim | Evidence in repo |
|---|---|
| JWT authentication for users/admin/autowalas | `backend/controllers/authController.js`, `backend/middleware/auth.js` |
| Role-aware booking and driver workflows | `backend/controllers/bookingsController.js`, frontend dashboard files |
| Socket.IO booking notifications | `backend/server.js`, `backend/services/socketEmitter.js` |
| MySQL-backed stands and fixed-route registry | `backend/database/schema.sql`, `backend/database/seed.sql` |
| Gemini Vision license plate extraction | `backend/services/geminiService.js`, `backend/controllers/safetyController.js` |
| SOS email alerts | `backend/controllers/safetyController.js`, `backend/services/emailService.js` |
| Structured JSON route generation | `backend/services/geminiService.js` |
| Grounding and validation layer for route outputs | `backend/services/routePlannerService.js` |

## Must be measured before being claimed as results

| Claim | Required evidence |
|---|---|
| REST latency values | Run `node evaluation/run_api_latency.js --token <JWT> --iterations 100` and cite the CSV. |
| WebSocket dispatch latency | Add timestamp instrumentation to passenger and driver clients, run at least 50 trials. |
| Route planner accuracy | Run route cases and score with `evaluation/route_quality_rubric.md`. |
| ALPR accuracy | Fill `evaluation/alpr_results_template.csv` using real plate images and ground truth. |
| User usefulness | Collect 5-10 responses using `evaluation/user_study_form.md`. |

## Claims to avoid unless implemented later

| Avoid this wording | Use this instead |
|---|---|
| "Backend uses OSRM for routing" | "The browser visualizes direct routes using OSRM; backend direct-auto estimates are deterministic." |
| "Production-ready deployment" | "Working prototype suitable for controlled pilot evaluation." |
| "RS-256 JWT" | "JWT signed with the project secret; default jsonwebtoken signing is HS256 unless changed." |
| "RTO-certified fare" | "Prototype fare estimate / database fare lookup." |