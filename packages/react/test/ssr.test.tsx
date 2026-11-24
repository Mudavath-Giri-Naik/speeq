// @vitest-environment node

import { createSpeeqClient } from "@speeq/client";
import { renderToString } from "react-dom/server";
import { expect, it } from "vitest";
import { SpeeqProvider, useSpeeq } from "../src/index.js";
import { useProvider } from "../src/provider.js";

function Reader() {
  const { state, support } = useSpeeq();
  const { getServerSnapshot } = useProvider("test");
  expect(getServerSnapshot()).toBe(getServerSnapshot());
  expect(getServerSnapshot().support).toEqual({
    speechInput: false,
    speechOutput: false,
    voiceForLanguage: null,
  });
  return <span>{`${state}:${support.speechInput}`}</span>;
}

it("renders an initial snapshot on the server and caches it per client", () => {
  const client = createSpeeqClient({
    endpoint: "/api",
    speech: { input: { supported: true, start() {}, stop() {}, abort() {} }, output: null },
  });
  expect(
    renderToString(
      <SpeeqProvider endpoint="/api" client={client}>
        <Reader />
      </SpeeqProvider>,
    ),
  ).toBe("<span>idle:false</span>");
  expect(
    renderToString(
      <SpeeqProvider endpoint="/api">
        <Reader />
      </SpeeqProvider>,
    ),
  ).toBe("<span>idle:false</span>");
});
