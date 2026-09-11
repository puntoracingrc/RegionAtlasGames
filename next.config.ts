import type { NextConfig } from "next";
import catalogRouteRedirectsData from "./data/catalog-route-redirects.json";
import coverAssetRedirects from "./data/cover-asset-redirects.json";
import ps2CoverHosting from "./data/ps2-cover-hosting.json";

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
      ...coverAssetRedirects,
      {
        source: "/catalog-covers/ps2/galeria/:path*",
        destination: `${ps2CoverHosting.origin}/catalog-covers/ps2/galeria/:path*`,
        permanent: true,
      },
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
      "artifacts/ps1-region-migration/**",
      "artifacts/ps2-region-migration/**",
      "artifacts/ps1-pending-covers/**",
      "data/_catalog_backup_gg.json",
      "data/descriptions/**",
      "data/covers-report.json",
      "data/covers-upload-one.txt",
      "data/logs/**",
      // Offline migration/backfill evidence is retained in Git, not read by runtime routes.
      "data/migrations/franchise-series-v1/**",
      "data/company-role-backfill-report.json",
      // Imported statically by admin-price-review; its full contents are already in server chunks.
      "data/ebay-regional-campaigns/review-queue.json",
      // Raw worker journals and the offline replay report are not runtime inputs.
      "data/ebay-regional-campaigns/ai-usage/**",
      "data/research/gameboy-reviewed-batch-report.json",
      "data/research/company-credit-ps4-pal-high-additions-report.*",
      "data/research/company-credit-ps4-pal-compilations-*",
      "data/research/ps4-pal-compilations-source.json",
      "data/research/ps4-pal-high-*.csv",
      "data/research/ps4-pal-residual-company-research-queue.csv",
      // Offline credit-audit inputs, never read by the web or price worker sync.
      "data/research/ps4-pal-rapid-review-decisions.csv",
      "data/research/ps4-pal-rapid-review-resolved.csv",
      // Award runtime data is statically imported from public.json; research is build-time only.
      "data/research/award-study/**",
      "data/research/award-editorial-approvals.json",
      "data/research/company-logos/manifest.csv",
      "data/research/company-logos/history-routes.json",
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
      "./data/ps2-source-knowledge.json.gz",
      "./data/ps2-edition-evidence.json.gz",
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
