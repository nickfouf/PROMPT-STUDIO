const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline'); // Added for stream-json (NDJSON) parsing

// ==========================================
// 1. HELPER: FUZZY SEARCH ENGINE
// ==========================================
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findBlockMatch(fileContent, searchBlock) {
    const cleanSearch = searchBlock.replace(/\r\n/g, '\n').trim();
    const escaped = escapeRegExp(cleanSearch);

    const strategies = [
        { name: 'Perfect Match', regex: new RegExp(escaped, 'g') },
        { name: 'Ignore Line Breaks', regex: new RegExp(escaped.replace(/\\n/g, '\\s+'), 'g') },
        { name: 'Ignore NBSP vs Space', regex: new RegExp(escaped.replace(/\\n/g, '\\s+').replace(/ /g, '[ \\u00A0]+'), 'g') },
        { name: 'Ignore All Space Mistakes', regex: new RegExp(cleanSearch.replace(/\s+/g, '').split('').map(escapeRegExp).join('\\s*'), 'g') }
    ];

    for (const strategy of strategies) {
        const matches = [...fileContent.matchAll(strategy.regex)];
        if (matches.length === 1) {
            const match = matches[0];
            return {
                success: true, startIndex: match.index, endIndex: match.index + match[0].length,
                matchedText: match[0], strategy: strategy.name
            };
        } else if (matches.length > 1) {
            throw new Error(`Update failed: Multiple matches (${matches.length}) found using strategy "${strategy.name}".`);
        }
    }
    return { success: false, error: 'Search block not found.' };
}

// ==========================================
// 2. PARSER: STREAM-JSON (NDJSON)
// ==========================================
// Replaces the old XML Regex parsers. Reads Newline-Delimited JSON streams.
async function parseCursorStreamJson(inputStream) {
    const fileOps = [];
    const cmdOps = [];

    const rl = readline.createInterface({
        input: inputStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        if (!line.trim()) continue;

        try {
            const event = JSON.parse(line);

            // Listen for tool call events starting (as per Cursor docs)
            if (event.type === 'tool_call' && event.subtype === 'started') {
                const call = event.tool_call;

                // 1. Cursor's native write tool mapping
                if (call.writeToolCall) {
                    fileOps.push({
                        action: 'overwrite', // Maps to create/overwrite
                        path: call.writeToolCall.args.path,
                        content: call.writeToolCall.args.fileText || ''
                    });
                }

                // 2. Custom tools mapping (For your specific update, delete, move, cmd actions)
                else if (call.function) {
                    // LLMs sometimes return args as a stringified JSON
                    const args = typeof call.function.arguments === 'string'
                        ? JSON.parse(call.function.arguments)
                        : call.function.arguments;

                    switch(call.function.name) {
                        case 'update_file':
                            fileOps.push({
                                action: 'update',
                                path: args.path,
                                search: args.search,
                                searchStart: args.search_start,
                                searchEnd: args.search_end,
                                replace: args.replace
                            });
                            break;
                        case 'delete_file':
                            fileOps.push({ action: 'delete', path: args.path });
                            break;
                        case 'move_file':
                            fileOps.push({ action: 'move', source: args.source, destination: args.destination });
                            break;
                        case 'run_command':
                            cmdOps.push({ action: 'execute', command: args.command });
                            break;
                    }
                }
            }
        } catch (err) {
            console.error("Failed to parse line as JSON:", err.message);
        }
    }

    return { fileOps, cmdOps };
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
                results.successful.push(`Overwrote: ${op.path}`);
            }
            else if (op.action === 'delete') {
                const fullPath = path.join(projectRoot, op.path);
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                    results.successful.push(`Deleted: ${op.path}`);
                } else throw new Error('File not found to delete.');
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
                    if (!searchResult.success) throw new Error(`Search failed: ${searchResult.error}`);

                    const prefix = fileContent.substring(0, searchResult.startIndex);
                    const suffix = fileContent.substring(searchResult.endIndex);

                    fs.writeFileSync(fullPath, prefix + cleanReplace + suffix, 'utf8');
                    results.successful.push(`Updated (Exact Mode - ${searchResult.strategy}): ${op.path}`);
                } else {
                    throw new Error('Update missing search blocks.');
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
            execSync(op.command, { cwd: projectRoot, encoding: 'utf8', stdio: 'pipe' });
            results.successful.push(`Executed: ${op.command}`);
        } catch (error) {
            results.failed.push({ operation: op.action, command: op.command, error: error.message, stderr: error.stderr ? error.stderr.trim() : 'No stderr output' });
        }
    }
    return results;
}

// ==========================================
// 4. THE TEST SANDBOX
// ==========================================
const TEST_DIR = path.join(__dirname, './');

(async () => {
    try {
        const mockPath = path.join(__dirname, 'mock-llm-response.jsonl'); // Changed to .jsonl
        if (fs.existsSync(mockPath)) {
            const stream = fs.createReadStream(mockPath, 'utf8');

            console.log("1. Parsing stream-json Output...");
            const { fileOps, cmdOps } = await parseCursorStreamJson(stream);
            console.log(`-> Found ${fileOps.length} file operations and ${cmdOps.length} command operations.\n`);

            console.log("2. Applying File Operations to disk...");
            const fileExecutionResults = applyFileOperations(TEST_DIR, fileOps);

            console.log("3. Executing Commands...");
            const cmdExecutionResults = applyCmdOperations(TEST_DIR, cmdOps);

            console.log("\n--- FILE RESULTS ---");
            fileExecutionResults.successful.forEach(msg => console.log(`✅ ${msg}`));
            fileExecutionResults.failed.forEach(f => console.log(`❌ [${f.operation}] ${f.path}: ${f.error}`));

            console.log("\n--- COMMAND RESULTS ---");
            cmdExecutionResults.successful.forEach(msg => console.log(`✅ ${msg}`));
            cmdExecutionResults.failed.forEach(f => console.log(`❌ [${f.operation}] ${f.command}\n   Error: ${f.error}`));

        } else {
            console.log("Mock file not found. Create mock-llm-response.jsonl with Cursor's stream-json output to test.");
        }
    } catch (e) {
        console.error("Test execution failed:", e.message);
    }
})();