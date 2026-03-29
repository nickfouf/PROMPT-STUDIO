import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {exec} from 'child_process';

export default class LLMProtocol {
  constructor() {
  }

  _generateUid() {
    return crypto.randomBytes(4).toString('hex');
  }

  getSystemInstructions(uid) {
    return `[SYSTEM INSTRUCTIONS: RESPONSE FORMATTING]
You are operating under a strict block-based parsing protocol (Structured Response Protocol). Split your response into distinct blocks. Output all text and operations in a single response.

RULES:
1. You MUST start your entire response with the protocol name and the uid on the very first line, exactly like this:
srp,${uid}
2. Every part of your response MUST be wrapped in tags containing a unique identifier: uid="${uid}".
3. The closing tag MUST perfectly match the opening tag and include the uid. Example: </markdown uid="${uid}">. You MUST NOT close tags without the uid (e.g. </file_op> is INVALID).
4. NEVER use CDATA sections.
5. Paths must ALWAYS be relative to the project root.
6. Use <markdown uid="${uid}"> ... </markdown uid="${uid}"> for explanations.
7. Use <terminal_op uid="${uid}" type="cmd|powershell" path="relative/dir"> ... </terminal_op uid="${uid}"> for terminal commands.
8. Use <file_op uid="${uid}" action="update|create|delete" path="relative/path/to/file"> ... </file_op uid="${uid}"> for file changes.

CRITICAL RULES FOR FILE UPDATES:
- For small code changes (under 30 lines), strictly use ONE <search uid="${uid}"> block and ONE <replace uid="${uid}"> block.
- For LARGE code changes (30+ lines), you MUST save tokens by using a span targeting method. Use <search_start uid="${uid}"> (containing the first 3-5 lines of the target block) and <search_end uid="${uid}"> (containing the exact last 3-5 lines of the target block).
- DO NOT use both <search> and <search_start> in the same file_op.
- OVERLAP FORBIDDEN: When using search_start and search_end, do NOT repeat the same lines. The end block must contain strictly different lines from the start block.
- Ensure the search blocks contain enough unique lines to find the exact location in the file.

EXAMPLE OF A LARGE BLOCK UPDATE:
<file_op uid="${uid}" action="update" path="src/app.js">
<search_start uid="${uid}">
function massiveFunction() {
    let a = 1;
    let b = 2;
</search_start uid="${uid}">
<search_end uid="${uid}">
    console.log("End of massive function");
    return true;
}
</search_end uid="${uid}">
<replace uid="${uid}">
function massiveFunction() {
    // Entirely new rewritten logic goes here
    return false;
}
</replace uid="${uid}">
</file_op uid="${uid}">
[END SYSTEM INSTRUCTIONS]`;
  }

  buildInitialPrompt(userPrompt) {
    let uid = this._generateUid();

    while (userPrompt.includes(uid)) {
      uid = this._generateUid();
    }

    const systemInstructions = this.getSystemInstructions(uid) + `\n\nUser Prompt:\n${userPrompt}\n`;
    return {prompt: systemInstructions, uid};
  }

  parseResponse(responseText, uid) {
    // NEW: Strip out UI-injected markdown escapes before parsing
    const cleanText = responseText
      .replace(/\\</g, '<')
      .replace(/\\>/g, '>')
      .replace(/\\`/g, '`')
      .replace(/\\_/g, '_')
      .replace(/\\!/g, '!');

    if (!cleanText.trim().startsWith(`srp,${uid}`)) {
      console.warn(`[WARNING]: Response does not start with the expected header: srp,${uid}`);
    }

    const blocks = [];
    // IMPORTANT: Make sure to run your regex against `cleanText`, not `responseText`
    const topLevelRegex = new RegExp(`<([a-zA-Z0-9_]+)\\s+uid="${uid}"([^>]*)>([\\s\\S]*?)<\\/\\1\\s+uid="${uid}">`, "g");

    let match;
    while ((match = topLevelRegex.exec(cleanText)) !== null) {
      const tagName = match[1];
      const attributesStr = match[2];
      const content = match[3];

      const block = {type: tagName, attributes: {}};

      const attrRegex = /([a-zA-Z0-9_]+)="([^"]*)"/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(attributesStr)) !== null) {
        block.attributes[attrMatch[1]] = attrMatch[2];
      }

      if (tagName === 'file_op') {
        block.operations = {};
        const nestedRegex = new RegExp(`<([a-zA-Z0-9_]+)\\s+uid="${uid}">([\\s\\S]*?)<\\/\\1\\s+uid="${uid}">`, 'g');
        let nestedMatch;

        const filePath = block.attributes.path || '';
        const isMarkdown = filePath.toLowerCase().endsWith('.md') || filePath.toLowerCase().endsWith('.mdx');

        while ((nestedMatch = nestedRegex.exec(content)) !== null) {
          let nestedType = nestedMatch[1];
          let nestedContent = nestedMatch[2].replace(/^\r?\n/, '');

          if (!isMarkdown) {
            nestedContent = nestedContent
              .split('\n')
              .filter(line => !/^\s*```[a-zA-Z]*\s*$/.test(line))
              .join('\n');
          }

          block.operations[nestedType] = nestedContent;
        }

        let rawContent = content.trim();
        if (!isMarkdown) {
          rawContent = rawContent
            .split('\n')
            .filter(line => !/^\s*```[a-zA-Z]*\s*$/.test(line))
            .join('\n');
        }
        block.content = rawContent;
      } else {
        block.content = content.trim();
      }

      blocks.push(block);
    }

