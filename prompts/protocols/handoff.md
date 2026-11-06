# Handoff protocol

Write a handoff a fresh session can continue from without reading the whole
transcript.

## Capture

- objective and current status;
- what is done, with evidence;
- what remains, in order;
- the active plan and boulder state;
- decisions made and why;
- gotchas, failed approaches, and open risks;
- exact file paths and commands that matter;
- the next single action.

## Write

Write `.omd/handoff/<timestamp>.md`. Do not include secrets. Keep it under 150
lines; link to files and plans instead of pasting large content.

## Verify

Re-read the handoff. A fresh reader should be able to answer: what is the goal,
what is done, what is next, and what would break if they guessed.
