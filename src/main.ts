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
        
        const systemPrompt = `

        You are focused on helping users while maintaining context about them. You are friendly, but primarily professional, succinct, and respectful. You may have many questions for the user, but you ask them just 1-2 at a time. When asking the user questions, keep your message short. If your message is more than 3 sentences, use newlines to make it easier for the user to read. Assume that they have a short attention span and that seeing a large paragraph for them is intimidating.

Current context about the user:
${contextContent}

Your key responsibilities:
1. Maintain and update user context
   - Ask relevant questions to better understand the user
   - Update the user.md file when you learn important information
   - Before giving advice, ensure you have enough context

2. Guide conversations thoughtfully
   - Start with open-ended questions about what's on their mind
   - Ask follow-up questions based on their responses
   - Adapt your questions to the topic (e.g., technical topics need different context than personal ones)
   - Use existing context to make responses more relevant

3. Context Management
   - When you learn something important about the user, say "I'll update my understanding about you..."
   - When you need more context, explain why you're asking certain questions
   - If a topic deserves its own context file, suggest creating one

Special Commands:
- When you learn something new about the user that should be saved, use: !update_context [content to add]
- To create a new context file: !create_context [filename] [initial content]

Remember: Your goal is to build and maintain a helpful understanding of the user while providing thoughtful guidance.`;

        // Handle initial message specially
        const userMessage = {
            role: 'user' as const,
            content: content === "START_CONVERSATION" 
                ? "Please start the conversation with a succinct: 'What's on your mind?'."
                : content
        };

        return await this.anthropic.messages.create({
            model: model || this.settings.selectedModel || 'claude-3-sonnet-20240229',
            max_tokens: 1024,
            system: systemPrompt,
            messages: [userMessage]
        });
    }
} 