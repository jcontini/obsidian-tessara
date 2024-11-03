import { Plugin, WorkspaceLeaf, Notice } from 'obsidian';
import { Anthropic } from '@anthropic-ai/sdk';
import { ConversationView } from './views/ConversationView';

interface TesseraSettings {
    apiKey: string;
}

export default class TesseraPlugin extends Plugin {
    private anthropic: Anthropic;
    settings: TesseraSettings;

    async onload() {
        this.settings = await this.loadData() || { apiKey: '' };
        
        if (this.settings.apiKey) {
            this.anthropic = new Anthropic({
                apiKey: this.settings.apiKey
            });
        }

        this.registerView(
            'tessera-chat',
            (leaf) => new ConversationView(leaf, this)
        );

        this.addRibbonIcon('message-square', 'Tessera Chat', () => {
            this.activateView();
        });
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
} 