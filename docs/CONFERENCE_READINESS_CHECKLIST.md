# Conference Readiness Checklist

## Solved problem

ShareRickshaw should be presented as a prototype for reducing uncertainty in informal shared-auto travel. The project solves three practical gaps:

- passengers lack searchable stand-route knowledge
- AI route suggestions can hallucinate unsupported transit legs
- first/last-mile walking risk is not visible in basic fare or distance comparisons

## Novelty to foreground

- Grounded stand-route registry for informal paratransit
- Deterministic route scoring before LLM generation
- Post-generation validation of LLM routes
- Trust-aware ranking for night and first/last-mile travel
- Reproducible offline seeded-data evaluation

## Minimum paper evidence before submission

- Offline route evaluation JSON from `evaluation/results/`
- IEEE evidence summary from `node evaluation\run_ieee_evidence_analysis.js`
- Verified or replaced references using `docs/REFERENCE_VERIFICATION_CHECKLIST.md` and `docs/VERIFIED_REFERENCE_CANDIDATES.md`
- Weight sensitivity sweep table from the generated IEEE evidence summary
- Fare-savings table comparing shared-auto and direct-auto estimates
- Trust score vs composite score scatter figure from `docs/figures/`
- Live REST latency results after MySQL credentials are fixed
- 20-50 manually reviewed route cases using `evaluation/route_quality_rubric.md`
- ALPR labeled test set, even if small, using `evaluation/alpr_results_template.csv`
- 8-12 person formative usability study using `evaluation/user_study_form.md`

## Claims that are currently safe

- The prototype supports stand, route, fare, booking, safety, and multimodal route-planning workflows.
- Shared-auto recommendations are grounded in structured stand-route data.
- AI output is validated before use and has deterministic fallback behavior.
- Offline seeded-data tests can measure evidence recall and candidate ranking behavior.

## Claims that need more work

- Accuracy of route recommendations in the live city
- ALPR recognition performance
- End-to-end production reliability
- Safety impact for real passengers
- Statistical significance over commercial routing systems

## Strong next experiments

1. Build a small gold dataset of 50 Mumbai OD pairs with expected stand-route evidence.
2. Compare four methods: direct auto only, nearest stand only, deterministic shared-auto scoring, trust-aware ranking.
3. Report evidence recall, top-1 route match, estimated fare difference, and uncomfortable-walk flags.
4. Run live API latency after fixing MySQL credentials.
5. Add screenshots of route options with evidence panels for qualitative evaluation.

## Fixes applied after v2 audit

- Added a sensitivity-sweep generator to justify and stress-test the route-ranking weights.
- Added fare-savings quantification from the offline seeded-data cases.
- Added seven-case coverage reporting so the small evaluation set is framed as deliberate coverage rather than broad statistical proof.
- Added a corrected Bandra case explanation that distinguishes trust effects from cost-time trade-off effects.
- Added a formal problem-statement paragraph and a data-governance paragraph for the IEEE rewrite pack.
- Added generated scatter-plot data and SVG output for trust score versus composite score.
