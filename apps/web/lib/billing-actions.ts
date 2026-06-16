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
// `tier`). Creates a Paddle customer if needed, then redirects to the hosted
// checkout; Paddle returns the user to /settings/billing?success=1.
export async function startCheckout(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const tier: PlanTier = formData.get("tier") === "max" ? "max" : "pro";
  const plan = PLANS[tier];
  if (!plan.priceId) {
    throw new Error(`${tier} tier not configured — set PADDLE_${tier.toUpperCase()}_PRICE_ID.`);
  }
  const billing = await getWorkspaceBilling(admin.workspaceId);
  if (!billing) redirect("/settings/billing?error=workspace");

  const customerId = await ensurePaddleCustomer({
    workspaceId: admin.workspaceId,
    workspaceName: billing!.workspaceName,
    adminEmail: admin.email,
  });
  const url = await createCheckoutUrl({
    customerId,
    priceId: plan.priceId,
    workspaceId: admin.workspaceId,
    tier,
  });
  redirect(url);
}

// Opens the Paddle Customer Portal (update payment, invoices, change/cancel).
export async function openBillingPortal(): Promise<void> {
  const admin = await requireAdmin();
  const billing = await getWorkspaceBilling(admin.workspaceId);
  if (!billing?.paddleCustomerId) redirect("/settings/billing?error=no_customer");
  const url = await createPortalUrl({
    customerId: billing!.paddleCustomerId!,
    subscriptionId: billing!.paddleSubscriptionId,
  });
  redirect(url);
}
