/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Behind Railway's edge proxy on a custom domain, the forwarded
    // x-forwarded-host (mentapath.com) doesn't match the container's own
    // Host, so Next 14's Server Actions CSRF guard rejects the action POST
    // and the form silently does nothing. Allow the real public origins.
    serverActions: {
      allowedOrigins: ["mentapath.com", "www.mentapath.com", "*.up.railway.app"],
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "geolocation=(), microphone=(), camera=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
