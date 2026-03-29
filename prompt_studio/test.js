import LLMProtocol from "./src/main/LLMProtocol.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  const protocol = new LLMProtocol();

  // The root folder of the user's project
  const PROJECT_BASE_PATH = path.join(__dirname, './');

  // 1. App generates payload for the clipboard
  const userText = "Fix the index.html and install express.";
  const payload = protocol.buildInitialPrompt(userText);
  payload.uid = "9d4b2f1e";
  const activeUid = payload.uid;
  console.log(`Copying prompt to clipboard. Using UID: ${activeUid}\n`);

  // ... User copies, pastes to LLM, copies response ...

  // Mocking the LLM's raw response containing file edits and a terminal command
  const rawAIResponse = fs.readFileSync(path.join(__dirname, 'response.txt'), 'utf-8');

  // 2. Parse the LLM response
  const parsedBlocks = protocol.parseResponse(rawAIResponse, activeUid);

  console.log("--- PARSED BLOCKS ---");
  console.log(JSON.stringify(parsedBlocks, null, 2));
  console.log("---------------------\n");

  // 3. App iterates through blocks. (In a real app, this is where you render the UI
  // and wait for the user to click "Apply Fix" or "Run Command").
  for (const block of parsedBlocks) {
    if (block.type === 'markdown') {
      console.log(`[AI SAYS]:\n${block.content}\n`);
    }

    else if (block.type === 'file_op') {
      console.log(`[ACTION PENDING]: Update file ${block.attributes.path}`);
      try {
        // We call the module to do the actual work using the project base path
        protocol.applyFileOp(PROJECT_BASE_PATH, block);
        console.log(`✅ File updated successfully.\n`);
      } catch (err) {
        console.error(`❌ Failed to update file: ${err.message}\n`);
      }
    }

    else if (block.type === 'terminal_op') {
      console.log(`[ACTION PENDING]: Run command: ${block.content}`);
      try {
        // We await the terminal execution
        const output = await protocol.runTerminalOp(PROJECT_BASE_PATH, block);
        console.log(`✅ Command output:\n${output}`);
      } catch (err) {
        console.error(`❌ Command failed:\n${err}\n`);
      }
    }
  }
}

run();
