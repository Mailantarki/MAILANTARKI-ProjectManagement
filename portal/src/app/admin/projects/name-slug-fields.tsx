"use client";
import { useState } from "react";
import { slugify } from "@/lib/text/slug";

/** Name + web address. The address follows the name until the admin edits it by hand. */
export function NameSlugFields({ defaultName = "", defaultSlug = "" }: { defaultName?: string; defaultSlug?: string }) {
  const [name, setName] = useState(defaultName);
  const [slug, setSlug] = useState(defaultSlug);
  const [touched, setTouched] = useState(!!defaultSlug);
  return <>
    <label className="field">Name<input name="name" value={name} required maxLength={160}
      onChange={(e) => { setName(e.target.value); if (!touched) setSlug(slugify(e.target.value)); }} /></label>
    <label className="field">Web address
      <span className="prefixed-input"><span aria-hidden>/projects/</span>
        <input name="slug" value={slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={100}
          onChange={(e) => { setTouched(true); setSlug(e.target.value.toLowerCase()); }} /></span></label>
  </>;
}
