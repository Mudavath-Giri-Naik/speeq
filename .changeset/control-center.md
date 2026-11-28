---

"speeq": minor
"@speeq/cli": minor
"@speeq/integrate": minor
---

`speeq setup` is now the control center: a status card, twelve sections (agent identity and personality, business, model and behavior, voice and languages, authentication, customer context, page context, greetings and starters, memory, storage and retention, chat box, verification), each with a badge and one deterministically ranked recommendation. Business facts, presets and sign-in come from the code with file and line evidence. Bind a detected sign-in system, approve discovered customer data fields (restricted fields can never be approved; endpoints without a visible sign-in check need an explicit confirmation), preview greetings with sample data, choose memory modes, and set up MongoDB with a hidden URI and an optional connection check. Edits go to a draft; Save shows a diff, writes `.speeq/setup.json` (version 2), a server-only `.speeq/generated/agent.ts` (plus `identity.ts` and `context.ts`) and wires `...agentSettings` into `speeq.config.ts` once, through the integration journal so `speeq rollback` undoes it. Settings your own config overrides are reported. `speeq setup <section>` deep-links and `speeq setup --json` prints the state without secrets.
