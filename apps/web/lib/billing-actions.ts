"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import {
  createCheckoutUrl,
  createPortalUrl,
  ensurePaddleCustomer,
  getWorkspaceBilling,
} from "@/lib/paddle";
import { PLANS, type PlanTier } from "@/lib/plans";

// Starts a Paddle Checkout for the active workspace's admin (form field
// `tier`). Creates/adopts a Paddle customer, then redirects to the hosted
// checkout; Paddle returns the user to /settings/billing?success=1.
//
// All Paddle work is wrapped so a failure becomes a VISIBLE error banner +
// a server log line — in production a thrown server action fails silently
// (no dev error overlay), which looks like "the button does nothing". The
// final redirect(url) sits OUTSIDE the try so its NEXT_REDIRECT signal isn't
// swallowed by the catch.
export async function startCheckout(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const tier: PlanTier = formData.get("tier") === "max" ? "max" : "pro";
  const plan = PLANS[tier];
  let url: string;
  try {
    if (!plan.priceId) {
      throw new Error(
        `${tier} tier not configured — set PADDLE_${tier.toUpperCase()}_PRICE_ID.`
      );
    }
    const billing = await getWorkspaceBilling(admin.workspaceId);
    if (!billing) throw new Error("workspace not found");
    const customerId = await ensurePaddleCustomer({
      workspaceId: admin.workspaceId,
      workspaceName: billing.workspaceName,
      adminEmail: admin.email,
    });
    url = await createCheckoutUrl({
      customerId,
      priceId: plan.priceId,
      workspaceId: admin.workspaceId,
      tier,
    });
  } catch (err) {
    console.error("[billing] startCheckout failed:", err);
    redirect("/settings/billing?error=checkout");
  }
  redirect(url);
}

// Opens the Paddle Customer Portal (update payment, invoices, change/cancel).
export async function openBillingPortal(): Promise<void> {
  const admin = await requireAdmin();
  const billing = await getWorkspaceBilling(admin.workspaceId);
  if (!billing?.paddleCustomerId) redirect("/settings/billing?error=no_customer");
  let url: string;
  try {
    url = await createPortalUrl({
      customerId: billing.paddleCustomerId,
      subscriptionId: billing.paddleSubscriptionId,
    });
  } catch (err) {
    console.error("[billing] openBillingPortal failed:", err);
    redirect("/settings/billing?error=portal");
  }
  redirect(url);
}
