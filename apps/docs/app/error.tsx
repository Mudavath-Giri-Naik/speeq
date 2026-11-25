"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="container-x flex min-h-[60dvh] flex-col items-center justify-center py-20 text-center">
      <h1 className="text-2xl font-semibold text-fg">Something went wrong</h1>
      <p className="mt-2 text-muted">Please try again. If it keeps happening, tell us on GitHub.</p>
      <button type="button" onClick={reset} className="btn btn-primary mt-6">
        Try again
      </button>
    </main>
  );
}
