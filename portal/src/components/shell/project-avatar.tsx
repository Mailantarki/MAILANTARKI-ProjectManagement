const palette = [
  ["#cfe0d5", "#1f3d2e"], ["#ecdfc6", "#6b4a12"], ["#d6e3ef", "#1a4a8f"],
  ["#e8dbe8", "#5c2d5c"], ["#e1e6d2", "#3e4d16"], ["#f2d9d3", "#7a2e1d"],
];

/** Initials on a colour picked from the name, so each project keeps the same badge everywhere. */
export function ProjectAvatar({ name, size = "sm" }: { name: string; size?: "sm" | "lg" }) {
  const letters = name.replace(/^MAILANTARKI\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const [background, color] = palette[hash % palette.length];
  return <span className={`project-avatar project-avatar-${size}`} style={{ background, color }} aria-hidden>{letters}</span>;
}
