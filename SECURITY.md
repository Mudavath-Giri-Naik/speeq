# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report them privately through GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository ("Security" tab → "Report a vulnerability").

Please include the affected package and version, a description of the impact, and steps to
reproduce. We aim to reply within 7 days and to ship a fix or mitigation within 30 days for
confirmed issues.

## Scope

In scope: all `@speeq/*` packages and the `apps/platform` ingest and dashboard.
Of special interest:

- Bypasses of the confirmation flow for write tools (replay, cross-session, cross-user).
- Access to audit endpoints without `audit.authorize`.
- Session token forgery or reuse after expiry.
- Telemetry sending any field outside the documented allow-list (`docs/reference/telemetry.md`).
- Prompt-injection paths where tool output or retrieved content leads to an unconfirmed write.

## Supported versions

Before 1.0, only the latest published `next` and `latest` versions receive fixes.
