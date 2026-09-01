export interface ToolResult {
    content: string;
    isError?: boolean;
}

export interface ToolContext {
    cwd: string;
    abortSignal?: AbortSignal;
}

export interface Tool {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;

    call(
        input: Record<string, unknown>,
        context: ToolContext
    ): Promise<ToolResult>;

    isReadOnly(): boolean;

    isEnabled(): boolean;
}

export interface ToolApiParam {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
}
