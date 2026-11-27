const secrets =
  /^(?:\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx|keystore)|id_(?:rsa|ed25519).*|\.npmrc|\.netrc|\.pypirc|(?:credentials|service-account).*\.json|\.git)$/i;
const ignored = /^(?:node_modules|\.next|dist|build|out|coverage|\.turbo|\.vercel|\.pnpm-store)$/i;
/** Built-in exclusions apply at every nesting level, including direct reads. */
export function excluded(path: string) {
  return (
    path.split("/").some((part) => secrets.test(part) || ignored.test(part)) ||
    /(?:^|\/)\.speeq\/backups(?:\/|$)/i.test(path)
  );
}
