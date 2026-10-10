"use client";
import Link from "next/link";
import { useEffect } from "react";
import { copy } from "@/lib/copy";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <div className="shell"><header className="topbar"><Link className="brand" href="/projects">{copy.brand}</Link></header>
    <main className="main state-page" aria-labelledby="error-title">
      <div className="eyebrow">Something went wrong</div>
      <h1 id="error-title">We couldn&apos;t load this page</h1>
      <p>This is usually temporary. Try again, or go back to your projects.</p>
      {error.digest && <p className="state-reference">Reference: {error.digest}</p>}
      <div className="actions"><button className="button" type="button" onClick={reset}>Try again</button>
        <Link className="button secondary" href="/projects">Back to projects</Link></div>
    </main></div>;
}
