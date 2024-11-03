# Tessera

> A trusted interface for AI-enhanced personal development and knowledge management in Obsidian.

## Overview
Tessera is an Obsidian plugin that creates a safe, collaborative space for personal and professional development with AI assistance. Named after the individual pieces that form a mosaic, Tessera helps you build a comprehensive understanding of yourself and your goals through thoughtful AI collaboration.

## Status: Early Development 🚧
This plugin is currently in early development. The initial MVP will focus on direct Claude API integration for contextual conversations within Obsidian.

### Current Focus
- [x] Basic plugin structure
- [ ] Claude API integration
- [ ] Conversation view implementation
- [ ] Context management (file selection)
- [ ] Settings management (API key)
- [ ] Safe file handling

### Future Plans
- [ ] Local RAG support
- [ ] Enhanced privacy controls
- [ ] Conversation templates
- [ ] Knowledge graph integration
- [ ] Collaborative features

## Features (Planned)

### MVP Features
- Direct integration with Claude API
- Safe, contextual conversations with access to your notes
- Simple file context selection
- Conversation persistence
- Visual preview for note updates

### Future Features
- Local vector database support
- Multiple LLM provider support
- Enhanced privacy controls
- Custom conversation templates
- Knowledge graph integration
- Collaborative features

## Development

### Prerequisites
- Node.js
- Git
- A code editor (e.g., VS Code)
- Obsidian (for testing)

### Local Development Setup
1. Create a test vault for development
```bash
mkdir TestVault
cd TestVault
mkdir .obsidian/plugins
cd .obsidian/plugins
```

2. Clone this repository
```bash
git clone https://github.com/your-username/tessera.git
cd tessera
```

3. Install dependencies
```bash
npm install
```

4. Start development build (with hot-reload)
```bash
npm run dev
```

5. Enable the plugin in Obsidian
- Open Settings → Community plugins
- Enable "Community Plugins"
- Enable "Tessera" in the Installed Plugins section

### Development Notes
- **Important**: Never develop plugins in your main vault. Always use a separate test vault.
- After changes to `manifest.json`, restart Obsidian to see the changes
- The `main.js` file is generated from your TypeScript source
- Hot reload will automatically rebuild when you make changes
- Use the Obsidian Developer Tools (View → Toggle Developer Tools) for debugging

### Project Structure
```
tessera/
├── manifest.json           # Plugin manifest
├── package.json           # Node dependencies
├── tsconfig.json          # TypeScript configuration
├── src/
│   ├── main.ts           # Plugin entry point
│   ├── settings.ts       # Settings management
│   ├── core/
│   │   ├── claude.ts     # Claude API client
│   │   └── context.ts    # Context management
│   ├── views/
│   │   ├── conversation.ts  # Main conversation view
│   │   └── settings.ts     # Settings view
│   └── utils/
│       └── file-helpers.ts  # File manipulation utilities
├── styles/
│   └── main.css          # Plugin styles
└── versions.json         # Version history
```

### Required Files
- `manifest.json`: Plugin metadata and version info
- `main.js`: Compiled plugin code (generated)
- `styles.css`: Plugin styles
- `versions.json`: Version compatibility info

### TypeScript Configuration
We use strict TypeScript settings for type safety:

```json
{
    "compilerOptions": {
        "baseUrl": ".",
        "inlineSourceMap": true,
        "inlineSources": true,
        "module": "ESNext",
        "target": "ES6",
        "allowJs": true,
        "noImplicitAny": true,
        "moduleResolution": "node",
        "importHelpers": true,
        "isolatedModules": true,
        "strictNullChecks": true,
        "lib": [
            "DOM",
            "ES5",
            "ES6",
            "ES7"
        ]
    },
    "include": [
        "src/**/*.ts"
    ]
}
```

### Testing
1. Run the dev build: `npm run dev`
2. Make changes to the source code
3. Changes will automatically rebuild
4. Reload the plugin in Obsidian (⌘+P → "Reload app without saving")

### Mobile Development
- Ensure mobile compatibility by testing on both platforms
- Use responsive design patterns
- Consider touch interactions
- Test plugin reload behavior on mobile

## Contributing
This project is in early development. If you're interested in contributing, please:
1. Check the current project status
2. Review open issues
3. Follow coding guidelines
4. Submit PRs with clear descriptions

## License
MIT