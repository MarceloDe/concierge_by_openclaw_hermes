import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  outputFileTracingRoot: appDir,
  async rewrites() {
    const apiBase = process.env.BRAINSTY_CONNECTOR_API_BASE || process.env.NEXT_PUBLIC_BRAINSTY_API_BASE || "http://127.0.0.1:8000";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiBase}/api/v1/:path*`
      }
    ];
  }
};

export default nextConfig;
