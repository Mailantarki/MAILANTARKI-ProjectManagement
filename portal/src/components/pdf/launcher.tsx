"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, Eye } from "lucide-react";
import { useDocumentSet } from "@/components/documents/document-set";

import { preloadViewer, ViewerSkeleton } from "./viewer-skeleton";

const Viewer = dynamic(() => import("./viewer"), { ssr: false, loading: () => <ViewerSkeleton /> });

export type ViewerDocument = { id: string; title: string; subtitle: string };

/**
 * Opens the PDF viewer. `variant="title"` renders the document title as the trigger; `variant="auto"`
 * renders no trigger and opens at once (?open={id}), removing the parameter when the viewer closes.
 */
export function PdfViewerLauncher({ document, variant = "button" }: { document: ViewerDocument; variant?: "button" | "title" | "auto" }) {
  const [open, setOpen] = useState(variant === "auto");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const siblings = useDocumentSet();
  if (variant === "auto") {
    const close = () => {
      setOpen(false);
      const next = new URLSearchParams(params);
      next.delete("open");
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
    };
    return open ? <Viewer document={document} siblings={siblings} onClose={close} /> : null;
  }
  return <>
    {variant === "title"
      ? <button className="document-open" type="button" onPointerEnter={preloadViewer} onFocus={preloadViewer} onClick={() => setOpen(true)}>{document.title}</button>
      : <button className="view-document" type="button" onPointerEnter={preloadViewer} onFocus={preloadViewer} onClick={() => setOpen(true)} aria-label={`View ${document.title}`}><Eye size={15} aria-hidden /><span className="view-label">View</span></button>}
    {open && <Viewer document={document} siblings={siblings} onClose={() => setOpen(false)} />}
  </>;
}

export function DownloadButton({ document }: { document: ViewerDocument }) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  return <button className="download-document" type="button" disabled={state === "busy"}
    aria-label={`Download ${document.title}`} title={state === "error" ? "Download failed. Try again." : "Download"}
    onClick={async () => {
      setState("busy");
      try {
        const response = await fetch(`/api/documents/${document.id}/url?download=1`, { cache: "no-store" });
        if (!response.ok) throw new Error();
        const { url } = await response.json() as { url: string };
        window.location.assign(url);
        setState("idle");
      } catch { setState("error"); }
    }}><Download size={15} aria-hidden /><span className="download-label">{state === "error" ? "Retry" : "Download"}</span></button>;
}
