import type { NextConfig } from "next";
import catalogRouteRedirectsData from "./data/catalog-route-redirects.json";

type CatalogRouteRedirectsData = {
  redirects: Array<{
    sourceParams: string[];
    targetParam: string;
    permanent: true;
  }>;
};

const catalogRouteRedirects = (catalogRouteRedirectsData as CatalogRouteRedirectsData).redirects.flatMap(
  (redirect) =>
    redirect.sourceParams.map((sourceParam) => ({
      source: `/catalogo/${sourceParam}`,
      destination: `/catalogo/${redirect.targetParam}`,
      permanent: redirect.permanent,
    })),
);

const isDevelopment = process.env.NODE_ENV === "development";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com https://www.google-analytics.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss: https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
  "media-src 'self' blob: https:",
  "frame-src 'self' https://www.googletagmanager.com https://www.youtube.com https://www.youtube-nocookie.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(self), payment=(), usb=(), browsing-topics=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "ssh2", "ssh2-sftp-client"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      ...catalogRouteRedirects,
      {
        source: "/:path*",
        has: [{ type: "host", value: "regionatlas.games" }],
        destination: "https://www.regionatlas.games/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "regionatlas.es" }],
        destination: "https://www.regionatlas.games/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.regionatlas.es" }],
        destination: "https://www.regionatlas.games/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "regionatlas.com" }],
        destination: "https://www.regionatlas.games/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.regionatlas.com" }],
        destination: "https://www.regionatlas.games/:path*",
        permanent: true,
      },
    ];
  },
  outputFileTracingExcludes: {
    "/*": [
      "data/_catalog_backup_gg.json",
      "data/descriptions/**",
      "data/covers-report.json",
      "data/covers-upload-one.txt",
      "data/logs/**",
      "data/research/company-credit-ps4-pal-high-additions-report.*",
      "data/research/ps4-pal-high-*.csv",
      "data/research/ps4-pal-residual-company-research-queue.csv",
      "data/**/*.local.json",
      "public/catalog-details/**",
      "public/mascots/**",
      "public/platform-consoles/**",
    ],
  },
  outputFileTracingIncludes: {
    "/api/admin/price-worker/sync": [
      "./data/platform-sources.json",
      "./data/region-evidence-rules.json",
      "./data/price-source-weights.json",
      "./scripts/*.py",
      "./scripts/collectors/*.py",
      "./scripts/remote_price_rotation.sh",
      "./scripts/remote_price_job_runner.sh",
    ],
  },
  experimental: {
    serverSourceMaps: false,
    turbopackInputSourceMaps: false,
    turbopackServerSideNestedAsyncChunking: true,
    turbopackSourceMaps: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "media.game.es",
        pathname: "/COVERV2/**",
      },
      {
        protocol: "https",
        hostname: "commons.wikimedia.org",
        pathname: "/wiki/Special:FilePath/**",
      },
    ],
  },
};

export default nextConfig;
