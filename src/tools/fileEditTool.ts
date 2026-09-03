import {readFile, writeFile} from "node:fs/promises";

import {validatePath} from "../utils/paths.js";
import type {Tool, ToolContext, ToolResult} from "./Tool.js";

function normalizeQuotes(value: string): string {
    return value
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, "\"");
}

function findOccurrences(content: string, search: string): number[] {
    const positions: number[] = [];
    let start = 0;

    while (start <= content.length - search.length) {
        const index = content.indexOf(search, start);
        if (index === -1) {
            break;
        }
        positions.push(index);
        // Advance by one so overlapping matches are also treated as ambiguous.
        start = index + 1;
    }

    return positions;
}

export const fileEditTool: Tool = {
    name: "Edit",
    description:
        "在文本文件中进行一次精确替换。old_string 必须恰好出现一次。",
    inputSchema: {
        type: "object",
        properties: {
            file_path: {
                type: "string",
                description: "要编辑的文件路径。"
            },
            old_string: {
                type: "string",
                description: "要替换的原始文本，必须在文件中唯一。"
            },
            new_string: {
                type: "string",
                description: "替换后的新文本。"
            }
        },
        required: ["file_path", "old_string", "new_string"]
    },

    async call(
        input: Record<string, unknown>,
        context: ToolContext
    ): Promise<ToolResult> {
        const filePath = input.file_path;
        const oldString = input.old_string;
        const newString = input.new_string;

        if (typeof filePath !== "string" || filePath.trim() === "") {
            return {content: "file_path is required", isError: true};
        }
        if (typeof oldString !== "string" || oldString.length === 0) {
            return {content: "old_string must be a non-empty string", isError: true};
        }
        if (typeof newString !== "string") {
            return {content: "new_string must be a string", isError: true};
        }

        const resolved = await validatePath(filePath, context.cwd);
        const content = await readFile(resolved, {
            encoding: "utf-8",
            signal: context.abortSignal
        });
        const normalizedContent = normalizeQuotes(content);
        const normalizedOld = normalizeQuotes(oldString);
        const normalizedNew = normalizeQuotes(newString);
        const occurrences = findOccurrences(normalizedContent, normalizedOld);

        if (occurrences.length === 0) {
            return {
                content:
                    `old_string not found in ${filePath}. ` +
                    "Make sure it matches the file content exactly.",
                isError: true
            };
        }

        if (occurrences.length > 1) {
            return {
                content:
                    `old_string appears ${occurrences.length} times in ${filePath}. ` +
                    "Include more surrounding context to make the match unique.",
                isError: true
            };
        }

        const matchIndex = occurrences[0];
        const updated =
            content.slice(0, matchIndex) +
            normalizedNew +
            content.slice(matchIndex + normalizedOld.length);

        await writeFile(resolved, updated, {
            encoding: "utf-8",
            signal: context.abortSignal
        });

        const lineDifference =
            normalizedNew.split("\n").length - normalizedOld.split("\n").length;
        const formattedDifference = lineDifference > 0
            ? `+${lineDifference}`
            : String(lineDifference);

        return {
            content: `Edited ${filePath} (${formattedDifference} lines)`
        };
    },

    isReadOnly(): boolean {
        return false;
    },

    isEnabled(): boolean {
        return true;
    }
};
