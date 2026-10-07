"use client";

/* Last-resort error boundary (Next.js App Router convention) — only fires
   when the ROOT layout itself throws, since error.tsx can't catch errors in
   its own parent. Must render its own <html>/<body> and stay dependency-free
   (no @devdigest/ui, no next-intl): if the root layout is broken, anything
   that layout would have provided may be unavailable too. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            gap: 16,
            fontFamily: "system-ui, sans-serif",
            textAlign: "center",
            padding: 24,
          }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Something went wrong</h1>
          <p style={{ color: "#666", maxWidth: 420 }}>
            DevDigest hit an unexpected error loading the app. Try again, or reload the page.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid #ccc",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
