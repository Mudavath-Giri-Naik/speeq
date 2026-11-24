import pkg from "../package.json" with { type: "json" };

/** The installed `@speeq/server` version. */
export const SDK_VERSION: string = pkg.version;
