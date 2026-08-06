import {
  CONSTITUTION_DIGEST_DOMAIN,
  PLAN_DIGEST_DOMAIN,
  SPECIFICATION_DIGEST_DOMAIN,
  TASK_LIST_DIGEST_DOMAIN,
} from "./digest-domains.js";
import { digestCanonicalJson } from "./integrity.js";

/**
 * The spec-driven pipeline.
 *
 * AI writes the *content* of every artifact here. This module owns the schema,
 * the validation and — most importantly — the gates between phases. The gates
 * are deterministic on purpose: an AI asked "is this spec clear enough?" will
 * usually say yes, which is precisely the failure mode that makes prompt-first
 * builders emit generic, buggy output.
 *
 * Artifacts stay compatible with GitHub Spec Kit's `specs/<feature>/` layout
 * (constitution.md, spec.md, plan.md, tasks.md) so a project can be ejected to
 * a plain repository and continued with any spec-kit-compatible agent.
 */

export class SpecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpecError";
  }
}

export type SpecPhase = "constitution" | "specification" | "plan" | "tasks";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SpecError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, maximum = 4_000): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result) throw new SpecError(`${label} is required`);
  if (result.length > maximum) throw new SpecError(`${label} exceeds ${maximum} characters`);
  if (result.includes("\0")) throw new SpecError(`${label} may not contain NUL`);
  return result;
}

function identifier(value: unknown, label: string): string {
  const result = text(value, label, 64);
  if (!ID_PATTERN.test(result)) throw new SpecError(`${label} has an invalid format: ${result}`);
  return result;
}

function digest(value: unknown, label: string): string {
  const result = text(value, label, 64);
  if (!DIGEST_PATTERN.test(result)) throw new SpecError(`${label} must be a sha256 hex digest`);
  return result;
}

function list<T>(value: unknown, label: string, maximum: number, map: (item: unknown, index: number) => T): T[] {
  if (!Array.isArray(value)) throw new SpecError(`${label} must be an array`);
  if (value.length > maximum) throw new SpecError(`${label} may hold at most ${maximum} items`);
  return value.map(map);
}

function requireUniqueIds(ids: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new SpecError(`${label} has a duplicate id: ${id}`);
    seen.add(id);
  }
}

function stripDigest<T extends Record<string, unknown>>(record: T, key: string): Omit<T, string> {
  const { [key]: _discarded, ...payload } = record;
  return payload;
}

// ---------------------------------------------------------------------------
// Constitution — the non-negotiable principles every later phase is bound to.
// ---------------------------------------------------------------------------

export type Principle = {
  id: string;
  statement: string;
  rationale: string | null;
};

export type ConstitutionV1 = {
  schemaVersion: 1;
  recordType: "constitution";
  projectId: string;
  principles: Principle[];
  createdAt: string;
  constitutionDigest: string;
};

export function constitutionDigest(
  value: Omit<ConstitutionV1, "constitutionDigest"> | ConstitutionV1
): string {
  return digestCanonicalJson(
    CONSTITUTION_DIGEST_DOMAIN,
    stripDigest(value as unknown as Record<string, unknown>, "constitutionDigest")
  );
}

