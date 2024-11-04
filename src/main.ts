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
            name: 'Check Context Directory',
            callback: async () => {
                const exists = await this.app.vault.adapter.exists(this.contextManager.basePath);
                const files = await this.app.vault.adapter.list(this.contextManager.basePath);
                new Notice(`Context directory exists: ${exists}\nFiles: ${JSON.stringify(files, null, 2)}`);
                console.log('Context directory contents:', files);
            }
        });

        // Add these commands in onload()
        this.addCommand({
            id: 'debug-context',
            name: 'Debug: Show Context Status',
            callback: async () => {
                try {
                    const basePath = this.contextManager.basePath;
                    const exists = await this.app.vault.adapter.exists(basePath);
                    const profilePath = `${basePath}/Profile.md`;
                    const profileExists = await this.app.vault.adapter.exists(profilePath);
                    
                    // Show initial status
                    new Notice(`Checking context status...`, 2000);
                    
                    // Show directory status
                    new Notice(`Context Directory (${basePath}): ${exists ? '✅' : '❌'}`, 3000);
                    
                    // Show profile status
                    new Notice(`Profile.md: ${profileExists ? '✅' : '❌'}`, 3000);
                    
                    if (profileExists) {
                        const file = this.app.vault.getAbstractFileByPath(profilePath);
                        if (file instanceof TFile) {
                            const content = await this.app.vault.read(file);
                            new Notice(`Profile Content Length: ${content.length} chars`, 3000);
                            console.log('Profile content:', content);
                        }
                    }
                    
                    // Log to console for additional debugging
                    console.log('Debug Status:', {
                        contextDirExists: exists,
                        profileExists: profileExists,
                        basePath,
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
            
            // Log conversation history
            if (this.conversationHistory.length > 0) {
                await this.contextManager.logToFile('Conversation history:', 'DEBUG', 
                    this.conversationHistory.map(msg => 
                        `${msg.role.toUpperCase()}: ${msg.content}`
                    ).join('\n')
                );
            }
            
            const contextContent = await this.contextManager.getContextContent();
            
            // Only log context length and active files if they exist
            if (contextContent.trim()) {
                await this.contextManager.logToFile(`Context length: ${contextContent.length} chars`, 'DEBUG');
            }

            const systemPrompt = this.getSystemPrompt(contextContent);
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

            // Log minimal API request info
            await this.contextManager.logToFile('Sending request to Claude API...', 'INFO');
            
            const response = await this.anthropic.messages.create({
                model: model || this.settings.selectedModel || 'claude-3-sonnet-20240229',
                max_tokens: 1024,
                system: systemPrompt,
                messages: this.conversationHistory,
                tools: tools
            });

            await this.contextManager.logToFile('Received response from Claude API', 'INFO');

            // Log response based on type
            if (response.content[0].type === 'text') {
                await this.contextManager.logToFile('AI response', 'INFO', response.content[0].text);
            } else if (response.content[0].type === 'tool_use') {
                await this.contextManager.logToFile('AI using tool', 'INFO', `${response.content[0].name}`);
                await this.contextManager.logToFile('Tool input', 'DEBUG', JSON.stringify(response.content[0].input, null, 2));
            }

            // Handle tool use if present
            if (response.content[0].type === 'tool_use') {
                const toolUse = response.content[0] as ToolUse;
                try {
                    let result: string;
                    let contextUpdate: ContextUpdate | null = null;

                    if (toolUse.name === 'update_context') {
                        await this.contextManager.logToFile('Updating context...', 'INFO');
                        await this.contextManager.appendToUserContext(toolUse.input.content);
                        result = "Context updated successfully";
                        await this.contextManager.logToFile('Context updated', 'INFO');
                    } else if (toolUse.name === 'create_context_file') {
                        await this.contextManager.logToFile(`Creating new context file: ${toolUse.input.filename}`, 'INFO');
                        const filename = toolUse.input.filename || 'untitled.md';
                        const path = await this.contextManager.createNewContextFile(
                            filename,
                            toolUse.input.content
                        );
                        result = `Created new context file: ${path}`;
                        contextUpdate = {
                            filename: filename.endsWith('.md') ? filename : `${filename}.md`,
                            path: path
                        };
                    } else {
                        result = "Unknown tool";
                    }

                    return await this.sendToolResult(toolUse, result);

                } catch (error) {
                    await this.contextManager.logToFile(`Tool error: ${error.message}`, 'ERROR');
                    return await this.sendToolResult(toolUse, error.message, true);
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
1. User shares ANY personal information (name, location, preferences, etc.)
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
   - Don't start responses with "What's on your mind?"
   - Focus on the current topic
   - Ask relevant follow-up questions when appropriate

Example Interactions:
1. START_CONVERSATION:
   Assistant: "What's on your mind?"

2. Personal Info Shared:
   User: "My name is Joe and I live in Austin"
   Assistant: [Use update_context tool FIRST]
   Then respond: "Nice to meet you, Joe! How can I help you today?"

Available Tools:
- update_context: Use FIRST when ANY personal info is shared
- create_context_file: Use ONLY when organizing specific types of information (NOT for conversations)

Special Cases:
- For START_CONVERSATION: ONLY respond with "What's on your mind?" - no tool use needed
- Never create files for general conversation history
- Only create context files when explicitly organizing specific information types

Remember: 
1. Tools BEFORE text when personal info is shared
2. "What's on your mind?" ONLY for START_CONVERSATION
3. Natural, focused responses for everything else`;
    }
} 