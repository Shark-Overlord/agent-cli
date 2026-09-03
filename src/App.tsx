import {Box, Text} from "ink";

import {AgentStatus} from "./components/AgentStatus.js";
import {MessageList} from "./components/MessageList.js";
import {PromptInput} from "./components/PromptInput.js";
import {useAgentSession} from "./hooks/useAgentSession.js";
import {useCliInput} from "./hooks/useCliInput.js";

export function App() {
    // 自定义 Hook：管理 Agent 状态（消息、加载、错误等）
    const agent = useAgentSession();

    // 自定义 Hook：处理键盘输入（回车提交、Ctrl+C 取消）
    const input = useCliInput({
        isLoading: agent.isLoading,
        onSubmit: agent.submit,
        onAbort: agent.abort
    });

    // 返回 UI 结构
    return (
        // Box = 类似 div，用于布局
        <Box flexDirection="column" padding={1}>
            {/* 标题行 */}
            <Text bold color="cyan">Ownai CLI</Text>

            {/* 消息列表组件（显示对话历史） */}
            <MessageList messages={agent.messages}/>

            {/* 状态组件（显示加载中、工具调用、错误、使用量） */}
            <AgentStatus
                isLoading={agent.isLoading}
                streamingText={agent.streamingText}
                toolStatus={agent.toolStatus}
                errorText={agent.errorText}
                usage={agent.lastUsage}
            />

            {/* 输入框（仅在非加载状态显示） */}
            {!agent.isLoading && (
                <PromptInput value={input.value}/>
            )}
        </Box>
    );
}