export function createConstitution(input: {
  projectId: string;
  principles: Array<{ id: string; statement: string; rationale?: string | null }>;
  createdAt?: string;
}): ConstitutionV1 {
  const principles = input.principles.map((principle, index) => ({
    id: identifier(principle.id, `principles[${index}].id`),
    statement: text(principle.statement, `principles[${index}].statement`),
    rationale: principle.rationale?.trim() || null,
  }));
  if (principles.length === 0) throw new SpecError("a constitution needs at least one principle");
  requireUniqueIds(principles.map((p) => p.id), "principles");

  const payload: Omit<ConstitutionV1, "constitutionDigest"> = {
    schemaVersion: 1,
    recordType: "constitution",
    projectId: identifier(input.projectId, "projectId"),
    principles,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  return { ...payload, constitutionDigest: constitutionDigest(payload) };
}

// ---------------------------------------------------------------------------
// Specification — what to build, and what is still unknown.
// ---------------------------------------------------------------------------

export type AcceptanceCriterionSpec = { id: string; statement: string };

export type UserStory = {
  id: string;
  asA: string;
  iWant: string;
  soThat: string;
  acceptanceCriteria: AcceptanceCriterionSpec[];
};

export type Requirement = {
  id: string;
  kind: "functional" | "non-functional";
  statement: string;
};

/**
 * A question the specification could not answer on its own.
 *
 * `answer === null` means unresolved. Unresolved questions block the plan
 * phase — this is the whole point of the gate.
 */
export type OpenQuestion = {
  id: string;
  question: string;
  answer: string | null;
};

export type SpecificationV1 = {
  schemaVersion: 1;
  recordType: "specification";
  projectId: string;
  featureId: string;
  title: string;
  summary: string;
  userStories: UserStory[];
  requirements: Requirement[];
  outOfScope: string[];
  openQuestions: OpenQuestion[];
  /** Binds this spec to the constitution it was written under. */
  constitutionDigest: string;
  createdAt: string;
  specificationDigest: string;
};

export function specificationDigest(
  value: Omit<SpecificationV1, "specificationDigest"> | SpecificationV1
): string {
  return digestCanonicalJson(
    SPECIFICATION_DIGEST_DOMAIN,
    stripDigest(value as unknown as Record<string, unknown>, "specificationDigest")
  );
}

export function createSpecification(input: {
  projectId: string;
  featureId: string;
  title: string;
  summary: string;
  userStories: Array<{
    id: string;
    asA: string;
    iWant: string;
    soThat: string;
    acceptanceCriteria: Array<{ id: string; statement: string }>;
  }>;
  requirements: Array<{ id: string; kind: Requirement["kind"]; statement: string }>;
  outOfScope?: string[];
  openQuestions?: Array<{ id: string; question: string; answer?: string | null }>;
  constitutionDigest: string;
  createdAt?: string;
}): SpecificationV1 {
  const userStories = list(input.userStories, "userStories", 128, (item, index) => {
    const record = requireObject(item, `userStories[${index}]`);
    const criteria = list(
      record.acceptanceCriteria,
      `userStories[${index}].acceptanceCriteria`,
      64,
      (criterion, criterionIndex) => {
        const inner = requireObject(criterion, `userStories[${index}].acceptanceCriteria[${criterionIndex}]`);
        return {
          id: identifier(inner.id, `userStories[${index}].acceptanceCriteria[${criterionIndex}].id`),
          statement: text(inner.statement, `userStories[${index}].acceptanceCriteria[${criterionIndex}].statement`),
        };
      }
    );
    if (criteria.length === 0) {
      throw new SpecError(`userStories[${index}] needs at least one acceptance criterion`);
    }
    requireUniqueIds(criteria.map((c) => c.id), `userStories[${index}].acceptanceCriteria`);
    return {
      id: identifier(record.id, `userStories[${index}].id`),
      asA: text(record.asA, `userStories[${index}].asA`),
      iWant: text(record.iWant, `userStories[${index}].iWant`),
      soThat: text(record.soThat, `userStories[${index}].soThat`),
      acceptanceCriteria: criteria,
    } satisfies UserStory;
  });
  if (userStories.length === 0) throw new SpecError("a specification needs at least one user story");
  requireUniqueIds(userStories.map((s) => s.id), "userStories");

  const requirements = list(input.requirements, "requirements", 256, (item, index) => {
    const record = requireObject(item, `requirements[${index}]`);
    if (record.kind !== "functional" && record.kind !== "non-functional") {
      throw new SpecError(`requirements[${index}].kind must be functional or non-functional`);
    }
    return {
      id: identifier(record.id, `requirements[${index}].id`),
      kind: record.kind,
      statement: text(record.statement, `requirements[${index}].statement`),
    } satisfies Requirement;
  });
  requireUniqueIds(requirements.map((r) => r.id), "requirements");

  const openQuestions = list(input.openQuestions ?? [], "openQuestions", 128, (item, index) => {
    const record = requireObject(item, `openQuestions[${index}]`);
    const answer = record.answer;
    return {
      id: identifier(record.id, `openQuestions[${index}].id`),
      question: text(record.question, `openQuestions[${index}].question`),
      answer: answer === null || answer === undefined ? null : text(answer, `openQuestions[${index}].answer`),
    } satisfies OpenQuestion;
  });
  requireUniqueIds(openQuestions.map((q) => q.id), "openQuestions");

  const payload: Omit<SpecificationV1, "specificationDigest"> = {
    schemaVersion: 1,
    recordType: "specification",
    projectId: identifier(input.projectId, "projectId"),
    featureId: identifier(input.featureId, "featureId"),
    title: text(input.title, "title", 256),
    summary: text(input.summary, "summary", 8_000),
    userStories,
    requirements,
    outOfScope: list(input.outOfScope ?? [], "outOfScope", 64, (item, index) =>
      text(item, `outOfScope[${index}]`)
    ),
    openQuestions,
    constitutionDigest: digest(input.constitutionDigest, "constitutionDigest"),
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  return { ...payload, specificationDigest: specificationDigest(payload) };
}

export function unresolvedQuestions(specification: SpecificationV1): OpenQuestion[] {
  return specification.openQuestions.filter((question) => question.answer === null);
}

/**
 * Answers an open question, returning a new specification.
 *
 * The digest changes, which deliberately invalidates anything already bound to
 * the old spec: a plan written against an unanswered question must not silently
 * survive the answer.
 */
export function answerQuestion(
  specification: SpecificationV1,
  questionId: string,
  answer: string
): SpecificationV1 {
  const resolved = text(answer, "answer");
  let found = false;
  const openQuestions = specification.openQuestions.map((question) => {
    if (question.id !== questionId) return question;
    found = true;
    return { ...question, answer: resolved };
  });
  if (!found) throw new SpecError(`no open question with id ${questionId}`);

  const payload = { ...stripDigest(specification as unknown as Record<string, unknown>, "specificationDigest"), openQuestions } as Omit<
    SpecificationV1,
    "specificationDigest"
  >;
  return { ...payload, specificationDigest: specificationDigest(payload) };
}

// ---------------------------------------------------------------------------
// Phase gates
// ---------------------------------------------------------------------------

export type GateResult =
  | { allowed: true; reasons: [] }
  | { allowed: false; reasons: string[] };

/**
 * Decides whether a specification may advance to the plan phase.
 *
 * Deterministic by design: this is the `clarify` step of spec-driven
 * development, enforced by code rather than trusted to a model's self-report.
 */
export function canEnterPlanPhase(specification: SpecificationV1): GateResult {
  const reasons: string[] = [];

  const unresolved = unresolvedQuestions(specification);
  if (unresolved.length > 0) {
    reasons.push(
      `${unresolved.length} open question(s) unanswered: ${unresolved.map((q) => q.id).join(", ")}`
    );
  }
  if (specification.userStories.length === 0) {
    reasons.push("specification has no user stories");
  }
  const uncovered = specification.userStories.filter(
    (story) => story.acceptanceCriteria.length === 0
  );
  if (uncovered.length > 0) {
    reasons.push(
      `user story without acceptance criteria: ${uncovered.map((s) => s.id).join(", ")}`
    );
  }

  return reasons.length === 0 ? { allowed: true, reasons: [] } : { allowed: false, reasons };
}

// ---------------------------------------------------------------------------
// Plan — how to build it.
// ---------------------------------------------------------------------------

export type TechnicalDecision = {
  id: string;
  decision: string;
  rationale: string;
  /** Requirement ids this decision serves; empty means it serves the whole spec. */
  requirementRefs: string[];
};

export type PlanV1 = {
  schemaVersion: 1;
  recordType: "plan";
  projectId: string;
  featureId: string;
  stack: {
    framework: string;
    language: string;
    styling: string | null;
    database: string | null;
    deployment: string | null;
  };
  decisions: TechnicalDecision[];
  /** Binds the plan to the exact specification it was written against. */
  specificationDigest: string;
  createdAt: string;
  planDigest: string;
};

export function planDigest(value: Omit<PlanV1, "planDigest"> | PlanV1): string {
  return digestCanonicalJson(
    PLAN_DIGEST_DOMAIN,
    stripDigest(value as unknown as Record<string, unknown>, "planDigest")
  );
}

export function createPlan(input: {
  specification: SpecificationV1;
  stack: {
    framework: string;
    language: string;
    styling?: string | null;
    database?: string | null;
    deployment?: string | null;
  };
  decisions: Array<{
    id: string;
    decision: string;
    rationale: string;
    requirementRefs?: string[];
  }>;
  createdAt?: string;
}): PlanV1 {
  const gate = canEnterPlanPhase(input.specification);
  if (!gate.allowed) {
    throw new SpecError(`cannot plan yet: ${gate.reasons.join("; ")}`);
  }

  const knownRequirements = new Set(input.specification.requirements.map((r) => r.id));
  const decisions = input.decisions.map((decision, index) => {
    const refs = list(decision.requirementRefs ?? [], `decisions[${index}].requirementRefs`, 64, (item, refIndex) =>
      identifier(item, `decisions[${index}].requirementRefs[${refIndex}]`)
    );
    for (const ref of refs) {
      if (!knownRequirements.has(ref)) {
        throw new SpecError(`decisions[${index}] references unknown requirement ${ref}`);
      }
    }
    return {
      id: identifier(decision.id, `decisions[${index}].id`),
      decision: text(decision.decision, `decisions[${index}].decision`),
      rationale: text(decision.rationale, `decisions[${index}].rationale`),
      requirementRefs: refs,
    } satisfies TechnicalDecision;
  });
  requireUniqueIds(decisions.map((d) => d.id), "decisions");

  const payload: Omit<PlanV1, "planDigest"> = {
    schemaVersion: 1,
    recordType: "plan",
    projectId: input.specification.projectId,
    featureId: input.specification.featureId,
    stack: {
      framework: text(input.stack.framework, "stack.framework", 128),
      language: text(input.stack.language, "stack.language", 128),
      styling: input.stack.styling?.trim() || null,
      database: input.stack.database?.trim() || null,
      deployment: input.stack.deployment?.trim() || null,
    },
    decisions,
    specificationDigest: input.specification.specificationDigest,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  return { ...payload, planDigest: planDigest(payload) };
}

// ---------------------------------------------------------------------------
// Task list — the ordered, dependency-aware work.
// ---------------------------------------------------------------------------

export type PlannedTask = {
  id: string;
  title: string;
  description: string;
  /** Ids of tasks that must complete first. */
  dependsOn: string[];
  /** Repository-relative directories/files this task may touch. */
  allowedPaths: string[];
  /** Requirement ids this task implements; used to prove coverage. */
  requirementRefs: string[];
};

export type TaskListV1 = {
  schemaVersion: 1;
  recordType: "task-list";
  projectId: string;
  featureId: string;
  tasks: PlannedTask[];
  /** Binds the task list to the exact plan it was derived from. */
  planDigest: string;
  createdAt: string;
  taskListDigest: string;
};

export function taskListDigest(value: Omit<TaskListV1, "taskListDigest"> | TaskListV1): string {
  return digestCanonicalJson(
    TASK_LIST_DIGEST_DOMAIN,
    stripDigest(value as unknown as Record<string, unknown>, "taskListDigest")
  );
}

/**
 * Returns tasks in dependency order, or throws when the graph cannot be
 * satisfied. Kahn's algorithm: a leftover node means a cycle.
 */
export function topologicalTaskOrder(tasks: readonly PlannedTask[]): PlannedTask[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const remaining = new Map<string, Set<string>>();
  for (const task of tasks) {
    for (const dependency of task.dependsOn) {
      if (!byId.has(dependency)) {
        throw new SpecError(`task ${task.id} depends on unknown task ${dependency}`);
      }
    }
    remaining.set(task.id, new Set(task.dependsOn));
  }

  const ordered: PlannedTask[] = [];
  // Sort the ready set so the order is deterministic for a given input.
  while (remaining.size > 0) {
    const ready = [...remaining.entries()]
      .filter(([, dependencies]) => dependencies.size === 0)
      .map(([id]) => id)
      .sort();
    if (ready.length === 0) {
      throw new SpecError(
        `task dependencies contain a cycle among: ${[...remaining.keys()].sort().join(", ")}`
      );
    }
    for (const id of ready) {
      ordered.push(byId.get(id)!);
      remaining.delete(id);
    }
    for (const dependencies of remaining.values()) {
      for (const id of ready) dependencies.delete(id);
    }
  }
  return ordered;
}

export function createTaskList(input: {
  plan: PlanV1;
  specification: SpecificationV1;
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    dependsOn?: string[];
    allowedPaths: string[];
    requirementRefs?: string[];
  }>;
  createdAt?: string;
}): TaskListV1 {
  if (input.plan.specificationDigest !== input.specification.specificationDigest) {
    throw new SpecError(
      "plan was written against a different specification; re-plan before generating tasks"
    );
  }

  const knownRequirements = new Set(input.specification.requirements.map((r) => r.id));
  const tasks = input.tasks.map((task, index) => {
    const allowedPaths = list(task.allowedPaths, `tasks[${index}].allowedPaths`, 64, (item, pathIndex) =>
      text(item, `tasks[${index}].allowedPaths[${pathIndex}]`, 1_024)
    );
    if (allowedPaths.length === 0) {
      // A task that may touch anything cannot be scope-verified, which would
      // defeat the contract layer this list feeds.
      throw new SpecError(`tasks[${index}] must declare at least one allowed path`);
    }
    const requirementRefs = list(
      task.requirementRefs ?? [],
      `tasks[${index}].requirementRefs`,
      64,
      (item, refIndex) => identifier(item, `tasks[${index}].requirementRefs[${refIndex}]`)
    );
    for (const ref of requirementRefs) {
      if (!knownRequirements.has(ref)) {
        throw new SpecError(`tasks[${index}] references unknown requirement ${ref}`);
      }
    }
    return {
      id: identifier(task.id, `tasks[${index}].id`),
      title: text(task.title, `tasks[${index}].title`, 256),
      description: text(task.description, `tasks[${index}].description`, 8_000),
      dependsOn: list(task.dependsOn ?? [], `tasks[${index}].dependsOn`, 64, (item, depIndex) =>
        identifier(item, `tasks[${index}].dependsOn[${depIndex}]`)
      ),
      allowedPaths,
      requirementRefs,
    } satisfies PlannedTask;
  });
  if (tasks.length === 0) throw new SpecError("a task list needs at least one task");
  requireUniqueIds(tasks.map((t) => t.id), "tasks");

  // Fail here rather than halfway through execution.
  topologicalTaskOrder(tasks);

  const payload: Omit<TaskListV1, "taskListDigest"> = {
    schemaVersion: 1,
    recordType: "task-list",
    projectId: input.plan.projectId,
    featureId: input.plan.featureId,
    tasks,
    planDigest: input.plan.planDigest,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  return { ...payload, taskListDigest: taskListDigest(payload) };
}

/**
 * Requirements with no task implementing them.
 *
 * Surfaced rather than enforced: some requirements are satisfied by the stack
 * itself. The caller decides whether a gap blocks execution.
 */
export function uncoveredRequirements(
  specification: SpecificationV1,
  taskList: TaskListV1
): Requirement[] {
  const covered = new Set(taskList.tasks.flatMap((task) => task.requirementRefs));
  return specification.requirements.filter((requirement) => !covered.has(requirement.id));
}
