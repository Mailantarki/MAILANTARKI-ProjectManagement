"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Upload, X } from "lucide-react";

export function LogoField({ previewUrl }: { previewUrl?: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState("");
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  function choose(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024 || !file.size) {
      setError("Choose a JPEG, PNG or WebP image up to 5 MB.");
      if (input.current) input.current.value = "";
      return;
    }
    const transfer = new DataTransfer();
    transfer.items.add(file);
    if (input.current) input.current.files = transfer.files;
    setPreview(URL.createObjectURL(file)); setRemoved(false); setError("");
  }
  const source = removed ? "" : preview || previewUrl;
  return <div className="cover-field"><span className="cover-label">Logo</span>
    <div className="cover-drop" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
      event.preventDefault(); choose(event.dataTransfer.files[0]);
    }}>
      {source ? <div className="cover-preview" role="img" aria-label="Organization logo preview"
        style={{ backgroundImage: `url("${source}")` }} /> : <ImagePlus size={28} aria-hidden />}
      <div><strong>Drop an image here</strong><span>JPEG, PNG or WebP, up to 5 MB</span></div>
      <button type="button" className="button secondary cover-browse" onClick={() => input.current?.click()}><Upload size={16} aria-hidden />Browse</button>
      <input ref={input} className="sr-only" aria-label="Logo file" type="file" name="logoImage"
        accept="image/jpeg,image/png,image/webp" onChange={(event) => choose(event.target.files?.[0])} />
    </div>
    {source && <button type="button" className="cover-remove" onClick={() => {
      setRemoved(true); setPreview(""); if (input.current) input.current.value = "";
    }}><X size={15} aria-hidden />Remove logo</button>}
    <input type="hidden" name="removeLogo" value={String(removed)} />
    {error && <p role="alert" className="error">{error}</p>}
  </div>;
}
