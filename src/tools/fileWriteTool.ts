import {access, mkdir, writeFile} from "node:fs/promises";
import {dirname} from "node:path";

import {validatePath} from "../utils/paths.js";
import type {Tool, ToolContext, ToolResult} from "./Tool.js";

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}

export const fileWriteTool: Tool = {
    name: "Write",
    description:
        "创建文本文件，或使用完整的新内容覆盖现有文件。父目录不存在时会自动创建。",
    inputSchema: {
        type: "object",
        properties: {
            file_path: {
                type: "string",
                description: "要写入的文件路径。相对路径从当前工作目录解析。"
            },
            content: {
                type: "string",
                description: "要写入文件的完整内容。"
            }
        },
        required: ["file_path", "content"]
    },

    async call(
        input: Record<string, unknown>,
        context: ToolContext
    ): Promise<ToolResult> {
        const filePath = input.file_path;
        const content = input.content;

        if (typeof filePath !== "string" || filePath.trim() === "") {
            return {content: "file_path is required", isError: true};
        }
        if (typeof content !== "string") {
            return {content: "content must be a string", isError: true};
        }

        const resolved = await validatePath(filePath, context.cwd);
        const existed = await fileExists(resolved);

        context.abortSignal?.throwIfAborted();
        await mkdir(dirname(resolved), {recursive: true});
        await validatePath(filePath, context.cwd);
        await writeFile(resolved, content, {
            encoding: "utf-8",
            signal: context.abortSignal
        });

        return {
            content: existed
                ? `Updated file: ${filePath}`
                : `Created file: ${filePath}`
        };
    },

    isReadOnly(): boolean {
        return false;
    },

    isEnabled(): boolean {
        return true;
    }
};
