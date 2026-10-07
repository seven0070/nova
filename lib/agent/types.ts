export type AgentMessage = { role: 'user' | 'assistant'; content: string };
export type ToolCall = { name: string; args: Record<string, unknown> };
export type AgentAction = { type: 'plan'; steps: string[] } | { type: 'tool'; name: string; args: Record<string, unknown> } | { type: 'parallel'; tools: ToolCall[] } | { type: 'final'; answer: string };
export type AgentEvent = { id: string; type: 'plan' | 'thinking' | 'action' | 'observation' | 'error' | 'completion'; title: string; detail: string; time: number };
export type AgentRun = { id: string; chatId?: string; messageId?: string; goal: string; status: 'running' | 'paused' | 'completed' | 'limited' | 'failed'; plan: string[]; events: AgentEvent[]; transcript: AgentMessage[]; answer: string; updatedAt: number };
export type WorkspaceRecord = { id: string; kind: 'memory' | 'file' | 'run' | 'audit'; name: string; content: string; updatedAt: number };
export type Capabilities = { runtime: 'web' | 'local'; terminalEnabled: boolean; codingEnabled?:boolean; browserEnabled?: boolean; desktopEnabled?: boolean; permissionLevel?: 'read'|'workspace'|'operator' };
export type ProviderConfig = { gateway?:boolean; connectionId?:string; fallbackModel?:string; base: string; key: string; model: string; protocol: string; system: string };
