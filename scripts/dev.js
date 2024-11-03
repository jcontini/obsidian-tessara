const fs = require('fs');
const path = require('path');

// Paths
const PLUGIN_NAME = 'tessera';
const SOURCE_DIR = process.cwd();
const VAULT_PATH = '/Users/joe/Documents/Life/Notes/pdev/.obsidian/plugins/tessera';

// Required files for Obsidian plugin
const REQUIRED_FILES = [
    'main.js',
    'manifest.json',
    'styles.css' // if you have one
];

// Ensure plugin directory exists
if (!fs.existsSync(VAULT_PATH)) {
    fs.mkdirSync(VAULT_PATH, { recursive: true });
}

// Copy files
REQUIRED_FILES.forEach(file => {
    const sourcePath = path.join(SOURCE_DIR, file);
    const destPath = path.join(VAULT_PATH, file);
    
    if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
        console.log(`Copied ${file} to plugin directory`);
    }
});

console.log('Plugin files copied successfully'); 