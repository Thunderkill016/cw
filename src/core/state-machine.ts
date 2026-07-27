export type TaskState =
  | "draft"
  | "prepared"
  | "implementing"
  | "verifying"
  | "accepted"
  | "rejected";

export class StateMachineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StateMachineError";
  }
}

const VALID_TRANSITIONS: Record<TaskState, TaskState[]> = {
  draft: ["prepared"],
  prepared: ["implementing", "rejected"],
  implementing: ["verifying"],
  verifying: ["accepted", "rejected", "implementing"],
  accepted: [],
  rejected: [],
};

export function isValidTransition(from: TaskState, to: TaskState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function advanceState(currentState: TaskState, nextState: TaskState): TaskState {
  if (!isValidTransition(currentState, nextState)) {
    throw new StateMachineError(
      `Invalid state transition from '${currentState}' to '${nextState}'`
    );
  }
  return nextState;
}

export function isTerminalState(state: TaskState): boolean {
  return state === "accepted" || state === "rejected";
}
