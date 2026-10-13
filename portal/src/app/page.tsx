import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { copy } from "../lib/copy";
import { safeNext, withNext } from "../lib/auth/next-path";
import { AuthLayout } from "@/components/auth/auth-layout";
import { CodeForm } from "./code-form";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function Home({ searchParams }: Props) {
  // Set when a signed-out visitor opens a project link (for example from the public landing).
  const next = safeNext((await searchParams).next);
  return <AuthLayout eyebrow="Project archive" title={copy.tagline}
    lead={next ? "Sign in or enter your project code to open this project." : "Access your project documents with an account or a project code."}>
    <Link className="button auth-primary" href={withNext("/login", next)}>{copy.signIn}<ArrowRight size={18} aria-hidden /></Link>
    <div className="auth-divider" role="presentation"><span>or use a project code</span></div>
    <CodeForm next={next} />
  </AuthLayout>;
}
