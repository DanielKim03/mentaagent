import { requireAdmin } from "@/lib/admin";
import {
  getWorkspaceBilling,
  getWorkspaceUsage,
  isEntitled,
  PADDLE_CONFIGURED,
  type SubscriptionStatus,
} from "@/lib/paddle";
import { PLANS, type PlanTier } from "@/lib/plans";
import { startCheckout, openBillingPortal } from "@/lib/billing-actions";

type SearchParams = {
  success?: string;
  canceled?: string;
  error?: string;
  plan?: string;
};

function statusLabel(s: SubscriptionStatus): { text: string; tone: string } {
  switch (s) {
    case "active":
      return { text: "Active", tone: "bg-green-100 text-green-700" };
    case "trialing":
      return { text: "Trial", tone: "bg-green-100 text-green-700" };
    case "past_due":
      return { text: "Past due", tone: "bg-amber-100 text-amber-700" };
    case "canceled":
      return { text: "Canceled", tone: "bg-red-100 text-red-700" };
    case "paused":
      return { text: "Paused", tone: "bg-amber-100 text-amber-700" };
    default:
      return { text: "No subscription", tone: "bg-neutral-100 text-neutral-600" };
  }
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const admin = await requireAdmin();
  const billing = await getWorkspaceBilling(admin.workspaceId);
  const usage = await getWorkspaceUsage(admin.workspaceId);
  const sp = searchParams ?? {};

  const hasCap = usage.capUsdMicros != null;
  const usedPct =
    hasCap && usage.capUsdMicros! > 0n
      ? Math.min(
          100,
          (Number(usage.usedUsdMicros) / Number(usage.capUsdMicros)) * 100
        )
      : 0;
  const barTone =
    usedPct >= 100
      ? "bg-red-500"
      : usedPct >= 80
        ? "bg-amber-500"
        : "bg-brand-500";
  const label = statusLabel(billing?.status ?? null);
  const entitled = isEntitled(billing?.status ?? null);
  const hasCustomer = !!billing?.paddleCustomerId;
  const currentTier: PlanTier =
    billing?.plan === "pro" || billing?.plan === "max" ? billing.plan : "free";
  // Plan picked on the landing page (?plan=pro|max), shown as a prompt to
  // finish checkout — unless they're already on that tier.
  const chosenPlan: PlanTier | null =
    (sp.plan === "pro" || sp.plan === "max") && currentTier !== sp.plan
      ? sp.plan
      : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Manage this workspace&apos;s subscription
          {billing ? ` (${billing.workspaceName})` : ""}.
        </p>
      </div>

      {sp.success && (
        <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
          Subscription started — the status below may take a few seconds to update.
        </p>
      )}
      {sp.canceled && (
        <p className="rounded-lg bg-neutral-100 p-3 text-sm text-neutral-600">
          Checkout canceled. No charges were made.
        </p>
      )}
      {sp.error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {sp.error === "no_customer"
            ? "No Paddle customer yet — start a subscription first."
            : "Something went wrong. Check the server logs."}
        </p>
      )}

      {chosenPlan && (
        <div className="rounded-xl border border-neutral-900 bg-brand-500 p-5 text-white">
          <h2 className="text-base font-semibold">
            Finish setting up your {PLANS[chosenPlan].label} plan
          </h2>
          <p className="mt-1 text-sm text-neutral-300">
            Complete checkout to activate {PLANS[chosenPlan].label} (
            {PLANS[chosenPlan].priceLabel}).
          </p>
          <form action={startCheckout} className="mt-4">
            <input type="hidden" name="tier" value={chosenPlan} />
            <button
              type="submit"
              disabled={!PLANS[chosenPlan].priceId}
              className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-100 disabled:opacity-50"
            >
              Continue to payment →
            </button>
          </form>
          {!PLANS[chosenPlan].priceId && (
            <p className="mt-2 text-xs text-neutral-400">
              Paddle isn&apos;t configured yet — see the note below.
            </p>
          )}
        </div>
      )}

      <div className="rounded-xl border border-neutral-200 bg-neutral-100 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Subscription</h2>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${label.tone}`}>
            {label.text}
          </span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-500">Plan</dt>
            <dd className="mt-1">
              {PLANS[currentTier].label} ({PLANS[currentTier].priceLabel})
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-neutral-500">Renews / ends</dt>
            <dd className="mt-1">
              {billing?.currentPeriodEnd
                ? new Date(billing.currentPeriodEnd).toLocaleDateString()
                : "—"}
            </dd>
          </div>
        </dl>

        <div className="mt-6 border-t border-neutral-100 pt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">AI usage this period</span>
            <span className="text-neutral-600">
              {hasCap ? `${Math.round(usedPct)}%` : "No limit"}
            </span>
          </div>
          {hasCap && (
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
              <div
                className={`h-full rounded-full ${barTone}`}
                style={{ width: `${usedPct}%` }}
              />
            </div>
          )}
          <p className="mt-2 text-xs text-neutral-500">
            {usage.periodStart
              ? `resets ${
                  billing?.currentPeriodEnd
                    ? new Date(billing.currentPeriodEnd).toLocaleDateString()
                    : "on renewal"
                }`
              : "resets monthly"}
            {usedPct >= 100 ? " · limit reached — upgrade for more" : ""}
          </p>
        </div>

        {(usage.questionsLeft != null || usage.uploadsLeft != null) && (
          <div className="mt-4 border-t border-neutral-100 pt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Free plan allowance</span>
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              {usage.questionsLeft ?? 0} of {PLANS.free.questionQuota} questions and{" "}
              {usage.uploadsLeft ?? 0} of {PLANS.free.sourceUploadQuota} file uploads left.
              {" "}Upgrade for more.
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          {currentTier !== "pro" && currentTier !== "max" && (
            <form action={startCheckout}>
              <input type="hidden" name="tier" value="pro" />
              <button
                type="submit"
                disabled={!PLANS.pro.priceId}
                className="rounded-lg border border-neutral-300 bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-50 disabled:opacity-50"
              >
                Upgrade to Pro — {PLANS.pro.priceLabel}
              </button>
            </form>
          )}
          {currentTier !== "max" && (
            <form action={startCheckout}>
              <input type="hidden" name="tier" value="max" />
              <button
                type="submit"
                disabled={!PLANS.max.priceId}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
              >
                Upgrade to Max — {PLANS.max.priceLabel}
              </button>
            </form>
          )}
          {hasCustomer && (
            <form action={openBillingPortal}>
              <button
                type="submit"
                disabled={!PADDLE_CONFIGURED}
                className="rounded-lg border border-neutral-300 bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-50 disabled:opacity-50"
              >
                Manage billing →
              </button>
            </form>
          )}
        </div>

        {!PADDLE_CONFIGURED && (
          <p className="mt-4 text-xs text-neutral-500">
            Paddle isn&apos;t configured. Set <code>PADDLE_API_KEY</code>,{" "}
            <code>PADDLE_ENVIRONMENT</code>, <code>PADDLE_PRO_PRICE_ID</code>,{" "}
            <code>PADDLE_MAX_PRICE_ID</code>, and <code>PADDLE_WEBHOOK_SECRET</code>.
          </p>
        )}
        {entitled && (
          <p className="mt-4 text-xs text-neutral-500">
            Thanks for subscribing — your plan&apos;s limits are active.
          </p>
        )}
      </div>
    </div>
  );
}
