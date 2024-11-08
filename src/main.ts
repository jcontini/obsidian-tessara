import { Plugin, WorkspaceLeaf, Notice, TFile } from 'obsidian';
import { Anthropic } from '@anthropic-ai/sdk';
import { ConversationView } from './views/ConversationView';
import { TesseraSettingTab } from './settings';
import { ContextManager } from './context-manager';

const ANTHROPIC_MODELS = {
    'claude-3-sonnet-20240229': 'claude-3-sonnet-20240229',
    'claude-3-opus-20240229': 'claude-3-opus-20240229',
    'claude-3-haiku-20240307': 'claude-3-haiku-20240307'
} as const;

interface TesseraSettings {
    provider: 'anthropic';
    apiKey: string;
    modelType: 'default' | 'custom';
    customModel?: string;
    selectedModel?: string;
    debugMode: boolean;
}

interface ToolUse {
    type: 'tool_use';
    id: string;
    name: 'update_context';
    input: UpdateContextInput;
}

interface UpdateContextInput {
    content: string;
}

interface MessageContent {
    type: 'text' | 'tool_use';
    text?: string;
    tool_use?: ToolUse;
}

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export type { TesseraSettings };

const DEFAULT_SETTINGS: TesseraSettings = {
    provider: 'anthropic',
    apiKey: '',
    modelType: 'default',
    selectedModel: 'claude-3-sonnet-20240229',
    customModel: '',
    debugMode: false
};

export default class TesseraPlugin extends Plugin {
    private anthropic: Anthropic;
    settings: TesseraSettings;
    contextManager: ContextManager;
    private conversationHistory: Message[] = [];

    private readonly TOOLS = {
        UPDATE_CONTEXT: {
            name: "update_context",
            description: "Update Profile.md when the user shares new information about themselves. This can be demographic information, context about their work, life, relationships, interests, hobbies, or anything else.",
            input_schema: {
                type: "object",
                properties: {
                    content: {
                        type: "string",
                        description: "The verified, factual biographical content for the profile - NO assumptions or inferences"
                    }
                },
                required: ["content"]
            },
            rules: [
                "ONLY update when user explicitly shares information",
                "NEVER create placeholder or fictional content",
                "NEVER update for general conversation or greetings",
                "NEVER infer or assume information",
                "Only include explicitly stated facts"
            ]
        }
    };

    async onload() {
        await this.loadSettings();
        
        this.contextManager = new ContextManager(this);
        await this.contextManager.initialize();
        
        // Log initial settings
        if (this.settings.apiKey) {
            this.initializeClaudeClient(this.settings.apiKey);
        }

        this.addSettingTab(new TesseraSettingTab(this.app, this));

        this.registerView(
            'tessera-chat',
            (leaf) => new ConversationView(leaf, this)
        );

        this.addRibbonIcon('message-square', 'Tessera Chat', () => {
            this.activateView();
        });

        this.addCommand({
            id: 'open-dev-tools',
            name: 'Open Developer Tools',
            callback: () => {
                // @ts-ignore
                const win = (window as any).require('electron').remote.getCurrentWindow();
                win.webContents.toggleDevTools();
            }
        });

        this.addCommand({
            id: 'open-debug-log',
            name: 'Open Debug Log File',
            callback: async () => {
                await this.contextManager.openDebugLog();
            }
        });
    }

