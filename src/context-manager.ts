import { TFile, Notice, normalizePath } from 'obsidian';
import TesseraPlugin from './main';

export class ContextManager {
    private activeContextFiles: Set<string> = new Set();
    private readonly DEBUG_LOG_PATH = 'debug.md';

    constructor(private plugin: TesseraPlugin) {}

    async initialize() {
        try {
            if (this.plugin.settings.debugMode) {
                // Handle debug.md file
                const debugFile = this.plugin.app.vault.getAbstractFileByPath(this.DEBUG_LOG_PATH);
                if (debugFile instanceof TFile) {
                    await this.plugin.app.vault.modify(debugFile, '# Debug Log\n\n');
                } else {
                    await this.plugin.app.vault.create(this.DEBUG_LOG_PATH, '# Debug Log\n\n');
                }
                await this.logToFile('Context manager initialized', 'INFO');
            }
            
            const profilePath = 'Profile.md';
            if (!(await this.plugin.app.vault.adapter.exists(profilePath))) {
                await this.plugin.app.vault.create(profilePath, '');
                this.activeContextFiles.add(profilePath);
            } else {
                this.activeContextFiles.add(profilePath);
            }
        } catch (error) {
            console.error('Failed to initialize context manager:', error);
            throw error;
        }
    }

    async appendToUserContext(content: string) {
        const profilePath = 'Profile.md';
        
        try {
            await this.logToFile(`Attempting to update profile at: ${profilePath}`, 'INFO');
            
            let file = this.plugin.app.vault.getAbstractFileByPath(profilePath);
            
            if (!file || !(file instanceof TFile)) {
                try {
                    await this.logToFile('Profile.md not found or inaccessible, creating new file...', 'INFO');
                    file = await this.plugin.app.vault.create(profilePath, '');
                    await this.logToFile(`Created new file with content:`, 'INFO', content);
                } catch (createError) {
                    if (createError.message.includes('exists')) {
                        await this.logToFile('File exists but inaccessible, attempting to recreate...', 'INFO');
                        await this.plugin.app.vault.adapter.remove(profilePath);
                        file = await this.plugin.app.vault.create(profilePath, '');
                    } else {
                        throw createError;
                    }
                }
            }
            
            if (file instanceof TFile) {
                await this.plugin.app.vault.modify(file, content);
                await this.logToFile('Content updated successfully', 'INFO');
                await this.logToFile('Updated Profile.md content:', 'INFO', content);
                
                new Notice('✅ Profile updated successfully');
                this.activeContextFiles.add(profilePath);
            } else {
                throw new Error('Failed to access Profile.md as a file');
            }
        } catch (error) {
            await this.logToFile(`Error in appendToUserContext: ${error.message}`, 'ERROR');
            new Notice(`❌ Failed to update profile: ${error.message}`);
            throw error;
        }
    }

    async createNewContextFile(name: string, content: string) {
        if (!name.endsWith('.md')) {
            name = `${name}.md`;
        }
        const path = await this.plugin.app.vault.create(name, content);
        this.activeContextFiles.add(path.path);
        await this.logToFile(`Created new context file: ${name}`, 'INFO');
        await this.logToFile('New file content:', 'INFO', content);
        return path.path;
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

    public async logToFile(message: string, level: 'INFO' | 'ERROR' | 'DEBUG', content?: string) {
        // Only log if debug mode is enabled
        if (!this.plugin.settings.debugMode) return;

        try {
            const timestamp = new Date().toLocaleString();
            let logMessage = `[${timestamp}] [${level}] ${message}\n`;
            
            if (content) {
                logMessage += `\`\`\`\n${content}\n\`\`\`\n`;
            }
            logMessage += '\n';
            
            const file = this.plugin.app.vault.getAbstractFileByPath(this.DEBUG_LOG_PATH);
            if (file instanceof TFile) {
                const currentContent = await this.plugin.app.vault.read(file);
                await this.plugin.app.vault.modify(file, currentContent + logMessage);
            }
        } catch (error) {
            console.error('Failed to write to debug log:', error);
        }
    }

    async openDebugLog() {
        if (!this.plugin.settings.debugMode) {
            new Notice('Debug mode is not enabled');
            return;
        }

        const file = this.plugin.app.vault.getAbstractFileByPath(this.DEBUG_LOG_PATH);
        if (file instanceof TFile) {
            await this.plugin.app.workspace.getLeaf(false).openFile(file);
        } else {
            new Notice('Debug log file does not exist yet');
        }
    }

    async checkProfileFile() {
        const profilePath = 'Profile.md';
        try {
            const exists = await this.plugin.app.vault.adapter.exists(profilePath);
            console.log('Profile.md exists:', exists);
            
            if (exists) {
                const file = this.plugin.app.vault.getAbstractFileByPath(profilePath);
                if (file instanceof TFile) {
                    const content = await this.plugin.app.vault.read(file);
                    console.log('Profile.md is readable, current size:', file.stat.size);
                    return true;
                }
            }
            return false;
        } catch (error) {
            console.error('Error checking Profile.md:', error);
            return false;
        }
    }

    async getDebugLog(): Promise<string[]> {
        try {
            const logPath = 'debug.md';
            if (await this.plugin.app.vault.adapter.exists(logPath)) {
                const content = await this.plugin.app.vault.adapter.read(logPath);
                // Strip markdown formatting when returning log lines
                const logContent = content.replace(/^# Debug Log\n\n```log\n|\n```$/g, '');
                return logContent.split('\n').filter(line => line.trim() !== '');
            }
            return ['No debug log found'];
        } catch (error) {
            console.error('Error reading debug log:', error);
            return ['Error reading debug log: ' + error.message];
        }
    }

    getActiveContextFiles(): Set<string> {
        return this.activeContextFiles;
    }
} 