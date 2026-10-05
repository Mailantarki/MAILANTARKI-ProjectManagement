"use client";

import { ImagePlus, Upload, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { finalizeProjectCoverUpload, prepareProjectCoverUpload } from "./cover-actions";

export function CoverImageField({ currentPreviewUrl, projectId }: {
  currentPreviewUrl?: string | null;
  projectId?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [remove, setRemove] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState("");
  const [selectedPreview, setSelectedPreview] = useState("");
  const objectUrl = useRef("");

  useEffect(() => {
    return () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); };
  }, []);

  async function choose(next?: File) {
    if (!next) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(next.type)) {
      setError("Choose a JPEG, PNG or WebP image.");
      return;
    }
    if (next.size > 5 * 1024 * 1024) {
      setError("The image is larger than 5 MB. Choose a smaller file.");
      return;
    }
    setError("");
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(next);
    setSelectedPreview(objectUrl.current);
    setFile(next);
    setRemove(false);
    if (!projectId) {
      setPhase("Selected. Click Create project to upload this cover.");
      return;
    }
    setPhase("Uploading cover...");
    try {
      const ticket = await prepareProjectCoverUpload({ projectId, size: next.size, mime: next.type });
      const { error: uploadError } = await getBrowserClient().storage.from("project-covers")
        .uploadToSignedUrl(ticket.path, ticket.token, next, { contentType: next.type });
      if (uploadError) throw new Error("Could not upload cover image");
      setPhase("Validating cover...");
      await finalizeProjectCoverUpload({ projectId, path: ticket.path });
      setFile(null);
      if (input.current) input.current.value = "";
      setPhase("Cover saved. It will remain after reloading.");
    } catch (cause) {
      setPhase("");
      setError(cause instanceof Error ? cause.message : "Could not upload cover image");
    }
  }

  const preview = selectedPreview || (remove ? "" : currentPreviewUrl ?? "");

  return <div className="cover-field">
    <span className="cover-label">Cover image</span>
    <div className={`cover-drop${dragging ? " dragging" : ""}`} onDragEnter={(event) => {
      event.preventDefault(); setDragging(true);
    }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => {
      event.preventDefault(); setDragging(false); choose(event.dataTransfer.files[0]);
    }}>
      {preview ? <div className="cover-preview" style={{ backgroundImage: `url("${preview}")` }}
        role="img" aria-label="Project cover preview" /> : <ImagePlus size={28} aria-hidden />}
      <div><strong>{file?.name ?? (currentPreviewUrl && !remove ? "Current cover" : "Drop an image here")}</strong>
        <span>JPEG, PNG or WebP, up to 5 MB</span></div>
      <button className="button secondary cover-browse" type="button" onClick={() => input.current?.click()}>
        <Upload size={16} aria-hidden />Browse
      </button>
      <input id={id} ref={input} className="sr-only" name={projectId ? undefined : "coverImage"} type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        onChange={(event) => choose(event.target.files?.[0])} />
    </div>
    {(currentPreviewUrl || file) && <button className="cover-remove" type="button" onClick={() => {
      setFile(null); setRemove(true); if (input.current) input.current.value = "";
    }}><X size={15} aria-hidden />Remove cover</button>}
    {phase && <span className="cover-help" role="status">{phase}</span>}
    {error && <span className="error" role="alert">{error}</span>}
    <input type="hidden" name="removeCover" value={remove ? "true" : "false"} />
  </div>;
}
