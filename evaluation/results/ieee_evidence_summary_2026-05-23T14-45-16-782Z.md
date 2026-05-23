# IEEE Evidence Summary

Source file: `evaluation\results\offline_route_eval_2026-05-23T14-45-16-694Z.json`

## Fare Savings

Across 7 seeded Mumbai origin-destination cases, the selected grounded shared-auto option costs 53% to 71% less than the direct-auto estimate, with a mean saving of 58% (SD 5%).

| Case | Direct auto | Shared auto | Saving |
| --- | --- | --- | --- |
| bandra_to_pali_hill_seed | Rs 34 | Rs 15 | 56% |
| andheri_to_midc_seed | Rs 51 | Rs 15 | 71% |
| dadar_to_shivaji_park_seed | Rs 36 | Rs 15 | 58% |
| kurla_to_kurla_market_seed | Rs 23 | Rs 10 | 57% |
| malad_to_orlem_seed | Rs 23 | Rs 10 | 57% |
| powai_to_iit_bombay_night_seed | Rs 43 | Rs 20 | 53% |
| ghatkopar_to_vikhroli_night_seed | Rs 57 | Rs 25 | 56% |

## Seven-Case Coverage

| Property | Cases covering it |
| --- | --- |
| Zero access walk candidate | 7/7 |
| Non-zero egress in selected shared-auto route | 3/7 |
| Night travel | 2/7 |
| Long egress candidate flagged (>1.2 km) | 6/7 |
| Ranking changed by trust-aware composite | 3/7 |
| Distinct Mumbai localities represented | 7/7 |

## Weight Sensitivity Sweep

Each row varies one weight from 0.0 to 0.5 and rescales the other three weights proportionally so the total remains 1.0. The table reports top-1 route changes relative to the current vector: time 0.42, cost 0.26, access 0.18, trust 0.14.

| Varied weight | Value | Top-1 changes | Changed cases |
| --- | --- | --- | --- |
| time | 0.0 | 0/7 | none |
| time | 0.1 | 0/7 | none |
| time | 0.2 | 0/7 | none |
| time | 0.3 | 0/7 | none |
| time | 0.4 | 0/7 | none |
| time | 0.5 | 0/7 | none |
| cost | 0.0 | 1/7 | bandra_to_pali_hill_seed |
| cost | 0.1 | 1/7 | bandra_to_pali_hill_seed |
| cost | 0.2 | 0/7 | none |
| cost | 0.3 | 0/7 | none |
| cost | 0.4 | 0/7 | none |
| cost | 0.5 | 1/7 | malad_to_orlem_seed |
| access | 0.0 | 0/7 | none |
| access | 0.1 | 0/7 | none |
| access | 0.2 | 0/7 | none |
| access | 0.3 | 0/7 | none |
| access | 0.4 | 1/7 | bandra_to_pali_hill_seed |
| access | 0.5 | 1/7 | bandra_to_pali_hill_seed |
| trust | 0.0 | 0/7 | none |
| trust | 0.1 | 0/7 | none |
| trust | 0.2 | 0/7 | none |
| trust | 0.3 | 0/7 | none |
| trust | 0.4 | 0/7 | none |
| trust | 0.5 | 0/7 | none |

## Correct Bandra Case Explanation

Both Bandra candidates share identical trust scores (96.0), confirming that the ranking change in this case is driven by multi-objective cost-time trade-off rather than trust penalisation. Trust-aware ranking selected Linking Road because its cost advantage (Rs 15 vs Rs 25, a 40% saving) dominated its time disadvantage (16 vs 14 min, a 14% increase) after composite normalisation; the naive baseline score instead selected Pali Hill because it conflates fare, time, and access distance in a single unnormalised heuristic.

## Ready-to-Paste Problem Statement

Given a passenger origin coordinate o=(lat,lng), destination coordinate d=(lat,lng), departure time t, and a stand database D={s1,...,sn}, where each stand si contains fixed shared-auto routes Ri={ri1,...,rim}, ShareRickshaw returns an ordered list of candidate route plans P=[p1,p2,...]. Each plan specifies a mode sequence, expected cost, estimated travel time, evidence metadata, and a trust score. The optimisation objective is to minimise a composite score S(c) over candidate stand-route pairs while exposing candidates whose trust score T(c) falls below a configurable review threshold. In this prototype, S(c) combines normalised travel time, fare, access/egress walking distance, and trust risk; T(c) is a transparent heuristic derived from evidence completeness and first/last-mile walking exposure, especially under night-travel conditions.

## Data Governance Paragraph

The prototype processes sensitive mobility and safety data, including GPS coordinates, booking timestamps, emergency contacts, and license-plate text extracted from user-submitted images. Night tracking is designed as a user-initiated flow and should be terminable by the passenger. In the current prototype, ALPR should be treated as an assistive extraction step rather than a verified identity system; production deployment would require explicit consent flows, a retention schedule, access controls for emergency-contact and trip records, image-retention minimisation, and review against India's Digital Personal Data Protection Act, 2023. These requirements are outside the present controlled prototype but are necessary before field deployment.

## Generated Figure

- Scatter data: `evaluation\results\trust_composite_scatter_2026-05-23T14-45-16-782Z.csv`
- Scatter SVG: `docs\figures\trust_composite_scatter_2026-05-23T14-45-16-782Z.svg`
