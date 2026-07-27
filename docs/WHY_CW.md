# Why CW? 

## The AI Code Governance Gap

As AI coding agents (like Cursor, Aider, Copilot, and SWE-agent) become more capable, they are transitioning from autocomplete assistants to autonomous problem solvers. You can give them an issue, and they will search the codebase, modify multiple files, and commit the result.

However, this introduces a critical governance gap: **Accountability**.

How do you guarantee that an autonomous agent:
- Only touched the files related to its assigned task?
- Didn't hallucinate an environment variable change in `.env`?
- Didn't introduce a subtle type error that broke the build?
- Passed all required checks without altering the test framework to hide failures?

## Why existing tools don't solve it

Current tools focus on **generation** rather than **verification**:
- **Prompt-based guardrails** ("Do not modify file X") are easily ignored or forgotten by LLMs.
- **CI/CD pipelines** run after the fact. They verify the entire branch, not the specific scope of what an agent was authorized to do vs. what it actually did.
- **Agent frameworks** produce logs, but logs are easily manipulated and don't provide cryptographic proof of what occurred in the repository.

## CW's Approach: Contracts + Verification + Attestation

`cw` (Cyclewarden) solves the governance gap using a deterministic contract-and-evidence protocol.

1. **Contracts**: Before the AI touches code, a deterministic contract is generated. It specifies the allowed scope (e.g., `src/auth/**`), the forbidden scope, and the mandatory verification checks (e.g., `npm test`). It is cryptographically locked to a specific Git `baseSha`.
2. **Verification**: After the AI implements the code, CW analyzes the exact Git object tree diff. It checks the modifications against the contract's scope rules, safely runs the verification commands, and ensures no unauthorized workspace mutations occurred during verification.
3. **Attestation**: CW produces a cryptographically signed JSON evidence record. This record irrefutably proves whether the AI's changes adhered to the contract and whether the verification checks passed.

## Use Cases

- **Enterprise Compliance**: Generate audit trails that prove AI agents only modified authorized boundaries, satisfying security and compliance requirements.
- **Open Source Quality**: Enforce rigorous constraints on AI-generated PRs, ensuring community standards are met before human review is even required.
- **AI Agent Safety**: Run autonomous agents in a sandbox where their outputs are mechanically verified against predefined contracts before being merged into production pipelines.
