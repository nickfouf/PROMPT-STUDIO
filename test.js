const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ==========================================
// 1. HELPER: FUZZY SEARCH ENGINE
// ==========================================
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findBlockMatch(fileContent, searchBlock) {
    // Normalize newlines and trim as the baseline
    const cleanSearch = searchBlock.replace(/\r\n/g, '\n').trim();
    const escaped = escapeRegExp(cleanSearch);

    // Define the cascading search strategies
    const strategies = [
        {
            name: 'Perfect Match',
            regex: new RegExp(escaped, 'g')
        },
        {
            name: 'Ignore Line Breaks',
            regex: new RegExp(escaped.replace(/\\n/g, '\\s+'), 'g')
        },
        {
            name: 'Ignore NBSP vs Space',
            regex: new RegExp(escaped.replace(/\\n/g, '\\s+').replace(/ /g, '[ \\u00A0]+'), 'g')
        },
        {
            name: 'Ignore All Space Mistakes',
            regex: new RegExp(cleanSearch.replace(/\s+/g, '').split('').map(escapeRegExp).join('\\s*'), 'g')
        }
    ];

    // Evaluate strategies in order
    for (const strategy of strategies) {
        const matches = [...fileContent.matchAll(strategy.regex)];

        if (matches.length === 1) {
            const match = matches[0];
            return {
                success: true,
                startIndex: match.index,
                endIndex: match.index + match[0].length,
                matchedText: match[0],
                strategy: strategy.name
            };
        } else if (matches.length > 1) {
            throw new Error(`Update failed: Multiple matches (${matches.length}) found using strategy "${strategy.name}". The search block must be specific enough to yield exactly 1 match.`);
        }
    }

    return { success: false, error: 'Search block not found using any strategy (Exact, Line Breaks, NBSP, or Ignore Spaces).' };
}

// ==========================================
// 2. PARSERS (Files & Commands)
// ==========================================
function parseFileOperations(llmText) {
    const operations = [];
    const fileOpRegex = /<file_op([^>]*)>([\s\S]*?)<\/file_op>/g;

    let match;
    while ((match = fileOpRegex.exec(llmText)) !== null) {
        const attributeString = match[1] || '';
        const innerContent = match[2] || '';

        const getFieldFromContent = (content, fieldName) => {
            const tagRegex = new RegExp(`<${fieldName}>([\\s\\S]*?)<\\/${fieldName}>`);
            const tagMatch = content.match(tagRegex);

            if (tagMatch) {
                let extractedText = tagMatch[1];
                const cdataRegex = /<!\[CDATA\[([\s\S]*?)]]>/;
                const cdataMatch = extractedText.match(cdataRegex);

                if (cdataMatch) {
                    let inner = cdataMatch[1];
                    return inner.replace(/^\r?\n/, '').replace(/\r?\n$/, '');
                }
                return extractedText.trim();
            }
            return null;
        };

        const actionTagsRegex = /<(update|create|overwrite|delete|move)>([\s\S]*?)<\/\1>/g;
        let hasActionTags = false;
        let actionMatch;

        while ((actionMatch = actionTagsRegex.exec(innerContent)) !== null) {
            hasActionTags = true;
            const action = actionMatch[1];
            const actionContent = actionMatch[2];

            const op = { action };

            op.path = getFieldFromContent(actionContent, 'path');
            if (!op.path) {
                const pathAttrRegex = /path="([^"]+)"/;
                const pathMatch = attributeString.match(pathAttrRegex);
                if (pathMatch) op.path = pathMatch[1];
            }

            if (action === 'create' || action === 'overwrite') {
                op.content = getFieldFromContent(actionContent, 'content') || '';
            } else if (action === 'delete') {
                // Delete only needs a path
            } else if (action === 'move') {
                op.source = getFieldFromContent(actionContent, 'source');
                op.destination = getFieldFromContent(actionContent, 'destination');
            } else if (action === 'update') {
                op.search = getFieldFromContent(actionContent, 'search');
                op.searchStart = getFieldFromContent(actionContent, 'search_start');
                op.searchEnd = getFieldFromContent(actionContent, 'search_end');
                op.replace = getFieldFromContent(actionContent, 'replace') || getFieldFromContent(actionContent, 'content') || '';
            }
            operations.push(op);
        }

        if (!hasActionTags) {
            let action = getFieldFromContent(innerContent, 'action');
            if (!action) {
                const attrRegex = /action="([^"]+)"/;
                const attrMatch = attributeString.match(attrRegex);
                if (attrMatch) action = attrMatch[1];
            }

            if (action) {
                const op = { action };

                op.path = getFieldFromContent(innerContent, 'path');
                if (!op.path) {
                    const pathAttrRegex = /path="([^"]+)"/;
                    const pathMatch = attributeString.match(pathAttrRegex);
                    if (pathMatch) op.path = pathMatch[1];
                }

                if (action === 'create' || action === 'overwrite') {
                    op.content = getFieldFromContent(innerContent, 'content') || '';
                } else if (action === 'delete') {
                } else if (action === 'move') {
                    op.source = getFieldFromContent(innerContent, 'source');
                    op.destination = getFieldFromContent(innerContent, 'destination');
                } else if (action === 'update') {
                    op.search = getFieldFromContent(innerContent, 'search');
                    op.searchStart = getFieldFromContent(innerContent, 'search_start');
                    op.searchEnd = getFieldFromContent(innerContent, 'search_end');
                    op.replace = getFieldFromContent(innerContent, 'replace') || getFieldFromContent(innerContent, 'content') || '';
                }
                operations.push(op);
            }
        }
    }
    return operations;
}

