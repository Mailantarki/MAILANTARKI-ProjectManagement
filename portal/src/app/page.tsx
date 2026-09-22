import Link from "next/link";
import { copy } from "../lib/copy";
import { CodeForm } from "./code-form";

export default function Home() {
  return <div className="shell"><header className="topbar"><Link className="brand" href="/">{copy.brand}</Link><span className="tag">Document portal</span></header>
    <main className="main"><div className="eyebrow">Project archive</div><h1>{copy.tagline}</h1>
      <p>Access your project documents with an account or a project code.</p>
      <div className="actions"><Link className="button" href="/login">{copy.signIn}</Link></div>
      <CodeForm />
    </main></div>;
}
