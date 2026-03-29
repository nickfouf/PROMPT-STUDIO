import React, { useState } from 'react';
import { Plus, Bookmark, FilePlus, FolderPlus, Edit2, Trash2, Loader2 } from 'lucide-react';
import FileTreeItem from '../FileTreeItem';

export default function Sidebar({
  width,
  project,
  presets,
  activePreset,
  visibilityMap,
  expandedFolders,
  selectedIds,
  setSelectedIds,
  renamingNodeId,
  isWorkspaceReady,
  scanProgress,
  onUpdateProject,
  processNewItems,
  onSelect,
  onToggleExpand,
  onToggleVisibility,
  onContextMenu,
  onRenameSubmit,
  onDropTarget,
  onRemoveRoot,
  setNewPresetModal,
  setDeletePresetModal
}) {
  const[editingPresetId, setEditingPresetId] = useState(null);

  const [presetEditName, setPresetEditName] = useState('');
  const [draggedPresetId, setDraggedPresetId] = useState(null);
  const [dragOverPresetId, setDragOverPresetId] = useState(null);

  const handlePresetDragStart = (e, presetId) => {
    if (editingPresetId) { e.preventDefault(); return; }
    setDraggedPresetId(presetId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', presetId);
  };

  const handlePresetDragOver = (e, presetId) => {
    e.preventDefault();
    if (draggedPresetId && draggedPresetId !== presetId) setDragOverPresetId(presetId);
  };

  const handlePresetDrop = (e, targetPresetId) => {
    e.preventDefault();
    if (!draggedPresetId || draggedPresetId === targetPresetId) {
      setDragOverPresetId(null); setDraggedPresetId(null); return;
    }
    onUpdateProject(prev => {
      const newPresets = [...(prev.presets || [])];
      const sourceIndex = newPresets.findIndex(p => p.id === draggedPresetId);
      const targetIndex = newPresets.findIndex(p => p.id === targetPresetId);
      if (sourceIndex > -1 && targetIndex > -1) {
        const [moved] = newPresets.splice(sourceIndex, 1);
        newPresets.splice(targetIndex, 0, moved);
      }
      return { presets: newPresets };
    });
    setDragOverPresetId(null); setDraggedPresetId(null);
  };

  const handlePresetDragEnd = () => {
    setDraggedPresetId(null); setDragOverPresetId(null);
  };

  const startEditPreset = (preset) => {
    setEditingPresetId(preset.id);
    setPresetEditName(preset.name);
  };

  const savePresetRename = (id) => {
    setEditingPresetId(null);
    if (!presetEditName.trim()) return;
    onUpdateProject(prev => ({
      presets: (prev.presets || []).map(p => p.id === id ? { ...p, name: presetEditName } : p)
    }));
  };

  const handleSwitchPreset = (id) => {
    if (editingPresetId) return;
    onUpdateProject({ activePresetId: id });
  };

  return (

    <aside
      style={{ width }}
      className="bg-gray-900 flex flex-col h-full shrink-0 relative select-none border-r border-gray-800"
      onClick={() => setSelectedIds(new Set())}
    >
      <div className="p-3 border-b border-gray-800 flex flex-col space-y-3 bg-gray-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-gray-400">
             <Bookmark className="w-4 h-4" />
             <h3 className="text-xs font-bold uppercase tracking-wider">Presets</h3>
          </div>
          <button onClick={() => setNewPresetModal(true)} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors" title="New Preset">
             <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 pb-1">
           {presets.map(preset => {
              const isDragged = draggedPresetId === preset.id;
              const isDragOver = dragOverPresetId === preset.id;
              return (
              <div
                   key={preset.id}
                   draggable={!editingPresetId}
                   onDragStart={(e) => handlePresetDragStart(e, preset.id)}
                   onDragOver={(e) => handlePresetDragOver(e, preset.id)}
                   onDrop={(e) => handlePresetDrop(e, preset.id)}
                   onDragEnd={handlePresetDragEnd}
                   className={`flex items-center shrink-0 rounded border px-2.5 py-1 cursor-pointer transition-colors group select-none
                   ${project.activePresetId === preset.id
                      ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                      : 'bg-gray-800/80 border-gray-700/50 text-gray-400 hover:bg-gray-800 hover:text-gray-300'}
                   ${isDragged ? 'opacity-30' : ''}
                   ${isDragOver ? '!border-blue-400 !bg-blue-500/20 !border-dashed' : ''}`}
                   onClick={() => handleSwitchPreset(preset.id)}
              >
                 {editingPresetId === preset.id ? (
                    <input
                       autoFocus
                       value={presetEditName}
                       onChange={e => setPresetEditName(e.target.value)}
                       onBlur={() => savePresetRename(preset.id)}
                       onKeyDown={e => {
                         if(e.key === 'Enter') savePresetRename(preset.id);
                         if(e.key === 'Escape') setEditingPresetId(null);
                       }}
                       className="bg-transparent border-none outline-none text-xs w-20 text-white placeholder-gray-500"
                       onClick={e => e.stopPropagation()}
                    />
                 ) : (
                    <span className="text-xs font-medium whitespace-nowrap">{preset.name}</span>
                 )}

                 {project.activePresetId === preset.id && !editingPresetId && (
                    <div className="flex items-center ml-2 space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                       <button onClick={(e) => { e.stopPropagation(); startEditPreset(preset); }} className="p-0.5 hover:text-white" title="Rename"><Edit2 className="w-3 h-3" /></button>
                       {presets.length > 1 && (
                          <button onClick={(e) => { e.stopPropagation(); setDeletePresetModal(preset); }} className="p-0.5 hover:text-red-400" title="Delete"><Trash2 className="w-3 h-3" /></button>
                       )}
                    </div>
                 )}
              </div>
           )})}
        </div>
      </div>

            <div className="p-4 border-b border-gray-800 flex items-center justify-between shrink-0">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center">
          Project Files
          {!isWorkspaceReady && (
            <Loader2 className="w-3.5 h-3.5 ml-2 animate-spin text-blue-500" title="Scanning files..." />
          )}
        </h3>
        <div className="flex space-x-1">

          <button onClick={() => processNewItems('files')} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors" title="Add Files">
            <FilePlus className="w-4 h-4" />
          </button>
          <button onClick={() => processNewItems('folders')} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors" title="Add Folder">
            <FolderPlus className="w-4 h-4" />
          </button>
        </div>
      </div>

            <div className="flex-1 overflow-y-auto p-2" onClick={(e) => e.stopPropagation()}>
        {!isWorkspaceReady && project.nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-gray-500 space-y-3 mt-10">
             <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
             <span className="text-sm font-medium">Scanning files...</span>
             {scanProgress && scanProgress.count > 0 && (
               <span className="text-xs text-gray-600">{scanProgress.count} items found</span>
             )}
          </div>
        ) : project.nodes.length === 0 ? (
          <div className="text-xs text-gray-500 p-4 text-center mt-4">
            No files added yet. Use the buttons above to add files or folders from your computer.
          </div>
        ) : (

          project.nodes.map((node) => (
            <FileTreeItem
              key={node.id}
              node={node}
              level={0}
              selectedIds={selectedIds}
              expandedFolders={expandedFolders}
              parentEffectiveVis="full"
              visibilityMap={visibilityMap}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
              onToggleVisibility={onToggleVisibility}
              onContextMenu={onContextMenu}
              renamingNodeId={renamingNodeId}
              onRenameSubmit={onRenameSubmit}
              onDropTarget={onDropTarget}
              onRemoveRoot={onRemoveRoot}
            />
          ))
        )}
      </div>
    </aside>
  );
}





