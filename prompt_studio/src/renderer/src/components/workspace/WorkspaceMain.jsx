import React, { useState, useEffect, useMemo } from 'react';
import { Copy, Download, CheckCircle, FileText, Settings, Code, Zap, Loader2, AlertTriangle, Edit2, Trash2, Network, Clipboard, Terminal, Check, X, Play } from 'lucide-react';
import PromptEditor from './PromptEditor';
import TurndownService from 'turndown';
import InstructionEditorModal from './InstructionEditorModal';
import ConfirmDialog from '../common/ConfirmDialog';
import { marked } from 'marked';

function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

const DEFAULT_INSTRUCTIONS =[
  {
    id: 'diff-patches',
    name: 'Diff Patches',
    content: `<p>Respond only with structured, actionable code edits using <code>&lt;file_op&gt;</code> tags.</p><ul><li>Include: <code>action</code> (create, overwrite, update, delete, move), <code>path</code>, and <code>content</code>.</li><li>For updates, use either:<ul><li><code>&lt;search&gt;</code> (supports fuzzy matching: ignore line breaks, non-breaking vs normal spaces, minor whitespace changes), OR</li><li><code>&lt;search_start&gt;</code> / <code>&lt;search_end&gt;</code> (range replacement).</li></ul></li><li>Do not include explanations — output only the structured patch.</li><li>Ensure each search block matches exactly one location to avoid ambiguity.</li></ul>`
  },
  {
    id: 'explain-code',
    name: 'Explain Code',
    content: `<p>Please read the provided code and explain how it works. Do not generate code modifications, only explain the logic, architecture, and potential improvements.</p>`
  }
];

