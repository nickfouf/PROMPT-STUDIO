/**
 * Generates an ASCII tree from a nested object structure.
 * * @param {Object} node - The current node containing a `name` and optional `children` array.
 * @param {String} prefix - The spacing/pipes to prepend to the current line (used in recursion).
 * @returns {String} The formatted tree string.
 */
function generateTree(node, prefix = '') {
    // If a node has a 'children' property (even if empty), treat it as a directory
    const isDir = Array.isArray(node.children);
    const nodeName = isDir ? `${node.name}/` : node.name;

    let result = `${nodeName}\n`;

    if (isDir && node.children.length > 0) {
        node.children.forEach((child, index) => {
            const isLast = index === node.children.length - 1;

            // The connector pointing to the current file/folder
            const connector = isLast ? '└── ' : '├── ';

            // The prefix to pass down to future children of this node
            const nextPrefix = prefix + (isLast ? '    ' : '│   ');

            result += prefix + connector + generateTree(child, nextPrefix);
        });
    }

    return result;
}


const virtualFileSystem = {
    name: 'src',
    children: [
        {
            name: 'main',
            children: [
                { name: 'index.js' }
            ]
        },
        {
            name: 'preload',
            children: [
                { name: 'index.js' }
            ]
        },
        {
            name: 'renderer',
            children: [
                { name: 'index.html' },
                {
                    name: 'src',
                    children: [
                        { name: 'App.jsx' },
                        {
                            name: 'assets',
                            children: [
                                { name: 'base.css' },
                                { name: 'electron.svg' },
                                { name: 'main.css' },
                                { name: 'wavy-lines.svg' }
                            ]
                        },
                        {
                            name: 'components',
                            children: [
                                {
                                    name: 'common',
                                    children: [
                                        { name: 'ConfirmDialog.jsx' }
                                    ]
                                },
                                { name: 'FileTreeItem.jsx' },
                                { name: 'ProjectDashboard.jsx' }
                                // ... other components
                            ]
                        }
                    ]
                }
            ]
        }
    ]
};

// Generate and print!
const output = generateTree(virtualFileSystem);
console.log(output);