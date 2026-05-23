# Micro User Study Packet

Use this only with real participants. Do not invent values for the paper.

## Participant task

Ask each participant to inspect the ShareRickshaw route-finder screen or screenshots of the route recommendation output. They should understand the route option, fare, transfer/walking steps, and safety controls.

## Questions

Scale: 1 = Strongly disagree, 5 = Strongly agree.

1. The recommended route and transfer points are easy to understand.
2. I would trust the fare transparency shown over a driver's manual quote.
3. The SOS and Night Tracking features make me feel safer using share autos at night.

## Data entry

Fill:

```text
evaluation/user_study_responses_template.csv
```

Then run:

```powershell
node evaluation\run_user_study_analysis.js evaluation\user_study_responses_template.csv
```

Paste the generated mean and standard deviation values into the paper subsection titled "Preliminary Usability Evaluation".
