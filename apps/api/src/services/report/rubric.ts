// Code-defined report dimensions. Each becomes a report_sections row and one
// investigation pass in the report run. Deep per-dimension methodology lives
// in the global skill library (improvable without deploys); the rubric holds
// the stable skeleton: what to look at and how to score.

export type Dimension = {
  key: string;
  title: string;
  guidance: string;
  // Profile-based applicability: omit dimension when predicate fails.
  appliesTo?: (profile: Record<string, unknown>) => boolean;
};

export const DIMENSIONS: Dimension[] = [
  {
    key: "finance",
    title: "Finance & Cash",
    guidance:
      "Revenue trend, margins, cash runway, cost concentration. Evidence: financial statements, invoices, sales data. What good looks like: positive margin trend, >3 months runway visibility, no single cost >30% of revenue without justification.",
  },
  {
    key: "customers_sales",
    title: "Customers & Sales",
    guidance:
      "Revenue concentration by customer, churn signals, pipeline health, pricing consistency. What good looks like: no customer >25% of revenue, documented pricing, repeat business visible.",
  },
  {
    key: "vendors_contracts",
    title: "Vendors & Contracts",
    guidance:
      "Contract expiry/renewal dates, auto-renew clauses, vendor dependency, missing contracts for key relationships. What good looks like: known renewal calendar, no single-vendor dependency for critical inputs, signed agreements on file.",
  },
  {
    key: "operations",
    title: "Operations",
    guidance:
      "Process documentation, key-person risk, capacity vs demand, inventory/fulfillment signals where applicable. What good looks like: critical processes survivable without any one person.",
  },
  {
    key: "marketing_presence",
    title: "Marketing & Growth",
    guidance:
      "Acquisition channels, marketing spend vs results, online presence signals in the shared data. What good looks like: at least two working acquisition channels and a way to measure them.",
  },
  {
    key: "compliance_risk",
    title: "Compliance & Risk",
    guidance:
      "Regulatory/tax deadlines, insurance coverage, data-protection obligations, employee agreements. What good looks like: no past-due obligations, key risks insured.",
  },
  {
    key: "people_org",
    title: "People & Organization",
    guidance:
      "Team structure, employment agreements on file, compensation consistency, hiring gaps vs stated goals. What good looks like: agreements for everyone, no critical role unfilled against stated goals.",
    appliesTo: (p) => {
      const size = Number(p.team_size ?? 0);
      return !Number.isFinite(size) || size !== 1;
    },
  },
];

export function dimensionsForProfile(
  profile: Record<string, unknown>
): Dimension[] {
  return DIMENSIONS.filter((d) => d.appliesTo?.(profile) ?? true);
}
