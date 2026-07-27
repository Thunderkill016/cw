# Understand and improve this project

Read `AGENTS.md`, `AI_WORKFLOW.md`, `IDEA.md`,
`docs/ai/AUTONOMOUS_IMPROVEMENT.md`, and relevant architecture documents.

Objective:

[State the product or engineering outcome.]

Autonomy level:

[A0, A1, A2, A3, or A4. Default to A2 when omitted.]

Do not begin by editing code.

1. Build or refresh an evidence-backed project model from
   `docs/ai/templates/PROJECT_MODEL.md`.
2. Report repository coverage, blind spots, and confidence. Do not claim that
   every file was understood.
3. Run safe baseline checks and separate pre-existing failures.
4. Trace the most important user journeys and trust boundaries.
5. Create a dated project health report.
6. Produce a ranked list of repair, risk-reduction, simplification, upgrade,
   product opportunity, and research candidates.
7. Select one bounded candidate using impact, confidence, urgency, effort,
   risk, reversibility, and strategic fit.
8. Write the decision-critical research questions. Search internal evidence
   first, then current primary external sources when browsing is available.
9. Record sources, dates, contradiction, inference, and uncertainty. Never
   invent access, analytics, interviews, or facts.
10. Convert the selected candidate into acceptance criteria and an
    implementation plan.
11. Implement only when the autonomy level and safety gates allow it.
12. Run focused checks, `pnpm verify`, and an independent diff review.
13. Open a draft PR rather than self-merging.
14. Update project model, improvement/research indexes, and retrospective so the
    next agent starts with better knowledge.

Stop and request a decision when the task crosses the approved scope, requires
sensitive access, lacks verification, or needs an irreversible action.
