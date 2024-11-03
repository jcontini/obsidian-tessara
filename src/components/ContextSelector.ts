import { Component, TFile, TFolder, Events } from 'obsidian';
import TesseraPlugin from '../main';

export class ContextSelector extends Component {
    private containerEl: HTMLElement;
    private selectedFiles: Set<string> = new Set();
    private events = new Events();

    constructor(
        containerEl: HTMLElement,
        private plugin: TesseraPlugin
    ) {
        super();
        this.containerEl = containerEl;
    }

    onload() {
        this.buildContextSelector();
    }

    trigger(name: string, ...data: any[]) {
        this.events.trigger(name, ...data);
    }

    on(name: string, callback: (...data: any[]) => any) {
        this.events.on(name, callback);
    }

    private async buildContextSelector() {
        const contextContainer = this.containerEl.createDiv('tessera-context-selector');
        
        // Create folder structure
        const folderList = contextContainer.createDiv('tessera-folder-list');
        
        // Add context folders
        const baseFolder = this.plugin.app.vault.getAbstractFileByPath('tessera');
        if (baseFolder instanceof TFolder) {
            await this.renderFolder(folderList, baseFolder);
        }

        // Add selected files display
        const selectedContainer = contextContainer.createDiv('tessera-selected-context');
        this.renderSelectedFiles(selectedContainer);
    }

    private async renderFolder(container: HTMLElement, folder: TFolder, level = 0) {
        const folderEl = container.createDiv('tessera-folder');
        folderEl.style.marginLeft = `${level * 20}px`;

        // Folder header
        const header = folderEl.createDiv('tessera-folder-header');
        header.createSpan({ text: folder.name });

        // Files in folder
        for (const child of folder.children) {
            if (child instanceof TFile && child.extension === 'md') {
                const fileEl = folderEl.createDiv('tessera-file');
                fileEl.style.marginLeft = `${(level + 1) * 20}px`;
                
                const checkbox = fileEl.createEl('input', {
                    type: 'checkbox',
                    attr: {
                        checked: this.selectedFiles.has(child.path)
                    }
                });

                fileEl.createSpan({ text: child.basename });

                checkbox.addEventListener('change', (e) => {
                    const target = e.target as HTMLInputElement;
                    if (target.checked) {
                        this.selectedFiles.add(child.path);
                    } else {
                        this.selectedFiles.delete(child.path);
                    }
                    this.plugin.contextManager.addToContext(child.path);
                    this.trigger('context-changed');
                });
            } else if (child instanceof TFolder) {
                await this.renderFolder(container, child, level + 1);
            }
        }
    }

    private renderSelectedFiles(container: HTMLElement) {
        container.empty();
        container.createEl('h4', { text: 'Selected Context' });
        
        for (const path of this.selectedFiles) {
            const fileEl = container.createDiv('tessera-selected-file');
            fileEl.createSpan({ text: path.split('/').pop() || '' });
            
            const removeBtn = fileEl.createEl('button', {
                text: 'Remove',
                cls: 'tessera-remove-context'
            });

            removeBtn.addEventListener('click', () => {
                this.selectedFiles.delete(path);
                this.plugin.contextManager.removeFromContext(path);
                this.renderSelectedFiles(container);
                this.trigger('context-changed');
            });
        }
    }
} 