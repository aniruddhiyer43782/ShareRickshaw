# IEEE Experiment Protocol

The conference paper should only report numbers generated through this protocol.

## 1. Dataset reporting

Report the exact database state:

```sql
SELECT COUNT(*) AS stands FROM stands;
SELECT COUNT(*) AS routes FROM routes;
SELECT COUNT(*) AS users FROM users;
SELECT COUNT(*) AS bookings FROM bookings;
```

## 2. REST latency

1. Start MySQL and the backend.
2. Log in and copy the JWT.
3. Run:

```powershell
node evaluation\run_api_latency.js --base http://localhost:3000/api --token YOUR_JWT --iterations 100
```

Report median, p95, and failure count from the generated CSV. Do not include Gemini-backed route latency unless the Gemini API key was active during the test.

## 3. Route planner quality

1. Run:

```powershell
node evaluation\run_route_cases.js --token YOUR_JWT
```

2. Score each JSON output using `evaluation/route_quality_rubric.md`.
3. Report both successful cases and failure cases.

## 4. ALPR

Use at least 20 real auto-rickshaw plate images with permission. Store only image IDs in the paper, not personally identifying images. Fill:

```text
evaluation/alpr_results_template.csv
```

Report exact-match accuracy and character-level error rate.

## 5. User study

Use 5-10 participants for a small formative study. Report it honestly as formative, not statistically conclusive.