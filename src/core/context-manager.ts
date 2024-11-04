import { TFile, Notice } from 'obsidian';
import TesseraPlugin from '../main';
import { join } from 'path';
import { existsSync, mkdirSync, appendFileSync } from 'fs';

export class ContextManager {
    public basePath = 'Context';
    private activeContextFiles: Set<string> = new Set();
    private debugLog: string[] = [];

    constructor(private plugin: TesseraPlugin) {}

    async initialize() {
        try {
            // Ensure base directory exists
            if (!(await this.plugin.app.vault.adapter.exists(this.basePath))) {
                await this.plugin.app.vault.createFolder(this.basePath);
            }

            // Create Profile.md with initial structure if it doesn't exist
            const profilePath = `${this.basePath}/Profile.md`;
            if (!(await this.plugin.app.vault.adapter.exists(profilePath))) {
                const initialContent = `# User Profile\n\nThis file contains information about the user.\n\n## Updates\n`;
                await this.plugin.app.vault.create(profilePath, initialContent);
                this.activeContextFiles.add(profilePath);
                await this.logToFile('Created new Profile.md with initial structure');
            }
        } catch (error) {
            await this.logToFile(`Failed to initialize context: ${error.message}`, 'ERROR');
            throw error;
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
            // Log to vault
            const vaultLogPath = 'debug.md';
            let existingContent = '';
            
            const existingFile = this.plugin.app.vault.getAbstractFileByPath(vaultLogPath);
            
            if (existingFile instanceof TFile) {
                existingContent = await this.plugin.app.vault.read(existingFile);
                const updatedContent = existingContent + logEntry;
                const lines = updatedContent.split('\n');
                const trimmedContent = lines.slice(-1000).join('\n');
                const formattedContent = trimmedContent.startsWith('# Debug Log') 
                    ? trimmedContent 
                    : `# Debug Log\n\n\`\`\`log\n${trimmedContent}\n\`\`\``;
                
                await this.plugin.app.vault.modify(existingFile, formattedContent);
            } else {
                const initialContent = `# Debug Log\n\n\`\`\`log\n${logEntry}\n\`\`\``;
                await this.plugin.app.vault.create(vaultLogPath, initialContent);
            }

            // Log to project directory if path is configured
            if (this.plugin.settings.projectDebugPath) {
                try {
                    const projectPath = this.plugin.settings.projectDebugPath;
                    const dirPath = projectPath.split('/').slice(0, -1).join('/');
                    
                    // Create directory if it doesn't exist
                    if (!existsSync(dirPath)) {
                        mkdirSync(dirPath, { recursive: true });
                    }
                    
                    // Append to file
                    appendFileSync(projectPath, logEntry);
                } catch (error) {
                    console.error('Failed to write to project debug file:', error);
                }
            }
        } catch (error) {
            console.error('Failed to write to debug log:', error);
        }
    }

    async appendToUserContext(content: string) {
        const profilePath = `${this.basePath}/Profile.md`;
        
        try {
            await this.logToFile(`Attempting to update profile at: ${profilePath}`);
            
            // Ensure Context directory exists
            if (!(await this.plugin.app.vault.adapter.exists(this.basePath))) {
                await this.logToFile('Creating Context directory...');
                await this.plugin.app.vault.createFolder(this.basePath);
            }
            
            // Get or create Profile.md
            let file = this.plugin.app.vault.getAbstractFileByPath(profilePath);
            if (!file) {
                await this.logToFile('Profile.md not found, creating new file...');
                const initialContent = `# User Profile\n\nThis file contains information about the user.\n\n## Updates\n`;
                file = await this.plugin.app.vault.create(profilePath, initialContent);
            }
            
            if (file instanceof TFile) {
                const currentContent = await this.plugin.app.vault.read(file);
                const timestamp = new Date().toLocaleString();
                const updatedContent = currentContent.trim() + `\n\n### Update ${timestamp}\n${content}`;
                
                await this.plugin.app.vault.modify(file, updatedContent);
                await this.logToFile('Content updated successfully');
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