"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { copy } from "../lib/copy";

export function CodeForm({ next = null }: { next?: string | null }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const alert = useRef<HTMLParagraphElement>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setPending(true); setError("");
    const fail = () => { setError(copy.invalidCode); setTimeout(() => alert.current?.focus(), 0); };
    try {
      const response = await fetch("/api/access-code/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      if (!response.ok) { fail(); return; }
      router.push(next ?? "/projects"); router.refresh();
    } catch { fail(); } finally { setPending(false); }
  }
  return <form className="form auth-form" onSubmit={submit}>
    {error && <p ref={alert} tabIndex={-1} className="form-alert" role="alert">{error}</p>}
    <label className="field">{copy.enterCode}<input className="code-input" value={code} onChange={(event) => setCode(event.target.value)}
      placeholder="XXXXX-XXXXX" autoComplete="off" autoCapitalize="characters" spellCheck={false} required /></label>
    <button className="button secondary" disabled={pending} type="submit">{pending ? "Checking…" : copy.enterCode}</button>
  </form>;
}
