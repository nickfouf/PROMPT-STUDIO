const fs = require('fs');
const path = require('path');

function parseAIResponse(pastedText, uid) {
    // Updated Regex:
    // [ \t]* matches optional trailing spaces
    // \r?\n safely handles both Windows and Linux newlines
    const regex = new RegExp(`:::${uid}:::[ \\t]*\\r?\\n([a-z]+)[ \\t]*\\r?\\n([\\s\\S]*?):::\\/${uid}:::`, 'g');

    const blocks = [];
    let match;

    while ((match = regex.exec(pastedText)) !== null) {
        blocks.push({
            format: match[1].trim(),   // e.g., 'markdown' or 'json'
            content: match[2].trim()   // The actual payload
        });
    }

    return blocks;
}

const raw_response = fs.readFileSync(path.join(__dirname, 'response.txt'), 'utf-8');
const response = parseAIResponse(raw_response, '354423a8');
console.log(response);