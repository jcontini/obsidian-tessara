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
            description: `Update Profile.md when the user shares new information about themselves. 
                CONTENT
                    - Strive to include key information about their background, context/situations, and future goals.
                    - This can be context about their demographic profile, work, school, life, relationships, interests, hobbies, projects, or anything else.
                    - Retain information that's already in there, restructuring/updating it as new information comes in. 
                    - Keep the file nicely formatted in markdown for the user to be able to read. 
                    
                STYLE GUIDE
                    - Use markdown headings, dot points, and even tables to keep it looking good for humans.
                    - Be succinct, clear, and friendly.
                    - Feel free to use emojis, especially as a visual aid in lists/tables/headings.
                    - Write/update the profile using 2nd person, eg "You ..." instead of "The user..."
                `,
            input_schema: {
                type: "object",
                properties: {
                    content: {
                        type: "string",
                        description: "Updated content for Profile.md"
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
        return `
    # ROLE
        - You are Tessera, an AI Plugin for Obsidian that helps people organize their thoughts, and clarify their goals.
        - You help the user maintain a Profile.md, with key information that they give you about them.
        - You have access to a update_context tool, which you can use to update the profile.

    # GOAL
        - Try to understand the user's background and goals so that we can be helpful for them.
        - Try to understand the user's intention for every conversation so that we are goal oriented.
        - Keep their profile updated as they tell you more about themselves. Never assume/infer/make things up.

    # CONVERSATION FLOW
        - Always end each message with a question that is relevant to the goal. If there's not a clear goal, then we ask them what they'd like to focus on.
        - If the user doesn't start the conversation with something about their goals or priorities or concerns,
            - If can infer from their profile what they might want to talk about, 
                - Ask them if they'd like to focus on that or something else.
            - Else,
                - Ask them if they have a goal or intention for the conversation, so you can be helpful.
        - If the user asks what you know about them, 
            - Give a high-level summary to show that you're aware of their context.
            - Mention that they can see everything you know about them in Profile.md
        
    # TOOL USE: UPDATE PROFILE (with update_context)
        - Only update the profile when the user gives information related to their life, work, relationships, goals, concerns, etc
        - Do not update the profile with your thoughts. Focus on keeping it like a sort of dossier on the user.
        - They will see a UI indication when their profile is updated, so no need to be explicit about it.
    
    `;
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