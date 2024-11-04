import { Plugin, WorkspaceLeaf, Notice, TFile } from 'obsidian';
import { Anthropic } from '@anthropic-ai/sdk';
import { ConversationView } from './views/ConversationView';
import { TesseraSettingTab } from './settings';
import { ANTHROPIC_MODELS } from './models';
import { ContextManager } from './core/context-manager';

interface TesseraSettings {
    provider: Provider;
    apiKey: string;
    modelType: ModelType;
    customModel?: string;
    selectedModel?: string;
    projectDebugPath?: string;
}

type Provider = 'anthropic';
type ModelType = 'default' | 'custom';

interface Tool {
    name: string;
    description: string;
    input_schema: {
        type: "object";
        properties: Record<string, any>;
        required?: string[];
    };
}

interface ToolInput {
    content: string;
    filename?: string;
}

interface ContextTool extends Tool {
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

interface ContextUpdate {
    filename: string;
    path: string;
}

interface ToolUse {
    type: 'tool_use';
    id: string;
    name: 'update_context' | 'create_context_file';
    input: {
        content: string;
        filename?: string;
    };
}

interface ToolResult {
    type: 'tool_result';
    tool_use_id: string;
    content: string;
    is_error?: boolean;
}

interface MessageContent {
    type: 'text' | 'tool_use';
    text?: string;
    tool_use?: ToolUse;
}

const DEFAULT_SETTINGS: TesseraSettings = {
    provider: 'anthropic',
    apiKey: '',
    modelType: 'default',
    selectedModel: 'claude-3-sonnet-20240229',
    customModel: '',
    projectDebugPath: 'debug/debug.md'
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
            id: 'check-profile',
            name: 'Check Profile File Status',
            callback: async () => {
                const exists = await this.contextManager.checkProfileFile();
                new Notice(`Profile.md status: ${exists ? 'OK' : 'Not found/Not readable'}`);
            }
        });

        // Add command to open developer tools
        this.addCommand({
            id: 'open-dev-tools',
            name: 'Open Developer Tools',
            callback: () => {
                // @ts-ignore
                const win = (window as any).require('electron').remote.getCurrentWindow();
                win.webContents.toggleDevTools();
            }
        });

        // Add command to check context directory
        this.addCommand({
            id: 'check-context-dir',
            name: 'Check Profile Status',
            callback: async () => {
                const exists = await this.app.vault.adapter.exists('Profile.md');
                const file = this.app.vault.getAbstractFileByPath('Profile.md');
                if (file instanceof TFile) {
                    const content = await this.app.vault.read(file);
                    new Notice(`Profile.md exists: ${exists}\nSize: ${content.length} chars`);
                    console.log('Profile content:', content);
                } else {
                    new Notice('Profile.md not found or not accessible');
                }
            }
        });

        // Add these commands in onload()
        this.addCommand({
            id: 'debug-context',
            name: 'Debug: Show Context Status',
            callback: async () => {
                try {
                    const profilePath = 'Profile.md';
                    const exists = await this.app.vault.adapter.exists(profilePath);
                    const profileExists = await this.app.vault.adapter.exists(profilePath);
                    
                    new Notice(`Checking context status...`, 2000);
                    new Notice(`Profile.md: ${exists ? '✅' : '❌'}`, 3000);
                    
                    if (profileExists) {
                        const file = this.app.vault.getAbstractFileByPath(profilePath);
                        if (file instanceof TFile) {
                            const content = await this.app.vault.read(file);
                            new Notice(`Profile Content Length: ${content.length} chars`, 3000);
                            console.log('Profile content:', content);
                        }
                    }
                    
                    console.log('Debug Status:', {
                        profileExists: exists,
                        profilePath
                    });
                    
                } catch (error) {
                    new Notice(`Debug Error: ${error.message}`, 4000);
                    console.error('Debug error:', error);
                }
            }
        });

        this.addCommand({
            id: 'test-context-update',
            name: 'Debug: Test Context Update',
            callback: async () => {
                try {
                    const testContent = `Test update at ${new Date().toLocaleString()}`;
                    new Notice('🔄 Testing context update...');
                    
                    await this.contextManager.appendToUserContext(testContent);
                    
                    new Notice('✅ Test update completed - Check Profile.md');
                } catch (error) {
                    new Notice(`❌ Test failed: ${error.message}`);
                    console.error('Test update failed:', error);
                }
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
            await this.contextManager.logToFile('User message', 'INFO', content);
            
            if (this.conversationHistory.length > 0) {
                await this.contextManager.logToFile('Conversation history:', 'DEBUG', 
                    this.conversationHistory.map(msg => 
                        `${msg.role.toUpperCase()}: ${msg.content}`
                    ).join('\n')
                );
            }
            
            const contextContent = await this.contextManager.getContextContent();
            if (contextContent.trim()) {
                await this.contextManager.logToFile(`Context length: ${contextContent.length} chars`, 'DEBUG');
            }

            // Handle initial message specially
            if (content === "START_CONVERSATION") {
                await this.contextManager.logToFile('Starting new conversation', 'INFO');
                this.conversationHistory = [];
                const userMessage = {
                    role: 'user' as const,
                    content: "Please start the conversation with a succinct: 'What's on your mind?'."
                };
                this.conversationHistory.push(userMessage);
            } else {
                this.conversationHistory.push({
                    role: 'user',
                    content: content
                });
            }

            await this.contextManager.logToFile('Sending request to Claude API...', 'INFO');
            
            const response = await this.anthropic.messages.create({
                model: model || this.settings.selectedModel || 'claude-3-sonnet-20240229',
                max_tokens: 1024,
                system: this.getSystemPrompt(contextContent),
                messages: this.conversationHistory,
                tools: this.getTools()
            });

            await this.contextManager.logToFile('Received response from Claude API', 'INFO');

            // Handle tool use if present
            if (response.content[0].type === 'tool_use') {
                const toolUse = response.content[0];
                await this.contextManager.logToFile('AI using tool', 'INFO', toolUse.name);
                await this.contextManager.logToFile('Tool input', 'DEBUG', JSON.stringify(toolUse.input, null, 2));

                try {
                    await this.handleToolUse(toolUse);
                    // After tool use, get a follow-up response without the profile content
                    return await this.getFollowUpResponse(content, model);
                } catch (error) {
                    await this.contextManager.logToFile(`Tool error: ${error.message}`, 'ERROR');
                    throw error;
                }
            }

            // Handle regular text response
            if (response.content[0].type === 'text') {
                this.conversationHistory.push({
                    role: 'assistant',
                    content: response.content[0].text
                });
            }

            return response;
        } catch (error) {
            await this.contextManager.logToFile(`Error: ${error.message}`, 'ERROR');
            throw error;
        }
    }

    private async handleToolUse(toolUse: any) {
        if (toolUse.name === 'update_context') {
            await this.contextManager.logToFile('Updating context...', 'INFO');
            await this.contextManager.appendToUserContext(toolUse.input.content);
            await this.contextManager.logToFile('Context updated', 'INFO');
        } else if (toolUse.name === 'create_context_file') {
            await this.contextManager.logToFile(`Creating new context file: ${toolUse.input.filename}`, 'INFO');
            const path = await this.contextManager.createNewContextFile(
                toolUse.input.filename,
                toolUse.input.content
            );
            await this.contextManager.logToFile(`Created file: ${path}`, 'INFO');
        }
    }

    private async getFollowUpResponse(originalContent: string, model?: string) {
        // Get a follow-up response that focuses on interaction rather than profile content
        return await this.anthropic.messages.create({
            model: model || this.settings.selectedModel || 'claude-3-sonnet-20240229',
            max_tokens: 1024,
            system: "You are responding after updating the user's profile. Focus on engaging with their message naturally, without repeating or referencing the profile content. Keep the conversation flowing.",
            messages: [{
                role: 'user',
                content: originalContent
            }]
        });
    }

    private getTools(): any[] {
        return [
            {
                name: "update_context",
                description: `Update the user's profile with ONLY explicitly shared personal information.

CRITICAL RULES:
- NEVER infer, assume, or generate information not directly stated by the user
- NEVER create fictional quotes
- NEVER add hobbies, interests, or background details unless explicitly shared
- NEVER embellish or expand upon basic facts
- If unsure whether something was explicitly stated, DO NOT include it

Format the profile as a clear, factual markdown document that:
- Includes ONLY information directly provided by the user
- Uses simple, clear statements without embellishment
- Organizes verified information using:
  * Level 1 (#) heading for the profile title
  * Level 2 (##) headings for main sections
  * Bullet points for discrete facts
  * Tables for structured information when relevant
- Updates existing sections by:
  * Keeping confirmed information
  * Removing any previously hallucinated content
  * Adding new verified information
- Maintains strict factual accuracy
`,
                input_schema: {
                    type: "object",
                    properties: {
                        content: {
                            type: "string",
                            description: "The verified, factual markdown content for the profile - NO assumptions or inferences"
                        }
                    },
                    required: ["content"]
                }
            },
            {
                name: "create_context_file",
                description: "Create a new context file for organizing specific types of information. Use proper markdown formatting and structure.",
                input_schema: {
                    type: "object",
                    properties: {
                        filename: {
                            type: "string",
                            description: "Name of the file (will append .md if needed)"
                        },
                        content: {
                            type: "string",
                            description: "Initial content for the file, formatted in markdown"
                        }
                    },
                    required: ["filename", "content"]
                }
            }
        ];
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
                content: `Based on this first message from a chat, generate a short, descriptive title (3-5 words) that captures the main topic. Don't use quotes or special characters. Message: "${firstMessage}"`
            }],
            system: "You are a chat title generator. Respond only with the title - no explanation or additional text. Keep titles clear and concise."
        });

        return response.content[0].type === 'text' 
            ? response.content[0].text.trim()
            : 'Untitled Chat';
    }

    // Add command to view debug log
    async viewDebugLog() {
        const debugLog = await this.contextManager.getDebugLog();
        const leaf = this.app.workspace.getLeaf(true);
        await leaf.setViewState({
            type: 'markdown',
            state: {
                mode: 'source',
                source: debugLog.join('\n')
            }
        });
    }

    // Add this helper function at the class level
    private async sendToolResult(toolUse: ToolUse, result: string, isError: boolean = false) {
        const tools: ContextTool[] = [
            {
                name: "update_context",
                description: "IMMEDIATELY update user profile when ANY personal information is shared",
                input_schema: {
                    type: "object",
                    properties: {
                        content: {
                            type: "string",
                            description: "Format as 'key: value' pairs, one per line"
                        }
                    },
                    required: ["content"]
                }
            },
            {
                name: "create_context_file",
                description: "Create a new context file for organizing specific types of information",
                input_schema: {
                    type: "object",
                    properties: {
                        filename: {
                            type: "string",
                            description: "Name of the file (will append .md if needed)"
                        },
                        content: {
                            type: "string",
                            description: "Initial content for the file"
                        }
                    },
                    required: ["filename", "content"]
                }
            }
        ];

        await this.contextManager.logToFile('Sending tool result to Claude...', 'DEBUG');
        
        return this.anthropic.messages.create({
            model: this.settings.selectedModel || 'claude-3-sonnet-20240229',
            max_tokens: 1024,
            system: this.getSystemPrompt(await this.contextManager.getContextContent()),
            tools: tools,
            messages: [
                ...this.conversationHistory,
                {
                    role: 'assistant',
                    content: [toolUse]
                },
                {
                    role: 'user',
                    content: [{
                        type: 'tool_result',
                        tool_use_id: toolUse.id,
                        content: result,
                        is_error: isError
                    }]
                }
            ]
        });
    }

    // Add this method to the TesseraPlugin class
    private getSystemPrompt(contextContent: string): string {
        return `You are a thoughtful AI assistant focused on helping users achieve their goals while maintaining helpful context about them.

Current context about the user:
${contextContent}

CRITICAL INSTRUCTION: You MUST use tools BEFORE sending ANY text response when:
1. User shares MEANINGFUL personal information (name, location, preferences, etc.)
2. You need to create a new context file for organizing specific types of information

Tool Usage Rules:
1. NEVER say "let me update" or "I will update" - just USE the tool immediately
2. NEVER respond with text before using required tools
3. After using a tool, wait for the tool result before continuing
4. Do NOT create conversation files - conversations are handled automatically

Response Guidelines:
1. ONLY say "What's on your mind?" for START_CONVERSATION messages
2. For all other messages:
   - Respond naturally to the user's content
   - Focus on the current topic
   - Ask relevant follow-up questions when appropriate
   - NEVER repeat or reference profile content in your responses`;
    }
} 