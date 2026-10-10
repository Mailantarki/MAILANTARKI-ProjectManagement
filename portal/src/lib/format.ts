// Display helpers shared by portal and admin pages. Dates are stored as UTC.
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC",
});

export function formatDate(value: string | null | undefined, fallback = "-") {
  if (!value) return fallback;
  const time = Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(time) ? fallback : dateFormat.format(time);
}

export function formatDateTime(value: string | null | undefined, fallback = "-") {
  if (!value) return fallback;
  const time = Date.parse(value);
  return Number.isNaN(time) ? fallback : `${dateTimeFormat.format(time)} UTC`;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export const docTypeLabels: Record<string, string> = {
  plan: "Plan", section: "Section", elevation: "Elevation", detail: "Detail",
  specification: "Specification", schedule: "Schedule", report: "Report", other: "Other",
};

export const docStatusLabels: Record<string, string> = {
  draft: "Draft", for_review: "For review", issued_for_construction: "Issued for construction", as_built: "As-built",
};

export const accessActionLabels: Record<string, string> = {
  login: "Signed in", code_redeem: "Redeemed a code", view: "Viewed", download: "Downloaded",
};

export const adminEventLabels: Record<string, string> = {
  user_created: "Created user", user_suspended: "Suspended user", user_reactivated: "Reactivated user",
  access_assigned: "Assigned access", access_removed: "Removed access", password_changed: "Changed password",
  document_made_current: "Made revision current",
};

export const label = (map: Record<string, string>, value: string | null | undefined) =>
  value ? map[value] ?? value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase()) : "-";
