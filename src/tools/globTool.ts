import {
    displayPath,
    matchesGlob,
    walkFiles
} from "../utils/fileSearch.js";
import {validatePath} from "../utils/paths.js";
import {runProcess, truncateOutput} from "./bashTool.js";
import type {Tool, ToolContext, ToolResult} from "./Tool.js";

async function globWithoutRipgrep(
    pattern: string,
    searchPath: string,
    context: ToolContext
): Promise<string> {
    const matches: string[] = [];

    for await (const filePath of walkFiles(searchPath, context.abortSignal)) {
        const relativeToSearch = displayPath(filePath, searchPath);
        if (matchesGlob(relativeToSearch, pattern)) {
            matches.push(displayPath(filePath, context.cwd));
        }
    }

    return truncateOutput(matches.join("\n") || "(no matches)");
}

export const globTool: Tool = {
    name: "Glob",
    description:
        "按文件名或路径模式查找项目文件，例如 *.test.ts 或 src/**/*.json。",
    inputSchema: {
        type: "object",
        properties: {
            pattern: {
                type: "string",
                description: "文件 Glob 模式。"
            },
            path: {
                type: "string",
                description: "开始搜索的目录，默认是项目根目录。"
            }
        },
        required: ["pattern"]
    },

    async call(
        input: Record<string, unknown>,
        context: ToolContext
    ): Promise<ToolResult> {
        const pattern = input.pattern;
        const requestedPath = input.path ?? ".";

        if (typeof pattern !== "string" || pattern.length === 0) {
            return {content: "pattern is required", isError: true};
        }
        if (typeof requestedPath !== "string") {
            return {content: "path must be a string", isError: true};
        }

        const searchPath = await validatePath(requestedPath, context.cwd);

        try {
            const result = await runProcess(
                "rg",
                ["--files", "--glob", pattern, searchPath],
                {
                    cwd: context.cwd,
                    timeout: 30_000,
                    abortSignal: context.abortSignal
                }
            );
            if (result.exitCode !== 0 && result.exitCode !== 1) {
                return {
                    content: truncateOutput(result.stderr || "Glob failed"),
                    isError: true
                };
            }

            const matches = result.stdout
                .split(/\r?\n/)
                .filter(Boolean)
                .map((filePath) => displayPath(filePath, context.cwd))
                .sort();
            return {content: truncateOutput(matches.join("\n") || "(no matches)")};
        } catch (error: unknown) {
            if (
                error instanceof Error &&
                "code" in error &&
                error.code === "ENOENT"
            ) {
                return {
                    content: await globWithoutRipgrep(pattern, searchPath, context)
                };
            }
            throw error;
        }
    },

    isReadOnly(): boolean {
        return true;
    },

    isEnabled(): boolean {
        return true;
    }
};
