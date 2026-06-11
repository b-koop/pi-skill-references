import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fuzzyFilter, type AutocompleteItem, type AutocompleteProvider, type AutocompleteSuggestions } from "@earendil-works/pi-tui";

import {
	findSkillReferenceToken,
	resolveSkillReferences,
	styleSkillReferencesIfAvailable,
} from "../src/skillReferences.js";

type LoadedSkill = {
	name: string;
	description: string;
	filePath: string;
};

const MAX_SUGGESTIONS = 20;
const SKILL_REFERENCE_STYLE = "\x1b[1;36m";
const RESET_STYLE = "\x1b[0m";

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

class DollarSkillEditor extends CustomEditor {
	constructor(
		...args: ConstructorParameters<typeof CustomEditor>
	) {
		super(...args);
	}

	handleInput(data: string): void {
		super.handleInput(data);
		if (this.isDollarSkillAutocompleteInput(data)) {
			(this as unknown as { tryTriggerAutocomplete(): void }).tryTriggerAutocomplete();
		}
	}

	render(width: number): string[] {
		return super.render(width).map((line) =>
			styleSkillReferencesIfAvailable(line, loadedSkillsForRender, (token) => `${SKILL_REFERENCE_STYLE}${token}${RESET_STYLE}`),
		);
	}

	private isDollarSkillAutocompleteInput(data: string): boolean {
		if (!/^[A-Za-z0-9$-]$/.test(data)) {
			return false;
		}

		const text = this.getText();
		const cursorIndex = this.getCursorIndex();
		return findSkillReferenceToken(text, cursorIndex) !== null;
	}

	private getCursorIndex(): number {
		const state = (this as unknown as { state: { lines: string[]; cursorLine: number; cursorCol: number } }).state;
		let index = 0;
		for (let lineIndex = 0; lineIndex < state.cursorLine; lineIndex += 1) {
			index += (state.lines[lineIndex] ?? "").length + 1;
		}

		return index + state.cursorCol;
	}
}

let loadedSkillsForRender: LoadedSkill[] = [];

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
		loadedSkillsForRender = loadedSkills(pi);
		ctx.ui.addAutocompleteProvider((current) => createSkillAutocompleteProvider(pi, current));
		ctx.ui.setEditorComponent((tui, theme, keybindings) => new DollarSkillEditor(tui, theme, keybindings));
	});

	pi.on("input", async (event) => {
		const resolvedText = resolveSkillReferences(event.text, loadedSkills(pi));
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
