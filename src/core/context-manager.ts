import { TFile, Notice } from 'obsidian';
import TesseraPlugin from '../main';

export class ContextManager {
    public basePath = 'Context';
    private activeContextFiles: Set<string> = new Set();
    private debugLog: string[] = [];

    constructor(private plugin: TesseraPlugin) {}

    async initialize() {
        // Ensure base directory exists
        if (!(await this.plugin.app.vault.adapter.exists(this.basePath))) {
            await this.plugin.app.vault.createFolder(this.basePath);
        }

        // Create empty Profile.md if it doesn't exist
        const profilePath = `${this.basePath}/Profile.md`;
        if (!(await this.plugin.app.vault.adapter.exists(profilePath))) {
            await this.createContextFile('Profile.md', '');
            this.activeContextFiles.add(profilePath);
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

    public async logToFile(message: string, level: 'INFO' | 'ERROR' | 'DEBUG' = 'INFO') {
        const timestamp = new Date().toLocaleString();
        const logEntry = `[${timestamp}] [${level}] ${message}\n`;
        
        try {
            // Change to .md extension and add markdown formatting
            const logPath = 'debug.md';
            let existingContent = '';
            
            // Check if file exists in vault root
            const existingFile = this.plugin.app.vault.getAbstractFileByPath(logPath);
            
            if (existingFile instanceof TFile) {
                existingContent = await this.plugin.app.vault.read(existingFile);
                
                // Append new log entry
                const updatedContent = existingContent + logEntry;
                
                // Keep only last 1000 lines
                const lines = updatedContent.split('\n');
                const trimmedContent = lines.slice(-1000).join('\n');
                
                // Add markdown formatting if it's a new file
                const formattedContent = trimmedContent.startsWith('# Debug Log') 
                    ? trimmedContent 
                    : `# Debug Log\n\n\`\`\`log\n${trimmedContent}\n\`\`\``;
                
                // Modify existing file
                await this.plugin.app.vault.modify(existingFile, formattedContent);
            } else {
                // Create new file with markdown formatting
                const initialContent = `# Debug Log\n\n\`\`\`log\n${logEntry}\n\`\`\``;
                await this.plugin.app.vault.create(logPath, initialContent);
            }
            
        } catch (error) {
            console.error('Failed to write to debug log:', error);
        }
    }

    async appendToUserContext(content: string) {
        const profilePath = `${this.basePath}/Profile.md`;
        
        try {
            await this.logToFile(`Attempting to update profile at: ${profilePath}`);
            
            if (!(await this.plugin.app.vault.adapter.exists(this.basePath))) {
                await this.logToFile('Creating Context directory...');
                await this.plugin.app.vault.createFolder(this.basePath);
            }
            
            if (!(await this.plugin.app.vault.adapter.exists(profilePath))) {
                await this.logToFile('Creating Profile.md...');
                await this.plugin.app.vault.create(profilePath, '');
            }
            
            const file = this.plugin.app.vault.getAbstractFileByPath(profilePath);
            await this.logToFile(`Found profile file: ${file ? 'yes' : 'no'}`);
            
            if (file instanceof TFile) {
                const currentContent = await this.plugin.app.vault.read(file);
                await this.logToFile(`Current content length: ${currentContent?.length || 0}`);
                
                const timestamp = new Date().toLocaleString();
                const updatedContent = currentContent 
                    ? `${currentContent}\n\n## Update ${timestamp}\n${content}` 
                    : `## Update ${timestamp}\n${content}`;
                
                await this.plugin.app.vault.modify(file, updatedContent);
                await this.logToFile('Content updated successfully');
                new Notice('✅ Profile updated successfully');
                
                const newContent = await this.plugin.app.vault.read(file);
                await this.logToFile(`New content length: ${newContent.length}`);
                
                this.activeContextFiles.add(profilePath);
            } else {
                const error = 'Failed to access Profile.md';
                await this.logToFile(error, 'ERROR');
                throw new Error(error);
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
        const path = await this.createContextFile(name, content);
        this.activeContextFiles.add(path);
        return path;
    }

    // Update the openDebugLog method to use .md extension
    async openDebugLog() {
        const logPath = 'debug.md';
        if (await this.plugin.app.vault.adapter.exists(logPath)) {
            const file = this.plugin.app.vault.getAbstractFileByPath(logPath);
            if (file instanceof TFile) {
                await this.plugin.app.workspace.getLeaf(false).openFile(file);
            }
        } else {
            new Notice('Debug log file does not exist yet');
        }
    }

    // Add method to check if Profile.md exists and is writable
    async checkProfileFile() {
        const profilePath = `${this.basePath}/Profile.md`;
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

    // Update the getDebugLog method to use .md extension
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
} 