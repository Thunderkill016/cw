# Product idea (copy into a generated starter project)

> This file is the source of truth for what the generated product builds.
> Stack and engineering rules live in `AGENTS.md`.

## Working title

My product

## One sentence

Describe the product and the outcome it creates.

## Who is it for?

- Primary user:
- Constrained or underserved user:

## Problem

Describe recent real behaviour, pain, frequency, severity, and current workaround.

## Solution hypothesis

1. Core user action
2. Supporting capability
3. Measurable result

## Out of scope

- Teams / multi-tenant organizations unless explicitly required
- Native mobile unless explicitly required
- Automatic production mutation by agents

## MVP checklist

- [ ] Product brief validated
- [ ] Landing and entry path
- [ ] Authentication if required
- [ ] Domain feature #1
- [ ] Domain feature #2
- [ ] Product outcome measurement

## Data

| Entity | Fields | Access boundary |
| --- | --- | --- |
| profiles | id, email, display_name | owner only |
| add yours | | |

## Success looks like

State an observable user or business outcome and its time window.

## Notes for agents

- Prefer small vertical slices end to end.
- Match existing UI tokens.
- Never commit secrets.
- Do not infer product value from passing tests alone.
