# ShareRickshaw IEEE Research Upgrade Plan

## Proposed research framing

ShareRickshaw should be presented as a prototype for digitising informal fixed-corridor paratransit, not as a generic ride-hailing clone.

The strongest contribution is:

> A grounded multimodal route-planning pipeline that combines a live database of informal shared-auto stands, deterministic stand-route scoring, structured LLM route generation, and post-generation validation to reduce hallucinated transit instructions.

## Algorithm: Grounded Structured Multimodal Planning

Inputs:

- Start and destination coordinates
- MySQL stand registry
- MySQL fixed route/fare table
- Optional Gemini API availability

Steps:

1. Validate coordinates against the supported Mumbai prototype bounds.
2. Generate a deterministic direct-auto estimate using corrected geodesic distance.
3. Score every stand-route pair using access walk distance, fixed route fare, route time, and egress walk distance.
4. Return the best grounded shared-auto candidate.
5. Ask Gemini for a structured JSON multimodal route using the live stand registry.
6. Validate the AI output against known stand names, known route destinations, allowed modes, and step-sum totals.
7. If Gemini fails or validation is weak, return a deterministic fallback route.

This is now implemented in:

- `backend/services/routePlannerService.js`
- `backend/controllers/routesController.js`

## Paper changes needed

- Replace unsupported numerical claims with measured results.
- Add the claim audit table from `docs/PAPER_CLAIM_AUDIT.md`.
- Add architecture, booking sequence, and multimodal pipeline diagrams.
- Add a subsection named "Grounded Structured Multimodal Planning".
- Add an honest limitations section.