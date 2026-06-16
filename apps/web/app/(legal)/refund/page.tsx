export const metadata = { title: "Refund Policy — Mentapath" };

const EFFECTIVE_DATE = "2026-05-20";

export default function RefundPage() {
  return (
    <>
      <h1 className="text-3xl font-semibold">Refund Policy</h1>
      <p className="text-xs text-neutral-500">Effective {EFFECTIVE_DATE}</p>

      <Section title="1. Plans and trials">
        <p>
          Mentapath offers a Free plan (no card required, hard-capped at 2
          source uploads and 2 AI queries per workspace) and two paid
          plans: Pro at $10/month and Max at $40/month. Both paid plans
          begin with a <strong>14-day free trial</strong>. You can use
          every paid-tier feature during the trial.
        </p>
        <p>
          Your card is not charged until the trial ends. We will email you
          before the first charge so you can cancel if the Service is not
          right for you.
        </p>
      </Section>

      <Section title="2. Cancellation">
        <p>
          You can cancel a paid subscription at any time from{" "}
          <a href="/settings/billing" className="underline">
            Settings &rarr; Billing &rarr; Manage billing
          </a>
          . Cancelling is immediate from our side and is also reflected in
          the Paddle customer portal.
        </p>
        <p>
          Cancellation stops the next renewal charge. You retain full
          access to your workspace through the end of the billing period
          you have already paid for; after that period your workspace
          automatically downgrades to the Free plan (your data is kept
          intact, but you go back to the 2/2 quota).
        </p>
      </Section>

      <Section title="3. Standard refund policy">
        <p>
          Because we charge monthly and you can cancel at any time, we
          do <strong>not</strong> offer pro-rated refunds for partially
          used months. If you cancel mid-month, you keep access until the
          end of that month and are not charged again.
        </p>
        <p>
          We do not offer refunds for accidental or
          forgotten-to-cancel renewals.{" "}
          <strong>Set a calendar reminder</strong> if you only want to
          use the Service for one billing cycle.
        </p>
      </Section>

      <Section title="4. Refund exceptions">
        <p>
          We will issue a full refund of your most recent charge in the
          following cases. Email{" "}
          <a href="mailto:support@mentapath.com" className="underline">
            support@mentapath.com
          </a>{" "}
          with your account email and a brief description.
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <strong>Service-side outage of more than 48 consecutive
            hours.</strong> If our hosting, database, or worker pipeline
            is down for more than 48 hours within a single billing
            period and you cannot access your data, you can request a
            refund of that billing period.
          </li>
          <li>
            <strong>Data loss caused by us.</strong> If we lose your
            Content due to a failure on our side that is not covered by
            our normal backup window, you can request a refund for the
            billing period in which the loss occurred.
          </li>
          <li>
            <strong>Duplicate or fraudulent charges.</strong> If you
            see a charge you did not authorize, we will refund it
            immediately and investigate.
          </li>
          <li>
            <strong>You are required by consumer law in your
            jurisdiction</strong> to receive a refund. We honor mandatory
            statutory rights even when they exceed this policy.
          </li>
        </ul>
      </Section>

      <Section title="5. How refunds are processed">
        <p>
          Refunds go back to the original payment method via Paddle.
          Paddle typically takes 5–10 business days to return the funds
          to your account.
        </p>
        <p>
          We process approved refunds within 3 business days of receiving
          a valid request. We will email you when the refund is issued.
        </p>
      </Section>

      <Section title="6. Chargebacks">
        <p>
          Please email us before filing a chargeback. Most billing issues
          are resolved within a day if you contact{" "}
          <a href="mailto:support@mentapath.com" className="underline">
            support@mentapath.com
          </a>
          . Filing a chargeback without contacting us first may result in
          suspension of your account while the dispute is resolved.
        </p>
      </Section>

      <Section title="7. Changes to this policy">
        <p>
          We may update this policy from time to time. Existing
          subscriptions are governed by the policy in effect at the start
          of their current billing period; new policy versions apply
          starting from the next renewal.
        </p>
      </Section>

      <Section title="8. Contact">
        <p>
          Billing and refund questions:{" "}
          <a href="mailto:support@mentapath.com" className="underline">
            support@mentapath.com
          </a>
          . Include your account email and (if relevant) the Paddle
          invoice number so we can find your record quickly.
        </p>
      </Section>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="mt-6 text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}
