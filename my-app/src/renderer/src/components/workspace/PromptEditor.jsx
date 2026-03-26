
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Wand2, MessageSquare } from 'lucide-react';

export default function PromptEditor({ prompts =[], activePromptId, onUpdateProject }) {
  const [editingId, setEditingId] = useState(null);
  const[editName, setEditName] = useState('');

  // Drag and Drop State
  const[draggedPromptId, setDraggedPromptId] = useState(null);
  const[dragOverPromptId, setDragOverPromptId] = useState(null);

  // Resizer State
  const useStickyHeight = (defaultVal) => {
    const [value, setValue] = useState(() => {
      const saved = localStorage.getItem('ui_promptHeight');
      return saved ? parseInt(saved, 10) : defaultVal;
    });
    const setStickyValue = (newVal) => {
      setValue((prev) => {
        const v = typeof newVal === 'function' ? newVal(prev) : newVal;
        localStorage.setItem('ui_promptHeight', v.toString());
        return v;
      });
    };
    return [value, setStickyValue];
  };
  const[height, setHeight] = useStickyHeight(250);
  const [isResizing, setIsResizing] = useState(false);

  const activePrompt = prompts.find(p => p.id === activePromptId) || prompts[0] || { id: 'temp', name: 'Default', content: '' };

  // Local state to prevent app-wide re-renders and disk writes on every single keystroke
  const [localContent, setLocalContent] = useState(activePrompt.content);

  // Sync local state when switching active prompt tabs
  useEffect(() => {
    setLocalContent(activePrompt.content);
  }, [activePromptId]);

  // Debounce saving to project state to prevent lag while typing
  useEffect(() => {
    const handler = setTimeout(() => {
      if (localContent !== activePrompt.content) {
        onUpdateProject(prev => ({
          prompts: (prev.prompts ||[]).map(p => p.id === activePromptId ? { ...p, content: localContent } : p)
        }));
      }
    }, 500); // Saves 500ms after the user stops typing
    return () => clearTimeout(handler);
  }, [localContent, activePromptId]);

  // --- Resize Handlers ---
  const startResizing = useCallback((e) => {
    e.preventDefault(); // Prevents text selection while dragging
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => setIsResizing(false),[]);

  const resize = useCallback((e) => {
    if (isResizing) {
      // Calculate new height from the bottom of the window
      const newHeight = Math.max(200, Math.min(window.innerHeight - e.clientY, window.innerHeight - 100));
      setHeight(newHeight);
    }
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
      // Professionally lock the cursor and text selection globally during drag
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, resize, stopResizing]);


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

  const handleUpdateContent = (e) => {
    setLocalContent(e.target.value);
  };

  const startRename = (e, prompt) => {
    e.stopPropagation();
    setEditingId(prompt.id);
    setEditName(prompt.name);
  };

  const saveRename = (id) => {
    if (editName.trim()) {
      onUpdateProject(prev => ({
        prompts: (prev.prompts ||[]).map(p => p.id === id ? { ...p, name: editName } : p)
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

  return (
    <div
      style={{ height: `${height}px` }}
      className="flex flex-col border-t border-gray-800 bg-gray-900 shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.3)] z-20 relative"
    >
      {/* Resizer Handle */}
      <div
        className="absolute top-0 left-0 right-0 h-1 bg-transparent hover:bg-blue-500 cursor-row-resize z-30 transition-colors"
        onMouseDown={startResizing}
      />

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
      <div className="p-4 flex flex-col flex-1 space-y-3 overflow-hidden">
        <textarea
          value={localContent}
          onChange={handleUpdateContent}
          placeholder="Write your prompt here..."
          className="w-full flex-1 bg-gray-950 border border-gray-800 rounded-lg p-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50 resize-none transition-colors"
        />

        <div className="flex items-center justify-between shrink-0">
          <div className="text-xs text-gray-500 font-mono">
            {localContent.length} characters
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
