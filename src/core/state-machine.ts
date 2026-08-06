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

/**
 * CW never observes the agent writing code, so `implementing` is a state the
 * task is placed *back* into when a verification does not accept the attempt —
 * it is not a state CW can watch a task enter.
 *
 * `accepted` is the only truly terminal state: a task that has been accepted is
 * closed. `rejected` is a verdict on one attempt, not the death of the task, so
 * it must lead back into the fix-and-reverify loop that is CW's core workflow.
 */
const VALID_TRANSITIONS: Record<TaskState, TaskState[]> = {
  draft: ["prepared"],
  prepared: ["implementing", "verifying", "rejected"],
  implementing: ["verifying"],
  verifying: ["accepted", "rejected", "implementing"],
  accepted: [],
  rejected: ["implementing", "verifying"],
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

/**
 * Derived from the transition table so it cannot drift from it: a state is
 * terminal exactly when no transition leads out of it.
 */
export function isTerminalState(state: TaskState): boolean {
  return (VALID_TRANSITIONS[state]?.length ?? 0) === 0;
}
