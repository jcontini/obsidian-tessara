# Tessera

> An AI-enhanced journaling and self-reflection companion for Obsidian.

## Overview
Tessera is an Obsidian plugin that creates an interactive journaling experience where AI helps you explore thoughts and maintain an evolving personal context. It acts as both a conversation partner and an intelligent biographer, helping you:

- Engage in natural, reflective conversations
- Automatically capture and organize personal context
- Build a structured, local "autobiography" over time
- Maintain continuity across conversations without repetition

### Key Features
- **Intelligent Context Management**
  - Automatically organizes personal information into themed markdown files
  - Creates and updates files like goals.md, relationships.md, etc.
  - Splits and reorganizes content as themes develop
  - Maintains a central autobiography.md with links to specific context files

- **Natural Conversation Flow**
  - Engages in reflective dialogue
  - Asks permission before saving important context
  - Suggests relevant topics based on conversation
  - Maintains conversation continuity using saved context

- **Privacy-First Design**
  - All context stored locally in markdown files
  - Compatible with any LLM (including local models)
  - Full control over what information is saved
  - Portable context that works across different AI models

### Current Status: Early Development 🚧
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