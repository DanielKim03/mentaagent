---
name: contract-renewal-review
description: Build a renewal/expiry calendar from contracts and flag imminent deadlines, auto-renew traps, and missing agreements.
---

# Contract renewal review

## Method
1. `list_documents` for contracts; `search_business_data` for "renewal", "term", "expiration", "auto-renew", "notice period".
2. For each contract found, `read_document` to extract: counterparty, end date, auto-renew clause, notice window, value.
3. Sort by urgency: anything expiring or auto-renewing within 90 days is actionable NOW (notice windows often close 30-60 days before the date).

## What good looks like
- Every key customer/vendor relationship has a signed agreement on file, and no renewal date is inside its notice window without a decision.

## Severity guide
- Auto-renew with a price increase clause inside its notice window → critical.
- Expiry within 60 days, no replacement discussion in the data → high.
- Key relationship (top customer/vendor by revenue) with NO contract on file → high.

## Pitfalls
- "Term: 12 months" without a start date — look for the signature or effective date elsewhere in the document.
- Don't compute date arithmetic mentally; today's date is in your instructions, compare explicitly.

## Output
A dated list: counterparty, what happens, when, the clause quoted, and the single action with its real deadline (the notice cutoff, not the renewal date). File create_alert with due_date for each imminent one.
