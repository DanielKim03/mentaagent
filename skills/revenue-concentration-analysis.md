---
name: revenue-concentration-analysis
description: Measure how dependent revenue is on a few customers and flag concentration risk with exact percentages.
---

# Revenue concentration analysis

## Method
1. Find customer/sales data: `list_documents` for customer_data or financial spreadsheets, then locate the column holding revenue/contract value per customer.
2. Compute, never estimate: `aggregate_table` with `op=sum`, `group_by=<customer column>` to get revenue per customer, and `op=sum` without grouping for the total.
3. Derive shares with `run_calculation`: top-1 share, top-3 share.

## What good looks like
- No single customer above 25% of revenue; top-3 below 50%.

## Severity guide
- Top customer > 40% of revenue → high (critical if their contract expires within 90 days — cross-check contracts).
- Top customer 25-40% → medium, pair with a concrete diversification action.

## Pitfalls
- Same customer under multiple spellings ("Acme", "Acme Inc.") — check the grouped output for near-duplicates before computing shares.
- One-off projects inflate a customer's share; note recurring vs one-time if the data distinguishes them.

## Output
State the exact percentages, name the documents, and pair the finding with the customer's contract status if contracts were shared.
