"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { copy } from "../../lib/copy";
import { PasswordInput } from "@/components/ui/password-fields";
import { withNext } from "@/lib/auth/next-path";

export function LoginForm({ next = null }: { next?: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const alert = useRef<HTMLParagraphElement>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setPending(true); setError("");
    const fail = (message: string) => { setError(message); setTimeout(() => alert.current?.focus(), 0); };
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      if (response.status === 429) { fail("Too many attempts. Try again in 15 minutes."); return; }
      if (!response.ok) { fail(copy.invalidLogin); return; }
      const { redirectTo } = await response.json() as { redirectTo?: string };
      router.push(redirectTo === "/change-password" ? "/change-password" : next ?? "/projects"); router.refresh();
    } catch { fail(copy.invalidLogin); } finally { setPending(false); }
  }
  return <form className="form auth-form" onSubmit={submit}>
    {error && <p ref={alert} tabIndex={-1} className="form-alert" role="alert">{error}</p>}
    <label className="field">{copy.email}<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
    <PasswordInput label={copy.password} name="password" autoComplete="current-password" value={password} onChange={setPassword} />
    <p className="auth-inline-link"><Link href="/forgot-password">Forgot password?</Link></p>
    <button className="button auth-primary" type="submit" disabled={pending}>{pending ? "Signing in…" : copy.signIn}</button>
    <p className="auth-switch">No account? <Link href={withNext("/", next)}>Enter a project code</Link></p>
  </form>;
}
