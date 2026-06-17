import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "ssh2", "ssh2-sftp-client"],
  async redirects() {
    return [
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
      "data/**/*.local.json",
      "public/mascots/**",
      "public/platform-consoles/**",
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
        hostname: "commons.wikimedia.org",
        pathname: "/wiki/Special:FilePath/**",
      },
    ],
  },
};

export default nextConfig;
