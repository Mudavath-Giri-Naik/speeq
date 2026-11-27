const secrets =
  /^(?:\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx|keystore)|id_(?:rsa|ed25519).*|\.npmrc|\.netrc|\.pypirc|(?:credentials|service-account).*\.json|\.git)$/i;
const ignored = /^(?:node_modules|\.next|\.turbo|\.vercel|\.pnpm-store)$/i;
/** Built-in exclusions apply at every nesting level, including direct reads. */
export function excluded(path: string) {
  return (
    path.split("/").some((part) => secrets.test(part) || ignored.test(part)) ||
    /(?:^|\/)\.speeq\/backups(?:\/|$)/i.test(path)
  );
}

/** Output directories are special only directly beneath a package root. */
export const packageOutput = /^(?:dist|build|out|coverage)$/i;
