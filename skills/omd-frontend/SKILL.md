---
name: omd-frontend
description: Build or review UI with design intent, accessibility, and responsive behavior.
whenToUse: Use for visual-engineering tasks, component work, styling, or UI review.
---
# OMD frontend

## Before code

- Identify the design source: existing components, a spec, or a screenshot.
- Read the project's tokens, layout primitives, and component conventions.
- Decide the states: empty, loading, error, success, disabled, focus, hover.
- Decide the breakpoints and the smallest supported width.

## Implement

- Reuse existing primitives before adding new ones.
- Keep spacing and type on the project scale.
- Make interactive elements keyboard reachable with visible focus.
- Use semantic elements and labels; do not use divs as buttons.
- Respect reduced motion and color contrast.
- Avoid layout shifts; reserve space for async content.

## Verify

Render at desktop and mobile widths. Check overflow, clipping, focus order,
contrast, and empty/error states. If a screenshot is the evidence, inspect it
with the visual QA checklist rather than assuming it looks right.
