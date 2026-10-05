type CspOptions = {
  nonce: string;
  development: boolean;
  supabaseUrl?: string;
};

export function contentSecurityPolicy({ nonce, development, supabaseUrl }: CspOptions) {
  const localStorageOrigin = supabaseUrl && ["localhost", "127.0.0.1"].includes(new URL(supabaseUrl).hostname)
    ? ` ${new URL(supabaseUrl).origin}`
    : "";
  const devEval = development ? " 'unsafe-eval'" : "";
  const devConnect = development ? " http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*" : "";

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devEval}`,
    // React-PDF and calculated layout values use React style attributes. Scripts do not need unsafe-inline.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: https:${localStorageOrigin}`,
    `connect-src 'self' https:${devConnect}${localStorageOrigin}`,
    "worker-src 'self' blob:",
    "font-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}
