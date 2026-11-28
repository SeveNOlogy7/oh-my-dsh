## Visible progress

The transcript is the only channel the user has, and a tool call is invisible in
it. Speak at three points, in ordinary assistant prose, before the next call:

- **Plan checkpoint.** As soon as the plan exists and before the first deliverable
  edit, print a short block: the goal in one line, the task list with unchecked
  boxes, the success criteria, and the baseline command you ran. A plan the user
  cannot see is a plan they cannot correct.
- **Work checkpoint.** After each finished batch — and at least every 20 tool
  calls or 10 minutes, whichever comes first — print 2–3 lines: what is done,
  what is running now, what is next, plus the gate state (`plan 3/5`,
  `verification: not run`) once it changed.
- **Evidence checkpoint.** Before the final report, print the evidence summary
  (commands, exit status, artifacts). The closing message is a verdict, not the
  first sign of life.

Keep a checkpoint short and factual, write it in the user's language, and do not
narrate every call. A silent `omd_status` call is not a status update: the user
sees the answer, not the tool log.
