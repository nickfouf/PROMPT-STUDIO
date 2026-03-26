import React, { useState, useEffect, useMemo } from 'react';
import { Copy, Download, CheckCircle, FileText, Settings, Code, Zap, Loader2, AlertTriangle } from 'lucide-react';
import { isTextFile } from '../../utils/fileTreeUtils';

function getIncludedNodes(nodes, visibilityMap, parentVis = 'full', parentPath = '') {
  const result =[];
  for (const node of nodes) {
    const intrinsicVis = visibilityMap[node.id] || 'full';
    let effectiveVis = intrinsicVis;

    // Filter out disabled extension types inherently matching FileTreeItem rules
    if (node.type !== 'folder' && !isTextFile(node.name)) {
      effectiveVis = 'hidden';
    } else {
      if (parentVis === 'hidden' && intrinsicVis !== 'hidden') {
        effectiveVis = 'hidden';
      } else if (parentVis === 'outline' && intrinsicVis === 'full') {
        effectiveVis = 'outline';
      }
    }

    if (effectiveVis === 'hidden') continue;

    const displayPath = parentPath ? `${parentPath}/${node.name}` : node.name;

    const newNode = { ...node, effectiveVis, displayPath };
    if (node.children) {
      newNode.children = getIncludedNodes(node.children, visibilityMap, effectiveVis, displayPath);
    }
    result.push(newNode);
  }
  return result;
}

function getFilesWithContent(nodes) {
  let files =[];
  for (const node of nodes) {
    if (node.type === 'file' && node.effectiveVis === 'full') {
      files.push(node);
    }
    if (node.children) {
      files = files.concat(getFilesWithContent(node.children));
    }
  }
  return files;
}

function generateTree(node, prefix = '') {
    const isDir = node.type === 'folder';
    const nodeName = isDir ? `${node.name}/` : node.name;

    let result = `${nodeName}\n`;

    if (isDir && node.children && node.children.length > 0) {
        node.children.forEach((child, index) => {
            const isLast = index === node.children.length - 1;
            const connector = isLast ? '└── ' : '├── ';
            const nextPrefix = prefix + (isLast ? '    ' : '│   ');
            result += prefix + connector + generateTree(child, nextPrefix);
        });
    }

    return result;
}

function flattenTreeForUI(nodes, prefix = '') {
  let result =[];
  nodes.forEach((node, index) => {
    const isDir = node.type === 'folder';
    const isLast = index === nodes.length - 1;
    const connector = isLast ? '└── ' : '├── ';

    result.push({
      id: node.id,
      name: isDir ? `${node.name}/` : node.name,
      prefix: prefix,
      connector: connector,
      effectiveVis: node.effectiveVis,
      type: node.type
    });

    if (isDir && node.children && node.children.length > 0) {
      const nextPrefix = prefix + (isLast ? '    ' : '│   ');
      result = result.concat(flattenTreeForUI(node.children, nextPrefix));
    }
  });
  return result;
}

