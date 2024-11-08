import { ItemView, WorkspaceLeaf, MarkdownRenderer, Notice, TFile, TAbstractFile } from 'obsidian';
import TesseraPlugin from '../main';
import { RetryButton } from '../components/RetryButton';

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

interface ContextUpdate {
    filename: string;
    path: string;
}

export class ConversationView extends ItemView {
    private messages: ChatMessage[] = [];
    private messageContainer: HTMLElement;
    private inputContainer: HTMLElement;
    private lastFailedMessage: string | null = null;

    constructor(
        leaf: WorkspaceLeaf,
        private plugin: TesseraPlugin
    ) {
        super(leaf);
    }

    getViewType(): string {
        return 'tessera-chat';
    }

    getDisplayText(): string {
        return 'Tessera Chat';
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        
        // Main chat container
        const chatContainer = container.createDiv('tessera-chat-container');
        
        // Header with buttons
        const header = chatContainer.createDiv('tessera-chat-header');
        
        // Remove left buttons section and debug clear button
        const headerButtons = header.createDiv('tessera-header-buttons');

        // New chat button
        const newChatButton = headerButtons.createEl('button', {
            cls: 'tessera-header-button',
            attr: {
                'aria-label': 'New chat'
            }
        });
        newChatButton.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
            <path d="M12 5v14M5 12h14"/>
        </svg>`;

        // Copy all button
        const copyAllButton = headerButtons.createEl('button', {
            cls: 'tessera-header-button',
            attr: {
                'aria-label': 'Copy conversation'
            }
        });
        copyAllButton.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>`;

        // Save button
        const saveButton = headerButtons.createEl('button', {
            cls: 'tessera-header-button',
            attr: {
                'aria-label': 'Save conversation'
            }
        });
        saveButton.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
            <polyline points="17 21 17 13 7 13 7 21"></polyline>
            <polyline points="7 3 7 8 15 8"></polyline>
        </svg>`;

        // Add event listeners
        newChatButton.addEventListener('click', async () => {
            if (this.messages.length > 0) {
                await this.saveConversation();
            }
            this.startNewChat();
        });

        copyAllButton.addEventListener('click', async () => {
            await this.copyConversation();
        });
        
        saveButton.addEventListener('click', () => this.saveConversation());

        // Messages area
        this.messageContainer = chatContainer.createDiv('tessera-messages');
        
        // Input area
        this.inputContainer = chatContainer.createDiv('tessera-input-container');
        
        const textarea = this.inputContainer.createEl('textarea', {
            attr: {
                placeholder: 'Type your message...',
                rows: '3'
            }
        });

        const buttonContainer = this.inputContainer.createDiv('tessera-button-container');
        
        const sendButton = buttonContainer.createEl('button', {
            cls: 'tessera-send-button'
        });
        sendButton.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>`;

        // Event listeners
        textarea.addEventListener('keydown', (e) => {
            if ((e.key === 'Enter' && !e.shiftKey) || 
                (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
                e.preventDefault();
                this.sendMessage(textarea.value);
                textarea.value = '';
            }
        });

        sendButton.addEventListener('click', () => {
            this.sendMessage(textarea.value);
            textarea.value = '';
        });

        // Add styles
        this.addStyles();

        // Show initial prompt without API call
        const initialPrompt = this.messageContainer.createDiv('tessera-message-wrapper assistant');
        const promptMessage = initialPrompt.createDiv('tessera-message assistant');
        promptMessage.setText("What's on your mind?");
    }

    async sendMessage(content: string) {
        if (!content.trim()) return;

        const userMessage: ChatMessage = {
            role: 'user',
            content: content.trim(),
            timestamp: Date.now()
        };
        
        this.messages.push(userMessage);
        await this.renderMessage(userMessage);

        const loadingEl = this.showLoadingIndicator();

        try {
            const response = await this.plugin.sendMessage(content);
            loadingEl.parentElement?.remove();

            const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: response.content,
                timestamp: Date.now()
            };
            
            this.messages.push(assistantMessage);
            await this.renderMessage(assistantMessage);

        } catch (error) {
            console.error('Failed to get AI response:', error);
            loadingEl.parentElement?.remove();
            this.lastFailedMessage = content;
            
            const errorMessage: ChatMessage = {
                role: 'assistant',
                content: 'Failed to get response from AI',
                timestamp: Date.now()
            };
            
            this.messages.push(errorMessage);
            await this.renderMessage(errorMessage);
        }
    }

