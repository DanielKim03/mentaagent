---
name: cash-runway-analysis
description: Estimate months of cash runway from financial data and flag burn-rate or receivables problems.
---

# Cash runway analysis

## Method
1. `list_documents` for financial_statement / invoice data. If none exists, STOP — the finding is "no financial visibility": recommend uploading a P&L or bank export, score the dimension low.
2. From what exists, compute with `aggregate_table` / `run_calculation`:
   - Average monthly net burn (expenses minus revenue) over the most recent 3 months available.
   - Runway = current cash ÷ monthly burn (only if a cash balance appears in the data — never invent one).
   - Receivables: total invoiced vs paid; aging if dates exist.
3. Distinguish "profitable but cash-poor" (receivables problem) from "burning" (cost problem).

## What good looks like
- 3+ months of forward visibility; receivables under 45 days; burn trending flat or down.

## Severity guide
- Runway < 2 months → critical. Runway 2-4 months → high.
- > 30% of receivables older than 60 days → high (it's free financing you're giving customers).

## Pitfalls
- Revenue ≠ cash collected; use payments/receipts when both exist.
- Seasonal businesses: compare to the same months last year before calling a trend.

## Output
The number ("about N months of runway at the current pace"), the two biggest cash levers found in the data, and exactly what data is missing to make this estimate solid.
