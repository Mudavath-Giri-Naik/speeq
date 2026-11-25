import { describe, expect, it } from "vitest";
import {
  addUserMessage,
  applyStep,
  type DemoState,
  initialState,
  matchPreset,
  presets,
  reset,
  resolvePending,
  type Step,
} from "../lib/demo-logic";

function run(state: DemoState, steps: Step[]): DemoState {
  return steps.reduce(applyStep, state);
}
const preset = (id: string) => presets.find((p) => p.id === id) as (typeof presets)[number];

describe("demo scenarios", () => {
  it("opens the pricing page", () => {
    const state = run(addUserMessage(initialState, "Show me pricing"), preset("pricing").steps);
    expect(state.route).toBe("pricing");
    expect(state.messages.at(-1)?.role).toBe("assistant");
    expect(state.pending).toBeNull();
  });

  it("finds the order, then shows it", () => {
    const state = run(addUserMessage(initialState, "Where is my order?"), preset("order").steps);
    expect(state.route).toBe("orders");
    expect(state.tools).toContain("find_order");
    expect(state.order).toBe("shipped");
  });

  it("pauses for approval on a cancel", () => {
    const state = run(addUserMessage(initialState, "Cancel order 1042"), preset("cancel").steps);
    expect(state.pending?.summary).toBe("Cancel order #1042?");
    expect(state.order).toBe("shipped");
  });

  it("approve cancels the order exactly once", () => {
    const paused = run(addUserMessage(initialState, "Cancel order 1042"), preset("cancel").steps);
    const { state, steps } = resolvePending(paused, true);
    expect(state.pending).toBeNull();
    const done = run(state, steps);
    expect(done.order).toBe("cancelled");
    expect(done.tools).toContain("cancel_order");
    // a second resolve has nothing to do
    expect(resolvePending(done, true).steps).toEqual([]);
  });

  it("reject leaves the site unchanged", () => {
    const paused = run(addUserMessage(initialState, "Cancel order 1042"), preset("cancel").steps);
    const before = { route: paused.route, order: paused.order };
    const { state, steps } = resolvePending(paused, false);
    const done = run(state, steps);
    expect({ route: done.route, order: done.order }).toEqual(before);
    expect(done.order).toBe("shipped");
    expect(done.messages.at(-1)?.text).toMatch(/left your order/);
  });

  it("matches free text to the nearest preset and falls back to the first", () => {
    expect(matchPreset("what do your plans cost").id).toBe("pricing");
    expect(matchPreset("please cancel it").id).toBe("cancel");
    expect(matchPreset("track my package").id).toBe("order");
    expect(matchPreset("zzzz").id).toBe("pricing");
  });

  it("resets to the initial state", () => {
    const dirty = run(addUserMessage(initialState, "hi"), preset("pricing").steps);
    expect(reset()).toEqual(initialState);
    expect(dirty).not.toEqual(initialState);
  });

  it("gives every message a unique id", () => {
    const state = run(addUserMessage(initialState, "x"), preset("cancel").steps);
    const ids = state.messages.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
