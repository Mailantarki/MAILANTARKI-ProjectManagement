"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Eye } from "lucide-react";
const Viewer = dynamic(() => import("./viewer"), { ssr: false });
export function PdfViewerLauncher({ documentId }: { documentId: string }) {
  const [open, setOpen] = useState(false);
  return <><button className="view-document" type="button" onClick={() => setOpen(true)}><Eye size={14} aria-hidden />View</button>{open && <Viewer documentId={documentId} onClose={() => setOpen(false)} />}</>;
}
