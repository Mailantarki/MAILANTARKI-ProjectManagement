import Link from "next/link";
import { copy } from "../lib/copy";
import { safeNext, withNext } from "../lib/auth/next-path";
import { CodeForm } from "./code-form";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Home({ searchParams }: Props) {
  // Set when a signed-out visitor opens a project link (for example from the public landing).
  const next = safeNext((await searchParams).next);
  return <div className="shell"><header className="topbar"><Link className="brand" href="/">{copy.brand}</Link><span className="tag">Document portal</span></header>
    <main className="main"><div className="eyebrow">Project archive</div><h1>{copy.tagline}</h1>
      <p>{next ? "Sign in or enter your project code to open this project." : "Access your project documents with an account or a project code."}</p>
      <div className="actions"><Link className="button" href={withNext("/login", next)}>{copy.signIn}</Link></div>
      <CodeForm next={next} />
    </main></div>;
}
