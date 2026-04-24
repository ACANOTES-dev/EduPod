// ─── Cash Flow Forecast Prompt ────────────────────────────────────────────

export const CASH_FLOW_FORECAST_PROMPT_VERSION = 1;

interface DailyTransaction {
  date: string;
  receipts: number;
  disbursements: number;
}

interface CashFlowInput {
  historical: DailyTransaction[];
  pending_invoices_amount: number;
  daysAhead: number;
}

export function buildCashFlowForecastPrompt(input: CashFlowInput): string {
  const historicalStr = input.historical
    .map((t) => `${t.date}: receipts=${t.receipts}, disbursements=${t.disbursements}`)
    .join('\n');

  return `You are a school finance AI forecasting cash flow. Given the historical daily receipts and disbursements, predict the next ${input.daysAhead} days of expected receipts.

Historical transactions (most recent last):
${historicalStr}

Pending invoices (expected receipts within ${input.daysAhead} days): $${input.pending_invoices_amount.toFixed(2)}

Consider:
- Weekly payment patterns (some parents pay on Fridays)
- Monthly patterns (some payment plans cycle monthly)
- Pending invoices are likely to come in
- Conservative confidence intervals (±20% typical)

Respond with ONLY valid JSON (no explanation, no markdown):
{
  "forecast": [
    {
      "date": "<ISO date YYYY-MM-DD>",
      "expected_receipts": <number>,
      "confidence_interval": [<lower>, <upper>]
    }
  ],
  "narrative": "<2-3 sentence explanation of cash flow outlook>",
  "confidence": "<high|medium|low>"
}`;
}
