import assert from 'node:assert/strict';
import test from 'node:test';

import {
  completeSkillReference,
  findSkillReferenceToken,
  highlightSkillReferences,
  resolveSkillReferences,
} from '../src/skillReferences.js';

const loadedSkills = [
  {
    name: 'tdd',
    description: 'Strict red, green, refactor development workflow.',
    content: '# TDD\n\nUse red, green, refactor loops.',
  },
  {
    name: 'review-and-ship',
    description: 'Review current branch, validate it, and open a PR.',
    content: '# Review and Ship\n\nReview, validate, commit, and ship.',
  },
];

test('users see fuzzy skill suggestions while typing a contiguous dollar token', () => {
  const token = findSkillReferenceToken('please use $rvw', 'please use $rvw'.length);
  const suggestions = completeSkillReference('please use $rvw', 'please use $rvw'.length, loadedSkills);

  assert.deepEqual(token, { start: 11, end: 15, query: 'rvw' });
  assert.deepEqual(suggestions, [
    {
      replacement: '$review-and-ship',
      label: 'review-and-ship',
      detail: 'Reference: Review current branch, validate it, and open a PR.',
    },
  ]);
});

test('users do not see skill suggestions for spaced dollar text', () => {
  assert.equal(findSkillReferenceToken('please use $ tdd', 'please use $ tdd'.length), null);
  assert.deepEqual(completeSkillReference('please use $ tdd', 'please use $ tdd'.length, loadedSkills), []);
});

test('model input keeps the original prompt and appends deduplicated known skill instructions', () => {
  const prompt = 'use $tdd then $tdd again';

  assert.equal(
    resolveSkillReferences(prompt, loadedSkills),
    [
      'use $tdd then $tdd again',
      '',
      '<skill_references>',
      '<skill_reference name="tdd" token="$tdd">',
      '# TDD',
      '',
      'Use red, green, refactor loops.',
      '</skill_reference>',
      '</skill_references>',
    ].join('\n'),
  );
});

test('model input stays unchanged when dollar text is spaced or unknown', () => {
  assert.equal(resolveSkillReferences('$ tdd and $unknown', loadedSkills), '$ tdd and $unknown');
});

test('model input does not expand known skill names inside larger unknown dollar tokens', () => {
  assert.equal(resolveSkillReferences('$tdd_extra', loadedSkills), '$tdd_extra');
});

test('users see recognized contiguous skill references highlighted in the editor', () => {
  assert.deepEqual(highlightSkillReferences('use $tdd and $unknown and $ tdd', loadedSkills), [
    { start: 4, end: 8, token: '$tdd', skillName: 'tdd', style: 'skill-reference' },
  ]);
});

test('users do not see known skill names highlighted inside larger unknown dollar tokens', () => {
  assert.deepEqual(highlightSkillReferences('$tdd_extra', loadedSkills), []);
});

test('users see concise skill reference context in autocomplete rows', () => {
  const [suggestion] = completeSkillReference('use $td', 'use $td'.length, [
    {
      name: 'tdd',
      description:
        'Strict red, green, refactor development workflow with a deliberately long explanation that should not dominate narrow terminal autocomplete rows.',
    },
  ]);

  assert.equal(
    suggestion.detail,
    'Reference: Strict red, green, refactor development workflow with a deliberately…',
  );
});
