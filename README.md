# Tessera

> An interface for AI-enhanced personal development and knowledge management in Obsidian.

## Overview
Tessera is an Obsidian plugin that creates a space for exploring ideas and personal growth with AI assistance. Named after the individual pieces that form a mosaic, Tessera helps you build a comprehensive understanding of yourself and your goals through contextual conversations.

## Status: Early Development 🚧
Currently building the initial MVP with direct Claude API integration.

### Current Progress
- [x] Basic plugin structure
- [x] Project setup
- [x] Settings panel with API key and model selection
- [x] Basic conversation UI with markdown support
- [ ] Context management
- [ ] Message history
- [ ] File operations

### Next Steps
1. Implement context file management
   - Create and update context files
   - Select context for conversations
   - Organize context by topics
2. Add message history persistence
3. Add file operations
   - Safe file creation/updates
   - Context file suggestions
   - File preview before changes

## Development

*This plugin is being built through AI pair programming with Claude. The codebase, documentation, and design decisions are emerging through this collaborative development process.*

### Setup
1. Clone and install
```bash
git clone https://github.com/jcontini/obsidian-tessara.git
cd obsidian-tessara
npm install
```

2. Create a test vault and link the plugin
```bash
cd /path/to/your/test/vault
mkdir -p .obsidian/plugins
ln -s /path/to/repo/obsidian-tessara .obsidian/plugins/tessera
```

3. Start development
```bash
cd /path/to/repo/obsidian-tessara
npm run dev
```

### Testing
1. Open Obsidian and point it to your test vault
2. Enable Community plugins and activate Tessera
3. Use Cmd/Ctrl + R to reload after changes
4. Use the developer console (Cmd + Option + I) for debugging

## Features
- Modern chat interface with markdown support
- Direct Claude API integration
- Context-aware conversations
- Safe file operations
- Flexible context management

## Requirements
- Obsidian v1.0.0 or higher
- Claude API key from Anthropic

## Installation
*Coming soon - not yet ready for general use*