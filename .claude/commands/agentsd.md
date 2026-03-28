# /agentsd — Delayed Agent Dispatch

Same as `/agents`, but waits before starting.

---

## Delay Parsing

The user's input starts with a number (minutes) followed by a comma, then the actual task:

```
/agentsd 20, Phase A — implement spec at Next Features/GDPR/Phase-A-Quick-Wins.md
```

1. Extract the number before the first comma → delay in minutes.
2. Everything after the comma → the task (passed to `/agents` logic).
3. If no number is found, ask: "How many minutes should I wait before starting?"

## Execution

1. Print: `⏳ Waiting [N] minutes before starting. Will begin at ~[current time + N min].`
2. Run `sleep [N * 60]` via Bash.
3. Print: `⏰ Delay complete. Starting agent dispatch now.`
4. Execute the full `/agents` workflow (Phase 1 through Phase 6) with the task from step 2.

Everything after the delay follows `/agents` exactly — analyse, decompose, briefing, dispatch, integrate, test, report. No commit, no deploy (that's `/agents2`).

---

Now parse the delay and task from the user's input and begin.
