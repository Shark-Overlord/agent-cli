import {readFile} from "node:fs/promises";

import {
    displayPath,
    matchesGlob,
    walkFiles
} from "../utils/fileSearch.js";
import {validatePath} from "../utils/paths.js";
import {runProcess, truncateOutput} from "./bashTool.js";
import type {Tool, ToolContext, ToolResult} from "./Tool.js";

async function grepWithoutRipgrep(
    pattern: string,
    searchPath: string,
    include: string | undefined,
    context: ToolContext
): Promise<string> {
    const matcher = new RegExp(pattern);
    const matches: string[] = [];

    for await (const filePath of walkFiles(searchPath, context.abortSignal)) {
        const relativePath = displayPath(filePath, searchPath);
        if (include && !matchesGlob(relativePath, include)) {
            continue;
        }

        let content: string;
        try {
            content = await readFile(filePath, "utf-8");
        } catch {
            continue;
        }
        if (content.includes("\0")) {
            continue;
        }

        const lines = content.split("\n");
        lines.forEach((line, index) => {
            matcher.lastIndex = 0;
            if (matcher.test(line)) {
                matches.push(`${displayPath(filePath, context.cwd)}:${index + 1}:${line}`);
            }
        });
    }

    return truncateOutput(matches.join("\n") || "(no matches)");
}

export const grepTool: Tool = {
    name: "Grep",
    description:
        "使用正则表达式搜索项目文件内容，可用 include 限定文件名模式。",
    inputSchema: {
        type: "object",
        properties: {
            pattern: {
                type: "string",
                description: "要搜索的正则表达式。"
            },
            path: {
                type: "string",
                description: "搜索目录或文件，默认是项目根目录。"
            },
            include: {
                type: "string",
                description: "可选文件模式，例如 *.ts 或 src/**/*.ts。"
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
        const include = input.include;

        if (typeof pattern !== "string" || pattern.length === 0) {
            return {content: "pattern is required", isError: true};
        }
        if (typeof requestedPath !== "string") {
            return {content: "path must be a string", isError: true};
        }
        if (include !== undefined && typeof include !== "string") {
            return {content: "include must be a string", isError: true};
        }

        const searchPath = await validatePath(requestedPath, context.cwd);
        const args = ["--line-number", "--no-heading", "--color", "never"];
        if (include) args.push("--glob", include);
        args.push("--", pattern, searchPath);

        try {
            const result = await runProcess("rg", args, {
                cwd: context.cwd,
                timeout: 30_000,
                abortSignal: context.abortSignal
            });
            if (result.exitCode === 1) {
                return {content: "(no matches)"};
            }
            if (result.exitCode !== 0) {
                return {
                    content: truncateOutput(result.stderr || "Grep failed"),
                    isError: true
                };
            }
            return {content: truncateOutput(result.stdout.trim() || "(no matches)")};
        } catch (error: unknown) {
            if (
                error instanceof Error &&
                "code" in error &&
                error.code === "ENOENT"
            ) {
                try {
                    return {
                        content: await grepWithoutRipgrep(
                            pattern,
                            searchPath,
                            include,
                            context
                        )
                    };
                } catch (fallbackError: unknown) {
                    const message = fallbackError instanceof Error
                        ? fallbackError.message
                        : String(fallbackError);
                    return {content: `Invalid search: ${message}`, isError: true};
                }
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
