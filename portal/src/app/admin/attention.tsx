"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, MailPlus, Trash2 } from "lucide-react";
import { toast } from "@/components/ui/toaster";
import { extendAccessCode } from "./codes/actions";
import { resendInvite } from "./users/actions";
import { cancelUpload } from "./projects/[slug]/documents/new/actions";

const DAY = 86400_000;

/** One-click actions of the "Needs attention" list. */
function ActionButton({ label, icon, run, done, danger = false }: {
  label: string; icon: React.ReactNode; run: () => Promise<unknown>; done: string; danger?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <button type="button" className={`button secondary${danger ? " danger-text" : ""}`} disabled={busy} onClick={async () => {
    setBusy(true);
    try { await run(); toast(done); router.refresh(); }
    catch (cause) { toast(cause instanceof Error ? cause.message : "Something went wrong", { error: true }); }
    finally { setBusy(false); }
  }}>{icon}{busy ? "Working…" : label}</button>;
}

export function ExtendThirtyDays({ id, expiresAt }: { id: string; expiresAt: string }) {
  return <ActionButton label="Extend 30 days" icon={<CalendarPlus size={15} aria-hidden />} done="Access code extended"
    run={() => {
      const form = new FormData();
      form.set("id", id);
      form.set("expiresAt", new Date(Math.max(Date.now(), Date.parse(expiresAt)) + 30 * DAY).toISOString());
      return extendAccessCode(form);
    }} />;
}

export function ResendInvite({ userId }: { userId: string }) {
  return <ActionButton label="Resend invite" icon={<MailPlus size={15} aria-hidden />} done="Invite sent" run={() => resendInvite(userId)} />;
}

export function DiscardUpload({ id }: { id: string }) {
  return <ActionButton label="Discard" icon={<Trash2 size={15} aria-hidden />} done="Unfinished upload discarded" danger run={() => cancelUpload(id)} />;
}