    private async renderMessage(message: ChatMessage) {
        const wrapper = this.messageContainer.createDiv(`tessera-message-wrapper ${message.role}`);
        const messageEl = wrapper.createDiv(`tessera-message ${message.role}`);
        
        // Add message content
        if (message.role === 'assistant') {
            await MarkdownRenderer.renderMarkdown(
                message.content,
                messageEl,
                '.tessera-chat',
                this
            );
        } else {
            messageEl.setText(message.content);
        }

        // Add bottom bar with timestamp and copy button
        const bottomBar = wrapper.createDiv('tessera-message-bottom-bar');
        
        // Add timestamp
        const timestamp = bottomBar.createDiv('tessera-timestamp');
        timestamp.setText(this.formatTimestamp(message.timestamp));

        // Add copy button
        const copyButton = bottomBar.createDiv('tessera-copy-button');
        copyButton.setAttribute('aria-label', 'Copy message');
        copyButton.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>`;

        copyButton.addEventListener('click', async (e) => {
            e.stopPropagation();
            await navigator.clipboard.writeText(message.content);
            
            // Show feedback
            copyButton.addClass('copied');
            setTimeout(() => copyButton.removeClass('copied'), 1000);
        });

        this.messageContainer.scrollTo({
            top: this.messageContainer.scrollHeight,
            behavior: 'smooth'
        });
    }

    private formatTimestamp(timestamp: number): string {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    private showLoadingIndicator() {
        const wrapper = this.messageContainer.createDiv('tessera-message-wrapper assistant');
        const loadingEl = wrapper.createDiv('tessera-message loading');
        
        const indicator = loadingEl.createDiv('typing-indicator');
        for (let i = 0; i < 3; i++) {
            indicator.createSpan();
        }
        
        // Scroll to bottom immediately after adding the loading indicator
        this.messageContainer.scrollTo({
            top: this.messageContainer.scrollHeight,
            behavior: 'smooth'
        });
        
        return loadingEl;
    }

    private async saveConversation() {
        if (this.messages.length === 0) {
            new Notice('No messages to save');
            return;
        }

        const basePath = 'Saved Chats';
        if (!(await this.app.vault.adapter.exists(basePath))) {
            await this.app.vault.createFolder(basePath);
        }

        const today = new Date().toISOString().slice(0, 10);
        const datePath = `${basePath}/${today}`;
        if (!(await this.app.vault.adapter.exists(datePath))) {
            await this.app.vault.createFolder(datePath);
        }

        const timestamp = new Date().toLocaleTimeString().replace(/:/g, '-');
        const filename = `${datePath}/Chat ${timestamp}.md`;

        const markdown = await this.generateConversationMarkdown();

        try {
            await this.app.vault.create(filename, markdown);
            new Notice('Conversation saved');
            
            const abstractFile = this.app.vault.getAbstractFileByPath(filename);
            if (abstractFile instanceof TFile) {
                await this.app.workspace.getLeaf(false).openFile(abstractFile);
            }
        } catch (error) {
            console.error('Failed to save conversation:', error);
            new Notice('Failed to save conversation');
        }
    }

    private async startNewChat() {
        this.messages = [];
        this.messageContainer.empty();
        await this.plugin.clearConversationHistory();
        
        const initialPrompt = this.messageContainer.createDiv('tessera-message-wrapper assistant');
        const promptMessage = initialPrompt.createDiv('tessera-message assistant');
        promptMessage.setText("What's on your mind?");
    }

    private addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .tessera-chat-container {
                display: flex;
                flex-direction: column;
                height: 100%;
                padding: 0.5rem;
                background-color: var(--background-primary);
            }

            .tessera-messages {
                flex-grow: 1;
                overflow-y: auto;
                margin-bottom: 0.5rem;
                padding: 0.5rem;
                padding-bottom: 1rem;
                scroll-behavior: smooth;
            }

            .tessera-message-wrapper {
                display: flex;
                flex-direction: column;
                margin-bottom: 0.8rem;
                max-width: 85%;
                position: relative;
            }

            .tessera-message-wrapper.user {
                margin-left: auto;
            }

            .tessera-message-wrapper.assistant {
                margin-right: auto;
            }

            .tessera-message {
                padding: 0.5rem 0.8rem;
                border-radius: 8px;
                position: relative;
                margin: 0;
                border: 1px solid var(--background-modifier-border);
            }

            /* Override default paragraph margins */
            .tessera-message p {
                margin: 0;
                padding: 0;
            }

            /* Add spacing between paragraphs only if they're not the last one */
            .tessera-message p:not(:last-child) {
                margin-bottom: 0.5em;
            }

            .tessera-message.user {
                background-color: var(--interactive-accent);
                color: var(--text-on-accent);
                border-bottom-right-radius: 3px;
                border: none;
            }

            .tessera-message.assistant {
                background-color: var(--background-secondary);
                color: var(--text-normal);
                border-bottom-left-radius: 3px;
            }

            .tessera-timestamp {
                font-size: 0.7em;
                color: var(--text-muted);
                margin-top: 0.3rem;
                padding: 0 0.5rem;
            }

            .tessera-message-wrapper.user .tessera-timestamp {
                text-align: right;
            }

            .tessera-message.loading {
                background-color: var(--background-secondary);
                color: var(--text-muted);
                border-bottom-left-radius: 4px;
                display: flex;
                align-items: center;
                gap: 0.3rem;
            }

            .typing-indicator {
                display: flex;
                gap: 0.3rem;
                padding: 0.2rem 0;
            }

            .typing-indicator span {
                width: 0.5rem;
                height: 0.5rem;
                border-radius: 50%;
                background-color: var(--text-muted);
                animation: bounce 1.4s infinite ease-in-out;
            }

            .typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
            .typing-indicator span:nth-child(2) { animation-delay: -0.16s; }

            @keyframes bounce {
                0%, 80%, 100% { transform: translateY(0); }
                40% { transform: translateY(-0.5rem); }
            }

            .tessera-input-container {
                position: relative;
                z-index: 2;
                display: flex;
                gap: 0.5rem;
                padding: 0.8rem;
                background-color: var(--background-secondary);
                border-radius: 12px;
                margin: 0 0.5rem;
            }

            .tessera-input-container textarea {
                flex-grow: 1;
                resize: none;
                border: none;
                background-color: transparent;
                color: var(--text-normal);
                padding: 0.5rem;
                border-radius: 4px;
                font-size: 0.95em;
                line-height: 1.4;
            }

            .tessera-input-container textarea:focus {
                outline: none;
                background-color: var(--background-primary);
            }

            .tessera-send-button {
                background: none;
                border: none;
                padding: 0.5rem;
                cursor: pointer;
                color: var(--interactive-accent);
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 8px;
                transition: background-color 0.2s ease;
            }

            .tessera-send-button:hover {
                background-color: var(--background-modifier-hover);
            }

            .tessera-message-bottom-bar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 0 0.5rem;
                margin-top: 0.3rem;
            }

            .tessera-timestamp {
                font-size: 0.7em;
                color: var(--text-muted);
            }

            .tessera-copy-button {
                opacity: 0;
                cursor: pointer;
                padding: 0.2rem;
                border-radius: 4px;
                color: var(--text-muted);
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
            }

            .tessera-message-wrapper:hover .tessera-copy-button {
                opacity: 0.5;
            }

            .tessera-copy-button:hover {
                opacity: 1 !important;
                background-color: var(--background-modifier-hover);
            }

            .tessera-copy-button.copied {
                color: var(--interactive-accent);
                opacity: 1;
            }

            /* Ensure markdown content is selectable */
            .tessera-message * {
                user-select: text;
                cursor: text;
            }

            /* Keep code blocks selectable but with code cursor */
            .tessera-message pre,
            .tessera-message code {
                cursor: text;
                user-select: text;
            }

            .tessera-chat-header {
                display: flex;
                justify-content: space-between;
                padding: 0.5rem;
                border-bottom: 1px solid var(--background-modifier-border);
                margin-bottom: 0.5rem;
            }

            .tessera-save-button {
                background: none;
                border: none;
                padding: 0.5rem;
                cursor: pointer;
                color: var(--text-muted);
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
                transition: all 0.2s ease;
            }

            .tessera-save-button:hover {
                color: var(--text-normal);
                background-color: var(--background-modifier-hover);
            }

            .tessera-header-buttons {
                display: flex;
                gap: 0.5rem;
            }

            .tessera-header-button {
                background: none;
                border: none;
                padding: 0.5rem;
                cursor: pointer;
                color: var(--text-muted);
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
                transition: all 0.2s ease;
            }

            .tessera-header-button:hover {
                color: var(--text-normal);
                background-color: var(--background-modifier-hover);
            }

            .tessera-context-notification {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                padding: 0.5rem 0.8rem;
                background-color: var(--background-secondary);
                border-radius: 8px;
                color: var(--text-muted);
                font-size: 0.9em;
                border: 1px solid var(--background-modifier-border);
                margin-bottom: 0.8rem;
            }

            .tessera-context-icon {
                display: flex;
                align-items: center;
                color: var(--text-accent);
                animation: spin 2s linear infinite;
            }

            @keyframes spin {
                100% { transform: rotate(360deg); }
            }

            .tessera-context-badge {
                background-color: var(--background-modifier-border);
                color: var(--text-muted);
                padding: 0.2rem 0.5rem;
                border-radius: 4px;
                font-size: 0.8em;
                cursor: pointer;
                border: none;
                transition: all 0.2s ease;
            }

            .tessera-context-badge:hover {
                background-color: var(--interactive-accent);
                color: var(--text-on-accent);
            }

            .tessera-header-buttons-left,
            .tessera-header-buttons-right {
                display: flex;
                gap: 0.5rem;
            }

            .tessera-header-buttons-left .tessera-header-button {
                color: var(--text-muted);
            }

            .tessera-header-buttons-left .tessera-header-button:hover {
                color: var(--text-error);
                background-color: var(--background-modifier-error);
            }
        `;
        document.head.append(style);
    }

