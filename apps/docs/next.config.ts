import type { NextConfig } from "next";

const config: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  // The assistant reads the markdown docs from disk when it runs. Next cannot see that read, so
  // without this line the files are left out of the serverless function and it crashes on Vercel.
  outputFileTracingIncludes: {
    "/api/**": ["./content/**/*"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "x-content-type-options", value: "nosniff" },
          { key: "referrer-policy", value: "strict-origin-when-cross-origin" },
          { key: "x-frame-options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};
export default config;
