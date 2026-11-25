export const REPO = "Mudavath-Giri-Naik/speeq";
export const REPO_URL = `https://github.com/${REPO}`;
export const NPM_URL = "https://www.npmjs.com/package/speeq";
export const INSTALL_COMMAND = "npm i speeq@next zod";

/** The public address of this site, for canonical links and the sitemap. */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3002";
}
