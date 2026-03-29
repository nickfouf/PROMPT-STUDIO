// prompt_studio/src/renderer/src/components/workspace/PromptEditor.jsx

import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { Plus, Edit2, Trash2, Wand2, MessageSquare } from 'lucide-react';
import ReactQuill, { Quill } from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import TurndownService from 'turndown';
import { marked } from 'marked';

// Inject custom Undo/Redo icons into Quill's internal icon registry
const icons = Quill.import('ui/icons');
icons['undo'] = `<svg viewbox="0 0 18 18"><polygon class="ql-fill ql-stroke" points="6 10 4 12 2 10 6 10"></polygon><path class="ql-stroke" d="M8.09,13.91A4.6,4.6,0,0,0,9,14,5,5,0,1,0,4,9"></path></svg>`;
icons['redo'] = `<svg viewbox="0 0 18 18"><polygon class="ql-fill ql-stroke" points="12 10 14 12 16 10 12 10"></polygon><path class="ql-stroke" d="M9.91,13.91A4.6,4.6,0,0,1,9,14a5,5,0,1,1,5-5"></path></svg>`;
icons['copyPrompt'] = `<svg viewbox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="14" height="14" rx="2" ry="2" class="ql-stroke"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" class="ql-stroke"></path></svg>`;

export default function PromptEditor({ prompts =[], activePromptId, isCountingTokens, onUpdateProject }) {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const quillRef = useRef(null);

  // Drag and Drop State
  const [draggedPromptId, setDraggedPromptId] = useState(null);
  const [dragOverPromptId, setDragOverPromptId] = useState(null);

  const activePrompt = prompts.find(p => p.id === activePromptId) || prompts[0] || { id: 'temp', name: 'Default', content: '' };

  // Local state to prevent app-wide re-renders and disk writes on every single keystroke
  const [localContent, setLocalContent] = useState(activePrompt.content);

  const[viewMode, setViewMode] = useState('rich'); // 'rich' | 'markdown'
  const[markdownContent, setMarkdownContent] = useState('');
  const textareaRef = useRef(null);

  const turndownService = useMemo(() => new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced'
  }),[]);

  // Sync local state when switching active prompt tabs
  useEffect(() => {
    setLocalContent(activePrompt.content);
    if (viewMode === 'markdown') {
      setMarkdownContent(turndownService.turndown(activePrompt.content || ''));
    }
  }, [activePromptId]);

  // Dynamically scale textarea height to match Quill's behavior
  useLayoutEffect(() => {
    if (viewMode === 'markdown' && textareaRef.current) {
      textareaRef.current.style.height = 'auto'; // Reset constraint temporarily
      textareaRef.current.style.height = `${Math.max(150, textareaRef.current.scrollHeight)}px`;
    }
  },[markdownContent, viewMode]);

  const handleContentChange = (newContent) => {
    setLocalContent(newContent);
    // Immediately show the loading spinner to make the UI feel responsive while typing
    if (!isCountingTokens) {
      onUpdateProject({ isCountingTokens: true, tokenError: null });
    }
  };

  const handleMarkdownChange = (e) => {
    const newMd = e.target.value;
    setMarkdownContent(newMd);

    // Parse markdown to HTML
    const newHtml = marked.parse(newMd, { async: false });
    setLocalContent(newHtml);

    if (!isCountingTokens) {
      onUpdateProject({ isCountingTokens: true, tokenError: null });
    }
  };

  const handleViewModeSwitch = (mode) => {
    if (mode === 'markdown' && viewMode !== 'markdown') {
      setMarkdownContent(turndownService.turndown(localContent || ''));
    }
    setViewMode(mode);
  };

  // Debounce saving to project state to prevent lag while typing
  useEffect(() => {
    const handler = setTimeout(() => {
      if (localContent !== activePrompt.content) {
        onUpdateProject(prev => ({
          prompts: (prev.prompts || []).map(p => p.id === activePromptId ? { ...p, content: localContent } : p)
        }));
      }
    }, 250); // Saves 250ms after the user stops typing
    return () => clearTimeout(handler);
  }, [localContent, activePromptId]);

  const handleCreatePrompt = () => {
    const newPrompt = {
      id: window.crypto.randomUUID(),
      name: `Prompt ${prompts.length + 1}`,
      content: ''
    };
    onUpdateProject(prev => ({
      prompts: [...(prev.prompts || []), newPrompt],
      activePromptId: newPrompt.id
    }));
  };

  const handleDeletePrompt = (e, id) => {
    e.stopPropagation();
    onUpdateProject(prev => {
      const newPrompts = prev.prompts.filter(p => p.id !== id);
      if (newPrompts.length === 0) {
        newPrompts.push({ id: window.crypto.randomUUID(), name: 'Main Prompt', content: '' });
      }
      return {
        prompts: newPrompts,
        activePromptId: prev.activePromptId === id ? newPrompts[0].id : prev.activePromptId
      };
    });
  };

  const startRename = (e, prompt) => {
    e.stopPropagation();
    setEditingId(prompt.id);
    setEditName(prompt.name);
  };

  const saveRename = (id) => {
    if (editName.trim()) {
      onUpdateProject(prev => ({
        prompts: (prev.prompts || []).map(p => p.id === id ? { ...p, name: editName } : p)
      }));
    }
    setEditingId(null);
  };

  // --- Drag and Drop Handlers ---
  const handleDragStart = (e, id) => {
    if (editingId) { e.preventDefault(); return; }
    setDraggedPromptId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e, id) => {
    e.preventDefault();
    if (draggedPromptId && draggedPromptId !== id) {
      setDragOverPromptId(id);
    }
  };

  const handleDrop = (e, targetId) => {
    e.preventDefault();
    if (!draggedPromptId || draggedPromptId === targetId) {
      setDragOverPromptId(null);
      setDraggedPromptId(null);
      return;
    }

    onUpdateProject(prev => {
      const newPrompts = [...(prev.prompts || [])];
      const sourceIndex = newPrompts.findIndex(p => p.id === draggedPromptId);
      const targetIndex = newPrompts.findIndex(p => p.id === targetId);
      if (sourceIndex > -1 && targetIndex > -1) {
        const [moved] = newPrompts.splice(sourceIndex, 1);
        newPrompts.splice(targetIndex, 0, moved);
      }
      return { prompts: newPrompts };
    });

    setDragOverPromptId(null);
    setDraggedPromptId(null);
  };

  const handleDragEnd = () => {
    setDraggedPromptId(null);
    setDragOverPromptId(null);
  };

  // Quill setup (useMemo ensures toolbar doesn't remount on every keystroke)
  const modules = useMemo(() => ({
    toolbar: {
      container: [
        [{ 'header': [1, 2, 3, false] }],['bold', 'italic', 'underline', 'strike'],[{ 'list': 'ordered'}, { 'list': 'bullet' }],
        ['code-block', 'blockquote'],
        ['clean'],['undo', 'redo', 'copyPrompt']
      ],
      handlers: {
        undo: function() { this.quill.history.undo(); },
        redo: function() { this.quill.history.redo(); },
        copyPrompt: function() {
          const html = this.quill.root.innerHTML;
          const td = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced'
          });
          const md = td.turndown(html);
          navigator.clipboard.writeText(md);

          const toolbar = this.quill.getModule('toolbar');
          const button = toolbar.container.querySelector('.ql-copyPrompt');
          if (button) {
             const originalHtml = button.innerHTML;
             button.innerHTML = `<svg viewbox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>`;
             setTimeout(() => {
               button.innerHTML = originalHtml;
             }, 2000);
          }
        }
      }
    },
    history: {
      delay: 500,
      maxStack: 100,
      userOnly: true
    }
  }),[]);

  // Calculate plain text length without HTML tags
  const plainTextLength = localContent.replace(/<[^>]*>?/gm, '').trim().length;

  return (
    <div className="flex flex-col bg-gray-900 relative shrink min-h-0 flex-1">
      {/* Tabs / Header */}
      <div className="flex items-center justify-between px-2 bg-gray-950 border-b border-gray-800 overflow-x-auto shrink-0 pt-1">
        <div className="flex items-center space-x-1 py-1.5">
          {prompts.map((prompt) => {
            const isActive = prompt.id === activePromptId;
            const isDragged = draggedPromptId === prompt.id;
            const isDragOver = dragOverPromptId === prompt.id;

            return (
              <div
                key={prompt.id}
                draggable={!editingId}
                onDragStart={(e) => handleDragStart(e, prompt.id)}
                onDragOver={(e) => handleDragOver(e, prompt.id)}
                onDrop={(e) => handleDrop(e, prompt.id)}
                onDragEnd={handleDragEnd}
                onClick={() => onUpdateProject({ activePromptId: prompt.id })}
                className={`group flex items-center space-x-2 px-3 py-1.5 rounded-t-lg cursor-pointer transition-colors border-b-2 select-none
                  ${isActive
                    ? 'bg-gray-800 border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-900'}
                  ${isDragged ? 'opacity-30' : ''}
                  ${isDragOver ? '!border-blue-400 !bg-blue-500/20 border-dashed' : ''}`}
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                {editingId === prompt.id ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => saveRename(prompt.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveRename(prompt.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-gray-950 border border-blue-500 outline-none text-xs w-24 px-1 rounded text-white"
                  />
                ) : (
                  <span className="text-xs font-medium whitespace-nowrap">{prompt.name}</span>
                )}

                {isActive && !editingId && (
                  <div className="flex items-center ml-2 opacity-0 group-hover:opacity-100 transition-opacity space-x-1 shrink-0">
                    <button onClick={(e) => startRename(e, prompt)} className="p-0.5 hover:text-white rounded" title="Rename"><Edit2 className="w-3 h-3" /></button>
                    {prompts.length > 1 && (
                      <button onClick={(e) => handleDeletePrompt(e, prompt.id)} className="p-0.5 hover:text-red-400 rounded" title="Delete"><Trash2 className="w-3 h-3" /></button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <button
            onClick={handleCreatePrompt}
            className="ml-2 p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded transition-colors shrink-0"
            title="New Prompt Variation"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Editor Area */}
      <div className="p-4 flex flex-col space-y-3 flex-1 min-h-0">
        <div className="flex items-center justify-end shrink-0 -mb-1">
          <div className="flex items-center bg-gray-900 rounded-lg p-0.5 border border-gray-800">
            <button
              onClick={() => handleViewModeSwitch('rich')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center ${viewMode === 'rich' ? 'bg-gray-800 text-gray-200 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
            >
              Rich Text
            </button>
            <button
              onClick={() => handleViewModeSwitch('markdown')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors flex items-center ${viewMode === 'markdown' ? 'bg-gray-800 text-gray-200 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
            >
              Markdown
            </button>
          </div>
        </div>

        {viewMode === 'rich' ? (
          <div className="flex flex-col flex-1 min-h-0 bg-gray-950 rounded-lg shadow-inner">
            <ReactQuill
              ref={quillRef}
              theme="snow"
              value={localContent}
              onChange={handleContentChange}
              modules={modules}
              placeholder="Write your prompt here..."
            />
          </div>
        ) : (
          <div className="flex-1 min-h-0 bg-gray-950 rounded-lg shadow-inner border border-gray-800 overflow-y-auto">
            <textarea
              ref={textareaRef}
              value={markdownContent}
              onChange={handleMarkdownChange}
              placeholder="Write your prompt in Markdown here..."
              className="w-full bg-transparent text-gray-200 resize-none outline-none font-mono text-sm leading-relaxed p-4 overflow-hidden block"
              style={{ minHeight: '150px' }}
            />
          </div>
        )}

        <div className="flex items-center justify-between shrink-0 pt-1">
          <div className="text-xs text-gray-500 font-mono">
            {plainTextLength} characters
          </div>
          <button className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40">
            <Wand2 className="w-4 h-4" />
            <span>Improve Prompt</span>
          </button>
        </div>
      </div>
    </div>
  );
}