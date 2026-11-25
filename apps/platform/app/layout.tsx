import type { ReactNode } from "react";
/** Platform document shell. */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
