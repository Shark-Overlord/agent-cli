export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock;

export interface UserMessage {
  role: "user";
  content: string | ContentBlock[];
}

export interface AssistantMessage {
  role: "assistant";
  content: ContentBlock[];
}

export type Message = UserMessage | AssistantMessage;

export interface StreamEventTextDelta {
  type: "text";
  text: string;
}

export interface StreamEventToolUseStart {
  type: "tool_use_start";
  id: string;
  name: string;
}

export interface StreamEventToolUseInput {
  type: "tool_use_input";
  delta: string;
}

export interface StreamEventMessageStart {
  type: "message_start";
}

export interface StreamEventError {
  type: "error";
  error: string;
}

export interface StreamResult {
  assistantMessage: AssistantMessage;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  stopReason: string;
}

export interface StreamEventMessageDone {
  type: "message_done";
  result: StreamResult;
}

export type StreamEvent =
  | StreamEventTextDelta
  | StreamEventToolUseStart
  | StreamEventToolUseInput
  | StreamEventMessageStart
  | StreamEventMessageDone
  | StreamEventError;