    private async generateConversationMarkdown(): Promise<string> {
        const timestamp = new Date().toLocaleString();
        let markdown = `# Chat ${timestamp}\n\n`;
        
        for (const msg of this.messages) {
            const icon = msg.role === 'assistant' ? '🔹' : '🟠';
            const name = msg.role === 'assistant' ? 'Tessera' : 'You';
            const lines = msg.content.split('\n').map(line => `> ${line}`).join('\n');
            markdown += `${icon} **${name}**\n${lines}\n\n`;
        }

        return markdown;
    }

    private async copyConversation() {
        if (this.messages.length === 0) {
            new Notice('No messages to copy');
            return;
        }

        const markdown = await this.generateConversationMarkdown();
        
        try {
            await navigator.clipboard.writeText(markdown);
            new Notice('Conversation copied to clipboard');
        } catch (error) {
            console.error('Failed to copy conversation:', error);
            new Notice('Failed to copy conversation');
        }
    }

    private async createMessageElement(message: { role: string, content: string }, container: HTMLElement) {
        const messageEl = container.createDiv({
            cls: `message ${message.role === 'user' ? 'user-message' : 'ai-message'}`
        });

        const contentEl = messageEl.createDiv({ cls: 'message-content' });
        contentEl.createSpan({ text: message.content });

        if (message.content === 'Failed to get response from AI') {
            const retryContainer = messageEl.createDiv({ cls: 'retry-container' });
            new RetryButton(retryContainer, async () => {
                if (this.lastFailedMessage) {
                    messageEl.remove();
                    await this.sendMessage(this.lastFailedMessage);
                    this.lastFailedMessage = null;
                }
            });
        }
    }

