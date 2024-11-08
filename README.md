# Tessera

> An AI-enhanced journaling and self-reflection companion for Obsidian.

## Overview
Tessera is an Obsidian plugin that creates an interactive journaling experience where AI helps you explore thoughts and maintain an evolving personal context. It integrates with Claude AI to provide intelligent conversation and context management within Obsidian.

## Current Features

### Chat Interface
- Modern, responsive chat UI with markdown support
- Real-time message streaming
- Copy individual messages or entire conversations
- Save conversations as markdown files
- Start new conversations with a single click
- Retry failed messages
- Visual loading states and error handling

### AI Integration
- Direct integration with Claude 3 models (Opus, Sonnet, Haiku)
- Configurable model selection
- API key management with validation
- Support for custom model IDs

### Context Management
- Maintains a central Profile.md for user context
- Automatically updates user context based on conversations
- Preserves context between chat sessions
- Safe file operations with error handling

### Debug Features
- Configurable debug logging
- Session-based debug logs
- Debug file viewer
- Detailed operation logging

## Setup

### Requirements
- Obsidian v1.0.0 or higher
- Claude API key from Anthropic

### Development Setup
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

## Installation
*Coming soon - not yet ready for general use*