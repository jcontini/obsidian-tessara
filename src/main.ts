import { Plugin, WorkspaceLeaf, Notice, TFile } from 'obsidian';
import { Anthropic } from '@anthropic-ai/sdk';
import { ConversationView } from './views/ConversationView';
import { TesseraSettingTab } from './settings';
import { ContextManager } from './context-manager';
import { 
    TesseraSettings, 
    ToolUse,
    MessageContent,
    FirstMessageResponse,
    isUpdateContextInput,
    UpdateContextInput
} from './models';

const DEFAULT_SETTINGS: TesseraSettings = {
    provider: 'anthropic',
    apiKey: '',
    modelType: 'default',
    selectedModel: 'claude-3-sonnet-20240229',
    customModel: '',
    projectDebugPath: undefined
};

export default class TesseraPlugin extends Plugin {
    private anthropic: Anthropic;
    settings: TesseraSettings;
    contextManager: ContextManager;
    private conversationHistory: Array<{ role: 'user' | 'assistant', content: string }> = [];

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
        },
        FIRST_MESSAGE_RESPONSE: {
            name: "first_message_response",
            description: "Format the first message response with a title and content",
            input_schema: {
                type: "object",
                properties: {
                    title: {
                        type: "string",
                        description: "A brief (3-5 words) descriptive title for the conversation"
                    },
                    response: {
                        type: "string",
                        description: "Your natural response to the user's message"
                    }
                },
                required: ["title", "response"]
            }
        }
    };

    async onload() {
        await this.loadSettings();
        
        this.contextManager = new ContextManager(this);
        await this.contextManager.initialize();
        
        // Log initial settings
        if (this.settings.projectDebugPath) {
            await this.logSettings();
        }
        
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

    async sendMessage(content: string, isFirstMessage: boolean = false) {
        if (!this.anthropic) {
            await this.contextManager.logToFile('No Claude client initialized', 'ERROR');
            throw new Error('Claude client not initialized');
        }

        try {
            await this.contextManager.logToFile('=== New Message ===', 'INFO');
            await this.contextManager.logToFile(`Sending message: ${content}`, 'INFO');
            
            const contextContent = await this.contextManager.getContextContent();
            await this.contextManager.logToFile(`Context content length: ${contextContent.length}`, 'DEBUG');
            
            this.conversationHistory.push({
                role: 'user',
                content: content
            });

            const response = await this.anthropic.messages.create({
                model: this.settings.selectedModel || 'claude-3-sonnet-20240229',
                max_tokens: 1024,
                system: this.getSystemPrompt(contextContent),
                messages: this.conversationHistory,
                tools: this.getTools()
            });

            await this.contextManager.logToFile('Received response from Claude API', 'INFO');

            let responseText = '';
            let chatTitle = null;

            // Process tool responses
            for (const content of response.content) {
                if (content.type === 'tool_use') {
                    const toolUse = content as ToolUse;
                    if (toolUse.name === 'update_context') {
                        await this.handleContextUpdate(toolUse);
                    } else if (toolUse.name === 'first_message_response' && isFirstMessage) {
                        const firstMessageResponse = toolUse as FirstMessageResponse;
                        responseText = firstMessageResponse.input.response;
                        chatTitle = firstMessageResponse.input.title;
                    }
                } else if (content.type === 'text') {
                    const textContent = content as MessageContent;
                    responseText = textContent.text || '';
                }
            }

            // Add to conversation history
            if (responseText) {
                this.conversationHistory.push({
                    role: 'assistant',
                    content: responseText
                });
            }

            return {
                content: responseText,
                title: chatTitle
            };

        } catch (error) {
            await this.contextManager.logToFile(`Error in sendMessage: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    private async handleContextUpdate(toolUse: ToolUse) {
        const input = toolUse.input as UpdateContextInput;
        if (!isUpdateContextInput(input)) {
            await this.contextManager.logToFile('Error: Invalid input for context update', 'ERROR');
            throw new Error('Invalid input for context update');
        }
        
        await this.contextManager.logToFile('Updating context...', 'INFO');
        await this.contextManager.appendToUserContext(input.content);
        await this.contextManager.logToFile('Context updated', 'INFO');
    }

    // Add method to clear conversation history
    clearConversationHistory() {
        this.conversationHistory = [];
        this.contextManager.clearDebugLog();
    }

    private getSystemPrompt(contextContent: string): string {
        return `You are an AI assistant that helps users organize their thoughts and document information about themselves.

Current context about the user:
${contextContent}

IMPORTANT INSTRUCTIONS:
1. For the first message in a conversation:
   - Use the first_message_response tool to provide your response
   - If the user shares personal information, also use the update_context tool

2. For all messages:
   - When users share new information about themselves, use the update_context tool
   - Keep responses helpful and engaging
   - Focus on the current topic without repeating profile content

3. After using update_context tool:
   - Continue the conversation naturally
   - Don't reference the profile update
   - Focus on engaging with their message`;
    }

    private getTools(): any[] {
        return [
            {
                name: this.TOOLS.UPDATE_CONTEXT.name,
                description: this.TOOLS.UPDATE_CONTEXT.description,
                input_schema: this.TOOLS.UPDATE_CONTEXT.input_schema
            },
            {
                name: this.TOOLS.FIRST_MESSAGE_RESPONSE.name,
                description: this.TOOLS.FIRST_MESSAGE_RESPONSE.description,
                input_schema: this.TOOLS.FIRST_MESSAGE_RESPONSE.input_schema
            }
        ];
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