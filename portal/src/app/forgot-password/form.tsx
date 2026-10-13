"use client";
import { useState } from "react";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  if (state === "sent") {
    return <div className="form-success" role="status"><strong>Check your email</strong>
      <p>If an account exists for {email}, a reset link is on its way. It works once and expires after one hour. Open it in this browser.</p></div>;
  }
  return <form className="form" onSubmit={async (event) => {
    event.preventDefault(); setState("busy"); setError("");
    try {
      const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      if (response.status === 429) { setError("Too many attempts. Try again in 15 minutes."); setState("error"); return; }
      if (!response.ok) { setError("Enter a valid email address."); setState("error"); return; }
      setState("sent");
    } catch { setError("Could not send the email. Try again."); setState("error"); }
  }}>
    {error && <p className="form-alert" role="alert">{error}</p>}
    <label className="field">Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    <button className="button" type="submit" disabled={state === "busy"}>{state === "busy" ? "Sending…" : "Send reset link"}</button>
  </form>;
}
