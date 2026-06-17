import { ImageResponse } from "next/og";
import { LOGO_DATA_URL } from "./og-logo";

// Branded social-share card (Open Graph + Twitter). Warm-charcoal canvas,
// cream ink, the chain-link logo mark — mirrors the app's dark theme. The
// logo is inlined as a base64 data URI (og-logo.ts) because Satori can't read
// public files at render time.
export const runtime = "nodejs";
export const alt = "MentaAgent — Your AI business analyst";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          backgroundColor: "#1e1c19",
          backgroundImage:
            "radial-gradient(circle at 78% 18%, rgba(255,255,255,0.06) 0%, transparent 60%)",
        }}
      >
        {/* Logo lockup: chain-link mark + cream wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={LOGO_DATA_URL}
            width={72}
            height={72}
            style={{ borderRadius: "16px" }}
            alt=""
          />
          <div style={{ fontSize: "40px", fontWeight: 700, color: "#f1ece4" }}>
            MentaAgent
          </div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: "56px",
            fontSize: "64px",
            fontWeight: 700,
            lineHeight: 1.15,
            color: "#f1ece4",
            maxWidth: "900px",
          }}
        >
          Your AI business analyst, on subscription.
        </div>

        <div
          style={{
            display: "flex",
            marginTop: "28px",
            fontSize: "30px",
            color: "#b3aa9c",
            maxWidth: "880px",
          }}
        >
          Connect your files and get clear answers — what you&apos;re lacking,
          where the risks are, what to improve.
        </div>

        <div
          style={{
            display: "flex",
            marginTop: "44px",
            fontSize: "24px",
            fontWeight: 600,
            color: "#cbc0b3",
          }}
        >
          Grounded in your data, with citations · Free to start
        </div>
      </div>
    ),
    size,
  );
}
