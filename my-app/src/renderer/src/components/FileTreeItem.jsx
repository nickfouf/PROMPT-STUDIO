// AI Prompt Builder 2/my-app/src/renderer/src/components/FileTreeItem.jsx
import React, { useState, useEffect } from 'react';
import { Folder, FolderOpen, ChevronRight, ChevronDown, Eye, EyeOff, LayoutList, ArrowRight } from 'lucide-react';
import { isTextFile, getFileIcon } from '../utils/fileTreeUtils';

const FileTreeItem = React.memo(function FileTreeItem({ 
  node, 
  level, 
  selectedIds, 
  expandedFolders, 
  parentEffectiveVis = 'full', 
  visibilityMap, // <--- Accept visibility data from Preset map
  onSelect, 
  onToggleExpand,
  onToggleVisibility,
  onContextMenu,
  renamingNodeId,
  onRenameSubmit,
  onDropTarget
}) {
  const[highlightClass, setHighlightClass] = useState('');
  const [dragCounter, setDragCounter] = useState(0); 

  const isFolder = node.type === 'folder';
  const isRoot = level === 0;
  
  const isExpanded = isFolder && expandedFolders.has(node.id);
  const isSelected = selectedIds.has(node.id);
  const isTargetOfBulk = isSelected && selectedIds.size > 1; 

  const isText = isFolder ? true : isTextFile(node.name);
  const IconComponent = isFolder ? null : getFileIcon(node.name);
  
  // Visibility Computation directly via preset's visibilityMap
  const intrinsicVis = visibilityMap[node.id] || 'full'; 
  let effectiveVis = intrinsicVis;                
  let isOverridden = false;                       
  let isBinaryDisabled = false;

  if (!isFolder && !isText) {
    effectiveVis = 'hidden';
    isBinaryDisabled = true;
  } else {
    if (parentEffectiveVis === 'hidden' && intrinsicVis !== 'hidden') {
      effectiveVis = 'hidden';
      isOverridden = true;
    } else if (parentEffectiveVis === 'outline' && intrinsicVis === 'full') {
      effectiveVis = 'outline';
      isOverridden = true;
    }
  }

  // Effect: Handle File System Updates
  useEffect(() => {
    if (node._event) {
      const { type, ts } = node._event;
      if (Date.now() - ts < 1000) {
        if (type === 'add' || type === 'addDir') setHighlightClass('animate-flash-add');
        else if (type === 'change') setHighlightClass('animate-flash-change');
        else if (type === 'unlink' || type === 'unlinkDir') setHighlightClass('animate-flash-delete');
        else if (type === 'rename' || type === 'renameDir') setHighlightClass('animate-flash-rename');

        const timer = setTimeout(() => setHighlightClass(''), 500);
        return () => clearTimeout(timer);
      }
    }
  }, [node._event]);

  // Effect: Handle User "Cascade" Config Updates
  useEffect(() => {
    if (node._cascadeUpdate) {
      if (Date.now() - node._cascadeUpdate < 1000) {
        setHighlightClass('animate-flash-cascade');
        const timer = setTimeout(() => setHighlightClass(''), 1000); 
        return () => clearTimeout(timer);
      }
    }
  },[node._cascadeUpdate]);

  // --- Drag and Drop Handlers ---
  const handleDragStart = (e) => {
    if (renamingNodeId === node.id) {
      e.preventDefault();
      return;
    }
    const draggedIds = selectedIds.has(node.id) ? Array.from(selectedIds) :[node.id];
    e.dataTransfer.setData('application/x-file-tree-ids', JSON.stringify(draggedIds));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    if (!isFolder) return;
    if (e.dataTransfer.types.includes('application/x-file-tree-ids')) {
      e.preventDefault(); 
      e.dataTransfer.dropEffect = 'move';
    }
  };

  const handleDragEnter = (e) => {
    if (!isFolder) return;
    if (e.dataTransfer.types.includes('application/x-file-tree-ids')) {
      e.preventDefault();
      setDragCounter(prev => prev + 1);
    }
  };

  const handleDragLeave = (e) => {
    if (!isFolder) return;
    if (e.dataTransfer.types.includes('application/x-file-tree-ids')) {
      setDragCounter(prev => prev - 1);
    }
  };

  const handleDrop = (e) => {
    if (!isFolder) return;
    e.preventDefault();
    setDragCounter(0);
    const data = e.dataTransfer.getData('application/x-file-tree-ids');
    if (data) {
      try {
        const ids = JSON.parse(data);
        if (onDropTarget) onDropTarget(ids, node);
      } catch (err) {
        console.error('Failed to parse drag payload', err);
      }
    }
  };

  const isDragOver = dragCounter > 0;
  // ------------------------------

  const rowStyle = {
    paddingLeft: isRoot ? '8px' : `${(level * 12) + 8}px`,
    ...(highlightClass === 'animate-flash-cascade' ? { animationDelay: `${level * 30}ms` } : {})
  };

  const tooltipText = isBinaryDisabled 
    ? `Non-text files cannot be included in prompts`
    : isOverridden 
      ? `Overridden by Parent\nPreset setting: ${intrinsicVis.toUpperCase()}\nEffective state: ${effectiveVis.toUpperCase()}\n\n(Click to change preset setting)`
      : `Current State: ${intrinsicVis.toUpperCase()}\n(Click to change${isTargetOfBulk ? ` all ${selectedIds.size} selected` : ''})\n💡 Alt + Click to deep cascade to children`;

  return (
    <div className={isRoot ? "mb-1" : ""}>
      <div
        draggable={renamingNodeId !== node.id}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`flex items-center py-1.5 px-2 rounded cursor-pointer text-sm transition-colors group select-none relative
          ${isSelected 
            ? 'bg-blue-600/30 text-blue-100 border border-blue-500/50' 
            : (isRoot 
                ? 'bg-gray-800/80 hover:bg-gray-700 border border-transparent border-l-2 border-l-blue-500 text-gray-200' 
                : 'hover:bg-gray-800 border border-transparent text-gray-400'
              )
          }
          ${effectiveVis === 'hidden' ? 'opacity-40' : ''}
          ${effectiveVis === 'outline' ? 'text-gray-400 italic' : ''}
          ${highlightClass}
          ${isDragOver ? '!bg-blue-500/30 !border-blue-400 ring-1 ring-blue-400' : ''} 
        `}
        style={rowStyle}
        onClick={(e) => onSelect(e, node)}
        onContextMenu={(e) => onContextMenu && onContextMenu(e, node)}
        onDoubleClick={(e) => {
          if (isFolder) {
            e.stopPropagation();
            onToggleExpand(node.id);
          }
        }}
      >
        <span 
          className="w-5 h-5 flex items-center justify-center mr-1 hover:bg-gray-700 rounded transition-colors"
          onClick={(e) => {
            if (isFolder) {
              e.stopPropagation();
              onToggleExpand(node.id);
            }
          }}
        >
          {isFolder && (
            isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          )}
        </span>

        <span className="mr-2 opacity-80">
          {isFolder ? (
             isExpanded ? <FolderOpen className="w-4 h-4 text-blue-400" /> : <Folder className="w-4 h-4 text-blue-400" />
          ) : (
             IconComponent ? <IconComponent className="w-4 h-4 text-gray-400 group-hover:text-gray-300" /> : null
          )}
        </span>

        {renamingNodeId === node.id ? (
          <input
            autoFocus
            defaultValue={node.name}
            onFocus={(e) => {
              const lastDot = e.target.value.lastIndexOf('.');
              if (lastDot > 0) e.target.setSelectionRange(0, lastDot);
              else e.target.select();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.target.blur();
              if (e.key === 'Escape') {
                e.target.value = node.name;
                e.target.blur();
              }
            }}
            onBlur={(e) => onRenameSubmit(node, e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.stopPropagation()}
            className="flex-1 bg-gray-900 border border-blue-500 rounded px-1 py-0.5 text-sm min-w-0 outline-none text-gray-200"
          />
        ) : (
          <span 
            className={`truncate flex-1 ${effectiveVis === 'hidden' ? 'line-through decoration-gray-500' : ''}`} 
            title={node.path}
          >
            {node.name}
          </span>
        )}

        {isRoot && (
          <span className="ml-2 px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider text-blue-400 bg-blue-900/30 rounded border border-blue-800/50">
            Root
          </span>
        )}

        {isBinaryDisabled ? (
           <div className="ml-2 p-1 text-gray-700 flex items-center justify-center shrink-0 cursor-not-allowed" title={tooltipText}>
              <EyeOff className="w-3.5 h-3.5" />
           </div>
        ) : (
          <button
            onClick={(e) => {
               e.stopPropagation();
               const isCascade = e.altKey; 
               onToggleVisibility(node.id, intrinsicVis, isCascade);
            }}
            className={`ml-2 rounded transition-all shrink-0 flex items-center justify-center
              ${isOverridden 
                ? 'px-1.5 py-0.5 bg-gray-800/80 border border-gray-700/80 hover:bg-gray-700 opacity-100' 
                : intrinsicVis === 'full' 
                  ? 'p-1 text-gray-500 hover:text-white hover:bg-gray-600 opacity-0 group-hover:opacity-100'
                  : intrinsicVis === 'outline'
                    ? 'p-1 text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20 opacity-100'
                    : 'p-1 text-red-400 bg-red-400/10 hover:bg-red-400/20 opacity-100'
              }
            `}
            title={tooltipText}
          >
            <div className="flex items-center">
               <span className={`flex items-center justify-center ${isOverridden ? 'opacity-50' : ''}`}>
                  {intrinsicVis === 'full' && <Eye className="w-3.5 h-3.5" />}
                  {intrinsicVis === 'outline' && <LayoutList className="w-3.5 h-3.5" />}
                  {intrinsicVis === 'hidden' && <EyeOff className="w-3.5 h-3.5" />}
               </span>
               
               {isOverridden && (
                  <>
                     <ArrowRight className="w-3 h-3 text-gray-500 mx-0.5 shrink-0" />
                     <span className={`flex items-center justify-center ${effectiveVis === 'hidden' ? 'text-red-400' : 'text-yellow-500'}`}>
                        {effectiveVis === 'outline' && <LayoutList className="w-3.5 h-3.5" />}
                        {effectiveVis === 'hidden' && <EyeOff className="w-3.5 h-3.5" />}
                     </span>
                  </>
               )}
            </div>
          </button>
        )}
      </div>

      {isFolder && isExpanded && node.children && (
        <div className="flex flex-col">
          {node.children.map((childNode) => (
            <FileTreeItem 
              key={childNode.id} 
              node={childNode} 
              level={level + 1} 
              selectedIds={selectedIds}
              expandedFolders={expandedFolders}
              parentEffectiveVis={effectiveVis}
              visibilityMap={visibilityMap} 
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
              onToggleVisibility={onToggleVisibility}
              onContextMenu={onContextMenu}
              renamingNodeId={renamingNodeId}
              onRenameSubmit={onRenameSubmit}
              onDropTarget={onDropTarget} 
            />
          ))}
        </div>
      )}
    </div>
  );
});

export default FileTreeItem;