import { Plugin, WorkspaceLeaf, Notice, TFile } from 'obsidian';
import { Anthropic } from '@anthropic-ai/sdk';
import { ConversationView } from './views/ConversationView';
import { TesseraSettingTab } from './settings';
import { ContextManager } from './context-manager';
import { 
    TesseraSettings, 
    ToolUse
} from './models';
import { Prompts } from './prompts';

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

    async sendMessage(content: string, model?: string) {
        if (!this.anthropic) {
            await this.contextManager.logToFile('No Claude client initialized', 'ERROR');
            throw new Error('Claude client not initialized');
        }

        try {
            await this.contextManager.logToFile('=== New Message ===', 'INFO');
            await this.contextManager.logToFile(`Sending message: ${content}`, 'INFO');
            
            if (this.conversationHistory.length > 0) {
                await this.contextManager.logToFile('Current conversation history:', 'DEBUG', 
                    JSON.stringify(this.conversationHistory, null, 2)
                );
            }
            
            const contextContent = await this.contextManager.getContextContent();
            await this.contextManager.logToFile(`Context content length: ${contextContent.length}`, 'DEBUG');
            await this.contextManager.logToFile('Context content:', 'DEBUG', contextContent);

            // Handle initial message specially
            if (content === "START_CONVERSATION") {
                await this.contextManager.logToFile('Starting new conversation', 'INFO');
                this.conversationHistory = [];
                const userMessage = {
                    role: 'user' as const,
                    content: Prompts.INITIAL_MESSAGE
                };
                this.conversationHistory.push(userMessage);
                await this.contextManager.logToFile('Added initial message to history', 'DEBUG');
            } else {
                this.conversationHistory.push({
                    role: 'user',
                    content: content
                });
            }

            await this.contextManager.logToFile('Preparing Claude API request...', 'INFO');
            await this.contextManager.logToFile('Using model:', 'DEBUG', model || this.settings.selectedModel);
            
            const systemPrompt = this.getSystemPrompt(contextContent);
            await this.contextManager.logToFile('System prompt:', 'DEBUG', systemPrompt);

            const response = await this.anthropic.messages.create({
                model: model || this.settings.selectedModel || 'claude-3-sonnet-20240229',
                max_tokens: 1024,
                system: systemPrompt,
                messages: this.conversationHistory,
                tools: this.getTools()
            });

            await this.contextManager.logToFile('Received response from Claude API', 'INFO');
            await this.contextManager.logToFile('Response content:', 'DEBUG', 
                JSON.stringify(response.content, null, 2)
            );

            // Handle tool use if present
            if (response.content[0].type === 'tool_use') {
                const toolUse = response.content[0];
                await this.contextManager.logToFile('AI using tool', 'INFO', toolUse.name);
                await this.contextManager.logToFile('Tool input', 'DEBUG', JSON.stringify(toolUse.input, null, 2));

                try {
                    await this.handleToolUse(toolUse);
                    await this.contextManager.logToFile('Tool use completed successfully', 'INFO');
                    // After tool use, get a follow-up response without the profile content
                    return await this.getFollowUpResponse(content, model);
                } catch (error) {
                    await this.contextManager.logToFile(`Tool error: ${error.message}`, 'ERROR');
                    throw error;
                }
            }

            // Handle regular text response
            if (response.content[0].type === 'text') {
                await this.contextManager.logToFile('Adding assistant response to history', 'DEBUG');
                this.conversationHistory.push({
                    role: 'assistant',
                    content: response.content[0].text
                });
            }

            return response;
        } catch (error) {
            await this.contextManager.logToFile(`Error in sendMessage: ${error.message}`, 'ERROR');
            if (error instanceof Error) {
                await this.contextManager.logToFile('Error stack:', 'ERROR', error.stack || 'No stack trace');
            }
            throw error;
        }
    }

    private async handleToolUse(toolUse: any) {
        if (toolUse.name === 'update_context') {
            await this.contextManager.logToFile('Updating context...', 'INFO');
            await this.contextManager.appendToUserContext(toolUse.input.content);
            await this.contextManager.logToFile('Context updated', 'INFO');
        }
    }

    private async getFollowUpResponse(originalContent: string, model?: string) {
        // Get a follow-up response that focuses on interaction rather than profile content
        return await this.anthropic.messages.create({
            model: model || this.settings.selectedModel || 'claude-3-sonnet-20240229',
            max_tokens: 1024,
            system: Prompts.POST_UPDATE_SYSTEM,
            messages: [{
                role: 'user',
                content: originalContent
            }]
        });
    }

    private getTools(): any[] {
        return [{
            name: "update_context",
            description: Prompts.TOOLS.UPDATE_CONTEXT.description,
            input_schema: {
                type: "object",
                properties: {
                    content: {
                        type: "string",
                        description: Prompts.TOOLS.UPDATE_CONTEXT.inputDescription
                    }
                },
                required: ["content"]
            }
        }];
    }

    // Add method to clear conversation history
    clearConversationHistory() {
        this.conversationHistory = [];
    }

    async generateChatName(firstMessage: string): Promise<string> {
        if (!this.anthropic) {
            throw new Error('Claude client not initialized');
        }

        const response = await this.anthropic.messages.create({
            model: this.settings.selectedModel || 'claude-3-sonnet-20240229',
            max_tokens: 50,
            messages: [{
                role: 'user',
                content: Prompts.CHAT_TITLE.user(firstMessage)
            }],
            system: Prompts.CHAT_TITLE.system
        });

        return response.content[0].type === 'text' 
            ? response.content[0].text.trim()
            : 'Untitled Chat';
    }


    // Add this method to the TesseraPlugin class
    private getSystemPrompt(contextContent: string): string {
        return Prompts.MAIN_SYSTEM(contextContent);
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