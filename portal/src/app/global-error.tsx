"use client";

// Last-resort boundary when the root layout itself fails; it cannot rely on app CSS.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="en"><body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#e7ede8", color: "#16241c" }}>
    <main style={{ maxWidth: 520, margin: "96px auto", padding: "0 20px" }}>
      <h1 style={{ fontSize: 28 }}>We couldn&apos;t load the portal</h1>
      <p style={{ color: "#52645a" }}>This is usually temporary. Try again in a moment.</p>
      <button type="button" onClick={reset} style={{ minHeight: 44, padding: "0 20px", border: 0, borderRadius: 6, background: "#1f3d2e", color: "#fff", fontSize: 16 }}>Try again</button>
    </main>
  </body></html>;
}
