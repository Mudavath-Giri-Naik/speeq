import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container-x flex min-h-[60dvh] flex-col items-center justify-center py-20 text-center">
      <p className="gradient-text text-7xl font-bold tracking-tighter">404</p>
      <h1 className="mt-4 text-2xl font-semibold text-fg">We could not find that page</h1>
      <p className="mt-2 max-w-md text-muted">
        It may have moved. Press{" "}
        <kbd className="rounded border border-line px-1.5 font-mono text-xs">/</kbd> to search the
        docs, or start from one of these.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn btn-ghost">
          Home
        </Link>
        <Link href="/docs/introduction" className="btn btn-primary">
          Read the docs
        </Link>
      </div>
    </main>
  );
}
