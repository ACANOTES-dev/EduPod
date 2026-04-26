# CP-SAT Parity Report — 2026-04-15

Sidecar: `http://localhost:5557/solve`

| Fixture                  | Category    | Backend | Status | Placed | Unassigned | T1 Viol | T2 Viol | Score   | Wall (ms) |
| ------------------------ | ----------- | ------- | ------ | ------ | ---------- | ------- | ------- | ------- | --------- |
| tier-1-tiny              | tier        | legacy  | ok     | 36     | 0          | 0       | 0       | 4.861/5 | 135       |
| tier-1-tiny              | tier        | cp-sat  | ok     | 36     | 0          | 0       | 0       | 5/5     | 2244      |
| tier-2-stress-a-baseline | tier        | legacy  | ok     | 331    | 9          | 0       | 9       | 4.676/5 | 5649      |
| tier-2-stress-a-baseline | tier        | cp-sat  | ok     | 329    | 11         | 0       | 5       | 5/5     | 30551     |
| tier-3-irish-secondary   | tier        | legacy  | ok     | 743    | 105        | 0       | 105     | 4.543/5 | 60095     |
| tier-3-irish-secondary   | tier        | cp-sat  | ok     | 892    | 203        | 0       | 55      | 5/5     | 61218     |
| adv-over-demand          | adversarial | legacy  | ok     | 4      | 1          | 0       | 1       | 5/5     | 2         |
| adv-over-demand          | adversarial | cp-sat  | ok     | 5      | 3          | 0       | 1       | 5/5     | 4         |
| adv-pin-conflict         | adversarial | legacy  | ok     | 2      | 0          | 1       | 1       | 5/5     | 0         |
| adv-pin-conflict         | adversarial | cp-sat  | ok     | 2      | 0          | 1       | 1       | 5/5     | 1         |
| adv-no-solution          | adversarial | legacy  | ok     | 0      | 1          | 0       | 1       | 5/5     | 0         |
| adv-no-solution          | adversarial | cp-sat  | ok     | 0      | 4          | 0       | 1       | 5/5     | 2         |
| adv-all-pinned           | adversarial | legacy  | ok     | 4      | 0          | 0       | 0       | 5/5     | 0         |
| adv-all-pinned           | adversarial | cp-sat  | ok     | 4      | 0          | 0       | 0       | 5/5     | 2         |

## Notes
