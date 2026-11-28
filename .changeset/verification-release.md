---

"speeq": minor
"@speeq/cli": minor
"@speeq/integrate": minor
---

`speeq verify` and `speeq doctor` check personalisation: settings wired into speeq.config.ts, the bound sign-in still exists, cross-session memory has a signed-in user, the store fits the memory mode (MongoDB URI present and persistence verified), and approved context sources are generated. The runtime level runs your settings with a mock model and a test user: guest, sign-in, sign-out, account and tenant switch, a forged browser identity, greetings that use only real values, and memory that continues only the owner's conversation. `speeq verify --live-store` proves persistence in your MongoDB using temporary collections it drops afterwards. Fixed: the generated chat box passed a wrongly shaped `getContext`, which failed strict type checks (`next build`) in host apps; the client already sends the page path and title.
