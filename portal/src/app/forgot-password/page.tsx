import Link from "next/link";
import { copy } from "@/lib/copy";
import { ForgotPasswordForm } from "./form";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  const { expired } = await searchParams;
  return <div className="shell"><header className="topbar"><Link className="brand" href="/">{copy.brand}</Link></header>
    <main className="main auth-page"><div className="eyebrow">Account access</div><h1>Reset your password</h1>
      {expired && <p className="form-alert" role="alert">That link has expired or was already used. Request a new one below.</p>}
      <p>Enter the email you use to sign in. We&apos;ll send you a link to choose a new password.</p>
      <ForgotPasswordForm />
      <p className="auth-links"><Link href="/login">Back to sign in</Link></p>
    </main></div>;
}
