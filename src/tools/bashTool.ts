import {spawn} from "node:child_process";

import type {Tool, ToolContext, ToolResult} from "./Tool.js";

const OUTPUT_LIMIT = 30_000;
const DEFAULT_TIMEOUT = 120_000;

export interface ProcessResult {
    stdout: string;
    stderr: string;
    exitCode: number | null;
}

interface RunProcessOptions {
    cwd: string;
    timeout?: number;
    abortSignal?: AbortSignal;
}

function abortError(message: string): Error {
    const error = new Error(message);
    error.name = "AbortError";
    return error;
}

export function truncateOutput(output: string): string {
    if (output.length <= OUTPUT_LIMIT) {
        return output;
    }

    const half = Math.floor(OUTPUT_LIMIT / 2);
    const dropped = output.length - OUTPUT_LIMIT;
    return (
        output.slice(0, half) +
        `\n\n--- truncated ${dropped.toLocaleString()} characters ---\n\n` +
        output.slice(-half)
    );
}

export function runProcess(
    command: string,
    args: string[],
    options: RunProcessOptions
): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
        if (options.abortSignal?.aborted) {
            reject(abortError("Process execution aborted"));
            return;
        }

        const child = spawn(command, args, {
            cwd: options.cwd,
            env: {...process.env},
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true
        });

        let stdout = "";
        let stderr = "";
        let settled = false;
        let closed = false;
        let forceKillTimer: NodeJS.Timeout | undefined;

        const timeout = options.timeout ?? DEFAULT_TIMEOUT;
        const timer = setTimeout(() => {
            child.kill("SIGTERM");
            forceKillTimer = setTimeout(() => {
                if (!closed) {
                    child.kill("SIGKILL");
                }
            }, 5_000);
            forceKillTimer.unref();

            if (!settled) {
                settled = true;
                reject(new Error(`Command timed out after ${timeout / 1000}s`));
            }
        }, timeout);

        const onAbort = () => {
            child.kill("SIGTERM");
            if (!settled) {
                settled = true;
                reject(abortError("Process execution aborted"));
            }
        };
        options.abortSignal?.addEventListener("abort", onAbort, {once: true});

        child.stdout.on("data", (chunk: Buffer) => {
            stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
        });

        child.on("error", (error) => {
            clearTimeout(timer);
            if (forceKillTimer) clearTimeout(forceKillTimer);
            options.abortSignal?.removeEventListener("abort", onAbort);
            if (!settled) {
                settled = true;
                reject(error);
            }
        });

        child.on("close", (exitCode) => {
            closed = true;
            clearTimeout(timer);
            if (forceKillTimer) clearTimeout(forceKillTimer);
            options.abortSignal?.removeEventListener("abort", onAbort);

            if (!settled) {
                settled = true;
                resolve({stdout, stderr, exitCode});
            }
        });
    });
}

const SIMPLE_READ_ONLY_COMMANDS = new Set([
    "ls", "dir", "cat", "type", "head", "tail", "wc", "grep", "rg",
    "pwd", "echo", "which", "where", "whoami", "date", "file", "stat",
    "du", "df", "uname", "hostname", "tree"
]);

export function isReadOnlyCommand(command: string): boolean {
    const trimmed = command.trim();
    if (!trimmed || /[<>`\n\r]|\$\(/.test(trimmed)) {
        return false;
    }

    const segments = trimmed
        .split(/\s*&&\s*|\s*\|\|\s*|\s*;\s*|\s*\|\s*/)
        .map((segment) => segment.trim())
        .filter(Boolean);

    return segments.length > 0 && segments.every((segment) => {
        const parts = segment.split(/\s+/);
        const base = parts[0]?.toLowerCase();

        if (base && SIMPLE_READ_ONLY_COMMANDS.has(base)) {
            return true;
        }

        if (base === "git") {
            const subcommand = parts[1]?.toLowerCase();
            if (["status", "log", "diff", "show"].includes(subcommand)) {
                return true;
            }
            if (subcommand === "branch") {
                return parts.slice(2).every((part) =>
                    ["--list", "--show-current", "-a", "-r", "-v", "-vv"].includes(part)
                );
            }
        }

        return segment === "node --version" ||
            segment.startsWith("npm list") ||
            segment.startsWith("npx tsc --noEmit");
    });
}

async function executeBash(
    input: Record<string, unknown>,
    context: ToolContext
): Promise<ToolResult> {
    const command = input.command;
    const requestedTimeout = input.timeout;

    if (typeof command !== "string" || command.trim() === "") {
        return {content: "command is required", isError: true};
    }

    const timeout = requestedTimeout === undefined
        ? DEFAULT_TIMEOUT
        : Number(requestedTimeout);
    if (!Number.isFinite(timeout) || timeout <= 0) {
        return {content: "timeout must be a positive number", isError: true};
    }

    const shell = process.platform === "win32"
        ? process.env.ComSpec || "cmd.exe"
        : "/bin/bash";
    const shellArgs = process.platform === "win32"
        ? ["/d", "/s", "/c", command]
        : ["-lc", command];
    const result = await runProcess(shell, shellArgs, {
        cwd: context.cwd,
        timeout,
        abortSignal: context.abortSignal
    });

    let output = "";
    if (result.stdout.trim()) output += result.stdout;
    if (result.stderr.trim()) {
        if (output) output += "\n";
        output += result.stderr;
    }
    output = truncateOutput(output || "(no output)");

    if (result.exitCode !== 0) {
        output = `Exit code: ${result.exitCode}\n${output}`;
    }

    return {
        content: output,
        isError: result.exitCode !== 0
    };
}

export const bashTool: Tool = {
    name: "Bash",
    description:
        "在当前项目根目录执行一条 shell 命令，并返回标准输出、标准错误和退出状态。",
    inputSchema: {
        type: "object",
        properties: {
            command: {
                type: "string",
                description: "要执行的 shell 命令。"
            },
            timeout: {
                type: "number",
                description: "可选超时时间，单位为毫秒，默认 120000。"
            }
        },
        required: ["command"]
    },
    call: executeBash,
    isReadOnly(): boolean {
        return false;
    },
    isEnabled(): boolean {
        return true;
    }
};
