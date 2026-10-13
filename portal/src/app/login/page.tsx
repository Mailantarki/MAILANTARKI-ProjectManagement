import Link from "next/link";
import { copy } from "../../lib/copy";
import { safeNext } from "../../lib/auth/next-path";
import { LoginForm } from "./login-form";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function LoginPage({ searchParams }: Props) {
  const next = safeNext((await searchParams).next);
  return <div className="shell"><header className="topbar"><Link className="brand" href="/">{copy.brand}</Link></header>
    <main className="main auth-page"><div className="eyebrow">Account access</div><h1>{copy.signIn}</h1><LoginForm next={next} /></main></div>;
}
