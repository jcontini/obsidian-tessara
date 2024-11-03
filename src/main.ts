import { Plugin, WorkspaceLeaf, Notice } from 'obsidian';
import { Anthropic } from '@anthropic-ai/sdk';
import { ConversationView } from './views/ConversationView';
import { TesseraSettingTab } from './settings';
import { ANTHROPIC_MODELS } from './models';
import { ContextManager } from './core/context-manager';

type Provider = 'anthropic';
type ModelType = 'default' | 'custom';

interface TesseraSettings {
    provider: Provider;
    apiKey: string;
    modelType: ModelType;
    customModel?: string;
    selectedModel?: string;
}

const DEFAULT_SETTINGS: TesseraSettings = {
    provider: 'anthropic',
    apiKey: '',
    modelType: 'default',
    selectedModel: 'claude-3-sonnet-20240229',
    customModel: ''
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
            throw new Error('Claude client not initialized');
        }
        
        const contextContent = await this.contextManager.getContextContent();
        
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
   - When you learn something important, say "I'll note that down..."
   - Focus on understanding what matters for their current goal

3. Communication style
   - Be concise and clear
   - Use short paragraphs and lists when appropriate
   - Stay professional but friendly
   - Keep responses focused and relevant

Special Commands:
- When you learn something important: !update_context [content]
- To create a new context file: !create_context [filename] [content]

For START_CONVERSATION:
- Simply ask "What's on your mind?"
- Let the user guide the direction
- Don't ask about AI or previous experiences unless relevant

Remember: Focus on what the user wants to discuss. Ask only ONE question at a time to maintain a natural conversation flow.`;

        // Handle initial message specially
        if (content === "START_CONVERSATION") {
            this.conversationHistory = [];
            const userMessage = {
                role: 'user' as const,
                content: "Please start the conversation with a succinct: 'What's on your mind?'."
            };
            this.conversationHistory.push(userMessage);
        } else {
            // Add the new user message to history
            this.conversationHistory.push({
                role: 'user',
                content: content
            });
        }

        const response = await this.anthropic.messages.create({
            model: model || this.settings.selectedModel || 'claude-3-sonnet-20240229',
            max_tokens: 1024,
            system: systemPrompt,
            messages: this.conversationHistory
        });

        // Add assistant's response to history
        if (response.content[0].type === 'text') {
            this.conversationHistory.push({
                role: 'assistant',
                content: response.content[0].text
            });
        }

        return response;
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
} 