"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
const Viewer = dynamic(() => import("./viewer"), { ssr: false });
export function PdfViewerLauncher({ documentId }: { documentId: string }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" onClick={() => setOpen(true)}>View</button>{open && <Viewer documentId={documentId} onClose={() => setOpen(false)} />}</>;
}
