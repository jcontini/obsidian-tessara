import { ItemView, WorkspaceLeaf } from 'obsidian';
import TesseraPlugin from '../main';

export class ConversationView extends ItemView {
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
        container.createEl('h4', { text: 'Tessera Chat' });
    }
} 