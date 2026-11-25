# Release speeq

## One-time setup

Require two-factor authentication for the `speeq` npm organization and enable it on the publishing account. Give that account publish access to the unscoped `speeq` package and the nine scoped packages. First publication of a scoped package needs public access. Each publishable manifest and the Changesets configuration specify `public`.

Publishing uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC), so the repository holds no npm token. For each of the ten packages, open the package settings on npmjs.com and add a GitHub Actions trusted publisher: owner `Mudavath-Giri-Naik`, repository `speeq`, workflow `release.yml`, no environment. Allow `npm publish`; leave dist-tag management off. Enable GitHub Actions to create pull requests in the repository settings.

A new package needs one first publish with a short-lived granular token (read and write, bypass 2FA) before its trusted publisher can be configured. Delete that token and the `NPM_TOKEN` secret afterwards.

## Cut a release

1. Add a changeset with `pnpm changeset` in the feature branch. Describe the user-visible change and select a bump. All ten published packages share a fixed version.
2. Merge the feature into the upstream `main` branch. The release job installs the locked dependencies, runs lint, typecheck, tests and builds, then packs and installs the tarballs in a scratch app.
3. After the gates pass, Changesets opens or updates **Version Packages**. Review the versions, internal dependency updates and changelogs. Merge that PR when ready.
4. The next push to `main` repeats the gates. With the changesets consumed, `pnpm release` builds and publishes unpublished versions with npm provenance under `next`. Check each package with `npm view <pkg> dist-tags`.

## Promote or roll back

To promote a tested build, run `npm dist-tag add <pkg>@<version> latest` for every package in the fixed group. Promotion is manual.

For a bad release, move the affected tag back using `npm dist-tag add <pkg>@<known-good-version> <tag>`, deprecate each affected version with `npm deprecate <pkg>@<bad-version> "Use <known-good-version> instead"`, and release a corrected version. Never unpublish after 72 hours.
