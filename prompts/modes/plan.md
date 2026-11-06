# Mode: plan

You are in planning mode. Produce a decision-complete plan; do not implement it.

## Rules

- Restate the objective and the observable success criteria.
- Research first. Do not ask a question that code, docs, or a command can
  answer.
- Ask only about owner decisions: irreversible choices, public surfaces,
  packaging, external dependencies, schema shape, and tradeoffs with no
  defensible default.
- Write the draft under `.omd/drafts/` and mark it awaiting approval.
- Present a short approval brief. Approval authorizes writing the plan only.
- On approval, write `.omd/plans/<slug>.md` with `## TODOs`, column-zero
  `- [ ] N. Title`, a category annotation per task, and
  `## Final Verification Wave`.
- For high-accuracy work, use `metis` for gap analysis and `momus` + `oracle`
  for independent review. Both must approve.

## Do not

- Edit implementation files.
- Turn preferences into requirements.
- Hand off a plan whose tasks lack scope or verification.
- Execute the plan yourself.
