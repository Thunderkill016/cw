import { describe, it, expect } from "vitest";
import {
  advanceState,
  isValidTransition,
  isTerminalState,
  StateMachineError,
  type TaskState,
} from "../src/core/state-machine.js";

describe("isValidTransition", () => {
  it("allows valid forward transitions", () => {
    expect(isValidTransition("draft", "prepared")).toBe(true);
    expect(isValidTransition("prepared", "implementing")).toBe(true);
    expect(isValidTransition("implementing", "verifying")).toBe(true);
    expect(isValidTransition("verifying", "accepted")).toBe(true);
    expect(isValidTransition("verifying", "rejected")).toBe(true);
  });

  it("allows re-implementing from verifying", () => {
    // verifying -> implementing is valid (retry loop)
    expect(isValidTransition("verifying", "implementing")).toBe(true);
  });

  it("allows verification to start without an observed implementing step", () => {
    // CW never observes the agent writing code, so a task can go straight from
    // prepared (or from a rejected attempt) into verifying.
    expect(isValidTransition("prepared", "verifying")).toBe(true);
    expect(isValidTransition("rejected", "verifying")).toBe(true);
  });

  it("allows a rejected attempt to re-enter the fix-and-reverify loop", () => {
    expect(isValidTransition("rejected", "implementing")).toBe(true);
  });

  it("blocks backward and illegal transitions", () => {
    expect(isValidTransition("accepted", "draft")).toBe(false);
    expect(isValidTransition("accepted", "rejected")).toBe(false);
    expect(isValidTransition("rejected", "accepted")).toBe(false);
    expect(isValidTransition("draft", "implementing")).toBe(false);
    expect(isValidTransition("draft", "accepted")).toBe(false);
    expect(isValidTransition("prepared", "accepted")).toBe(false);
    expect(isValidTransition("implementing", "accepted")).toBe(false);
  });

  it("blocks self-transitions", () => {
    const states: TaskState[] = ["draft", "prepared", "implementing", "verifying", "accepted", "rejected"];
    for (const state of states) {
      expect(isValidTransition(state, state), `${state} -> ${state} should not be valid`).toBe(false);
    }
  });
});

describe("advanceState", () => {
  it("returns the next state on valid transition", () => {
    expect(advanceState("draft", "prepared")).toBe("prepared");
    expect(advanceState("prepared", "implementing")).toBe("implementing");
    expect(advanceState("verifying", "accepted")).toBe("accepted");
    expect(advanceState("verifying", "rejected")).toBe("rejected");
  });

  it("throws StateMachineError on invalid transition", () => {
    expect(() => advanceState("accepted", "draft")).toThrow(StateMachineError);
    expect(() => advanceState("accepted", "verifying")).toThrow(StateMachineError);
    expect(() => advanceState("draft", "accepted")).toThrow(StateMachineError);
  });

  it("error message includes the invalid from->to states", () => {
    try {
      advanceState("accepted", "draft");
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(StateMachineError);
      expect((error as StateMachineError).message).toMatch(/accepted/);
      expect((error as StateMachineError).message).toMatch(/draft/);
    }
  });
});

describe("isTerminalState", () => {
  it("identifies accepted as the only terminal state", () => {
    // A rejected attempt is not the end of the task: it must be able to re-enter
    // the fix-and-reverify loop, so it has outgoing transitions and is not terminal.
    expect(isTerminalState("accepted")).toBe(true);
    expect(isTerminalState("rejected")).toBe(false);
  });

  it("identifies non-terminal states correctly", () => {
    expect(isTerminalState("draft")).toBe(false);
    expect(isTerminalState("prepared")).toBe(false);
    expect(isTerminalState("implementing")).toBe(false);
    expect(isTerminalState("verifying")).toBe(false);
  });
});
