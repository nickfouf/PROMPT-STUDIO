const fs = require('fs');
const path = require('path');

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
            // Exactly as provided (post-normalization)
            regex: new RegExp(escaped, 'g')
        },
        {
            name: 'Ignore Line Breaks',
            // Treat explicit newlines as any combination of whitespace/newlines
            regex: new RegExp(escaped.replace(/\\n/g, '\\s+'), 'g')
        },
        {
            name: 'Ignore NBSP vs Space',
            // Same as above, but allow normal spaces to match non-breaking spaces (\u00A0)
            regex: new RegExp(escaped.replace(/\\n/g, '\\s+').replace(/ /g, '[ \\u00A0]+'), 'g')
        },
        {
            name: 'Ignore All Space Mistakes',
            // Remove all whitespace from the search string, escape characters, and insert \s* between every single character
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
            // CRITICAL: Fail safely with a specific message if > 1 match is found
            throw new Error(`Update failed: Multiple matches (${matches.length}) found using strategy "${strategy.name}". The search block must be specific enough to yield exactly 1 match.`);
        }
        // If 0 matches, let the loop continue to the next fallback strategy
    }

    // If all strategies fail
    return { success: false, error: 'Search block not found using any strategy (Exact, Line Breaks, NBSP, or Ignore Spaces).' };
}

// ==========================================
// 2. THE PARSER (Upgraded for Multi-Tag, CDATA & Attribute Support)
// ==========================================
function parseFileOperations(llmText) {
    const operations = [];
    const fileOpRegex = /<file_op([^>]*)>([\s\S]*?)<\/file_op>/g;

    let match;
    while ((match = fileOpRegex.exec(llmText)) !== null) {
        const attributeString = match[1] || '';
        const innerContent = match[2] || '';

        // Helper: Extracts fields and safely cleans CDATA wrappers
        const getFieldFromContent = (content, fieldName) => {
            const tagRegex = new RegExp(`<${fieldName}>([\\s\\S]*?)<\\/${fieldName}>`);
            const tagMatch = content.match(tagRegex);

            if (tagMatch) {
                let extractedText = tagMatch[1];

                // Much safer CDATA match (doesn't require ^ and $)
                const cdataRegex = /<!\[CDATA\[([\s\S]*?)]]>/;
                const cdataMatch = extractedText.match(cdataRegex);

                if (cdataMatch) {
                    let inner = cdataMatch[1];
                    // Strip exactly one leading/trailing newline commonly added by LLM formatting
                    return inner.replace(/^\r?\n/, '').replace(/\r?\n$/, '');
                }
                return extractedText.trim();
            }
            return null;
        };

        // NEW FORMAT: Check for action tags directly nested in <file_op> (e.g., <update>...</update>)
        const actionTagsRegex = /<(update|create|overwrite|delete|move)>([\s\S]*?)<\/\1>/g;
        let hasActionTags = false;
        let actionMatch;

        while ((actionMatch = actionTagsRegex.exec(innerContent)) !== null) {
            hasActionTags = true;
            const action = actionMatch[1];
            const actionContent = actionMatch[2];

            const op = { action };

            // Try child tag first, then fallback to attribute string if needed
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

        // ORIGINAL FORMAT FALLBACK: Check for action as an attribute or an <action> child tag
        if (!hasActionTags) {
            let action = getFieldFromContent(innerContent, 'action');
            if (!action) {
                const attrRegex = /action="([^"]+)"/;
                const attrMatch = attributeString.match(attrRegex);
                if (attrMatch) action = attrMatch[1];
            }

            if (action) {
                const op = { action };

                // FIXED: Try child tag first, then extract from <file_op ... path="...">
                op.path = getFieldFromContent(innerContent, 'path');
                if (!op.path) {
                    const pathAttrRegex = /path="([^"]+)"/;
                    const pathMatch = attributeString.match(pathAttrRegex);
                    if (pathMatch) op.path = pathMatch[1];
                }

                if (action === 'create' || action === 'overwrite') {
                    op.content = getFieldFromContent(innerContent, 'content') || '';
                } else if (action === 'delete') {
                    // Delete only needs a path
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

// ==========================================
// 3. THE EXECUTION ENGINE (With Fallback)
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

                // RANGE UPDATE LOGIC
                if (op.searchStart && op.searchEnd) {
                    const startResult = findBlockMatch(fileContent, op.searchStart);
                    if (!startResult.success) throw new Error(`search_start failed: ${startResult.error}`);

                    // Search for the end block *only* in the text that comes after the start block
                    const remainingContent = fileContent.substring(startResult.endIndex);
                    const endResult = findBlockMatch(remainingContent, op.searchEnd);
                    if (!endResult.success) throw new Error(`search_end failed: ${endResult.error}`);

                    const prefix = fileContent.substring(0, startResult.startIndex);
                    // Add the remaining content's offset back in
                    const suffix = remainingContent.substring(endResult.endIndex);

                    fs.writeFileSync(fullPath, prefix + cleanReplace + suffix, 'utf8');
                    results.successful.push(`Updated (Range Mode): ${op.path}`);
                }
                // STANDARD UPDATE LOGIC
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

// ==========================================
// 4. THE TEST SANDBOX
// ==========================================
const TEST_DIR = path.join(__dirname, '../');

try {
    const mockPath = path.join(__dirname, 'mock-llm-response.txt');
    if (fs.existsSync(mockPath)) {
        const mockLLMResponse = fs.readFileSync(mockPath, 'utf8');

        console.log("1. Parsing LLM Output...");
        const parsedOps = parseFileOperations(mockLLMResponse);
        console.log(`-> Found ${parsedOps.length} operations to execute.\n`);

        console.log("2. Applying Operations to disk...");
        const executionResults = applyFileOperations(TEST_DIR, parsedOps);

        console.log("\n--- RESULTS ---");
        executionResults.successful.forEach(msg => console.log(`✅ ${msg}`));
        executionResults.failed.forEach(f => console.log(`❌ [${f.operation}] ${f.path}: ${f.error}`));
    } else {
        console.log("Mock file not found. Place your LLM response text in mock-llm-response.txt to test.");
    }
} catch (e) {
    console.error("Test execution failed:", e.message);
}