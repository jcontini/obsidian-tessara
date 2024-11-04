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
        this.contextManager = new ContextManager(this);
        await this.contextManager.initialize();
        
        await this.loadSettings();
        
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
            await this.contextManager.logToFile(`User message: ${content}`, 'INFO');
            
            const contextContent = await this.contextManager.getContextContent();
            await this.contextManager.logToFile(`Current context length: ${contextContent.length} chars`, 'DEBUG');

            // Log the system prompt being used
            await this.contextManager.logToFile('Preparing system prompt and tools...', 'DEBUG');
            
            const systemPrompt = `You are a thoughtful AI assistant focused on helping users achieve their goals while maintaining helpful context about them.

Current context about the user:
${contextContent}

Your approach:
1. Stay focused on the user's current topic
   - Don't switch topics unless the user does
   - Ask only ONE follow-up question at a time
   - Only gather context that's relevant to the current discussion

2. Context gathering
   - Ask natural follow-up questions that flow from the conversation
   - Only ask ONE question at a time
   - When you learn something important about the user, use the update_context tool
   - Focus on understanding what matters for their current goal

3. Communication style
   - Be concise and clear
   - Use short paragraphs and lists when appropriate
   - Stay professional but friendly
   - Keep responses focused and relevant

Available Tools:
- update_context: Use this when you learn important information about the user
- create_context_file: Use this to create new context files for organizing information

For START_CONVERSATION:
- Simply ask "What's on your mind?"
- Let the user guide the direction
- Don't ask about AI or previous experiences unless relevant

Remember: Focus on what the user wants to discuss. Ask only ONE question at a time to maintain a natural conversation flow.`;

            await this.contextManager.logToFile('Configuring tools...', 'DEBUG');
            
            const tools: ContextTool[] = [
                {
                    name: "update_context",
                    description: "Append new information about the user to their profile",
                    input_schema: {
                        type: "object",
                        properties: {
                            content: {
                                type: "string",
                                description: "The information to append to the user's profile"
                            }
                        },
                        required: ["content"]
                    }
                },
                {
                    name: "create_context_file",
                    description: "Create a new markdown file in the Context folder to store specific information. Use this for organizing different types of context into separate files.",
                    input_schema: {
                        type: "object",
                        properties: {
                            filename: {
                                type: "string",
                                description: "Name of the file to create (will append .md if not included)"
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

            // Log conversation state
            await this.contextManager.logToFile(`Conversation history length: ${this.conversationHistory.length} messages`, 'DEBUG');

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

            // Log API request
            await this.contextManager.logToFile('Sending request to Claude API...', 'INFO');
            const response = await this.anthropic.messages.create({
                model: model || this.settings.selectedModel || 'claude-3-sonnet-20240229',
                max_tokens: 1024,
                system: systemPrompt,
                messages: this.conversationHistory,
                tools: tools
            });
            await this.contextManager.logToFile('Received response from Claude API', 'INFO');

            // Log response type
            await this.contextManager.logToFile(`Response type: ${response.content[0].type}`, 'INFO');

            // Handle tool use if present
            if (response.content[0].type === 'tool_use') {
                const toolUse = response.content[0];
                await this.contextManager.logToFile(`Tool use detected: ${toolUse.name}`, 'INFO');
                await this.contextManager.logToFile(`Tool input: ${JSON.stringify(toolUse.input, null, 2)}`, 'DEBUG');

                let result: string;
                let contextUpdate: ContextUpdate | null = null;

                try {
                    const toolInput = toolUse.input as ToolInput;
                    
                    if (toolUse.name === 'update_context') {
                        await this.contextManager.logToFile('Attempting context update...', 'INFO');
                        new Notice('🔄 Attempting to update context...', 2000);
                        
                        await this.contextManager.appendToUserContext(toolInput.content);
                        result = "Context updated successfully";
                        contextUpdate = {
                            filename: 'Profile.md',
                            path: 'Context/Profile.md'
                        };
                        
                        await this.contextManager.logToFile('Context update successful', 'INFO');
                        new Notice('✅ Context updated successfully', 2000);
                    } else if (toolUse.name === 'create_context_file') {
                        await this.contextManager.logToFile(`Creating new context file: ${toolInput.filename}`, 'INFO');
                        const path = await this.contextManager.createNewContextFile(
                            toolInput.filename!,
                            toolInput.content
                        );
                        result = `Created new context file: ${path}`;
                        contextUpdate = {
                            filename: toolInput.filename! + (toolInput.filename!.endsWith('.md') ? '' : '.md'),
                            path: path
                        };
                    } else {
                        result = "Unknown tool";
                    }

                    // Log tool result
                    await this.contextManager.logToFile(`Tool result: ${result}`, 'INFO');

                    // Send tool result back to Claude
                    await this.contextManager.logToFile('Sending tool result back to Claude...', 'DEBUG');
                    const toolResponse = await this.anthropic.messages.create({
                        model: model || this.settings.selectedModel || 'claude-3-sonnet-20240229',
                        max_tokens: 1024,
                        system: systemPrompt,
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
                                    content: result
                                }]
                            }
                        ]
                    });
                    await this.contextManager.logToFile('Received tool response from Claude', 'DEBUG');

                    // Add visual notification for context updates
                    if (contextUpdate) {
                        this.app.workspace.getLeavesOfType('tessera-chat').forEach(leaf => {
                            const view = leaf.view as ConversationView;
                            if (view?.showContextUpdateNotification && contextUpdate) {
                                view.showContextUpdateNotification(contextUpdate);
                                this.contextManager.logToFile('Showed context update notification', 'DEBUG');
                            }
                        });
                    }

                    return toolResponse;
                } catch (error) {
                    await this.contextManager.logToFile(`Tool execution failed: ${error.message}`, 'ERROR');
                    new Notice('❌ Failed to update context: ' + error.message, 3000);
                    // Handle tool execution error
                    return this.anthropic.messages.create({
                        model: model || this.settings.selectedModel || 'claude-3-sonnet-20240229',
                        max_tokens: 1024,
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
                                    content: error.message,
                                    is_error: true
                                }]
                            }
                        ]
                    });
                }
            }

            // Handle regular text response
            if (response.content[0].type === 'text') {
                await this.contextManager.logToFile('Processing text response...', 'DEBUG');
                this.conversationHistory.push({
                    role: 'assistant',
                    content: response.content[0].text
                });
                await this.contextManager.logToFile('Added response to conversation history', 'DEBUG');
            }

            return response;
        } catch (error) {
            await this.contextManager.logToFile(`Message handling failed: ${error.message}`, 'ERROR');
            new Notice('❌ Error handling message: ' + error.message, 3000);
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
} 