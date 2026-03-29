import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { normalizePath, isSubPath, findNodeById, isTextFile } from '../utils/fileTreeUtils';

import ConfirmDialog from './common/ConfirmDialog';
import ContextMenu from './workspace/ContextMenu';
import WorkspaceModals from './workspace/WorkspaceModals';
import Sidebar from './workspace/Sidebar';
import HistoryPanel from './workspace/HistoryPanel';
import WorkspaceMain from './workspace/WorkspaceMain';
import { useFileWatcher } from '../hooks/useFileWatcher';
import { useTreeSelection } from '../hooks/useTreeSelection';

export default function ProjectWorkspace({ project, onUpdateNodes, onUpdateProject }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => { const saved = localStorage.getItem('ui_sidebarWidth'); return saved ? parseInt(saved, 10) : 320; });
  const[isResizing, setIsResizing] = useState(false);
  const [historyWidth, setHistoryWidth] = useState(() => { const saved = localStorage.getItem('ui_historyWidth'); return saved ? parseInt(saved, 10) : 300; });
  const[isResizingHistory, setIsResizingHistory] = useState(false);

  useEffect(() => { localStorage.setItem('ui_sidebarWidth', sidebarWidth.toString()); }, [sidebarWidth]);
  useEffect(() => { localStorage.setItem('ui_historyWidth', historyWidth.toString()); }, [historyWidth]);

  const[notification, setNotification] = useState(null);
  const[contextMenu, setContextMenu] = useState(null);
  const [clipboard, setClipboard] = useState(null);
  const [renamingNodeId, setRenamingNodeId] = useState(null);
  const[confirmModal, setConfirmModal] = useState(null);
  const [conflictModal, setConflictModal] = useState(null);
  const [removeRootNode, setRemoveRootNode] = useState(null);
  const [emptyRootNode, setEmptyRootNode] = useState(null);
  const [newPresetModal, setNewPresetModal] = useState(false);
  const[newPresetName, setNewPresetName] = useState('');
  const [deletePresetModal, setDeletePresetModal] = useState(null);

  const isMac = navigator.userAgent.includes('Mac');
  const presets = project.presets ||[];
  const activePreset = presets.find(p => p.id === project.activePresetId) || presets[0] || { id: 'temp', name: 'Default', visibilityMap: {}, expandedFolders:[] };
  const visibilityMap = activePreset.visibilityMap || {};
  const expandedFolders = useMemo(() => new Set(activePreset.expandedFolders || []),[activePreset.expandedFolders]);

  const [isMounting, setIsMounting] = useState(true);
  const [projectMeta, setProjectMeta] = useState({});

  useEffect(() => {
    if (project.rootPath && window.electronAPI.readProjectMeta) {
      window.electronAPI.readProjectMeta(project.rootPath).then(meta => {
         const validPaths = new Set();
         const populateValidPaths = (nodes) => {
            for (const n of nodes) {
               validPaths.add(n.path.replace(/\\/g, '/'));
               if (n.children) populateValidPaths(n.children);
            }
         };
         populateValidPaths(project.nodes);

         const cleanedMeta = {};
         let changed = false;
         for (const [key, desc] of Object.entries(meta)) {
            if (validPaths.has(key)) cleanedMeta[key] = desc;
            else changed = true;
         }

         if (changed) window.electronAPI.writeProjectMeta(project.rootPath, cleanedMeta);
         setProjectMeta(cleanedMeta);
      });
    }
  }, [project.rootPath]); 

  const handleNodeRename = useCallback((oldPath, newPath) => {
    const normOld = oldPath.replace(/\\/g, '/'); const normNew = newPath.replace(/\\/g, '/');
    onUpdateProject(prev => {
      const newPresets = (prev.presets ||[]).map(p => {
        if (!p.visibilityMap) return p;
        const newMap = { ...p.visibilityMap }; let changed = false;
        for (const[key, vis] of Object.entries(newMap)) {
          if (key === normOld || key.startsWith(normOld + '/')) {
            const updatedKey = key === normOld ? normNew : normNew + key.slice(normOld.length);
            newMap[updatedKey] = vis; delete newMap[key]; changed = true;
          }
        }
        return changed ? { ...p, visibilityMap: newMap } : p;
      });
      return { presets: newPresets };
    });
    setProjectMeta(prev => {
       const newMeta = { ...prev }; let changed = false;
       for (const [key, desc] of Object.entries(newMeta)) {
           if (key === normOld || key.startsWith(normOld + '/')) {
               const updatedKey = key === normOld ? normNew : normNew + key.slice(normOld.length);
               newMeta[updatedKey] = desc; delete newMeta[key]; changed = true;
           }
       }
       if (changed && project.rootPath) window.electronAPI.writeProjectMeta(project.rootPath, newMeta);
       return newMeta;
    });
  }, [onUpdateProject, project.rootPath]);

  const handleNodeDelete = useCallback((deletedPath) => {
    const normDeleted = deletedPath.replace(/\\/g, '/');
    onUpdateProject(prev => {
      const newPresets = (prev.presets || []).map(p => {
        if (!p.visibilityMap) return p;
        const newMap = { ...p.visibilityMap };
        let changed = false;
        for (const key of Object.keys(newMap)) {
          if (key === normDeleted || key.startsWith(normDeleted + '/')) {
            delete newMap[key];
            changed = true;
          }
        }
        return changed ? { ...p, visibilityMap: newMap } : p;
      });
      return { presets: newPresets };
    });

    setProjectMeta(prev => {
       const newMeta = { ...prev };
       let changed = false;
       for (const key of Object.keys(newMeta)) {
           if (key === normDeleted || key.startsWith(normDeleted + '/')) {
               delete newMeta[key];
               changed = true;
           }
       }
       if (changed && project.rootPath) {
           window.electronAPI.writeProjectMeta(project.rootPath, newMeta);
       }
       return newMeta;
    });
  }, [onUpdateProject, project.rootPath]);

  const { isWatcherReady } = useFileWatcher(project, onUpdateNodes, handleNodeRename, handleNodeDelete);
  const { selectedIds, setSelectedIds, lastSelectedId, setLastSelectedId, handleSelect, getVisibleNodes } = useTreeSelection(project.nodes, expandedFolders);

  useEffect(() => {
    const timer = setTimeout(() => setIsMounting(false), 50); return () => clearTimeout(timer);
  },[]);

  const isWorkspaceReady = isWatcherReady && !isMounting;
  const startResizing = useCallback(() => setIsResizing(true),[]); const stopResizing = useCallback(() => setIsResizing(false),[]);
  const startResizingHistory = useCallback(() => setIsResizingHistory(true), []); const stopResizingHistory = useCallback(() => setIsResizingHistory(false),[]);
  const resize = useCallback((mouseMoveEvent) => {
    if (isResizing) setSidebarWidth(Math.max(200, Math.min(mouseMoveEvent.clientX, 800)));
    else if (isResizingHistory) setHistoryWidth(Math.max(200, Math.min(window.innerWidth - mouseMoveEvent.clientX, 800)));
  },[isResizing, isResizingHistory]);

  useEffect(() => {
    window.addEventListener('mousemove', resize); window.addEventListener('mouseup', stopResizing); window.addEventListener('mouseup', stopResizingHistory);
    if (isResizing || isResizingHistory) { document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; } 
    else { document.body.style.cursor = ''; document.body.style.userSelect = ''; }
    const closeContextMenu = (e) => { if (contextMenu && e.target && e.target.closest && !e.target.closest('#project-context-menu')) setContextMenu(null); };
    window.addEventListener('mousedown', closeContextMenu, { capture: true });
    return () => {
      window.removeEventListener('mousemove', resize); window.removeEventListener('mouseup', stopResizing); window.removeEventListener('mouseup', stopResizingHistory);
      window.removeEventListener('mousedown', closeContextMenu, { capture: true });
      document.body.style.cursor = ''; document.body.style.userSelect = '';
    };
  },[resize, stopResizing, stopResizingHistory, contextMenu, isResizing, isResizingHistory]);

  const showNotification = useCallback((message) => { setNotification(message); setTimeout(() => setNotification(null), 4000); },[]);

  const confirmAddPreset = () => {
    if (!newPresetName.trim()) return;
    const newPreset = { id: window.crypto.randomUUID(), name: newPresetName.trim(), visibilityMap: {}, expandedFolders: [] };
    onUpdateProject(prev => ({ presets:[...(prev.presets || []), newPreset], activePresetId: newPreset.id }));
    setNewPresetModal(false); setNewPresetName('');
  };

  const handleDropTarget = useCallback((sourceIds, targetNode) => {
    const sourceNodes = sourceIds.map(id => findNodeById(project.nodes, id)).filter(Boolean); if (sourceNodes.length === 0) return;
    const targetDir = targetNode.type === 'folder' ? targetNode.path : targetNode.path.substring(0, Math.max(targetNode.path.lastIndexOf('/'), targetNode.path.lastIndexOf('\\')));
    const invalidMove = sourceNodes.some(src => { if (src.id === targetNode.id) return true; if (src.type === 'folder' && isSubPath(src.path, targetDir)) return true; return false; });
    if (invalidMove) { showNotification("Cannot move a folder into itself or its subfolder."); return; }
    const sameDir = sourceNodes.every(src => {
      const srcDir = src.path.substring(0, Math.max(src.path.lastIndexOf('/'), src.path.lastIndexOf('\\')));
      return normalizePath(srcDir) === normalizePath(targetDir);
    });
    if (sameDir) return;
    setConfirmModal({ action: 'cut', nodes: sourceNodes, targetDir, targetNode });
  }, [project.nodes, showNotification]);

  const processNewItems = async (type) => {
    const newNodes = type === 'files' ? await window.electronAPI.selectFiles() : await window.electronAPI.selectFolders();
    if (!newNodes || newNodes.length === 0) return;
    const newPaths = newNodes.map(n => n.path);
    onUpdateProject(prev => {
       const existing = new Set([...(prev.foreignPaths || []), prev.rootPath]);
       const addedPaths = newPaths.filter(p => !existing.has(p));
       const addedNodes = newNodes.filter(n => !existing.has(n.path)).map(n => ({...n, isForeign: true}));
       if (addedPaths.length > 0) return { foreignPaths: [...(prev.foreignPaths || []), ...addedPaths], nodes: [...prev.nodes, ...addedNodes] };
       return prev;
    });
  };

  const handleToggleVisibility = useCallback((clickedNodeId, nextVis, isCascade = false) => {
    const targetIds = selectedIds.has(clickedNodeId) ? selectedIds : new Set([clickedNodeId]); 
    let updates = {};

    const updateTree = (nodes, cascadeOverride = false) => {
      let treeChanged = false;
      const newNodes = nodes.map(node => {
        const isTarget = targetIds.has(node.id); 
        const shouldCascade = isTarget && isCascade;
        const applyOverride = cascadeOverride || shouldCascade; 
        const isChanging = isTarget || applyOverride;
        
        if (isChanging) {
          const isText = node.type === 'folder' ? true : isTextFile(node.name);
          const defaultVis = isText ? 'full' : 'outline';
          if (nextVis === defaultVis) {
             updates[node.path.replace(/\\/g, '/')] = 'DELETE_FROM_MAP';
          } else {
             updates[node.path.replace(/\\/g, '/')] = nextVis;
          }
        }
        
        let newChildren = node.children; 
        if (node.children) newChildren = updateTree(node.children, applyOverride);
        if (!isChanging && newChildren === node.children) return node;

        treeChanged = true; 
        const newNode = { ...node };
        if (applyOverride) newNode._cascadeUpdate = Date.now(); 
        if (newChildren !== node.children) newNode.children = newChildren;
        return newNode;
      });
      return treeChanged ? newNodes : nodes;
    };

    onUpdateNodes(prev => updateTree(prev));

    onUpdateProject(prev => {
      const activeId = prev.activePresetId; 
      const prevPresets = prev.presets ||[];
      return { 
        presets: prevPresets.map(p => { 
          if (p.id === activeId) { 
            const newMap = { ...(p.visibilityMap || {}) };
            for (const [key, val] of Object.entries(updates)) {
               if (val === 'DELETE_FROM_MAP') { delete newMap[key]; } else { newMap[key] = val; }
            }
            return { ...p, visibilityMap: newMap }; 
          } 
          return p; 
        }) 
      };
    });
  }, [selectedIds, onUpdateNodes, onUpdateProject]);

  const handleToggleExpand = useCallback((nodeId) => {
    onUpdateProject(prev => {
      const currentActiveId = prev.activePresetId; const prevPresets = prev.presets ||[];
      return { presets: prevPresets.map(p => {
          if (p.id === currentActiveId) {
            const nextExpanded = new Set(p.expandedFolders ||[]);
            if (nextExpanded.has(nodeId)) nextExpanded.delete(nodeId); else nextExpanded.add(nodeId);
            return { ...p, expandedFolders: Array.from(nextExpanded) };
          }
          return p;
        })
      };
    });
  }, [onUpdateProject]);

  const handleRename = useCallback((node) => setRenamingNodeId(node.id),[]);
  const submitRename = useCallback(async (node, newName) => {
    setRenamingNodeId(null); if (!newName || newName === node.name) return;
    const res = await window.electronAPI.renameFile(node.path, newName); if (!res?.success) showNotification(`Rename failed: ${res?.error}`);
  }, [showNotification]);

  const handleCut = useCallback((nodes) => setClipboard({ action: 'cut', nodes }),[]); const handleCopy = useCallback((nodes) => setClipboard({ action: 'copy', nodes }),[]);
  const handlePaste = useCallback((targetNode) => {
    if (!clipboard || !clipboard.nodes || clipboard.nodes.length === 0) return;
    const targetDir = targetNode.type === 'folder' ? targetNode.path : targetNode.path.substring(0, Math.max(targetNode.path.lastIndexOf('/'), targetNode.path.lastIndexOf('\\')));
    setConfirmModal({ action: clipboard.action, nodes: clipboard.nodes, targetDir, targetNode });
  }, [clipboard]);

  const confirmPaste = useCallback(async () => {
    if (!confirmModal) return; const { action, nodes, targetDir } = confirmModal; setConfirmModal(null);
    let overwriteAll = false; let skipAll = false; const isMultiple = nodes.length > 1;
    for (const node of nodes) {
      const fileName = node.name; const newPath = await window.electronAPI.joinPath(targetDir, fileName); let shouldOverwrite = overwriteAll;
      if (!overwriteAll && !skipAll) {
        const exists = await window.electronAPI.fileExists(newPath);
        if (exists) {
          const choice = await new Promise(resolve => { setConflictModal({ title: action === 'cut' ? 'Move Files/Directories' : 'Copy Files/Directories', message: `File '${fileName}' already exists in directory.`, isMultiple, onResolve: resolve }); });
          setConflictModal(null);
          if (choice === 'overwrite_all') { overwriteAll = true; shouldOverwrite = true; } else if (choice === 'skip_all') { skipAll = true; continue; } else if (choice === 'skip') continue; else if (choice === 'overwrite') shouldOverwrite = true; else if (choice === 'cancel') break;
        }
      } else if (skipAll) { const exists = await window.electronAPI.fileExists(newPath); if (exists) continue; }
      let res; if (action === 'copy') res = await window.electronAPI.copyFile(node.path, targetDir, shouldOverwrite); else res = await window.electronAPI.moveFile(node.path, targetDir, shouldOverwrite);
      if (!res.success) showNotification(`${action === 'copy' ? 'Copy' : 'Move'} failed for ${fileName}: ${res.error}`);
    }
    if (action === 'cut') setClipboard(null);
  },[confirmModal, showNotification]);

  const handleDelete = useCallback(async (node) => {
    if (node.path === project.rootPath) { setEmptyRootNode(node); return; }
    const res = await window.electronAPI.deleteFile(node.path);
    if (!res.success) showNotification(`Delete failed: ${res.error}`);
  }, [project.rootPath, showNotification]);

  const handleContextMenu = useCallback((e, node) => {
    e.preventDefault(); e.stopPropagation();
    if (!selectedIds.has(node.id)) { setSelectedIds(new Set([node.id])); setLastSelectedId(node.id); }
    const menuWidth = 224; const menuHeight = 220; let { clientX: x, clientY: y } = e;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;
    const isRoot = project.nodes.some(n => n.id === node.id);
    setContextMenu({ x, y, node, isRoot });
  },[selectedIds, setSelectedIds, setLastSelectedId, project.nodes]);

  const handleMenuAction = (action) => {
    if (action === 'remove-root') { setRemoveRootNode(contextMenu.node); setContextMenu(null); return; }
    const isMulti = selectedIds.has(contextMenu.node.id) && selectedIds.size > 1;
    const targetNodes = isMulti ? [...selectedIds].map(id => findNodeById(project.nodes, id)).filter(Boolean) : [contextMenu.node];
    if (action === 'cut') handleCut(targetNodes); if (action === 'copy') handleCopy(targetNodes);
    if (action === 'delete') targetNodes.forEach(n => handleDelete(n));
    if (action === 'rename') handleRename(contextMenu.node); if (action === 'paste') handlePaste(contextMenu.node);
    setContextMenu(null);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isWorkspaceReady) return; if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      if (isCmdOrCtrl && e.code === 'KeyA') {
        e.preventDefault(); const visibleNodes = getVisibleNodes(project.nodes, expandedFolders);
        setSelectedIds(new Set(visibleNodes.map(n => n.id))); return;
      }
      const targetNodeId = lastSelectedId || [...selectedIds][0]; if (!targetNodeId) return;
      const node = findNodeById(project.nodes, targetNodeId); if (!node) return;

      if (e.key === 'F2') { e.preventDefault(); handleRename(node); } 
      else if (isCmdOrCtrl && e.key.toLowerCase() === 'x') { e.preventDefault(); const nodesToCut = [...selectedIds].map(id => findNodeById(project.nodes, id)).filter(Boolean); if (nodesToCut.length) handleCut(nodesToCut); } 
      else if (isCmdOrCtrl && e.key.toLowerCase() === 'c') { e.preventDefault(); const nodesToCopy =[...selectedIds].map(id => findNodeById(project.nodes, id)).filter(Boolean); if (nodesToCopy.length) handleCopy(nodesToCopy); } 
      else if (isCmdOrCtrl && e.key.toLowerCase() === 'v') { e.preventDefault(); handlePaste(node); } 
      else if (e.key === 'Delete' || (isMac && e.key === 'Backspace' && e.metaKey)) { e.preventDefault(); selectedIds.forEach(id => { const n = findNodeById(project.nodes, id); if (n) handleDelete(n); }); }
    };
    window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown);
  },[project.nodes, expandedFolders, getVisibleNodes, selectedIds, lastSelectedId, clipboard, handleRename, handleCut, handleCopy, handlePaste, handleDelete, isMac, setSelectedIds, isWorkspaceReady]);

  return (
    <div className="flex flex-col h-full w-full relative">
      {isMounting && (
        <div className="absolute inset-0 z-[200] flex flex-col items-center justify-center bg-gray-950">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
          <div className="text-gray-400 font-medium">Loading Workspace...</div>
        </div>
      )}

      {notification && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center bg-gray-800 border border-yellow-500/50 text-yellow-200 px-4 py-2.5 rounded shadow-xl animate-bounce-in">
          <AlertCircle className="w-4 h-4 mr-2 text-yellow-500 shrink-0" />
          <span className="text-sm font-medium">{notification}</span>
        </div>
      )}

      <div className="flex flex-1 min-h-0 relative">
        <Sidebar
          width={sidebarWidth} project={project} presets={presets} activePreset={activePreset} visibilityMap={visibilityMap} expandedFolders={expandedFolders} selectedIds={selectedIds} setSelectedIds={setSelectedIds} renamingNodeId={renamingNodeId} isWorkspaceReady={isWorkspaceReady} scanProgress={{count: 0}} onUpdateProject={onUpdateProject} processNewItems={processNewItems} onSelect={handleSelect} onToggleExpand={handleToggleExpand} onToggleVisibility={handleToggleVisibility} onContextMenu={handleContextMenu} onRenameSubmit={submitRename} onDropTarget={handleDropTarget} onRemoveRoot={(node) => setRemoveRootNode(node)} setNewPresetModal={setNewPresetModal} setDeletePresetModal={setDeletePresetModal}
        />

        <div className="relative z-10 flex shrink-0 w-0">
          <div className="absolute top-0 bottom-0 -left-[2px] w-1 bg-transparent hover:bg-blue-500 cursor-col-resize transition-colors" onMouseDown={startResizing} />
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-gray-950 relative">
          {!isMounting && (
            <WorkspaceMain project={project} onUpdateProject={onUpdateProject} isWorkspaceReady={isWorkspaceReady} showNotification={showNotification} />
          )}
        </div>

        <div className="relative z-10 flex shrink-0 w-0">
          <div className="absolute top-0 bottom-0 -left-[2px] w-1 bg-transparent hover:bg-blue-500 cursor-col-resize transition-colors" onMouseDown={startResizingHistory} />
        </div>

        <HistoryPanel width={historyWidth} />
      </div>

      <ContextMenu contextMenu={contextMenu} selectedIds={selectedIds} clipboard={clipboard} onAction={handleMenuAction} isMac={isMac} />

      <WorkspaceModals confirmModal={confirmModal} setConfirmModal={setConfirmModal} confirmPaste={confirmPaste} conflictModal={conflictModal} newPresetModal={newPresetModal} setNewPresetModal={setNewPresetModal} newPresetName={newPresetName} setNewPresetName={setNewPresetName} confirmAddPreset={confirmAddPreset} />

      <ConfirmDialog
        isOpen={!!deletePresetModal} title="Delete Preset"
        message={`Are you sure you want to delete the preset "${deletePresetModal?.name}"?\nThis action cannot be undone.`} confirmText="Delete Preset" confirmStyle="danger"
        onConfirm={() => {
          onUpdateProject(prev => {
            const prevPresets = prev.presets ||[]; const newPresets = prevPresets.filter(p => p.id !== deletePresetModal.id);
            return { presets: newPresets, activePresetId: prev.activePresetId === deletePresetModal.id ? newPresets[0].id : prev.activePresetId };
          });
          setDeletePresetModal(null);
        }}
        onCancel={() => setDeletePresetModal(null)}
      />

      <ConfirmDialog
        isOpen={!!removeRootNode} title="Remove Folder from Project"
        message={`Are you sure you want to remove "${removeRootNode?.name}" from this project?\n\nThis will NOT delete the folder from your computer.`} confirmText="Remove from Project" confirmStyle="danger"
        onConfirm={() => {
          handleNodeDelete(removeRootNode.path);
          onUpdateProject(prev => {
            const isForeign = removeRootNode.isForeign;
            return {
              nodes: prev.nodes.filter(n => n.id !== removeRootNode.id),
              foreignPaths: isForeign ? prev.foreignPaths.filter(fp => fp !== removeRootNode.path) : prev.foreignPaths
            };
          });
          setRemoveRootNode(null);
        }}
        onCancel={() => setRemoveRootNode(null)}
      />

      <ConfirmDialog
        isOpen={!!emptyRootNode} title="Empty Project Directory"
        message={`WARNING: You are attempting to delete the main root folder "${emptyRootNode?.name}".\n\nFor safety, Prompt Studio will NOT delete the main folder itself. Instead, this will PERMANENTLY DELETE ALL CONTENTS inside it (except the .prompt_studio data).\n\nDo you wish to proceed and empty the directory?`} confirmText="Empty Contents Permanently" confirmStyle="danger"
        onConfirm={async () => {
          const res = await window.electronAPI.emptyDirectory(emptyRootNode.path);
          if (!res.success) showNotification(`Failed to empty project folder: ${res.error}`); else showNotification("Project contents have been cleared.");
          setEmptyRootNode(null);
        }}
        onCancel={() => setEmptyRootNode(null)}
      />
    </div>
  );
}

