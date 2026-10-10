import Link from "next/link";
import { copy } from "@/lib/copy";

export default function NotFound() {
  return <div className="shell"><header className="topbar"><Link className="brand" href="/projects">{copy.brand}</Link></header>
    <main className="main state-page" aria-labelledby="not-found-title">
      <div className="eyebrow">Not found</div>
      <h1 id="not-found-title">This page isn&apos;t available</h1>
      <p>The link may be out of date, or your account may not have access to it. If you expected to see it, ask your project administrator.</p>
      <div className="actions"><Link className="button" href="/projects">Back to projects</Link></div>
    </main></div>;
}