function parseCmdOperations(llmText) {
    const operations = [];
    const cmdOpRegex = /<cmd_op>([\s\S]*?)<\/cmd_op>/g;

    let match;
    while ((match = cmdOpRegex.exec(llmText)) !== null) {
        const command = match[1].replace(/^\r?\n/, '').replace(/\r?\n$/, '').trim();
        if (command) {
            operations.push({ action: 'execute', command });
        }
    }
    return operations;
}

// ==========================================
// 3. EXECUTION ENGINES
// ==========================================
function applyFileOperations(projectRoot, operations) {
    const results = { successful: [], failed: [] };

    for (const op of operations) {
        try {
            if (op.action === 'create' || op.action === 'overwrite') {
                const fullPath = path.join(projectRoot, op.path);
                fs.mkdirSync(path.dirname(fullPath), { recursive: true });
                fs.writeFileSync(fullPath, op.content, 'utf8');
                results.successful.push(`${op.action === 'create' ? 'Created' : 'Overwrote'}: ${op.path}`);
            }
            else if (op.action === 'delete') {
                const fullPath = path.join(projectRoot, op.path);
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                    results.successful.push(`Deleted: ${op.path}`);
                } else {
                    throw new Error('File not found to delete.');
                }
            }
            else if (op.action === 'move') {
                const srcPath = path.join(projectRoot, op.source);
                const destPath = path.join(projectRoot, op.destination);
                if (!fs.existsSync(srcPath)) throw new Error('Source file not found.');
                fs.mkdirSync(path.dirname(destPath), { recursive: true });
                fs.renameSync(srcPath, destPath);
                results.successful.push(`Moved: ${op.source} -> ${op.destination}`);
            }
            else if (op.action === 'update') {
                const fullPath = path.join(projectRoot, op.path);
                if (!fs.existsSync(fullPath)) throw new Error('File not found to update.');

                const fileContent = fs.readFileSync(fullPath, 'utf8').replace(/\r\n/g, '\n');
                const cleanReplace = op.replace.replace(/\r\n/g, '\n');

                if (op.searchStart && op.searchEnd) {
                    const startResult = findBlockMatch(fileContent, op.searchStart);
                    if (!startResult.success) throw new Error(`search_start failed: ${startResult.error}`);

                    const remainingContent = fileContent.substring(startResult.endIndex);
                    const endResult = findBlockMatch(remainingContent, op.searchEnd);
                    if (!endResult.success) throw new Error(`search_end failed: ${endResult.error}`);

                    const prefix = fileContent.substring(0, startResult.startIndex);
                    const suffix = remainingContent.substring(endResult.endIndex);

                    fs.writeFileSync(fullPath, prefix + cleanReplace + suffix, 'utf8');
                    results.successful.push(`Updated (Range Mode): ${op.path}`);
                }
                else if (op.search) {
                    const searchResult = findBlockMatch(fileContent, op.search);

                    if (!searchResult.success) {
                        throw new Error(`Search failed: ${searchResult.error}`);
                    }

                    const prefix = fileContent.substring(0, searchResult.startIndex);
                    const suffix = fileContent.substring(searchResult.endIndex);

                    fs.writeFileSync(fullPath, prefix + cleanReplace + suffix, 'utf8');
                    results.successful.push(`Updated (Exact Mode - ${searchResult.strategy}): ${op.path}`);
                } else {
                    throw new Error('Update operation missing <search> or <search_start>/<search_end> blocks.');
                }
            }
        } catch (error) {
            results.failed.push({ operation: op.action, path: op.path || op.source, error: error.message });
        }
    }
    return results;
}

function applyCmdOperations(projectRoot, operations) {
    const results = { successful: [], failed: [] };

    for (const op of operations) {
        try {
            const output = execSync(op.command, {
                cwd: projectRoot,
                encoding: 'utf8',
                stdio: 'pipe'
            });
            results.successful.push(`Executed: ${op.command}`);
        } catch (error) {
            results.failed.push({
                operation: op.action,
                command: op.command,
                error: error.message,
                stderr: error.stderr ? error.stderr.trim() : 'No stderr output'
            });
        }
    }
    return results;
}

// ==========================================
// 4. THE TEST SANDBOX
// ==========================================
const TEST_DIR = path.join(__dirname, './');

try {
    const mockPath = path.join(__dirname, 'mock-llm-response.txt');
    if (fs.existsSync(mockPath)) {
        const mockLLMResponse = fs.readFileSync(mockPath, 'utf8');

        console.log("1. Parsing LLM Output...");
        const parsedFileOps = parseFileOperations(mockLLMResponse);
        const parsedCmdOps = parseCmdOperations(mockLLMResponse);
        console.log(`-> Found ${parsedFileOps.length} file operations and ${parsedCmdOps.length} command operations.\n`);

        console.log("2. Applying File Operations to disk...");
        const fileExecutionResults = applyFileOperations(TEST_DIR, parsedFileOps);

        console.log("3. Executing Commands...");
        const cmdExecutionResults = applyCmdOperations(TEST_DIR, parsedCmdOps);

        console.log("\n--- FILE RESULTS ---");
        fileExecutionResults.successful.forEach(msg => console.log(`✅ ${msg}`));
        fileExecutionResults.failed.forEach(f => console.log(`❌ [${f.operation}] ${f.path}: ${f.error}`));

        console.log("\n--- COMMAND RESULTS ---");
        cmdExecutionResults.successful.forEach(msg => console.log(`✅ ${msg}`));
        cmdExecutionResults.failed.forEach(f => console.log(`❌ [${f.operation}] ${f.command}\n   Error: ${f.error}\n   Stderr: ${f.stderr}`));

    } else {
        console.log("Mock file not found. Place your LLM response text in mock-llm-response.txt to test.");
    }
} catch (e) {
    console.error("Test execution failed:", e.message);
}