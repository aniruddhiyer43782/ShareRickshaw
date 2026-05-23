# Route Planner Evaluation Rubric

Use this rubric for each origin-destination case in `route_planner_cases.json`.

Score each item as 1 = yes, 0.5 = partially, 0 = no.

| Metric | Question |
|---|---|
| Station validity | Are all train stations named by the route real Mumbai suburban stations? |
| Stand grounding | Are all shared-auto stands mentioned present in the database? |
| Destination grounding | Are all shared-auto destinations present under the cited stand route? |
| Cost plausibility | Is the total fare plausible for the stated modes and step fares? |
| Time plausibility | Is the total travel time plausible for walking/train/auto movement? |
| User interpretability | Could a passenger follow the route without extra clarification? |

Report:

- Total cases
- Mean score per metric
- Number of hallucinated stand references
- Number of routes requiring manual correction
- Representative success and failure examples