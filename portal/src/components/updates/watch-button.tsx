"use client";
import { useState, useTransition } from "react";
import { Bell, BellOff } from "lucide-react";
import { setWatching } from "@/lib/updates/actions";

/** Publish emails for this project: on by default for the projects a person can see. */
export function WatchButton({ projectId, watching: initial }: { projectId: string; watching: boolean }) {
  const [watching, setState] = useState(initial);
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  return <button type="button" className="button secondary icon-button-text" aria-pressed={watching} disabled={pending}
    title={watching ? "You get an email when documents are published here. Click to stop." : "Get an email when documents are published here."}
    onClick={() => start(async () => {
      try { setState((await setWatching({ projectId, enabled: !watching })).enabled); setFailed(false); }
      catch { setFailed(true); }
    })}>
    {watching ? <Bell size={16} aria-hidden /> : <BellOff size={16} aria-hidden />}
    <span>{failed ? "Try again" : watching ? "Watching" : "Not watching"}</span></button>;
}
