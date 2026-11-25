# Release speeq

## One-time setup

Require two-factor authentication for the `speeq` npm organization and enable it on the publishing account. Give that account publish access to the unscoped `speeq` package and the nine scoped packages. First publication of a scoped package needs public access. Each publishable manifest and the Changesets configuration specify `public`.

Create a granular npm automation token with package write access covering those names, direct publishing and bypass 2FA for noninteractive publication. Save it as the GitHub Actions repository secret `NPM_TOKEN` and rotate it before expiration. Enable GitHub Actions to create pull requests in the repository settings. npm documents a January 2027 end date for direct publishing with granular tokens. Revisit authentication before then. [npm access tokens](https://docs.npmjs.com/about-access-tokens/)

## Cut a release

1. Add a changeset with `pnpm changeset` in the feature branch. Describe the user-visible change and select a bump. All ten published packages share a fixed version.
2. Merge the feature into the upstream `main` branch. The release job installs the locked dependencies, runs lint, typecheck, tests and builds, then packs and installs the tarballs in a scratch app.
3. After the gates pass, Changesets opens or updates **Version Packages**. Review the versions, internal dependency updates and changelogs. Merge that PR when ready.
4. The next push to `main` repeats the gates. With the changesets consumed, `pnpm release` builds and publishes unpublished versions with npm provenance under `next`. Check each package with `npm view <pkg> dist-tags`.

## Promote or roll back

To promote a tested build, run `npm dist-tag add <pkg>@<version> latest` for every package in the fixed group. Promotion is manual.

For a bad release, move the affected tag back using `npm dist-tag add <pkg>@<known-good-version> <tag>`, deprecate each affected version with `npm deprecate <pkg>@<bad-version> "Use <known-good-version> instead"`, and release a corrected version. Never unpublish after 72 hours.
