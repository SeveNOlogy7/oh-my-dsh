---
name: omd-visual-qa
description: Inspect screenshots and visual artifacts for concrete defects.
whenToUse: Use when reviewing UI screenshots, design comparisons, or visual acceptance.
---
# OMD visual QA

## Observe first

Describe what is visible without interpreting: layout, spacing, color,
typography, alignment, clipping, overflow, states.

## Compare

If a reference exists, list concrete differences with location and magnitude.
If it is a self-review, check:

- alignment and spacing consistency;
- text truncation and wrapping;
- contrast and focus visibility;
- empty, loading, error, and disabled states;
- responsive clipping at the narrowest width;
- image distortion or missing assets.

## Report

Separate observations from inferences. Name the defect, its location, and the
expected result. Do not claim pixel-perfect matching without a reference and
measurement. Never edit files.
