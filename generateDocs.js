const fs = require('fs');
const path = require('path');

// Define the main category folder
const mainFolder = path.join(__dirname, 'backend');

// List of subfolders (which represent Discord channels)
const channels = ['clang', 'cpp', 'databases', 'golang', 'java', 'python', 'rust'];

// Ensure the backend folder exists
if (!fs.existsSync(mainFolder)) {
    fs.mkdirSync(mainFolder);
}

// Create markdown documentation files and subfolders with JavaScript files
channels.forEach(channel => {
    // Create .md file in /backend
    const mdFilePath = path.join(mainFolder, `${channel}.md`);
    const mdContent = `# ${channel.toUpperCase()} Documentation\n\nThis is the documentation for ${channel}.`;
    
    if (!fs.existsSync(mdFilePath)) {
        fs.writeFileSync(mdFilePath, mdContent);
        console.log(`Created: ${mdFilePath}`);
    } else {
        console.log(`Already exists: ${mdFilePath}`);
    }

    // Create subfolder for JavaScript file
    const subFolderPath = path.join(mainFolder, channel);
    if (!fs.existsSync(subFolderPath)) {
        fs.mkdirSync(subFolderPath);
        console.log(`Created folder: ${subFolderPath}`);
    }

    // Create index.js inside the subfolder
    const jsFilePath = path.join(subFolderPath, 'index.js');
    const jsContent = `// ${channel.toUpperCase()} JavaScript logic\n\nconsole.log("${channel} module loaded");`;

    if (!fs.existsSync(jsFilePath)) {
        fs.writeFileSync(jsFilePath, jsContent);
        console.log(`Created: ${jsFilePath}`);
    } else {
        console.log(`Already exists: ${jsFilePath}`);
    }
});

console.log("Folder structure and docs created successfully!");
