/** Shown at once when a document is opened, while the viewer code loads (no blank pause). */
export function ViewerSkeleton() {
  return <div className="viewer-backdrop" role="presentation">
    <div className="viewer" role="dialog" aria-modal="true" aria-label="Opening document">
      <div className="viewer-toolbar"><div className="viewer-heading"><strong>&nbsp;</strong></div></div>
      <div className="viewer-stage">
        <div className="viewer-loading" role="status"><span className="spinner" aria-hidden />Opening document…</div>
      </div>
    </div>
  </div>;
}

/** Starts downloading the viewer code early (hover or focus on an Open/View button). */
export const preloadViewer = () => { void import("./viewer"); };