function getTreeStats(nodes) {
  let files = 0;
  let dirs = 0;
  for (const node of nodes) {
    if (node.type === 'file') files++;
    else if (node.type === 'folder') dirs++;
    if (node.children) {
      const childStats = getTreeStats(node.children);
      files += childStats.files;
      dirs += childStats.dirs;
    }
  }
  return { files, dirs };
}

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes =['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

const getResponseModeText = (mode) => {
  if (mode === 'Diff Patches') {
    return `Respond only with structured, actionable code edits using \`<file_op>\` tags.

* Include: \`action\` (create, overwrite, update, delete, move), \`path\`, and \`content\`.
* For updates, use either:
  * \`<search>\` (supports fuzzy matching: ignore line breaks, non-breaking vs normal spaces, minor whitespace changes), OR
  * \`<search_start>\` / \`<search_end>\` (range replacement).
* Do not include explanations — output only the structured patch.
* Ensure each search block matches exactly one location to avoid ambiguity.`;
  } else if (mode === 'Explain Code') {
    return `Please read the provided code and explain how it works. Do not generate code modifications, only explain the logic, architecture, and potential improvements.`;
  }
  return '';
};

export default function WorkspaceMain({ project }) {
  const [activeTab, setActiveTab] = useState('composer');
  const [responseMode, setResponseMode] = useState('None');
  const[totalSize, setTotalSize] = useState(0);
  const [invalidFiles, setInvalidFiles] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const activePrompt = project.prompts?.find(p => p.id === project.activePromptId);
  const activePreset = project.presets?.find(p => p.id === project.activePresetId) || {};
  const visibilityMap = activePreset.visibilityMap || {};

  const includedNodes = useMemo(() => getIncludedNodes(project.nodes ||[], visibilityMap), [project.nodes, visibilityMap]);
  const filesWithContent = useMemo(() => getFilesWithContent(includedNodes), [includedNodes]);
  const treeStats = useMemo(() => getTreeStats(includedNodes), [includedNodes]);
  const uiTreeItems = useMemo(() => flattenTreeForUI(includedNodes), [includedNodes]);

  const contentPaths = useMemo(() => filesWithContent.map(f => f.path).join('|'), [filesWithContent]);

  useEffect(() => {
    const paths = contentPaths ? contentPaths.split('|') :[];
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
  }, [contentPaths]);

  const generateMarkdown = async () => {
    let treeStr = '';
    includedNodes.forEach(node => {
      treeStr += generateTree(node);
    });

    let contentMarkdown = '';
    for (const file of filesWithContent) {
      const readResult = await window.electronAPI.readFile(file.path);
      if (readResult !== null) {
        const contentStr = typeof readResult === 'string' ? readResult : readResult.content;
        const ext = file.name.split('.').pop() || 'text';
        contentMarkdown += `## ${file.displayPath}\n\n\`\`\`${ext}\n${contentStr}\n\`\`\`\n\n`;
      }
    }

    const userPrompt = activePrompt?.content || '';
    const modeText = getResponseModeText(responseMode);

    let finalMd = '';
    if (treeStr) {
      finalMd += `# Project Structure\n\n\`\`\`text\n${treeStr.trimEnd()}\n\`\`\`\n\n---\n\n`;
    }
    if (contentMarkdown) {
      finalMd += `# Files\n\n${contentMarkdown}---\n\n`;
    }
    if (userPrompt) {
      finalMd += `# User Request\n\n"${userPrompt}"\n\n---\n\n`;
    }
    if (modeText) {
      finalMd += `# Response Mode\n\n${modeText}\n`;
    }

    return finalMd;
  };

  const handleCopy = async () => {
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
    <div className="flex-1 flex flex-col h-full bg-gray-950 overflow-y-auto">
      {/* Tabs */}
      <div className="flex space-x-6 border-b border-gray-800 px-8 pt-4 shrink-0 sticky top-0 bg-gray-950 z-10">
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
      <div className="p-8 max-w-4xl w-full mx-auto space-y-6 pb-24">
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
                  <span className="text-blue-400 font-mono text-sm font-semibold">~14,500</span>
                </div>
              </div>

              {/* Project Tree Preview */}
              <div className="mb-6">
                <h4 className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider flex items-center">
                  <FileText className="w-4 h-4 mr-2" />
                  Included Files
                </h4>
                <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 max-h-64 overflow-y-auto text-sm font-mono space-y-1">
                  {uiTreeItems.map(item => (
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
                  {uiTreeItems.length === 0 && (
                    <div className="text-gray-500 text-center py-4">No files included in the prompt context.</div>
                  )}
                </div>
              </div>

              {/* User Prompt Preview */}
              <div className="mb-6">
                <h4 className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider flex items-center">
                  <Settings className="w-4 h-4 mr-2" />
                  User Prompt Preview
                </h4>
                <div className="bg-gray-950 border border-gray-800 rounded-lg p-4 text-sm text-gray-300 italic min-h-[60px] max-h-60 overflow-y-auto whitespace-pre-wrap">
                  {activePrompt?.content || 'No prompt content...'}
                </div>
              </div>

              {/* Response Mode */}
              <div>
                <h4 className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider flex items-center">
                  <Code className="w-4 h-4 mr-2" />
                  Response Mode
                </h4>
                <div className="relative">
                  <select
                    value={responseMode}
                    onChange={(e) => setResponseMode(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500 mb-3 transition-colors appearance-none cursor-pointer"
                  >
                    <option value="None">None</option>
                    <option value="Diff Patches">Diff Patches</option>
                    <option value="Explain Code">Explain Code</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none mb-3">
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>
                <div className="bg-blue-900/10 rounded-lg p-4 text-xs text-blue-200/70 border border-blue-900/30 leading-relaxed whitespace-pre-wrap">
                  {responseMode === 'None' && "Standard generation without specific formatting constraints. The prompt will only include the project context and your user prompt."}
                  {responseMode === 'Diff Patches' && getResponseModeText('Diff Patches')}
                  {responseMode === 'Explain Code' && getResponseModeText('Explain Code')}
                </div>
              </div>
            </div>

            {/* Statistics */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-6 text-gray-200">Statistics &amp; Health</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 flex flex-col items-center justify-center shadow-inner">
                  <span className="text-2xl font-bold text-gray-100">{filesWithContent.length}</span>
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider mt-1 font-bold text-center">Files (Content)</span>
                </div>
                <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 flex flex-col items-center justify-center shadow-inner">
                  <span className="text-2xl font-bold text-gray-100">{treeStats.files}</span>
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider mt-1 font-bold text-center">Files (Tree)</span>
                </div>
                <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 flex flex-col items-center justify-center shadow-inner">
                  <span className="text-2xl font-bold text-gray-100">{treeStats.dirs}</span>
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

              {filesWithContent.length > 0 ? (
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
          </>
        )}

        {activeTab === 'updater' && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 border border-dashed border-gray-800 rounded-xl bg-gray-900/50">
            <p className="text-sm">Updater features coming soon...</p>
          </div>
        )}
      </div>
    </div>
  );
}
