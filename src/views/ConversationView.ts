import { ItemView, WorkspaceLeaf, MarkdownRenderer, Notice, TFile, TAbstractFile } from 'obsidian';
import TesseraPlugin from '../main';
import { RetryButton } from '../components/RetryButton';

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

export class ConversationView extends ItemView {
    private messages: ChatMessage[] = [];
    private messageContainer: HTMLElement;
    private inputContainer: HTMLElement;
    private chatName: string | null = null;
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

        // Show welcome message using the API
        await this.sendInitialMessage();
    }

    private async sendInitialMessage() {
        const loadingEl = this.showLoadingIndicator();

        try {
            const response = await this.plugin.sendMessage(
                "START_CONVERSATION", // Special trigger for initial message
                this.plugin.settings.selectedModel
            );

            loadingEl.parentElement?.remove();

            const responseText = response.content[0].type === 'text' 
                ? response.content[0].text 
                : 'Failed to start conversation';

            const welcomeMessage: ChatMessage = {
                role: 'assistant',
                content: responseText,
                timestamp: Date.now()
            };
            
            this.messages.push(welcomeMessage);
            await this.renderMessage(welcomeMessage);

        } catch (error) {
            console.error('Failed to start conversation:', error);
            loadingEl.parentElement?.remove();
            
            const errorWrapper = this.messageContainer.createDiv('tessera-message-wrapper assistant');
            errorWrapper.createDiv('tessera-message error')
                .setText('Failed to start conversation');
        }
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

        // Generate chat name after first user message
        if (!this.chatName && this.messages.filter(m => m.role === 'user').length === 1) {
            try {
                const response = await this.plugin.generateChatName(content);
                this.chatName = response.replace(/[<>:"/\\|?*]/g, '-').trim();
            } catch (error) {
                console.error('Failed to generate chat name:', error);
                this.chatName = 'Untitled Chat';
            }
        }

        const loadingEl = this.showLoadingIndicator();

        try {
            const response = await this.plugin.sendMessage(content);
            loadingEl.parentElement?.remove();

            const responseText = response.content[0].type === 'text' 
                ? response.content[0].text 
                : 'Received non-text response';

            const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: responseText,
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

        // Create base Saved Chats folder if it doesn't exist
        const basePath = 'Saved Chats';
        if (!(await this.app.vault.adapter.exists(basePath))) {
            await this.app.vault.createFolder(basePath);
        }

        // Create date-based folder (format: YYYY-MM-DD)
        const today = new Date().toISOString().slice(0, 10);
        const datePath = `${basePath}/${today}`;
        if (!(await this.app.vault.adapter.exists(datePath))) {
            await this.app.vault.createFolder(datePath);
        }

        const filename = `${datePath}/${this.chatName || 'Untitled Chat'}.md`;

        // Add numeric suffix if file already exists
        let finalFilename = filename;
        let counter = 1;
        while (await this.app.vault.adapter.exists(finalFilename)) {
            finalFilename = `${datePath}/${this.chatName || 'Untitled Chat'} (${counter}).md`;
            counter++;
        }

        const markdown = await this.generateConversationMarkdown();

        // Save the file
        try {
            await this.app.vault.create(finalFilename, markdown);
            new Notice('Conversation saved');
            
            // Open the file in a new leaf
            const abstractFile = this.app.vault.getAbstractFileByPath(finalFilename);
            if (abstractFile instanceof TFile) {
                await this.app.workspace.getLeaf(false).openFile(abstractFile);
            }
        } catch (error) {
            console.error('Failed to save conversation:', error);
            new Notice('Failed to save conversation');
        }
    }

    private async startNewChat() {
        // Clear existing messages
        this.messages = [];
        this.messageContainer.empty();
        
        // Clear chat name
        this.chatName = null;
        
        // Clear conversation history in plugin
        this.plugin.clearConversationHistory();
        
        // Show welcome message
        await this.sendInitialMessage();
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
                justify-content: flex-end;
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
        `;
        document.head.append(style);
    }

    // Add new method to generate markdown content
    private async generateConversationMarkdown(): Promise<string> {
        // Generate chat name if needed
        if (!this.chatName && this.messages.length > 0) {
            const firstUserMessage = this.messages.find(m => m.role === 'user')?.content;
            if (firstUserMessage) {
                try {
                    const response = await this.plugin.generateChatName(firstUserMessage);
                    this.chatName = response.replace(/[<>:"/\\|?*]/g, '-').trim();
                } catch (error) {
                    console.error('Failed to generate chat name:', error);
                    this.chatName = 'Untitled Chat';
                }
            }
        }

        let markdown = `# ${this.chatName || 'Chat History'}\n\n`;
        markdown += `*${new Date().toLocaleString()}*\n\n`;
        
        for (const msg of this.messages) {
            const icon = msg.role === 'assistant' ? '🔹' : '🟠';
            const name = msg.role === 'assistant' ? 'Tessera' : 'You';
            const lines = msg.content.split('\n').map(line => `> ${line}`).join('\n');
            markdown += `${icon} **${name}**\n${lines}\n\n`;
        }

        return markdown;
    }

    // Add new method to copy conversation
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
} 