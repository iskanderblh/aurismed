import type { NextConfig } from "next";

// Les données médicales ne doivent jamais être mises en cache côté serveur :
// cacheComponents reste désactivé, toutes les pages authentifiées sont rendues à la requête.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // React PDF (génération des PDF côté serveur) est chargé tel quel par Node.
  serverExternalPackages: ["@react-pdf/renderer"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
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
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