function UpdaterBlock({ block, idx, status, onApply }) {
  if (block.type === 'markdown') {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-sm">
        <div className="ql-snow">
          <div className="ql-editor !p-0 !min-h-0 !h-auto text-gray-300" dangerouslySetInnerHTML={{ __html: marked.parse(block.content || '', { async: false }) }} />
        </div>
      </div>
    );
  }

  if (block.type === 'file_op') {
    const action = block.attributes.action || 'update';
    const path = block.attributes.path || 'Unknown path';

    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-sm flex flex-col">
        {/* Header */}
        <div className="bg-gray-950 px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <FileText className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-gray-200 font-mono">{path}</span>
            <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${action === 'create' ? 'bg-green-900/30 text-green-400 border border-green-800/50' : action === 'delete' ? 'bg-red-900/30 text-red-400 border border-red-800/50' : 'bg-yellow-900/30 text-yellow-500 border border-yellow-800/50'}`}>
              {action}
            </span>
          </div>
          <div>
            {status.status === 'idle' && (
              <button onClick={onApply} className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shadow-lg shadow-blue-900/20">
                <Play className="w-3.5 h-3.5" />
                <span>Apply Patch</span>
              </button>
            )}
            {status.status === 'running' && (
              <div className="flex items-center space-x-2 text-blue-400 px-3 py-1.5 text-xs font-medium">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Applying...</span>
              </div>
            )}
            {status.status === 'success' && (
              <div className="flex items-center space-x-2 text-green-400 px-3 py-1.5 text-xs font-medium">
                <Check className="w-3.5 h-3.5" />
                <span>Applied</span>
              </div>
            )}
            {status.status === 'error' && (
              <div className="flex items-center space-x-2 text-red-400 px-3 py-1.5 text-xs font-medium">
                <X className="w-3.5 h-3.5" />
                <span>Failed</span>
              </div>
            )}
          </div>
        </div>

        {/* Content Preview */}
        <div className="p-4 bg-gray-900 text-xs font-mono text-gray-300 overflow-x-auto space-y-3">
          {action === 'update' && block.operations && (
            <>
              {block.operations.search && (
                <div>
                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Search</div>
                  <pre className="bg-red-900/10 border border-red-900/30 text-red-400/90 p-3 rounded-lg whitespace-pre-wrap">{block.operations.search}</pre>
                </div>
              )}
              {block.operations.search_start && (
                <div>
                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Search Start</div>
                  <pre className="bg-red-900/10 border border-red-900/30 text-red-400/90 p-3 rounded-lg whitespace-pre-wrap">{block.operations.search_start}</pre>
                </div>
              )}
              {block.operations.search_end && (
                <div>
                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Search End</div>
                  <pre className="bg-red-900/10 border border-red-900/30 text-red-400/90 p-3 rounded-lg whitespace-pre-wrap">{block.operations.search_end}</pre>
                </div>
              )}
              {block.operations.replace !== undefined && (
                <div>
                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Replace With</div>
                  <pre className="bg-green-900/10 border border-green-900/30 text-green-400/90 p-3 rounded-lg whitespace-pre-wrap">{block.operations.replace}</pre>
                </div>
              )}
            </>
          )}

          {action === 'create' && (
            <div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Content</div>
              <pre className="bg-green-900/10 border border-green-900/30 text-green-400/90 p-3 rounded-lg whitespace-pre-wrap">{block.operations?.replace || block.content || ''}</pre>
            </div>
          )}

          {action === 'delete' && (
            <div className="text-gray-500 italic">This file will be deleted.</div>
          )}

          {status.status === 'error' && (
            <div className="mt-3 bg-red-900/20 border border-red-900/50 p-3 rounded-lg flex items-start space-x-2 text-red-400">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="whitespace-pre-wrap break-words">{status.msg}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (block.type === 'terminal_op') {
    const shellType = block.attributes.type || 'cmd';
    const cwd = block.attributes.path || './';

    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-sm flex flex-col">
        <div className="bg-gray-950 px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Terminal className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-semibold text-gray-200 font-mono">Terminal Command</span>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-purple-900/30 text-purple-400 border border-purple-800/50">
              {shellType}
            </span>
            <span className="text-[10px] text-gray-500 font-mono tracking-wider ml-2">cwd: {cwd}</span>
          </div>
          <div>
            {status.status === 'idle' && (
              <button onClick={onApply} className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shadow-lg shadow-blue-900/20">
                <Play className="w-3.5 h-3.5" />
                <span>Run Command</span>
              </button>
            )}
            {status.status === 'running' && (
              <div className="flex items-center space-x-2 text-blue-400 px-3 py-1.5 text-xs font-medium">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Running...</span>
              </div>
            )}
            {status.status === 'success' && (
              <div className="flex items-center space-x-2 text-green-400 px-3 py-1.5 text-xs font-medium">
                <Check className="w-3.5 h-3.5" />
                <span>Success</span>
              </div>
            )}
            {status.status === 'error' && (
              <div className="flex items-center space-x-2 text-red-400 px-3 py-1.5 text-xs font-medium">
                <X className="w-3.5 h-3.5" />
                <span>Failed</span>
              </div>
            )}
          </div>
        </div>
        <div className="p-4 bg-gray-900 text-xs font-mono text-gray-300 overflow-x-auto space-y-3">
          <pre className="bg-black/50 border border-gray-800 text-gray-300 p-3 rounded-lg whitespace-pre-wrap">{block.content}</pre>

          {(status.status === 'success' || status.status === 'error') && status.msg && (
            <div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Output</div>
              <pre className={`p-3 rounded-lg whitespace-pre-wrap border ${status.status === 'success' ? 'bg-black/30 text-gray-400 border-gray-800' : 'bg-red-900/10 text-red-400/90 border-red-900/30'}`}>
                {status.msg}
              </pre>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}

export default function WorkspaceMain({ project, onUpdateProject, isWorkspaceReady, showNotification }) {
  const [activeTab, setActiveTab] = useState('prompt');

  const[instructionId, setInstructionId] = useState(project.selectedInstruction || 'None');
  const [customInstructions, setCustomInstructions] = useState([]);
  const [newInstModal, setNewInstModal] = useState(false);
  const[newInstName, setNewInstName] = useState('');
  const [editInstModal, setEditInstModal] = useState(null);
  const [isRenamingInst, setIsRenamingInst] = useState(false);
  const[renameInstName, setRenameInstName] = useState('');
  const [deleteInstModalOpen, setDeleteInstModalOpen] = useState(false);

  const [realStats, setRealStats] = useState({ files: 0, dirs: 0, includedFiles: [], uiTreeItems: [] });
  const [totalSize, setTotalSize] = useState(0);
  const [invalidFiles, setInvalidFiles] = useState([]);
  const[isGenerating, setIsGenerating] = useState(false);
  const [promptView, setPromptView] = useState('markdown');
  const [responseView, setResponseView] = useState('markdown');
  const[copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedResponse, setCopiedResponse] = useState(false);

  // Updater States
  const updaterParsed = project.updaterParsed || null;
  const updaterBlockStatus = project.updaterBlockStatus || {};
  const [manualParseModal, setManualParseModal] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [clearUpdaterModal, setClearUpdaterModal] = useState(false);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getCustomInstructions().then(insts => {
        if (insts) setCustomInstructions(insts);
      });
    }
  },[]);

  const saveCustomInstructions = (updated) => {
    setCustomInstructions(updated);
    if (window.electronAPI) {
      window.electronAPI.saveCustomInstructions(updated);
    }
  };

  const getBasePath = () => {
    if (!project.nodes || project.nodes.length === 0) return '';
    const firstFolder = project.nodes.find(n => n.type === 'folder');
    if (firstFolder) return firstFolder.path;
    const firstFile = project.nodes[0];
    return firstFile.path.substring(0, Math.max(firstFile.path.lastIndexOf('/'), firstFile.path.lastIndexOf('\\')));
  };

  const handleParseResponse = async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    let protocol = 'markdown';
    let uid = null;
    let blocks =[];

    const lines = trimmed.split('\n');
    const firstLine = lines[0].trim();
    if (firstLine.startsWith('srp,')) {
      protocol = 'srp';
      uid = firstLine.split(',')[1].trim();
    }

    if (protocol === 'srp' && uid) {
      blocks = await window.electronAPI.parseResponse({ responseText: trimmed, uid });
    } else {
      blocks = [{ type: 'markdown', content: trimmed }];
    }

    onUpdateProject({
      updaterParsed: { protocol, blocks },
      updaterBlockStatus: {}
    });
    setManualParseModal(false);
    setManualInput('');
  };

  const handleClipboardParse = async () => {
    const text = await window.electronAPI.readClipboardText();
    if (text) handleParseResponse(text);
  };

  const applyBlock = async (block, idx) => {
    onUpdateProject(prev => ({
      updaterBlockStatus: { ...(prev.updaterBlockStatus || {}), [idx]: { status: 'running' } }
    }));
    const basePath = getBasePath();

    if (block.type === 'file_op') {
      const res = await window.electronAPI.applyFileOp({ basePath, block });
      if (res.success) {
        onUpdateProject(prev => ({
          updaterBlockStatus: { ...(prev.updaterBlockStatus || {}), [idx]: { status: 'success' } }
        }));
      } else {
        onUpdateProject(prev => ({
          updaterBlockStatus: { ...(prev.updaterBlockStatus || {}), [idx]: { status: 'error', msg: res.error } }
        }));
      }
    } else if (block.type === 'terminal_op') {
      const res = await window.electronAPI.runTerminalOp({ basePath, block });
      if (res.success) {
        onUpdateProject(prev => ({
          updaterBlockStatus: { ...(prev.updaterBlockStatus || {}), [idx]: { status: 'success', msg: res.output } }
        }));
      } else {
        onUpdateProject(prev => ({
          updaterBlockStatus: { ...(prev.updaterBlockStatus || {}), [idx]: { status: 'error', msg: res.error } }
        }));
      }
    }
  };

  const confirmAddNewInst = () => {
    if (!newInstName.trim()) return;
    const newId = window.crypto.randomUUID();
    const newInst = {
      id: newId,
      name: newInstName.trim(),
      content: '<p>Here are your custom instructions.</p>'
    };
    const updated =[...customInstructions, newInst];
    saveCustomInstructions(updated);
    setInstructionId(newId);
    onUpdateProject({ selectedInstruction: newId });
    setNewInstModal(false);
  };

  const startRenameInst = () => {
    const inst = customInstructions.find(i => i.id === instructionId);
    if (inst) {
      setRenameInstName(inst.name);
      setIsRenamingInst(true);
    }
  };

  const handleRenameInstSubmit = () => {
    if (!renameInstName.trim()) return;
    const updated = customInstructions.map(i => i.id === instructionId ? { ...i, name: renameInstName.trim() } : i);
    saveCustomInstructions(updated);
    setIsRenamingInst(false);
  };

  const handleDeleteInst = () => {
    setDeleteInstModalOpen(true);
  };

  const confirmDeleteInst = () => {
    const updated = customInstructions.filter(i => i.id !== instructionId);
    saveCustomInstructions(updated);
    setInstructionId('None');
    onUpdateProject({ selectedInstruction: 'None' });
    setDeleteInstModalOpen(false);
  };

  const handleInstructionChange = (e) => {
    const val = e.target.value;
    if (val === 'add_new') {
      setNewInstModal(true);
      setNewInstName('');
    } else {
      setInstructionId(val);
      onUpdateProject({ selectedInstruction: val });
    }
  };

  const activeInstruction = useMemo(() => {
    if (instructionId === 'None') return null;
    return DEFAULT_INSTRUCTIONS.find(i => i.id === instructionId) || customInstructions.find(i => i.id === instructionId);
  }, [instructionId, customInstructions]);

  const activeInstIsCustom = customInstructions.some(i => i.id === instructionId);

  const activePrompt = project.prompts?.find(p => p.id === project.activePromptId);
  const activePreset = project.presets?.find(p => p.id === project.activePresetId) || {};
  const visibilityMap = activePreset.visibilityMap || {};

  const turndownService = useMemo(() => new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced'
  }),[]);

  const promptRaw = useMemo(() => {
    return activePrompt?.content ? turndownService.turndown(activePrompt.content) : '';
  }, [activePrompt?.content, turndownService]);

  const handleCopyPromptPreview = () => {
    navigator.clipboard.writeText(promptRaw);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const getInstructionText = (html) => {
    if (!html) return '';
    return turndownService.turndown(html);
  };

  const handleCopyResponseMode = () => {
    if (activeInstruction) {
      navigator.clipboard.writeText(getInstructionText(activeInstruction.content));
      setCopiedResponse(true);
      setTimeout(() => setCopiedResponse(false), 2000);
    }
  };

  useEffect(() => {
    const paths = realStats.includedFiles.map(f => f.path);
    if (paths.length === 0) {
      setTotalSize(0);
      setInvalidFiles([]);
      return;
    }
    window.electronAPI.getFileMetadata(paths).then(meta => {
      setTotalSize(meta.totalSize);
      setInvalidFiles(meta.invalidFiles);
    }).catch(() => {
      setTotalSize(0);
      setInvalidFiles([]);
    });
  }, [realStats.includedFiles]);

  const generateMarkdown = async () => {
    const rootPaths = (project.nodes ||[]).map(n => n.path);
    
    const scanResult = await window.electronAPI.scanOptimized(rootPaths, visibilityMap);
    const { treeStr, includedFiles, stats } = scanResult;

    setRealStats({ files: stats.files, dirs: stats.dirs, includedFiles, uiTreeItems: scanResult.uiTreeItems });

    let contentMarkdown = '';
    const pathsToRead = includedFiles.map(f => f.path);
    const chunkSize = 50;

    for (let i = 0; i < pathsToRead.length; i += chunkSize) {
      const chunk = pathsToRead.slice(i, i + chunkSize);
      const readResults = await window.electronAPI.readFilesBulk(chunk);
      const resultMap = new Map(readResults.map(r =>[r.path, r]));

      for (const file of includedFiles.slice(i, i + chunkSize)) {
        const res = resultMap.get(file.path);
        if (res && !res.error && !res.isBinary) {
          const ext = file.name.split('.').pop() || 'text';
          contentMarkdown += `## ${file.displayPath}\n\n\`\`\`${ext}\n${res.content}\n\`\`\`\n\n`;
        }
      }
    }

    const userPromptHtml = activePrompt?.content || '';
    let userPrompt = '';
    if (userPromptHtml) {
      userPrompt = turndownService.turndown(userPromptHtml);
    }
    const modeText = activeInstruction ? getInstructionText(activeInstruction.content) : '';

    let bodyMd = '';
    if (modeText) {
      bodyMd += `# Instructions\n\n${modeText}\n\n---\n\n`;
    }
    if (treeStr) {
      bodyMd += `# Project Structure\n\n\`\`\`text\n${treeStr.trimEnd()}\n\`\`\`\n\n---\n\n`;
    }
    if (contentMarkdown) {
      bodyMd += `# Files\n\n${contentMarkdown}---\n\n`;
    }
    if (userPrompt) {
      bodyMd += `# User Request\n\n${userPrompt}\n\n---\n\n`;
    }

    let finalMd = bodyMd;

    if ((project.selectedProtocol || 'srp') === 'srp') {
      let currentUid = project.protocolUid;
      let uidChanged = false;

      if (!currentUid) {
        currentUid = await window.electronAPI.generateUid();
        uidChanged = true;
      }

      while (bodyMd.includes(currentUid)) {
        currentUid = await window.electronAPI.generateUid();
        uidChanged = true;
      }

      if (uidChanged) {
        onUpdateProject({ protocolUid: currentUid });
      }

      const protocolText = await window.electronAPI.getSystemInstructions(currentUid);
      finalMd = `${protocolText}\n\n${bodyMd}`;
    }

    return finalMd;
  };

  // --- NEW: Token Counter Debounce ---
  useEffect(() => {
    if (!isWorkspaceReady) return; // Wait until scanning is finished

    onUpdateProject({ isCountingTokens: true, tokenError: null });

    const handler = setTimeout(async () => {
      try {
        const fullMarkdownPayload = await generateMarkdown();

        const result = await window.electronAPI.countTokens({
          text: fullMarkdownPayload,
          model: project.selectedModel || 'Google Gemini'
        });

        if (result && result.error) {
          onUpdateProject({ tokenCount: null, tokenError: result.error, isCountingTokens: false });
        } else {
          onUpdateProject({
            tokenCount: result.count,
            isApproximateTokens: result.isApproximate,
            tokenError: null,
            isCountingTokens: false
          });
        }
      } catch (err) {
        console.error("Failed to count tokens:", err);
        onUpdateProject({ tokenCount: null, tokenError: "Failed", isCountingTokens: false });
      }
    }, 250);

    return () => clearTimeout(handler);
  },[project.nodes, visibilityMap, activePrompt?.content, project.selectedModel, project.selectedProtocol, project.protocolUid, instructionId, customInstructions, isWorkspaceReady]);

  const handleCopy = async () => {
    if (!isWorkspaceReady) {
      showNotification("Please wait until file scanning is complete before generating markdown.");
      return;
    }
    setIsGenerating(true);
    try {
      const md = await generateMarkdown();
      await navigator.clipboard.writeText(md);
    } catch (e) {
      console.error(e);
      alert('Error generating markdown');
    }
    setIsGenerating(false);
  };

  const handleExport = async () => {
    if (!isWorkspaceReady) {
      showNotification("Please wait until file scanning is complete before exporting.");
      return;
    }
    setIsGenerating(true);
    try {
      const md = await generateMarkdown();
      const res = await window.electronAPI.saveMarkdown(md, 'prompt.md');
      if (res && res.error) {
        alert('Failed to save: ' + res.error);
      }
    } catch (e) {
      console.error(e);
      alert('Error generating markdown');
    }
    setIsGenerating(false);
  };

  return (
    <div className={`flex-1 flex flex-col h-full bg-gray-950 ${activeTab === 'prompt' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
      {/* Tabs */}
      <div className="flex space-x-6 border-b border-gray-800 px-8 pt-4 shrink-0 sticky top-0 bg-gray-950 z-10">
        <button
          onClick={() => setActiveTab('prompt')}
          className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'prompt' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          Prompt
        </button>
        <button
          onClick={() => setActiveTab('composer')}
          className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'composer' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          Composer
        </button>
        <button
          onClick={() => setActiveTab('updater')}
          className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'updater' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          Updater
        </button>
      </div>

      {/* Tab Content */}
      <div className={`p-8 max-w-4xl w-full mx-auto flex-1 flex flex-col min-h-0 ${activeTab !== 'prompt' ? 'space-y-6 pb-24' : ''}`}>
        {activeTab === 'prompt' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl flex flex-col shadow-sm overflow-hidden shrink max-h-full min-h-0">
            <PromptEditor
              prompts={project.prompts}
              activePromptId={project.activePromptId}
              isCountingTokens={project.isCountingTokens}
              onUpdateProject={onUpdateProject}
            />
          </div>
        )}

        {activeTab === 'composer' && (
          <>
            {/* Markdown Flow */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-200 flex items-center">
                  <Zap className="w-5 h-5 mr-2 text-blue-400" />
                  Markdown Flow
                </h3>
                <div className="flex items-center space-x-2 bg-gray-950 px-3 py-1.5 rounded-lg border border-gray-800">
                  <span className="text-gray-400 text-sm">Estimated Tokens:</span>
                  <span className="text-blue-400 font-mono text-sm font-semibold">
                    {typeof project.tokenCount === 'number' ? `${project.isApproximateTokens ? '~' : ''}${project.tokenCount.toLocaleString()}` : "0"}
                  </span>
                </div>
              </div>

              {/* Protocol Selection */}
              <div className="mb-6">
                <h4 className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider flex items-center">
                  <Network className="w-4 h-4 mr-2" />
                  Protocol
                </h4>
                <div className="flex items-center space-x-4 bg-gray-950 border border-gray-800 rounded-lg p-4 shadow-inner">
                  <select
                    value={project.selectedProtocol || 'srp'}
                    onChange={(e) => onUpdateProject({ selectedProtocol: e.target.value })}
                    className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500 transition-colors cursor-pointer outline-none w-64"
                  >
                    <option value="srp">Structured Response Protocol</option>
                    <option value="none">None</option>
                  </select>

                  {(project.selectedProtocol || 'srp') === 'srp' && (
                    <div className="flex items-center space-x-2 bg-gray-900 px-3 py-1.5 rounded-lg border border-gray-800 ml-auto shadow-sm">
                      <span className="text-gray-500 text-xs font-medium uppercase tracking-wider">Session UID:</span>
                      <span className="text-blue-400 font-mono text-sm font-bold tracking-widest">{project.protocolUid || 'Generating...'}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Project Tree Preview */}
              <div className="mb-6">
                <h4 className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider flex items-center">
                  <FileText className="w-4 h-4 mr-2" />
                  Included Files
                </h4>
                <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 max-h-64 overflow-y-auto text-sm font-mono space-y-1">
                  {realStats.uiTreeItems.slice(0, 300).map(item => (
                    <div key={item.id} className="flex items-center justify-between group py-0.5 hover:bg-gray-900 px-2 rounded">
                      <span className="text-gray-300 flex items-center whitespace-pre">
                        <span className="text-gray-600">{item.prefix}{item.connector}</span>
                        <span className={item.effectiveVis === 'outline' ? 'text-gray-400 italic' : item.type === 'folder' ? 'text-blue-300' : 'text-gray-200'}>
                          {item.name}
                        </span>
                      </span>
                      {item.effectiveVis === 'full' && item.type === 'file' && (
                        <span className="text-[10px] uppercase tracking-wider font-bold bg-blue-900/30 text-blue-400 border border-blue-800/50 px-2 py-0.5 rounded ml-4 shrink-0">Content Included</span>
                      )}
                      {item.effectiveVis === 'outline' && (
                        <span className="text-[10px] uppercase tracking-wider font-bold bg-gray-800 text-gray-400 px-2 py-0.5 rounded ml-4 shrink-0">Structure Only</span>
                      )}
                    </div>
                  ))}
                  {realStats.uiTreeItems.length > 300 && (
                    <div className="text-gray-500 text-center py-3 mt-2 border-t border-gray-800/50 italic text-xs">
                      ... and {realStats.uiTreeItems.length - 300} more items hidden for performance.
                    </div>
                  )}
                  {realStats.uiTreeItems.length === 0 && (
                    <div className="text-gray-500 text-center py-4">No files included in the prompt context.</div>
                  )}
                </div>
              </div>

              {/* User Prompt Preview */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center">
                    <Settings className="w-4 h-4 mr-2" />
                    User Prompt Preview
                  </h4>
                  <div className="flex items-center space-x-2">
                    <div className="flex items-center bg-gray-900 rounded-lg p-0.5 border border-gray-800">
                      <button onClick={() => setPromptView('markdown')} className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${promptView === 'markdown' ? 'bg-gray-800 text-gray-200 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}>Markdown</button>
                      <button onClick={() => setPromptView('raw')} className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${promptView === 'raw' ? 'bg-gray-800 text-gray-200 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}>Raw</button>
                    </div>
                    <button onClick={handleCopyPromptPreview} className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-lg transition-colors border border-transparent hover:border-gray-700" title="Copy Markdown">
                      {copiedPrompt ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 text-sm text-gray-300 min-h-[60px] max-h-60 overflow-y-auto">
                  {activePrompt?.content ? (
                    promptView === 'markdown' ? (
                      <div className="ql-snow">
                        <div
                          className="ql-editor !p-0 !min-h-0 !h-auto"
                          dangerouslySetInnerHTML={{ __html: activePrompt.content }}
                        />
                      </div>
                    ) : (
                      <pre className="whitespace-pre-wrap font-mono text-xs text-gray-400">{promptRaw}</pre>
                    )
                  ) : (
                    <span className="italic text-gray-500">No prompt content...</span>
                  )}
                </div>
              </div>

              {/* Instructions */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center">
                    <Code className="w-4 h-4 mr-2" />
                    Instructions
                  </h4>
                  {instructionId !== 'None' && (
                    <div className="flex items-center space-x-2">
                      <div className="flex items-center bg-gray-900 rounded-lg p-0.5 border border-gray-800">
                        <button onClick={() => setResponseView('markdown')} className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${responseView === 'markdown' ? 'bg-gray-800 text-gray-200 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}>Markdown</button>
                        <button onClick={() => setResponseView('raw')} className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${responseView === 'raw' ? 'bg-gray-800 text-gray-200 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}>Raw</button>
                      </div>
                      <button onClick={handleCopyResponseMode} className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-lg transition-colors border border-transparent hover:border-gray-700" title="Copy Text">
                        {copiedResponse ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center space-x-2 mb-3">
                  <div className="relative flex-1">
                    <select
                      value={instructionId}
                      onChange={handleInstructionChange}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500 transition-colors appearance-none cursor-pointer"
                    >
                      <option value="None">None</option>
                      <optgroup label="Default Presets">
                        {DEFAULT_INSTRUCTIONS.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </optgroup>
                      {customInstructions.length > 0 && (
                        <optgroup label="Custom Presets">
                          {customInstructions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                        </optgroup>
                      )}
                      <option value="add_new">+ Add new instruction preset...</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none">
                      <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                  </div>

                  {activeInstIsCustom && (
                    <>
                      {isRenamingInst ? (
                        <div className="flex items-center space-x-2">
                          <input
                            autoFocus
                            value={renameInstName}
                            onChange={e => setRenameInstName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleRenameInstSubmit();
                              if (e.key === 'Escape') setIsRenamingInst(false);
                            }}
                            className="bg-gray-900 border border-blue-500 rounded px-2 py-2 text-sm text-gray-200 outline-none w-32"
                          />
                          <button onClick={handleRenameInstSubmit} className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-2 rounded font-medium">Save</button>
                          <button onClick={() => setIsRenamingInst(false)} className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-2 rounded font-medium">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-1 shrink-0">
                          <button onClick={startRenameInst} className="p-2 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors border border-gray-800" title="Rename Preset">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={handleDeleteInst} className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors border border-gray-800" title="Delete Preset">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 text-sm text-gray-300 min-h-[60px] max-h-60 overflow-y-auto relative group">
                  {instructionId === 'None' && <span className="text-gray-300">Standard generation without specific formatting constraints. The prompt will only include the project context and your user prompt.</span>}
                  {activeInstruction && (
                    <>
                      {responseView === 'markdown' ? (
                        <div className="ql-snow">
                          <div
                            className="ql-editor !p-0 !min-h-0 !h-auto"
                            dangerouslySetInnerHTML={{ __html: activeInstruction.content }}
                          />
                        </div>
                      ) : (
                        <pre className="whitespace-pre-wrap font-mono text-xs text-gray-400">{getInstructionText(activeInstruction.content)}</pre>
                      )}

                      {activeInstIsCustom && (
                        <button
                          onClick={() => setEditInstModal(activeInstruction)}
                          className="absolute bottom-4 right-4 bg-blue-600 hover:bg-blue-500 text-white p-2.5 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-200 transform hover:scale-105 flex items-center justify-center z-10"
                          title="Edit Instructions"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Statistics */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-6 text-gray-200">Statistics &amp; Health</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 flex flex-col items-center justify-center shadow-inner">
                  <span className="text-2xl font-bold text-gray-100">{realStats.includedFiles.length}</span>
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider mt-1 font-bold text-center">Files (Content)</span>
                </div>
                <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 flex flex-col items-center justify-center shadow-inner">
                  <span className="text-2xl font-bold text-gray-100">{realStats.files}</span>
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider mt-1 font-bold text-center">Files (Tree)</span>
                </div>
                <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 flex flex-col items-center justify-center shadow-inner">
                  <span className="text-2xl font-bold text-gray-100">{realStats.dirs}</span>
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider mt-1 font-bold text-center">Directories</span>
                </div>
                <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 flex flex-col items-center justify-center shadow-inner text-center">
                  <span className="text-2xl font-bold text-gray-100 whitespace-nowrap">{formatBytes(totalSize).split(' ')[0]} <span className="text-sm font-medium text-gray-400">{formatBytes(totalSize).split(' ')[1]}</span></span>
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider mt-1 font-bold text-center">Total Size</span>
                </div>
              </div>

              {invalidFiles.length > 0 && (
                <div className="mb-4 flex flex-col space-y-2 text-red-400 bg-red-900/10 px-4 py-3 rounded-lg border border-red-900/30">
                  <div className="flex items-center space-x-3">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <span className="text-sm font-medium">Warning: {invalidFiles.length} disguised binary file(s) masquerading as text were detected. Their contents have been bypassed.</span>
                  </div>
                  <div className="text-xs text-red-400/80 max-h-24 overflow-y-auto pl-8 pr-2 space-y-1">
                    {invalidFiles.map((f, i) => <div key={i} className="truncate">{f}</div>)}
                  </div>
                </div>
              )}

              {realStats.includedFiles.length > 0 ? (
                <div className="flex items-center space-x-3 text-green-400 bg-green-900/10 px-4 py-3 rounded-lg border border-green-900/30">
                  <CheckCircle className="w-5 h-5 shrink-0" />
                  <span className="text-sm font-medium">Everything looks good! Ready to generate markdown.</span>
                </div>
              ) : (
                <div className="flex items-center space-x-3 text-yellow-500 bg-yellow-900/10 px-4 py-3 rounded-lg border border-yellow-900/30">
                  <FileText className="w-5 h-5 shrink-0" />
                  <span className="text-sm font-medium">No files selected for content generation.</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between shadow-sm gap-4 sm:gap-0">
              <div>
                <h3 className="text-lg font-semibold text-gray-200">Generate Output</h3>
                <p className="text-sm text-gray-500 mt-1">Copy to clipboard or export as .md file</p>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={handleExport}
                  disabled={isGenerating}
                  className="flex items-center space-x-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-200 px-5 py-2.5 rounded-lg transition-colors text-sm font-medium border border-gray-700"
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span>Export .md</span>
                </button>
                <button
                  onClick={handleCopy}
                  disabled={isGenerating}
                  className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg transition-colors text-sm font-medium shadow-lg shadow-blue-900/20"
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                  <span>Copy Markdown</span>
                </button>
              </div>
            </div>

            {/* Bottom Spacer for scroll clearance */}
            <div className="h-2 shrink-0 w-full"></div>
          </>
        )}

        {activeTab === 'updater' && (
          <div className="flex flex-col h-full space-y-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-200 flex items-center">
                  <Network className="w-5 h-5 mr-2 text-blue-400" />
                  Parse AI Response
                </h3>
                <p className="text-sm text-gray-500 mt-1">Import the AI's response to review and apply code changes.</p>
              </div>
              <div className="flex items-center space-x-3 w-full sm:w-auto">
                <button
                  onClick={handleClipboardParse}
                  className="flex-1 sm:flex-none flex items-center justify-center space-x-2 bg-gray-800 hover:bg-gray-700 text-gray-200 px-4 py-2.5 rounded-lg transition-colors text-sm font-medium border border-gray-700"
                >
                  <Clipboard className="w-4 h-4" />
                  <span>From Clipboard</span>
                </button>
                <button
                  onClick={() => setManualParseModal(true)}
                  className="flex-1 sm:flex-none flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-lg transition-colors text-sm font-medium shadow-lg shadow-blue-900/20"
                >
                  <Edit2 className="w-4 h-4" />
                  <span>Enter Manually</span>
                </button>
              </div>
            </div>

            {!updaterParsed ? (
              <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-gray-800 rounded-xl bg-gray-900/30 p-12 text-center mt-6">
                <div className="w-16 h-16 bg-gray-900 rounded-full flex items-center justify-center mb-4 shadow-inner border border-gray-800">
                  <Network className="w-8 h-8 text-blue-500/50" />
                </div>
                <h3 className="text-lg font-medium text-gray-300 mb-2">No Response Loaded</h3>
                <p className="text-gray-500 text-sm max-w-sm">Use the options above to paste an AI response and begin applying updates to your workspace.</p>
              </div>
            ) : (
              <div className="space-y-4 pb-24 relative">
                <div className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 shadow-sm">
                  <div className="flex items-center space-x-3">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Detected Protocol:</span>
                    <span className={`px-2.5 py-1 rounded text-xs font-bold tracking-wider uppercase ${updaterParsed.protocol === 'srp' ? 'bg-blue-900/30 text-blue-400 border border-blue-800/50' : 'bg-gray-800 text-gray-300 border border-gray-700'}`}>
                      {updaterParsed.protocol === 'srp' ? 'Structured Response Protocol (SRP)' : 'Standard Markdown'}
                    </span>
                  </div>
                  <button
                    onClick={() => setClearUpdaterModal(true)}
                    className="flex items-center space-x-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-1.5 rounded transition-colors font-medium"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear Response</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {updaterParsed.blocks.map((block, idx) => (
                    <UpdaterBlock key={idx} block={block} idx={idx} status={updaterBlockStatus[idx] || { status: 'idle' }} onApply={() => applyBlock(block, idx)} />
                  ))}
                  {updaterParsed.protocol === 'srp' && updaterParsed.blocks.length === 0 && (
                    <div className="bg-yellow-900/20 border border-yellow-900/50 rounded-xl p-8 flex flex-col items-center justify-center text-center shadow-inner mt-4">
                      <AlertTriangle className="w-10 h-10 text-yellow-500 mb-4 opacity-80" />
                      <h4 className="text-yellow-400 font-semibold text-lg mb-2">No valid blocks found!</h4>
                      <p className="text-yellow-500/80 text-sm max-w-lg leading-relaxed">
                        It looks like the response was parsed as SRP, but no XML operation tags were found. If you manually highlighted the text to copy it, your browser may have hidden the tags.

                        Please use the <strong>Copy button</strong> provided at the bottom of the AI's response to preserve the raw text.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {manualParseModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-xl w-[600px] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-gray-700 bg-gray-850 text-base font-bold text-gray-100 flex items-center justify-between">
              <span>Enter AI Response Manually</span>
              <button onClick={() => setManualParseModal(false)} className="text-gray-500 hover:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 flex-1 min-h-[300px] flex flex-col">
              <textarea
                autoFocus
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Paste the raw response from the AI here..."
                className="flex-1 w-full bg-gray-900 border border-gray-700 focus:border-blue-500 rounded-lg p-4 outline-none text-gray-200 text-sm font-mono resize-none transition-colors"
              />
            </div>
            <div className="px-5 py-4 bg-gray-900 border-t border-gray-700 flex justify-end space-x-3">
              <button onClick={() => setManualParseModal(false)} className="px-4 py-2 hover:bg-gray-700 rounded-lg text-sm text-gray-300 font-medium transition-colors">Cancel</button>
              <button
                onClick={() => handleParseResponse(manualInput)}
                disabled={!manualInput.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white font-medium transition-colors shadow-lg shadow-blue-900/20"
              >
                Parse
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={clearUpdaterModal}
        title="Clear Response"
        message="Are you sure you want to clear the parsed response? Any unapplied patches will be lost."
        confirmText="Clear Response"
        confirmStyle="danger"
        onConfirm={() => {
          onUpdateProject({ updaterParsed: null, updaterBlockStatus: {} });
          setClearUpdaterModal(false);
        }}
        onCancel={() => setClearUpdaterModal(false)}
      />

      {newInstModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-xl w-[400px] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-gray-700 bg-gray-850 text-base font-bold text-gray-100">
              New Instruction Preset
            </div>
            <div className="px-5 py-5 text-sm flex flex-col space-y-3">
              <label className="text-gray-400 font-medium">Preset Name</label>
              <input
                autoFocus
                value={newInstName}
                onChange={e => setNewInstName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') confirmAddNewInst();
                  if (e.key === 'Escape') setNewInstModal(false);
                }}
                className="bg-gray-900 border border-gray-700 focus:border-blue-500 rounded-lg px-4 py-2 outline-none text-white transition-colors"
                placeholder="e.g. Frontend Architecture Rules"
              />
            </div>
            <div className="px-5 py-4 bg-gray-900 border-t border-gray-700 flex justify-end space-x-3">
              <button onClick={() => setNewInstModal(false)} className="px-4 py-2 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors">Cancel</button>
              <button
                onClick={confirmAddNewInst}
                disabled={!newInstName.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white font-medium transition-colors shadow-lg shadow-blue-900/20"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {editInstModal && (
        <InstructionEditorModal
          instruction={editInstModal}
          onCancel={() => setEditInstModal(null)}
          onSave={(updated) => {
            const newInsts = customInstructions.map(i => i.id === updated.id ? updated : i);
            saveCustomInstructions(newInsts);
            setEditInstModal(null);
          }}
        />
      )}

      <ConfirmDialog
        isOpen={deleteInstModalOpen}
        title="Delete Instruction Preset"
        message="Are you sure you want to delete this custom instruction preset? This action cannot be undone."
        confirmText="Delete Preset"
        confirmStyle="danger"
        onConfirm={confirmDeleteInst}
        onCancel={() => setDeleteInstModalOpen(false)}
      />
    </div>
  );
}