    private async appendMessage(message: Partial<ChatMessage>) {
        const fullMessage: ChatMessage = {
            ...message,
            timestamp: Date.now()
        } as ChatMessage;
        
        this.messages.push(fullMessage);
        await this.renderMessage(fullMessage);
    }

    public showContextUpdateNotification(update: ContextUpdate) {
        const wrapper = this.messageContainer.createDiv('tessera-message-wrapper assistant');
        const notificationEl = wrapper.createDiv('tessera-context-notification');
        
        const icon = notificationEl.createSpan('tessera-context-icon');
        icon.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>`;
        
        const text = notificationEl.createSpan();
        text.setText('Updating context: ');
        
        const badge = notificationEl.createEl('button', {
            cls: 'tessera-context-badge',
            text: update.filename
        });
        
        // Add loading indicator
        const loadingEl = notificationEl.createSpan('tessera-loading');
        loadingEl.innerHTML = '⏳';
        
        badge.addEventListener('click', async () => {
            const file = this.app.vault.getAbstractFileByPath(update.path);
            if (file instanceof TFile) {
                await this.app.workspace.getLeaf(false).openFile(file);
            }
        });

        // Update the notification after a delay to show completion
        setTimeout(() => {
            loadingEl.innerHTML = '✅';
            text.setText('Context updated: ');
        }, 1000);
    }

    refresh() {
        this.onOpen();
    }
} 