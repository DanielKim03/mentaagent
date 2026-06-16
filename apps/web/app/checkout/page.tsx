import CheckoutClient from "./CheckoutClient";

// Reads the Paddle client-side token at request time (not build time, so it
// works as a normal Railway env var without NEXT_PUBLIC build inlining) and
// hands it to the client overlay. Reached via redirect from startCheckout
// with ?_ptxn=<transaction id>; the user is authenticated (middleware-gated).
export const dynamic = "force-dynamic";

export default function CheckoutPage() {
  const token = process.env.PADDLE_CLIENT_TOKEN ?? "";
  const environment =
    (process.env.PADDLE_ENVIRONMENT ?? "sandbox").toLowerCase() === "production"
      ? "production"
      : "sandbox";
  return <CheckoutClient token={token} environment={environment} />;
}
