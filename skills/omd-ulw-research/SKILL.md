---
name: omd-ulw-research
description: Research a codebase or external system with citations and explicit uncertainty.
whenToUse: Use when facts are missing, when a design depends on upstream behavior, or before planning.
---
# OMD research

## Questions

Write the questions first. Separate:

- facts that code, docs, or a command can settle;
- decisions only the owner can make;
- defaults that are defensible and should be stated.

## Sources

- Codebase: `explore`, `grep`, `glob`, read relevant files, tests, config.
- External: `librarian`, `web_search`, `web_fetch`; prefer primary sources.
- Runtime: run the smallest read-only command that settles the question.

## Record

Keep notes in `.omd/notepads/<plan>/learnings.md` or a research directory.
Each claim carries a path, URL, or command. Mark inference as inference.

## Stop

Stop when another source is unlikely to change the decision. Do not collect
sources for their own sake.
