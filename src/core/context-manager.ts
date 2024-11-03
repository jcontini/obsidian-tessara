import { TFile, Notice } from 'obsidian';
import TesseraPlugin from '../main';

export class ContextManager {
    private basePath = 'context';
    private activeContextFiles: Set<string> = new Set();

    constructor(private plugin: TesseraPlugin) {}

    async initialize() {
        // Ensure base directory exists
        if (!(await this.plugin.app.vault.adapter.exists(this.basePath))) {
            await this.plugin.app.vault.createFolder(this.basePath);
        }

        // Create empty user.md if it doesn't exist
        const userPath = `${this.basePath}/user.md`;
        if (!(await this.plugin.app.vault.adapter.exists(userPath))) {
            await this.createContextFile('user.md', '');
            this.activeContextFiles.add(userPath);
        }
    }

    async createContextFile(name: string, content: string) {
        const path = `${this.basePath}/${name}`;
        await this.plugin.app.vault.create(path, content);
        return path;
    }

    async updateContextFile(path: string, content: string) {
        const file = this.plugin.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            await this.plugin.app.vault.modify(file, content);
        }
    }

    async getContextContent(): Promise<string> {
        let context = '';
        for (const path of this.activeContextFiles) {
            const file = this.plugin.app.vault.getAbstractFileByPath(path);
            if (file instanceof TFile) {
                const content = await this.plugin.app.vault.read(file);
                context += `# ${file.basename}\n${content}\n\n`;
            }
        }
        return context;
    }

    addToContext(path: string) {
        this.activeContextFiles.add(path);
    }

    removeFromContext(path: string) {
        this.activeContextFiles.delete(path);
    }

    clearContext() {
        this.activeContextFiles.clear();
    }

    async appendToUserContext(content: string) {
        const userPath = `${this.basePath}/user.md`;
        const file = this.plugin.app.vault.getAbstractFileByPath(userPath);
        
        if (file instanceof TFile) {
            const currentContent = await this.plugin.app.vault.read(file);
            const updatedContent = currentContent ? `${currentContent}\n\n${content}` : content;
            await this.plugin.app.vault.modify(file, updatedContent);
        }
    }

    async createNewContextFile(name: string, content: string) {
        if (!name.endsWith('.md')) {
            name = `${name}.md`;
        }
        const path = await this.createContextFile(name, content);
        this.activeContextFiles.add(path);
        return path;
    }
} 