---

title: Security policy
description: How to report a security problem, and a summary of how speeq protects your app.
---

# Security policy

## Report a problem

**Please do not open a public issue for security problems.**

Use GitHub's private vulnerability reporting. On the [speeq repository](https://github.com/Mudavath-Giri-Naik/speeq), open the **Security** tab and choose **Report a vulnerability**.

Please include the package and version, what the impact is, and the steps to reproduce it. We aim to reply within 7 days, and to ship a fix or a workaround within 30 days for confirmed problems.

## What we care about most

- Ways around the approval step for write tools (replays, or using another session or user).
- Reading the audit routes without `audit.authorize`.
- Forging a session token, or using one after it expired.
- Telemetry sending any field outside the documented list.
- Text in a tool result or a search result that tricks the assistant into changing data without approval.

## How speeq protects you

- Sessions use signed tokens that expire, and they are tied to the current user.
- Write tools ask for approval by default. Each approval can be used once.
- Audit reads need your explicit permission. Secret-looking argument names are masked before saving.
- Telemetry is anonymous, and off until you set an address.
- The rate limiter works inside one server. Use a shared limiter for site-wide protection.

Your tools must still check permissions. speeq cannot know your rules.

## Supported versions

Before 1.0, only the latest `next` and `latest` versions get fixes.

## Next steps

- [Sessions and security](/docs/concepts/security)
- [Privacy and telemetry](/docs/concepts/privacy)
