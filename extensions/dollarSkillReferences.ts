import { readFile } from "node:fs/promises";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fuzzyFilter, type AutocompleteItem, type AutocompleteProvider, type AutocompleteSuggestions } from "@earendil-works/pi-tui";

import { findSkillReferenceToken, resolveSkillReferences } from "../src/skillReferences.js";

type LoadedSkill = {
	name: string;
	description: string;
	filePath: string;
};

type SkillWithContent = LoadedSkill & {
	content: string;
};

const MAX_SUGGESTIONS = 20;

function loadedSkills(pi: ExtensionAPI): LoadedSkill[] {
	return pi
		.getCommands()
		.filter((command) => command.source === "skill")
		.map((command) => ({
			name: command.name.replace(/^skill:/, ""),
			description: command.description ?? "Skill instructions",
			filePath: command.sourceInfo.path,
		}));
}

function conciseDescription(description: string): string {
	return description.length > 68 ? `${description.slice(0, 68)}…` : description;
}

function skillToItem(skill: LoadedSkill): AutocompleteItem {
	return {
		value: `$${skill.name}`,
		label: skill.name,
		description: `Reference: ${conciseDescription(skill.description)}`,
	};
}

function matchingSkillItems(skills: LoadedSkill[], query: string): AutocompleteItem[] {
	if (query.length === 0) {
		return skills.slice(0, MAX_SUGGESTIONS).map(skillToItem);
	}

	return fuzzyFilter(skills, query, (skill) => skill.name).slice(0, MAX_SUGGESTIONS).map(skillToItem);
}

async function skillsWithContent(pi: ExtensionAPI): Promise<SkillWithContent[]> {
	const skills = loadedSkills(pi);
	const contents = await Promise.all(
		skills.map(async (skill) => ({
			...skill,
			content: await readFile(skill.filePath, "utf8"),
		})),
	);

	return contents;
}

function createSkillAutocompleteProvider(pi: ExtensionAPI, current: AutocompleteProvider): AutocompleteProvider {
	return {
		async getSuggestions(lines, cursorLine, cursorCol, options): Promise<AutocompleteSuggestions | null> {
			const textBeforeCursor = (lines[cursorLine] ?? "").slice(0, cursorCol);
			const token = findSkillReferenceToken(textBeforeCursor, textBeforeCursor.length);
			if (!token) {
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			}

			const items = matchingSkillItems(loadedSkills(pi), token.query);
			if (options.signal.aborted || items.length === 0) {
				return current.getSuggestions(lines, cursorLine, cursorCol, options);
			}

			return {
				prefix: `$${token.query}`,
				items,
			};
		},

		applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
			return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
		},

		shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
			return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
		},
	};
}

export default function dollarSkillReferences(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		ctx.ui.addAutocompleteProvider((current) => createSkillAutocompleteProvider(pi, current));
	});

	pi.on("input", async (event) => {
		const skills = await skillsWithContent(pi);
		const resolvedText = resolveSkillReferences(event.text, skills);
		if (resolvedText === event.text) {
			return { action: "continue" as const };
		}

		return {
			action: "transform" as const,
			text: resolvedText,
			images: event.images,
		};
	});
}
