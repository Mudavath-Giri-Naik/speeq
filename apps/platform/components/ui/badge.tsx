/** Textual project status indicator. */
export function Badge({ revoked }: { revoked: boolean }) {
  return <span className="badge">{revoked ? "Revoked" : "Active"}</span>;
}
