import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import TesseraPlugin from './main';
import { ANTHROPIC_MODELS } from './models';

export class TesseraSettingTab extends PluginSettingTab {
    private tempApiKey: string;
    private showApiKey: boolean = false;

    constructor(app: App, private plugin: TesseraPlugin) {
        super(app, plugin);
        this.tempApiKey = this.plugin.settings.apiKey;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // Provider Selection
        new Setting(containerEl)
            .setName('AI Provider')
            .setDesc('Select your AI provider')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('anthropic', 'Anthropic (Claude)')
                    .setValue(this.plugin.settings.provider)
                    .onChange(async (value: 'anthropic') => {
                        this.plugin.settings.provider = value;
                        await this.plugin.saveSettings();
                        this.display(); // Refresh to update model options
                    });
            });

        // Model Selection
        new Setting(containerEl)
            .setName('Model Selection')
            .setDesc('Choose between default models or specify a custom one')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('default', 'Use Default Models')
                    .addOption('custom', 'Custom Model')
                    .setValue(this.plugin.settings.modelType)
                    .onChange(async (value: 'default' | 'custom') => {
                        this.plugin.settings.modelType = value;
                        await this.plugin.saveSettings();
                        this.display();
                    });
            });

        // Show appropriate model selection based on type
        if (this.plugin.settings.modelType === 'default') {
            new Setting(containerEl)
                .setName('Model')
                .setDesc('Select the Claude model to use')
                .addDropdown(dropdown => {
                    Object.keys(ANTHROPIC_MODELS).forEach(modelId => {
                        dropdown.addOption(modelId, modelId);
                    });
                    // Always default to a known good model if none is selected
                    const currentModel = this.plugin.settings.selectedModel || 'claude-3-sonnet-20240229';
                    dropdown.setValue(currentModel)
                    .onChange(async (value) => {
                        this.plugin.settings.selectedModel = value;
                        await this.plugin.saveSettings();
                    });
                });
        } else {
            new Setting(containerEl)
                .setName('Custom Model')
                .setDesc('Enter a custom model identifier')
                .addText(text => text
                    .setPlaceholder('e.g., claude-3-custom-20240307')
                    .setValue(this.plugin.settings.customModel || '')
                    .onChange(async (value) => {
                        this.plugin.settings.customModel = value;
                        this.plugin.settings.selectedModel = value;
                        await this.plugin.saveSettings();
                    }));
        }

        // API Key Setting
        const apiKeySetting = new Setting(containerEl)
            .setName('API Key')
            .setDesc('Your API key from the selected provider')
            .addText(text => {
                text
                    .setPlaceholder('Enter your API key')
                    .setValue(this.tempApiKey)
                    .onChange(value => {
                        this.tempApiKey = value;
                    });
                
                text.inputEl.type = 'password';
                
                return text;
            })
            .addExtraButton(button => {
                button
                    .setIcon(this.showApiKey ? 'eye-off' : 'eye')
                    .setTooltip(this.showApiKey ? 'Hide API key' : 'Show API key')
                    .onClick(() => {
                        this.showApiKey = !this.showApiKey;
                        const input = containerEl.querySelector('input[type="password"], input[type="text"]') as HTMLInputElement;
                        if (input) {
                            input.type = this.showApiKey ? 'text' : 'password';
                        }
                        button.setIcon(this.showApiKey ? 'eye-off' : 'eye');
                    });
            })
            .addButton(button => {
                button
                    .setButtonText('Save')
                    .setCta()
                    .onClick(async () => {
                        try {
                            const modelToTest = this.plugin.settings.modelType === 'custom' 
                                ? this.plugin.settings.customModel 
                                : this.plugin.settings.selectedModel;
                                
                            await this.plugin.testApiKey(this.tempApiKey, modelToTest);
                            
                            this.plugin.settings.apiKey = this.tempApiKey;
                            await this.plugin.saveSettings();
                            
                            new Notice('API key saved and verified successfully');
                            button
                                .setButtonText('Saved ✓')
                                .setDisabled(true);
                            
                            setTimeout(() => {
                                button
                                    .setButtonText('Save')
                                    .setDisabled(false);
                            }, 2000);
                        } catch (error) {
                            new Notice('Failed to verify API key. Please check the key and model selection.');
                            console.error('API key verification failed:', error);
                        }
                    });
            });

        // Debug Path Settings
        new Setting(containerEl)
            .setName('Debug Log Location')
            .setDesc('Choose where to save debug logs (relative to vault root). Leave empty to disable logging.')
            .addText(text => text
                .setPlaceholder('tessera-debug.md')
                .setValue(this.plugin.settings.projectDebugPath || '')
                .onChange(async (value) => {
                    // If empty, set to undefined to disable logging
                    if (!value.trim()) {
                        this.plugin.settings.projectDebugPath = undefined;
                    } else {
                        // Ensure path ends with .md
                        if (!value.endsWith('.md')) {
                            value = value + '.md';
                        }
                        this.plugin.settings.projectDebugPath = value;
                    }
                    await this.plugin.saveSettings();
                }))
            .addButton(button => button
                .setButtonText('Create')
                .setCta()
                .onClick(async () => {
                    try {
                        const path = this.plugin.settings.projectDebugPath;
                        if (!path) {
                            new Notice('Please enter a path first');
                            return;
                        }

                        // Create folder if it doesn't exist
                        const folderPath = path.split('/').slice(0, -1).join('/');
                        if (folderPath && !(await this.app.vault.adapter.exists(folderPath))) {
                            await this.app.vault.createFolder(folderPath);
                        }

                        // Create or update file
                        if (!(await this.app.vault.adapter.exists(path))) {
                            await this.app.vault.create(path, '');
                            new Notice('Debug log file created');
                        } else {
                            new Notice('Debug log file already exists');
                        }
                    } catch (error) {
                        new Notice(`Failed to create debug log: ${error.message}`);
                    }
                }));
    }
} 