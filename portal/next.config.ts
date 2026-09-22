import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  async headers() {
    const devEval = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
    const devConnect = process.env.NODE_ENV === "development" ? " http://127.0.0.1:* http://localhost:*" : "";
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const localStorageOrigin = supabaseUrl && ["localhost", "127.0.0.1"].includes(new URL(supabaseUrl).hostname)
      ? ` ${new URL(supabaseUrl).origin}` : "";
    return [{ source: "/:path*", headers: [
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Content-Security-Policy", value: `default-src 'self'; script-src 'self' 'unsafe-inline'${devEval}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https:${devConnect}${localStorageOrigin}; worker-src 'self' blob:; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` },
    ] }];
  },
};
export default nextConfig;
