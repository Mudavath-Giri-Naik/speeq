import { speeqVitestConfig } from "../../vitest.shared.ts";

// Rendering markdown loads the syntax highlighter, which is slow when the whole repo is tested at once.
export default speeqVitestConfig({ environment: "node", testTimeout: 60_000 });
