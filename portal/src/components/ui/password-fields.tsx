"use client";
import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/** Password input with a show/hide toggle. The toggle sits outside the <label> so it never becomes part of the field's name. */
export function PasswordInput({ label, name, autoComplete, value, onChange, describedBy, minLength, maxLength }: {
  label: string; name: string; autoComplete: string; value: string; onChange: (value: string) => void;
  describedBy?: string; minLength?: number; maxLength?: number;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return <div className="field">
    <label htmlFor={id}>{label}</label>
    <span className="password-input">
      <input id={id} type={visible ? "text" : "password"} name={name} autoComplete={autoComplete} required
        minLength={minLength} maxLength={maxLength} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={describedBy} />
      <button type="button" className="password-toggle" onClick={() => setVisible(!visible)} aria-label={visible ? "Hide" : "Show"}
        aria-pressed={visible} title={visible ? "Hide password" : "Show password"}>
        {visible ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}</button>
    </span>
  </div>;
}

/** New password + confirmation with visible rules and a live match check (min 12, max 128). */
export function PasswordFields() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const hint = useId();
  const match = useId();
  const long = password.length >= 12;
  const same = confirm.length > 0 && confirm === password;
  return <>
    <PasswordInput label="New password" name="password" autoComplete="new-password" value={password} onChange={setPassword}
      describedBy={hint} minLength={12} maxLength={128} />
    <span id={hint} className={`field-hint${long ? " ok" : ""}`}>{long ? "✓ " : ""}At least 12 characters</span>
    <PasswordInput label="Confirm password" name="confirm" autoComplete="new-password" value={confirm} onChange={setConfirm}
      describedBy={match} minLength={12} maxLength={128} />
    <span id={match} className={`field-hint${same ? " ok" : ""}`} aria-live="polite">
      {confirm.length === 0 ? "" : same ? "✓ Passwords match" : "Passwords don't match yet"}</span>
  </>;
}
