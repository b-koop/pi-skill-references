# pi-skill-references

Reference implementation for adding Codex-style `$skill` references to Pi.

## Scope

This package models the behavior from issues #1-#6:

- fuzzy autocomplete for contiguous `$skill-name` editor tokens,
- concise autocomplete context that identifies skill references,
- submit-time prompt expansion that preserves the original prompt text,
- deduplicated appended skill instruction blocks,
- no expansion for spaced `$ skill-name` or unknown `$tokens`, and
- editor highlight ranges for recognized contiguous skill references.

## API

The Pi package registers `extensions/dollarSkillReferences.ts` when installed with `pi install /path/to/pi-skill-references`.

`src/skillReferences.js` exports:

- `findSkillReferenceToken(text, cursor)` — returns the current contiguous dollar token before the cursor, or `null`.
- `completeSkillReference(text, cursor, skills)` — returns autocomplete rows with `label`, `replacement`, and `Reference: ...` detail text.
- `resolveSkillReferences(prompt, skills)` — returns the original prompt plus a delimited `<skill_references>` section for known, deduplicated references.
- `highlightSkillReferences(text, skills)` — returns theme-ready editor ranges for recognized `$skill-name` tokens.

## Constraints

- Dollar-skill syntax is contiguous: `$tdd` can resolve; `$ tdd` never resolves.
- Unknown dollar tokens remain ordinary prompt text.
- A known skill name embedded in a larger unknown token, such as `$tdd_extra`, remains ordinary prompt text.
- Autocomplete uses fuzzy subsequence matching against loaded skill names.

## Verification

Run:

```sh
npm test
```
