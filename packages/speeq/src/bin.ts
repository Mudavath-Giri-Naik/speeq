#!/usr/bin/env node
// The `speeq` executable. The SDK supports Node 20, the CLI needs 22.12 (ADR-0014), so check first.
const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  process.stderr.write(
    `speeq: the command line tool needs Node.js 22.12 or newer (this is ${process.versions.node}).\n`,
  );
  process.exitCode = 1;
} else {
  const { main } = await import("@speeq/cli");
  await main();
}
