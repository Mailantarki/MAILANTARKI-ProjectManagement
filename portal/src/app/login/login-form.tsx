"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { copy } from "../../lib/copy";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setPending(true); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      if (!response.ok) { setError(copy.invalidLogin); return; }
      router.push("/projects"); router.refresh();
    } catch { setError(copy.invalidLogin); } finally { setPending(false); }
  }
  return <form className="form" onSubmit={submit}>
    <label className="field">{copy.email}<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
    <label className="field">{copy.password}<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
    <button className="button" type="submit" disabled={pending}>{copy.signIn}</button><div className="error" role="alert">{error}</div>
  </form>;
}
