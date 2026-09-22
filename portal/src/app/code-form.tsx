"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { copy } from "../lib/copy";

export function CodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setPending(true); setError("");
    try {
      const response = await fetch("/api/access-code/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      if (!response.ok) { setError(copy.invalidCode); return; }
      router.push("/projects"); router.refresh();
    } catch { setError(copy.invalidCode); } finally { setPending(false); }
  }
  return <form className="form" onSubmit={submit}><label className="field">{copy.enterCode}<input value={code} onChange={(event) => setCode(event.target.value)} placeholder="XXXXX-XXXXX" autoComplete="off" /></label>
    <button className="button secondary" disabled={pending} type="submit">{copy.enterCode}</button><div className="error" role="alert">{error}</div></form>;
}
