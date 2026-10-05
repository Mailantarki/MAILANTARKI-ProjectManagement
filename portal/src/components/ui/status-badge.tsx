const labels: Record<string, string> = {
  draft: "Draft", for_review: "For review", issued_for_construction: "Issued for construction",
  as_built: "As-built", active: "Active", revoked: "Revoked", expired: "Expired",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge status-${status}`}>{labels[status] ?? status}</span>;
}
