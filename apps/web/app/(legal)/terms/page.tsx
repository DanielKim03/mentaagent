export const metadata = { title: "Terms of Service — MentaAgent" };

const EFFECTIVE_DATE = "2026-06-08";

export default function TermsPage() {
  return (
    <>
      <h1 className="text-3xl font-semibold">Terms of Service</h1>
      <p className="text-xs text-neutral-500">
        Effective {EFFECTIVE_DATE}
      </p>

      <Section title="1. Acceptance">
        <p>
          By creating an account, uploading content, or otherwise using
          MentaAgent (the &ldquo;Service&rdquo;), you agree to these Terms of
          Service (the &ldquo;Terms&rdquo;) and to our{" "}
          <a href="/privacy" className="underline">Privacy Policy</a>. If you
          do not agree, do not use the Service.
        </p>
        <p>
          You must be at least 18 years old and have authority to bind the
          business or workspace you are signing up on behalf of.
        </p>
      </Section>

      <Section title="2. The Service">
        <p>
          MentaAgent is an AI business analyst. You upload
          documents (spreadsheets, PDFs, emails, etc.); the Service parses
          them and uses a third-party large language model (the DeepSeek
          model served via DeepInfra in the United States) to analyze your
          business — flagging what you are lacking and where the risks are,
          and answering questions about your data with citations back to
          your sources.
        </p>
        <p>
          The Service is provided on a per-workspace basis. Each workspace
          is isolated: content uploaded into one workspace is not exposed to
          any other workspace.
        </p>
      </Section>

      <Section title="3. Your account">
        <p>
          You are responsible for maintaining the confidentiality of your
          login credentials and for all activity that occurs under your
          account. Notify us immediately at the contact address below if you
          suspect unauthorized access. We are not liable for losses arising
          from compromised credentials you failed to report promptly.
        </p>
      </Section>

      <Section title="4. Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            Upload content you do not have the right to use, including
            copyrighted material, trade secrets, or personal data of third
            parties without lawful basis;
          </li>
          <li>
            Upload regulated data (PHI, payment card numbers, government
            IDs, classified material) — MentaAgent is not certified to
            handle these categories;
          </li>
          <li>
            Use the Service to generate, store, or distribute illegal
            content, malware, or content that violates intellectual property
            rights;
          </li>
          <li>
            Attempt to bypass rate limits, access another workspace&apos;s
            data, reverse-engineer the Service, or scrape our pages;
          </li>
          <li>
            Resell, sublicense, or white-label the Service without a
            written agreement.
          </li>
        </ul>
        <p>
          We may suspend or terminate accounts that violate this section.
        </p>
      </Section>

      <Section title="5. Subscriptions and billing">
        <p>
          The Service is available on three tiers: Free, Pro ($10/month),
          and Max ($40/month). Free is limited to four source uploads and
          eight AI queries (lifetime, per workspace); paid tiers have monthly
          AI-spend caps documented on the billing page.
        </p>
        <p>
          Paid subscriptions begin with a 14-day free trial. After the
          trial, your payment method is charged for the first billing
          period, and recurring billing continues until you cancel.
          Cancellation is effective at the end of your current billing
          period — see the{" "}
          <a href="/refund" className="underline">Refund Policy</a> for
          details.
        </p>
        <p>
          Paddle.com Market Limited (UK) processes all payments as our
          merchant of record, including collection and remittance of any
          applicable sales tax / VAT. We do not store full payment card
          numbers; Paddle handles that on PCI-compliant infrastructure.
        </p>
      </Section>

      <Section title="6. Your content and data ownership">
        <p>
          You retain all ownership rights to content you upload and to the
          reports, queries, and analysis the Service generates from your
          content (collectively, &ldquo;Your Content&rdquo;).
        </p>
        <p>
          You grant MentaAgent a worldwide, non-exclusive, royalty-free
          license to host, process, transmit, display, and create derivative
          works of Your Content solely to operate and improve the Service
          for you. This license terminates when you delete Your Content or
          close your account, except as needed to comply with law, resolve
          disputes, or fulfill backup-retention obligations.
        </p>
        <p>
          MentaAgent does not train models on Your Content. The third-party
          LLM provider (DeepInfra, serving the DeepSeek model from
          U.S.-based infrastructure) receives Your Content only for the
          duration of a specific request. DeepInfra does not use API
          inputs or outputs to train models, subject to their own terms.
        </p>
      </Section>

      <Section title="7. AI-generated outputs">
        <p>
          Outputs from the Service (reports, query answers, suggestions)
          are generated by large language models and may contain factual
          errors, omissions, or hallucinations. <strong>You are
          responsible for verifying any AI output before relying on it for
          business decisions</strong>, especially for legal, financial,
          medical, or compliance matters.
        </p>
        <p>
          Citations link back to the source documents you uploaded; an
          output without a citation is unsupported.
        </p>
      </Section>

      <Section title="8. Third-party services">
        <p>
          The Service depends on third parties to function:
          <strong> DeepInfra</strong> (LLM inference, U.S.),
          <strong> Paddle</strong> (payments, merchant of record),
          <strong> Resend</strong> (transactional email),
          <strong> Railway</strong> (hosting),
          <strong> Cloudflare</strong> (DNS, captcha, edge),
          <strong> Sentry</strong> (error tracking), and the
          <strong> Google</strong> identity provider (used only if you sign
          in with Google). Their availability and policies are
          outside our control; the Service may be degraded or unavailable
          when they are.
        </p>
      </Section>

      <Section title="9. Service availability">
        <p>
          The Service is provided on a best-effort basis. We do not offer a
          formal uptime SLA on Free or Pro plans. Max plan customers may
          request a written availability commitment by contacting us.
        </p>
        <p>
          Maintenance windows, third-party outages, and force-majeure
          events may interrupt service. We will use reasonable efforts to
          notify you of planned maintenance in advance.
        </p>
      </Section>

      <Section title="10. Disclaimers">
        <p className="uppercase">
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as
          available,&rdquo; without warranties of any kind, whether
          express, implied, statutory, or otherwise. To the maximum extent
          permitted by law, MentaAgent disclaims all warranties including
          merchantability, fitness for a particular purpose, accuracy of
          AI output, non-infringement, and freedom from data loss.
        </p>
      </Section>

      <Section title="11. Limitation of liability">
        <p className="uppercase">
          To the maximum extent permitted by law, MentaAgent&apos;s total
          aggregate liability for any claim arising from or related to the
          Service will not exceed the greater of (a) the amount you paid
          us in the twelve months preceding the claim, or (b) one hundred
          U.S. dollars.
        </p>
        <p className="uppercase">
          MentaAgent is not liable for indirect, incidental, consequential,
          special, exemplary, or punitive damages, or for lost profits,
          lost data, or business interruption, even if advised of the
          possibility.
        </p>
      </Section>

      <Section title="12. Indemnification">
        <p>
          You agree to defend, indemnify, and hold MentaAgent harmless from
          any claim, demand, or expense (including reasonable legal fees)
          arising from Your Content, your use of the Service in violation
          of these Terms, or your violation of any law or third-party
          right.
        </p>
      </Section>

      <Section title="13. Termination">
        <p>
          You may close your account at any time from the Settings page.
          Closing your account permanently deletes Your Content within 30
          days, except for backups retained for an additional 30 days and
          records we are required by law to keep.
        </p>
        <p>
          We may suspend or terminate your account for material violations
          of these Terms, non-payment, or as required by law, with notice
          where practicable.
        </p>
      </Section>

      <Section title="14. Changes to these Terms">
        <p>
          We may update these Terms from time to time. Material changes
          will be announced via email and at least 14 days before they
          take effect. Continued use after the effective date constitutes
          acceptance.
        </p>
      </Section>

      <Section title="15. Governing law and disputes">
        <p>
          These Terms are governed by the laws of the Republic of Korea,
          without regard to conflict-of-laws principles. The Seoul Central
          District Court shall have exclusive jurisdiction over any
          dispute arising from or relating to these Terms or your use of
          the Service, unless mandatory consumer-protection law in your
          jurisdiction provides otherwise.
        </p>
      </Section>

      <Section title="16. Contact">
        <p>
          Questions about these Terms? Email{" "}
          <a href="mailto:legal@mentapath.com" className="underline">
            legal@mentapath.com
          </a>
          .
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
