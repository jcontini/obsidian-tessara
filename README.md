# Tessera

> A trusted interface for AI-enhanced personal development and knowledge management in Obsidian.

## Overview
Tessera is an Obsidian plugin that creates a safe, collaborative space for personal and professional development with AI assistance. Named after the individual pieces that form a mosaic, Tessera helps you build a comprehensive understanding of yourself and your goals through thoughtful AI collaboration.

## Status: Early Development 🚧
Currently building the initial MVP with direct Claude API integration for contextual conversations within Obsidian.

### Current Progress
- [x] Basic plugin structure
- [x] Project setup
- [x] Settings panel (API key)
- [ ] Basic conversation UI
- [ ] Context selection
- [ ] Message history
- [ ] Safe file handling

### Next Steps
1. Build basic conversation UI
2. Add context selection
3. Add message history
4. Implement safe file handling

## Development

*This plugin is being built through AI pair programming with Claude. The codebase, documentation, and design decisions are emerging through this collaborative development process.*

### Setup
1. Clone and install
```bash
git clone https://github.com/jcontini/obsidian-tessara.git
cd obsidian-tessara
npm install
```

2. Create a test vault and symlink the plugin
```bash
mkdir TestVault/.obsidian/plugins/tessara
ln -s /path/to/repo/* TestVault/.obsidian/plugins/tessara/
```

3. Start development
```bash
npm run dev
```

### Testing
Enable the plugin in Obsidian's community plugins section and use the developer console (Cmd/Ctrl + Shift + I) for debugging.

## Future Plans
- Local RAG support
- Enhanced privacy controls
- Conversation templates
- Knowledge graph integration

## Installation
*Coming soon - not yet ready for general use*