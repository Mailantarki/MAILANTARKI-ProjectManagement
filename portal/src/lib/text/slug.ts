/** "Maylan Plaza — Fase 2" → "maylan-plaza-fase-2" (matches the slug rule `[a-z0-9]+(-[a-z0-9]+)*`). */
export function slugify(text: string, max = 100) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/g, "");
}
