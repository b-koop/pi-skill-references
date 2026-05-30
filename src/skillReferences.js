const SKILL_TOKEN_PATTERN = /\$([A-Za-z0-9][A-Za-z0-9-]*)(?![A-Za-z0-9_-])/g;
const DESCRIPTION_LIMIT = 68;

/**
 * Find the contiguous dollar-skill token immediately before or under the cursor.
 * Spaced forms such as "$ tdd" are intentionally ignored.
 *
 * @param {string} text
 * @param {number} cursor
 * @returns {{ start: number, end: number, query: string } | null}
 */
export function findSkillReferenceToken(text, cursor) {
  const safeCursor = Math.max(0, Math.min(cursor, text.length));
  const beforeCursor = text.slice(0, safeCursor);
  const match = /\$([A-Za-z0-9][A-Za-z0-9-]*)$/.exec(beforeCursor);

  if (!match) {
    return null;
  }

  return {
    start: safeCursor - match[0].length,
    end: safeCursor,
    query: match[1],
  };
}

/**
 * Return concise autocomplete rows for loaded skills matching the current token.
 *
 * @param {string} text
 * @param {number} cursor
 * @param {{ name: string, description?: string }[]} skills
 */
export function completeSkillReference(text, cursor, skills) {
  const token = findSkillReferenceToken(text, cursor);
  if (!token) {
    return [];
  }

  return skills
    .filter((skill) => fuzzyMatches(token.query, skill.name))
    .map((skill) => ({
      replacement: `$${skill.name}`,
      label: skill.name,
      detail: `Reference: ${truncateDescription(skill.description ?? 'Skill instructions')}`,
    }));
}

/**
 * Preserve the original prompt and append full contents for known skill mentions.
 *
 * @param {string} prompt
 * @param {{ name: string, content: string }[]} skills
 */
export function resolveSkillReferences(prompt, skills) {
  const skillByName = new Map(skills.map((skill) => [skill.name, skill]));
  const resolved = [];
  const seen = new Set();

  for (const match of prompt.matchAll(SKILL_TOKEN_PATTERN)) {
    const token = match[0];
    const skillName = match[1];
    const skill = skillByName.get(skillName);
    if (!skill || seen.has(skillName)) {
      continue;
    }

    seen.add(skillName);
    resolved.push({ token, skill });
  }

  if (resolved.length === 0) {
    return prompt;
  }

  const sections = resolved.flatMap(({ token, skill }) => [
    `<skill_reference name="${escapeAttribute(skill.name)}" token="${escapeAttribute(token)}">`,
    skill.content,
    '</skill_reference>',
  ]);

  return [prompt, '', '<skill_references>', ...sections, '</skill_references>'].join('\n');
}

/**
 * Return editor ranges for known contiguous dollar-skill mentions.
 *
 * @param {string} text
 * @param {{ name: string }[]} skills
 */
export function highlightSkillReferences(text, skills) {
  const knownSkillNames = new Set(skills.map((skill) => skill.name));
  const highlights = [];

  for (const match of text.matchAll(SKILL_TOKEN_PATTERN)) {
    const skillName = match[1];
    if (!knownSkillNames.has(skillName)) {
      continue;
    }

    highlights.push({
      start: match.index,
      end: match.index + match[0].length,
      token: match[0],
      skillName,
      style: 'skill-reference',
    });
  }

  return highlights;
}

/**
 * Apply terminal/editor styling to known contiguous dollar-skill mentions.
 *
 * @param {string} text
 * @param {{ name: string }[]} skills
 * @param {(token: string, skillName: string) => string} format
 */
export function styleSkillReferences(text, skills, format) {
  const highlights = highlightSkillReferences(text, skills);
  let styled = '';
  let cursor = 0;

  for (const highlight of highlights) {
    styled += text.slice(cursor, highlight.start);
    styled += format(highlight.token, highlight.skillName);
    cursor = highlight.end;
  }

  return styled + text.slice(cursor);
}

function fuzzyMatches(query, candidate) {
  if (query.length === 0) {
    return true;
  }

  let queryIndex = 0;
  for (const character of candidate) {
    if (character.toLowerCase() === query[queryIndex]?.toLowerCase()) {
      queryIndex += 1;
    }
  }

  return queryIndex === query.length;
}

function escapeAttribute(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

function truncateDescription(description) {
  if (description.length <= DESCRIPTION_LIMIT) {
    return description;
  }

  return `${description.slice(0, DESCRIPTION_LIMIT)}…`;
}
