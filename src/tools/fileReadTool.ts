import {readFile} from "node:fs/promises";
import {validatePath} from "../utils/paths.js";
import type {Tool, ToolContext, ToolResult} from "./Tool.js";

function formatLines(
    content: string,
    offset: number,
    limit?: number
): string {
    const lines = content.split("\n");
    const start = Math.max(0, offset - 1);
    const end = limit === undefined
        ? lines.length
        : Math.min(lines.length, start + limit);
    const sliced = lines.slice(start, end);
    const padWidth = String(Math.max(end, 1)).length;

    return sliced
        .map((line, index) => {
            const lineNum = String(start + index + 1).padStart(padWidth, " ");
            return `${lineNum}|${line}`;
        })
        .join("\n");
}

export const fileReadTool: Tool = {
    name: "Read",
    description:
        "读取当前项目工作目录中的指定文本文件。返回内容包含行号。" +
        "对于较大的文件，可以使用 offset 和 limit 分段读取。",

    inputSchema: {
        type: "object",
        properties: {
            file_path: {
                type: "string",
                description: "要读取的文件路径。相对路径从当前工作目录解析。"
            },
            offset: {
                type: "integer",
                description: "开始读取的行号，从 1 开始。默认为 1。"
            },
            limit: {
                type: "integer",
                description: "最多读取多少行。如果省略，则读取到文件末尾。"
            }
        },
        required: ["file_path"]
    },

    async call(
        input: Record<string, unknown>,
        context: ToolContext
    ): Promise<ToolResult> {
        const filePath = input.file_path;

        if (typeof filePath !== "string" || filePath.trim() === "") {
            return {content: "file_path is required", isError: true};
        }

        const offset = input.offset === undefined ? 1 : Number(input.offset);
        if (!Number.isInteger(offset) || offset < 1) {
            return {
                content: "offset must be an integer greater than or equal to 1",
                isError: true
            };
        }

        const limit = input.limit === undefined ? undefined : Number(input.limit);
        if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
            return {content: "limit must be a positive integer", isError: true};
        }

        try {
            const absolutePath = await validatePath(filePath, context.cwd);
            const content = await readFile(absolutePath, {
                encoding: "utf-8",
                signal: context.abortSignal
            });
            const totalLines = content.split("\n").length;
            const formatted = formatLines(content, offset, limit);
            return {
                content: `File: ${filePath} (${totalLines} lines total)\n${formatted}`
            };
        } catch (err: unknown) {
            if (context.abortSignal?.aborted) {
                return {content: "File read interrupted", isError: true};
            }
            if (err instanceof Error && "code" in err && err.code === "ENOENT") {
                return {content: `File not found: ${filePath}`, isError: true};
            }
            if (err instanceof Error && "code" in err && err.code === "EISDIR") {
                return {
                    content: `${filePath} is a directory, not a file`,
                    isError: true
                };
            }
            const message = err instanceof Error ? err.message : String(err);
            return {content: `Error reading file: ${message}`, isError: true};
        }
    },

    isReadOnly(): boolean {
        return true;
    },

    isEnabled(): boolean {
        return true;
    }
};
