---
name: improve-project
description: Build an evidence-backed model of a repository, diagnose and rank improvements, research unknowns, and deliver one bounded verified change under explicit autonomy and safety gates.
---

# Improve project

Use when the human asks the agent to understand a project, find what is wrong,
recommend upgrades, or autonomously improve it.

## Read first

- `IDEA.md`
- `AGENTS.md`
- `AI_WORKFLOW.md`
- `docs/ai/AUTONOMOUS_IMPROVEMENT.md`
- `docs/ai/SAFETY.md`

## Required sequence

1. Declare objective and autonomy level; default to A2.
2. Build or refresh a project model with evidence, confidence, and blind spots.
3. Validate baseline and trace critical journeys.
4. Create a health report and ranked improvement candidates.
5. Select one bounded candidate.
6. Research only decision-critical unknowns using internal evidence first and
   current primary sources when browsing is available.
7. Create acceptance criteria and a plan.
8. Implement only within permission gates.
9. Verify, review independently, and open a draft PR.
10. Update durable project memory.

Never self-merge, deploy, alter production data, or claim whole-project coverage
without evidence and explicit permission.
