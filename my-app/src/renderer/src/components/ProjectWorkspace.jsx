import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import { normalizePath, isSubPath, findNodeById } from '../utils/fileTreeUtils';

import ConfirmDialog from './common/ConfirmDialog';
import ContextMenu from './workspace/ContextMenu';
import WorkspaceModals from './workspace/WorkspaceModals';
import Sidebar from './workspace/Sidebar';
import HistoryPanel from './workspace/HistoryPanel';
import PromptEditor from './workspace/PromptEditor';
import WorkspaceMain from './workspace/WorkspaceMain';
import { useFileWatcher } from '../hooks/useFileWatcher';
import { useTreeSelection } from '../hooks/useTreeSelection';

export default function ProjectWorkspace({ project, onUpdateNodes, onUpdateProject }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('ui_sidebarWidth');
    return saved ? parseInt(saved, 10) : 320;
  });
  const [isResizing, setIsResizing] = useState(false);

  const [historyWidth, setHistoryWidth] = useState(() => {
    const saved = localStorage.getItem('ui_historyWidth');
    return saved ? parseInt(saved, 10) : 300;
  });
  const [isResizingHistory, setIsResizingHistory] = useState(false);

  useEffect(() => {
    localStorage.setItem('ui_sidebarWidth', sidebarWidth.toString());
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem('ui_historyWidth', historyWidth.toString());
  }, [historyWidth]);

  const [notification, setNotification] = useState(null);

  // Context Menu & File Ops State
  const [contextMenu, setContextMenu] = useState(null);
  const [clipboard, setClipboard] = useState(null);
  const [renamingNodeId, setRenamingNodeId] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const [conflictModal, setConflictModal] = useState(null);

  // Preset Modal State
  const [newPresetModal, setNewPresetModal] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [deletePresetModal, setDeletePresetModal] = useState(null);

  const isMac = navigator.userAgent.includes('Mac');

  // Extract Active Preset Environment
  const presets = project.presets || [];
  const activePreset = presets.find(p => p.id === project.activePresetId) || presets[0] || { id: 'temp', name: 'Default', visibilityMap: {}, expandedFolders: [] };
  const visibilityMap = activePreset.visibilityMap || {};
  const expandedFolders = useMemo(() => new Set(activePreset.expandedFolders || []), [activePreset.expandedFolders]);


  // Loading & Initialization State
  const [isMounting, setIsMounting] = useState(true);

  // Hooks
  const { isWatcherReady, scanProgress } = useFileWatcher(project, onUpdateNodes);
  const { selectedIds, setSelectedIds, lastSelectedId, setLastSelectedId, handleSelect, getVisibleNodes } = useTreeSelection(project.nodes, expandedFolders);

  // Defer slightly to decouple Dashboard unmount from DOM mount computations
  useEffect(() => {
    const timer = setTimeout(() => setIsMounting(false), 50);
    return () => clearTimeout(timer);
  }, []);

  const isWorkspaceReady = isWatcherReady && !isMounting;

    const startResizing = useCallback(() => setIsResizing(true), []);
  const stopResizing = useCallback(() => setIsResizing(false), []);

  const startResizingHistory = useCallback(() => setIsResizingHistory(true), []);
  const stopResizingHistory = useCallback(() => setIsResizingHistory(false), []);

  const resize = useCallback((mouseMoveEvent) => {
    if (isResizing) {
      const newWidth = Math.max(200, Math.min(mouseMoveEvent.clientX, 800));
      setSidebarWidth(newWidth);
    } else if (isResizingHistory) {
      const newWidth = Math.max(200, Math.min(window.innerWidth - mouseMoveEvent.clientX, 800));
      setHistoryWidth(newWidth);
    }
  }, [isResizing, isResizingHistory]);


  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    window.addEventListener('mouseup', stopResizingHistory);

    if (isResizing || isResizingHistory) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    const closeContextMenu = (e) => {
      if (contextMenu && e.target && e.target.closest && !e.target.closest('#project-context-menu')) {
        setContextMenu(null);
      }
    };
    window.addEventListener('mousedown', closeContextMenu, { capture: true });

    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      window.removeEventListener('mouseup', stopResizingHistory);
      window.removeEventListener('mousedown', closeContextMenu, { capture: true });
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resize, stopResizing, stopResizingHistory, contextMenu, isResizing, isResizingHistory]);

  const showNotification = useCallback((message) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 4000);
  }, []);

  const confirmAddPreset = () => {
    if (!newPresetName.trim()) return;
    const newPreset = {
      id: window.crypto.randomUUID(),
      name: newPresetName.trim(),
      visibilityMap: {},
      expandedFolders: []
    };
    onUpdateProject(prev => ({
      presets: [...(prev.presets || []), newPreset],
      activePresetId: newPreset.id
    }));
    setNewPresetModal(false);
    setNewPresetName('');
  };

  const handleDropTarget = useCallback((sourceIds, targetNode) => {
    const sourceNodes = sourceIds.map(id => findNodeById(project.nodes, id)).filter(Boolean);
    if (sourceNodes.length === 0) return;

    const targetDir = targetNode.type === 'folder'
      ? targetNode.path
      : targetNode.path.substring(0, Math.max(targetNode.path.lastIndexOf('/'), targetNode.path.lastIndexOf('\\')));

    const invalidMove = sourceNodes.some(src => {
      if (src.id === targetNode.id) return true;
      if (src.type === 'folder' && isSubPath(src.path, targetDir)) return true;
      return false;
    });

    if (invalidMove) {
      showNotification("Cannot move a folder into itself or its subfolder.");
      return;
    }

    const sameDir = sourceNodes.every(src => {
       const srcDir = src.path.substring(0, Math.max(src.path.lastIndexOf('/'), src.path.lastIndexOf('\\')));
       return normalizePath(srcDir) === normalizePath(targetDir);
    });

    if (sameDir) return;

    setConfirmModal({
      action: 'cut',
      nodes: sourceNodes,
      targetDir,
      targetNode
    });
  }, [project.nodes, showNotification]);

  const processNewItems = async (type) => {
    const newNodes = type === 'files'
      ? await window.electronAPI.selectFiles()
      : await window.electronAPI.selectFolders();

    if (!newNodes || newNodes.length === 0) return;

    let ignoredCount = 0;
    const finalNodes = [...project.nodes];

    for (const newNode of newNodes) {
      const isCovered = finalNodes.some(existingRoot => isSubPath(existingRoot.path, newNode.path));

      if (isCovered) {
        ignoredCount++;
      } else {
        const filtered = finalNodes.filter(existing => !isSubPath(newNode.path, existing.path));
        finalNodes.length = 0;
        finalNodes.push(...filtered, { ...newNode });
      }
    }

    if (ignoredCount > 0) {
      showNotification(`${ignoredCount} item(s) ignored because they already exist in the project.`);
    }

    if (finalNodes.length !== project.nodes.length || newNodes.length > ignoredCount) {
      onUpdateNodes(finalNodes);
    }
  };

  const handleToggleVisibility = useCallback((clickedNodeId, currentVis, isCascade = false) => {
    let nextVis = 'full';
    if (currentVis === 'full') nextVis = 'outline';
    else if (currentVis === 'outline') nextVis = 'hidden';
    else if (currentVis === 'hidden') nextVis = 'full';

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
          updates[node.id] = nextVis;
        }

        let newChildren = node.children;
        if (node.children) {
          newChildren = updateTree(node.children, applyOverride);
        }

        if (!isChanging && newChildren === node.children) {
          return node;
        }

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
      const prevPresets = prev.presets || [];
      return {
        presets: prevPresets.map(p => {
          if (p.id === activeId) {
             return { ...p, visibilityMap: { ...(p.visibilityMap || {}), ...updates } };
          }
          return p;
        })
      };
    });

  }, [selectedIds, onUpdateNodes, onUpdateProject]);

  const handleToggleExpand = useCallback((nodeId) => {
    onUpdateProject(prev => {
      const currentActiveId = prev.activePresetId;
      const prevPresets = prev.presets || [];
      return {
        presets: prevPresets.map(p => {
          if (p.id === currentActiveId) {
            const nextExpanded = new Set(p.expandedFolders || []);
            if (nextExpanded.has(nodeId)) nextExpanded.delete(nodeId);
            else nextExpanded.add(nodeId);
            return { ...p, expandedFolders: Array.from(nextExpanded) };
          }
          return p;
        })
      };
    });
  }, [onUpdateProject]);

  // --- File Actions Engine ---
  const handleRename = useCallback((node) => setRenamingNodeId(node.id), []);
  const submitRename = useCallback(async (node, newName) => {
    setRenamingNodeId(null);
    if (!newName || newName === node.name) return;
    const res = await window.electronAPI.renameFile(node.path, newName);
    if (!res?.success) showNotification(`Rename failed: ${res?.error}`);
  }, [showNotification]);

  const handleCut = useCallback((nodes) => setClipboard({ action: 'cut', nodes }), []);
  const handleCopy = useCallback((nodes) => setClipboard({ action: 'copy', nodes }), []);

  const handlePaste = useCallback((targetNode) => {
    if (!clipboard || !clipboard.nodes || clipboard.nodes.length === 0) return;
    const targetDir = targetNode.type === 'folder'
      ? targetNode.path
      : targetNode.path.substring(0, Math.max(targetNode.path.lastIndexOf('/'), targetNode.path.lastIndexOf('\\')));

    setConfirmModal({
      action: clipboard.action,
      nodes: clipboard.nodes,
      targetDir,
      targetNode
    });
  }, [clipboard]);

  const confirmPaste = useCallback(async () => {
    if (!confirmModal) return;
    const { action, nodes, targetDir } = confirmModal;
    setConfirmModal(null);

    let overwriteAll = false;
    let skipAll = false;
    const isMultiple = nodes.length > 1;

    for (const node of nodes) {
      const fileName = node.name;
      const newPath = await window.electronAPI.joinPath(targetDir, fileName);

      let shouldOverwrite = overwriteAll;

      if (!overwriteAll && !skipAll) {
        const exists = await window.electronAPI.fileExists(newPath);
        if (exists) {
          const choice = await new Promise(resolve => {
            setConflictModal({
              title: action === 'cut' ? 'Move Files/Directories' : 'Copy Files/Directories',
              message: `File '${fileName}' already exists in directory.`,
              isMultiple,
              onResolve: resolve
            });
          });

          setConflictModal(null);

          if (choice === 'overwrite_all') {
            overwriteAll = true;
            shouldOverwrite = true;
          } else if (choice === 'skip_all') {
            skipAll = true;
            continue;
          } else if (choice === 'skip') {
            continue;
          } else if (choice === 'overwrite') {
            shouldOverwrite = true;
          } else if (choice === 'cancel') {
            break;
          }
        }
      } else if (skipAll) {
        const exists = await window.electronAPI.fileExists(newPath);
        if (exists) continue;
      }

      let res;
      if (action === 'copy') {
        res = await window.electronAPI.copyFile(node.path, targetDir, shouldOverwrite);
      } else {
        res = await window.electronAPI.moveFile(node.path, targetDir, shouldOverwrite);
      }

      if (!res.success) {
        showNotification(`${action === 'copy' ? 'Copy' : 'Move'} failed for ${fileName}: ${res.error}`);
      }
    }

    if (action === 'cut') setClipboard(null);
  }, [confirmModal, showNotification]);

  const handleDelete = useCallback(async (node) => {
    const res = await window.electronAPI.deleteFile(node.path);
    if (!res.success) showNotification(`Delete failed: ${res.error}`);
  }, [showNotification]);

  const handleContextMenu = useCallback((e, node) => {
    e.preventDefault();
    e.stopPropagation();

    if (!selectedIds.has(node.id)) {
      setSelectedIds(new Set([node.id]));
      setLastSelectedId(node.id);
    }

    const menuWidth = 224;
    const menuHeight = 220;
    let { clientX: x, clientY: y } = e;

    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;

    setContextMenu({ x, y, node });
  }, [selectedIds, setSelectedIds, setLastSelectedId]);

  const handleMenuAction = (action) => {
    const isMulti = selectedIds.has(contextMenu.node.id) && selectedIds.size > 1;
    const targetNodes = isMulti
      ? [...selectedIds].map(id => findNodeById(project.nodes, id)).filter(Boolean)
      : [contextMenu.node];

    if (action === 'cut') handleCut(targetNodes);
    if (action === 'copy') handleCopy(targetNodes);
    if (action === 'delete') targetNodes.forEach(n => handleDelete(n));
    if (action === 'rename') handleRename(contextMenu.node);
    if (action === 'paste') handlePaste(contextMenu.node);

    setContextMenu(null);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept keybinds if we are currently loading
      if (!isWorkspaceReady) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (isCmdOrCtrl && e.code === 'KeyA') {
        e.preventDefault();
        const visibleNodes = getVisibleNodes(project.nodes, expandedFolders);
        setSelectedIds(new Set(visibleNodes.map(n => n.id)));
        return;
      }

      const targetNodeId = lastSelectedId || [...selectedIds][0];
      if (!targetNodeId) return;

      const node = findNodeById(project.nodes, targetNodeId);
      if (!node) return;

      if (e.key === 'F2') {
        e.preventDefault();
        handleRename(node);
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        const nodesToCut = [...selectedIds].map(id => findNodeById(project.nodes, id)).filter(Boolean);
        if (nodesToCut.length) handleCut(nodesToCut);
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        const nodesToCopy = [...selectedIds].map(id => findNodeById(project.nodes, id)).filter(Boolean);
        if (nodesToCopy.length) handleCopy(nodesToCopy);
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        handlePaste(node);
      } else if (e.key === 'Delete' || (isMac && e.key === 'Backspace' && e.metaKey)) {
        e.preventDefault();
        selectedIds.forEach(id => {
          const n = findNodeById(project.nodes, id);
          if (n) handleDelete(n);
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [project.nodes, expandedFolders, getVisibleNodes, selectedIds, lastSelectedId, clipboard, handleRename, handleCut, handleCopy, handlePaste, handleDelete, isMac, setSelectedIds, isWorkspaceReady]);

    return (
    <div className="flex flex-col h-full w-full relative">


      {/* Loading Overlay */}
      {!isWorkspaceReady && (
        <div className="absolute inset-0 z-[200] flex flex-col items-center justify-center bg-gray-950/95 backdrop-blur-md">
          <div className="flex flex-col items-center w-full max-w-md px-8 text-center">
            <div className="w-12 h-12 border-4 border-blue-600/30 border-t-blue-500 rounded-full animate-spin mb-6 shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
            <h2 className="text-2xl font-bold tracking-wider text-gray-100 mb-2">Loading Workspace</h2>
            <p className="text-blue-400/80 text-sm font-medium animate-pulse mb-6">Scanning files and initializing environment...</p>

            {/* New Progress Indicators */}
            <div className={`transition-opacity duration-300 w-full flex flex-col items-center space-y-3 ${scanProgress.count > 0 ? 'opacity-100' : 'opacity-0'}`}>
              <div className="bg-gray-900 border border-gray-800 rounded-full px-4 py-1.5 shadow-inner">
                <span className="text-sm text-blue-400 font-mono font-medium">
                  {scanProgress.count.toLocaleString()} items scanned
                </span>
              </div>
              {scanProgress.path && (
                <span className="text-[10px] text-gray-500 font-mono truncate w-full px-4" dir="rtl">
                  &lrm;{scanProgress.path}&lrm;
                </span>
              )}
            </div>
          </div>
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
          width={sidebarWidth}
          project={project}
          presets={presets}
          activePreset={activePreset}
          visibilityMap={visibilityMap}
          expandedFolders={expandedFolders}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          renamingNodeId={renamingNodeId}
          isWorkspaceReady={isWorkspaceReady}
          onUpdateProject={onUpdateProject}
          processNewItems={processNewItems}
          onSelect={handleSelect}
          onToggleExpand={handleToggleExpand}
          onToggleVisibility={handleToggleVisibility}
          onContextMenu={handleContextMenu}
          onRenameSubmit={submitRename}
          onDropTarget={handleDropTarget}
          setNewPresetModal={setNewPresetModal}
          setDeletePresetModal={setDeletePresetModal}
        />

        <div className="relative z-10 flex shrink-0 w-0">
          <div
            className="absolute top-0 bottom-0 -left-[2px] w-1 bg-transparent hover:bg-blue-500 cursor-col-resize transition-colors"
            onMouseDown={startResizing}
          />
        </div>

                        <div className="flex-1 flex flex-col min-w-0 bg-gray-950 relative">
          <WorkspaceMain project={project} />
        </div>

        <div className="relative z-10 flex shrink-0 w-0">
          <div
            className="absolute top-0 bottom-0 -left-[2px] w-1 bg-transparent hover:bg-blue-500 cursor-col-resize transition-colors"
            onMouseDown={startResizingHistory}
          />
        </div>

        <HistoryPanel width={historyWidth} />
      </div>

      <div className="shrink-0 w-full border-t border-gray-800 bg-gray-950 relative z-20">
        <PromptEditor
          prompts={project.prompts}
          activePromptId={project.activePromptId}
          onUpdateProject={onUpdateProject}
        />
      </div>

      <ContextMenu
        contextMenu={contextMenu}
        selectedIds={selectedIds}
        clipboard={clipboard}
        onAction={handleMenuAction}
        isMac={isMac}
      />

      <WorkspaceModals
        confirmModal={confirmModal}
        setConfirmModal={setConfirmModal}
        confirmPaste={confirmPaste}
        conflictModal={conflictModal}
        newPresetModal={newPresetModal}
        setNewPresetModal={setNewPresetModal}
        newPresetName={newPresetName}
        setNewPresetName={setNewPresetName}
        confirmAddPreset={confirmAddPreset}
      />

      <ConfirmDialog
        isOpen={!!deletePresetModal}
        title="Delete Preset"
        message={`Are you sure you want to delete the preset "${deletePresetModal?.name}"?\nThis action cannot be undone.`}
        confirmText="Delete Preset"
        confirmStyle="danger"
        onConfirm={() => {
          onUpdateProject(prev => {
            const prevPresets = prev.presets || [];
            const newPresets = prevPresets.filter(p => p.id !== deletePresetModal.id);
            return {
              presets: newPresets,
              activePresetId: prev.activePresetId === deletePresetModal.id ? newPresets[0].id : prev.activePresetId
            };
          });
          setDeletePresetModal(null);
        }}
        onCancel={() => setDeletePresetModal(null)}
      />
    </div>
  );
}



