---
name: security-pass
description: Audit CycleWarden app changes against ASVS-oriented baseline and PRODUCTION_CHECKLIST.md.
---

# Skill: security-pass

## Checklist

- [ ] No secrets in client bundles or git  
- [ ] Writes validated (Zod)  
- [ ] Protected routes still guarded  
- [ ] Queries scoped to current user  
- [ ] Security headers still applied via next.config  
- [ ] Auth adapter not bypassed  
- [ ] Rate limit considered for spammy endpoints  

## Output

List **blockers** first, then nice-to-haves. Do not claim "secure" without evidence.
