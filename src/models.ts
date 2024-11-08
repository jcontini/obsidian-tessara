// Constants
export const ANTHROPIC_MODELS: Record<string, string> = {
    'claude-3-sonnet-20240229': 'claude-3-sonnet-20240229',
    'claude-3-opus-20240229': 'claude-3-opus-20240229',
    'claude-3-haiku-20240307': 'claude-3-haiku-20240307'
} as const;

// Types and Interfaces
export type Provider = 'anthropic';
export type ModelType = 'default' | 'custom';

export interface TesseraSettings {
    provider: Provider;
    apiKey: string;
    modelType: ModelType;
    customModel?: string;
    selectedModel?: string;
    projectDebugPath?: string;
}

export interface Tool {
    name: string;
    description: string;
    input_schema: {
        type: "object";
        properties: Record<string, any>;
        required?: string[];
    };
}

export interface ToolInput {
    content: string;
    filename?: string;
}

export interface ContextTool extends Tool {
    name: "update_context" | "create_context_file";
    description: string;
    input_schema: {
        type: "object";
        properties: {
            content: {
                type: "string";
                description: string;
            };
            filename?: {
                type: "string";
                description: string;
            };
        };
        required: string[];
    };
}

export interface ContextUpdate {
    filename: string;
    path: string;
}

export interface ToolUse {
    type: 'tool_use';
    id: string;
    name: 'update_context' | 'create_context_file';
    input: {
        content: string;
        filename?: string;
    };
}

export interface ToolResult {
    type: 'tool_result';
    tool_use_id: string;
    content: string;
    is_error?: boolean;
}

export interface MessageContent {
    type: 'text' | 'tool_use';
    text?: string;
    tool_use?: ToolUse;
} 