    async loadSettings() {
        const loadedData = await this.loadData();
        this.settings = {
            ...DEFAULT_SETTINGS,
            ...loadedData,
            selectedModel: loadedData?.selectedModel || DEFAULT_SETTINGS.selectedModel
        };
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    initializeClaudeClient(apiKey: string) {
        try {
            this.anthropic = new Anthropic({
                apiKey: apiKey,
                dangerouslyAllowBrowser: true
            });
        } catch (error) {
            console.error('Failed to initialize Claude client:', error);
            new Notice('Failed to initialize Claude client');
        }
    }

    async activateView() {
        const { workspace } = this.app;
        
        let leaf = workspace.getLeavesOfType('tessera-chat')[0];
        
        if (!leaf) {
            const newLeaf = workspace.getRightLeaf(false);
            if (!newLeaf) {
                new Notice('Failed to create view');
                return;
            }
            leaf = newLeaf;
            await leaf.setViewState({
                type: 'tessera-chat',
                active: true,
            });
        }
        
        workspace.revealLeaf(leaf);
    }

    async onunload() {
        // Cleanup
    }

    async testApiKey(apiKey: string, model?: string): Promise<boolean> {
        try {
            const testClient = new Anthropic({
                apiKey: apiKey,
                dangerouslyAllowBrowser: true
            });
            
            await testClient.messages.create({
                model: model || this.settings.selectedModel || 'claude-3-sonnet-20241022',
                max_tokens: 1,
                messages: [{ role: 'user', content: 'test' }]
            });
            
            this.initializeClaudeClient(apiKey);
            return true;
        } catch (error) {
            console.error('API key test failed:', error);
            if (error instanceof Error) {
                new Notice(`API Error: ${error.message}`);
            }
            throw error;
        }
    }

    async sendMessage(content: string) {
        if (!this.anthropic) {
            await this.contextManager.logToFile('No Claude client initialized', 'ERROR');
            throw new Error('Claude client not initialized');
        }

        try {
            await this.contextManager.logToFile('=== New Message ===', 'INFO');
            
            const contextContent = await this.contextManager.getContextContent();
            const systemPrompt = this.getSystemPrompt(contextContent);
            
            const newMessage: Message = { role: 'user', content };
            const messages: Message[] = [...this.conversationHistory, newMessage];
            
            const messageContext = {
                model: this.settings.selectedModel || 'claude-3-sonnet-20240229',
                system: systemPrompt,
                messages,
                tools: this.getTools(),
                max_tokens: 1024
            };
            
            await this.contextManager.logToFile('Sending request to Claude:', 'INFO', 
                JSON.stringify(messageContext, null, 2)
            );
            
            this.conversationHistory.push(newMessage);

            const response = await this.anthropic.messages.create({
                model: messageContext.model,
                max_tokens: messageContext.max_tokens,
                system: messageContext.system,
                messages: messageContext.messages,
                tools: messageContext.tools
            });

            await this.contextManager.logToFile('Received response from Claude API', 'INFO');

            let responseText = '';

            // Process tool responses
            for (const content of response.content) {
                if (content.type === 'tool_use') {
                    const toolUse = content as ToolUse;
                    if (toolUse.name === 'update_context') {
                        await this.handleContextUpdate(toolUse);
                    }
                } else if (content.type === 'text') {
                    const textContent = content as MessageContent;
                    responseText = textContent.text || '';
                }
            }

            // Log the response
            await this.contextManager.logToFile('Claude response:', 'INFO', 
                JSON.stringify(response.content, null, 2)
            );

            // Add to conversation history
            if (responseText) {
                this.conversationHistory.push({
                    role: 'assistant',
                    content: responseText
                });
            }

            return { content: responseText };

        } catch (error) {
            await this.contextManager.logToFile(`Error in sendMessage: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    private async handleContextUpdate(toolUse: ToolUse) {
        if (toolUse.name !== 'update_context') {
            await this.contextManager.logToFile('Error: Invalid tool use for context update', 'ERROR');
            throw new Error('Invalid tool use for context update');
        }
        
        const input = toolUse.input as UpdateContextInput;
        await this.contextManager.logToFile('Updating context...', 'INFO');
        await this.contextManager.appendToUserContext(input.content);
        await this.contextManager.logToFile('Context updated', 'INFO');
    }

    // Add method to clear conversation history
    clearConversationHistory() {
        this.conversationHistory = [];
    }

    private getSystemPrompt(contextContent: string): string {
        return `You are an AI assistant that helps users organize their thoughts and document information about themselves.

Current context about the user:
${contextContent}

IMPORTANT INSTRUCTIONS:
1. For all messages:
   - When users share new information about themselves, use the update_context tool
   - Keep responses helpful and engaging
   - Focus on the current topic without repeating profile content

2. After using update_context tool:
   - Continue the conversation naturally
   - Don't reference the profile update
   - Focus on engaging with their message`;
    }

    private getTools(): any[] {
        return [{
            name: this.TOOLS.UPDATE_CONTEXT.name,
            description: this.TOOLS.UPDATE_CONTEXT.description,
            input_schema: this.TOOLS.UPDATE_CONTEXT.input_schema
        }];
    }

    private async logSettings() {
        const settingsToLog = {
            ...this.settings,
            apiKey: this.settings.apiKey ? '***********' : undefined
        };

        await this.contextManager.logToFile(
            'Plugin Settings:', 
            'INFO',
            JSON.stringify(settingsToLog, null, 2)
        );
    }
} 