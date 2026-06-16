import { NextResponse } from "next/server";
import {
  PADDLE_WEBHOOK_SECRET,
  syncSubscriptionFromPaddle,
  verifyWebhookSignature,
  type PaddleSubscriptionEvent,
} from "@/lib/paddle";
import { pool } from "@/lib/db";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PaddleEvent = {
  event_type: string;
  occurred_at?: string;
  data: Record<string, unknown>;
};

// Paddle posts raw MIME; we need the byte-exact body to verify the HMAC.
export async function POST(req: Request) {
  if (!PADDLE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "PADDLE_WEBHOOK_SECRET is not configured" },
      { status: 500 }
    );
  }
  const rawBody = await req.text();
  const sig = req.headers.get("paddle-signature");
  if (!verifyWebhookSignature({ rawBody, signatureHeader: sig })) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let event: PaddleEvent;
  try {
    event = JSON.parse(rawBody) as PaddleEvent;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  try {
    switch (event.event_type) {
      case "subscription.created":
      case "subscription.updated":
      case "subscription.canceled": {
        const sub = event.data as unknown as PaddleSubscriptionEvent;
        const workspaceId = await syncSubscriptionFromPaddle(sub, event.occurred_at);
        const action =
          event.event_type === "subscription.created"
            ? "billing.subscription_created"
            : event.event_type === "subscription.canceled"
              ? "billing.subscription_canceled"
              : "billing.subscription_updated";
        await logAudit({
          workspaceId,
          action,
          description: sub.status ?? undefined,
          details: { subscription_id: sub.id, status: sub.status },
        });
        break;
      }
      case "transaction.payment_failed": {
        const txn = event.data as { id?: string; customer_id?: string; subscription_id?: string };
        if (txn.customer_id) {
          const { rows } = await pool.query<{ id: string }>(
            "SELECT id FROM workspaces WHERE paddle_customer_id = $1",
            [txn.customer_id]
          );
          if (rows[0]) {
            await logAudit({
              workspaceId: rows[0].id,
              action: "billing.payment_failed",
              description: txn.id ?? undefined,
              details: { transaction_id: txn.id, subscription_id: txn.subscription_id },
            });
          }
        }
        break;
      }
      default:
        break; // ignore the many event types we don't act on
    }
  } catch (err) {
    // 500 → Paddle retries (good for transient DB issues / unmapped events).
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
  return NextResponse.json({ received: true });
}
