import { ButtonComponent } from 'obsidian';

export class RetryButton extends ButtonComponent {
    constructor(containerEl: HTMLElement, onClick: () => void) {
        super(containerEl);
        
        this.setButtonText("Retry")
            .setClass("retry-button")
            .setClass("button-primary")
            .onClick(onClick);
    }
} 