    return blocks;
  }

  _cleanOverlap(startText, endText) {
    let sLines = startText.split(/\r?\n/);
    let eLines = endText.split(/\r?\n/);

    // Normalize by removing all whitespaces for a robust overlap comparison
    const normalize = (str) => str.replace(/\s+/g, '');

    let sValid = sLines.map((l, i) => ({ text: l.trim(), norm: normalize(l), idx: i })).filter((x) => x.text);
    let eValid = eLines.map((l, i) => ({ text: l.trim(), norm: normalize(l), idx: i })).filter((x) => x.text);

    let maxOverlap = Math.min(sValid.length, eValid.length);
    let overlapIdxInEnd = -1;

    for (let i = maxOverlap; i > 0; i--) {
      let tail = sValid.slice(-i).map((x) => x.norm).join('\n');
      let head = eValid.slice(0, i).map((x) => x.norm).join('\n');
      if (tail === head) {
        overlapIdxInEnd = eValid[i - 1].idx;
        break;
      }
    }

    if (overlapIdxInEnd !== -1) {
      return eLines.slice(overlapIdxInEnd + 1).join('\n');
    }
    return endText;
  }

  applyFileOp(basePath, block) {
    const targetPath = path.join(basePath, block.attributes.path);

    if (block.attributes.action === 'create') {
      fs.mkdirSync(path.dirname(targetPath), {recursive: true});
      fs.writeFileSync(targetPath, block.operations.replace || block.content || '', 'utf-8');
      return true;
    }

    if (block.attributes.action === 'delete') {
      if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
      return true;
    }

    if (block.attributes.action === 'update') {
      if (!fs.existsSync(targetPath)) throw new Error(`File not found: ${targetPath}`);

      let fileContent = fs.readFileSync(targetPath, 'utf-8');
      let replaceText = block.operations.replace || '';

      const buildFuzzyRegexStr = (text) => {
        return text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0)
          .map((l) => {
            // Remove all spaces, escape regex chars, and inject \s* between every token
            const noSpace = l.replace(/\s+/g, '');
            const escaped = noSpace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return escaped.match(/\\?./g).join('\\s*');
          })
          .join('\\s+');
      };
      if (block.operations.search) {
        let searchText = block.operations.search;
        const safeReplaceText = replaceText.replace(/\$/g, '$$$$');

        if (fileContent.includes(searchText)) {
          fs.writeFileSync(targetPath, fileContent.replace(searchText, safeReplaceText), 'utf-8');
          return true;
        }

        let fuzzyStr = buildFuzzyRegexStr(searchText);
        if (fuzzyStr) {
          let regex = new RegExp(fuzzyStr);
          if (regex.test(fileContent)) {
            let fuzzyReplaceText = replaceText.replace(/\\xA0/g, ' ').replace(/\$/g, '$$$$');
            fs.writeFileSync(targetPath, fileContent.replace(regex, fuzzyReplaceText), 'utf-8');
            return true;
          }
        }
        throw new Error(`Fuzzy search failed to find the block in ${targetPath}`);
      }

      if (block.operations.search_start && block.operations.search_end) {
        let startText = block.operations.search_start;
        let endText = block.operations.search_end;

        endText = this._cleanOverlap(startText, endText);

        let startIdx = fileContent.indexOf(startText);
        if (startIdx !== -1) {
          let endIdx = fileContent.indexOf(endText, startIdx + startText.length);
          if (endIdx !== -1) {
            let before = fileContent.substring(0, startIdx);
            let after = fileContent.substring(endIdx + endText.length);
            fs.writeFileSync(targetPath, before + replaceText + after, 'utf-8');
            return true;
          }
        }

        let startFuzzy = buildFuzzyRegexStr(startText);
        let endFuzzy = buildFuzzyRegexStr(endText);

        if (startFuzzy && endFuzzy) {
          let spanRegex = new RegExp(`(${startFuzzy})[\\s\\S]*?(${endFuzzy})`);
          if (spanRegex.test(fileContent)) {
            let fuzzyReplaceText = replaceText.replace(/\\xA0/g, ' ').replace(/\$/g, '$$$$');
            fs.writeFileSync(targetPath, fileContent.replace(spanRegex, fuzzyReplaceText), 'utf-8');
            return true;
          }
        }
        throw new Error(`Fuzzy span search (start/end) failed in ${targetPath}`);
      }

      throw new Error(`Missing <search> or <search_start> block in update operation.`);
    }
  }

  runTerminalOp(basePath, block) {
    return new Promise((resolve, reject) => {
      const relPath = block.attributes.path || '';
      const cwd = path.join(basePath, relPath);
      const shell = block.attributes.type === 'powershell' ? 'powershell.exe' : 'cmd.exe';
      const command = block.content;

      exec(command, {cwd, shell}, (error, stdout, stderr) => {
        if (error) {
          reject(`Error: ${error.message}\nStderr: ${stderr}`);
        } else {
          resolve(stdout);
        }
      });
    });
  }
}

