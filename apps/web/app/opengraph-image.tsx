import { ImageResponse } from "next/og";

// Branded social-share card (Open Graph + Twitter). Colors mirror the
// marketing brief / tailwind tokens: neutral-900 ink, brand-500 terracotta,
// brand-50 warm base. Rendered at request time by next/og — no binary asset
// to keep in the repo, and it inherits the site's wordmark/lockup.
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
          backgroundColor: "#070605",
          backgroundImage:
            "radial-gradient(900px 500px at 78% 18%, rgba(217,119,87,0.16) 0%, transparent 60%)",
        }}
      >
        {/* Logo lockup: clay "M" square + cream wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "16px",
              backgroundColor: "#d97757",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "48px",
              fontWeight: 700,
            }}
          >
            M
          </div>
          <div style={{ fontSize: "40px", fontWeight: 700, color: "#ede7dc" }}>
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
            color: "#ede7dc",
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
            color: "#a99c8b",
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
            color: "#e69d7b",
          }}
        >
          Grounded in your data, with citations · Free to start
        </div>
      </div>
    ),
    size,
  );
}
