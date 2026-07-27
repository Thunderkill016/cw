# Independent review

Act as an independent reviewer. Read `AGENTS.md`, the issue, plan, and diff.
Do not edit files.

Check correctness, regressions, security, authorization, data integrity,
architecture boundaries, accessibility, performance, error handling, and test
quality. Ignore the implementer's confidence and verify claims from the code.

For each finding provide:

- severity: Critical, High, Medium, or Low;
- file and line;
- failure scenario or reproduction;
- impact;
- smallest safe fix.

Do not manufacture findings. End with acceptance criteria coverage and residual
risk.
