import { useEffect, useState, useRef } from 'react';
import { normalizePath, findNode, updateChildrenPaths } from '../utils/fileTreeUtils';

export function useFileWatcher(project, onUpdateNodes, onRenameNode, onDeleteNode) {
  const [isWatcherReady, setIsWatcherReady] = useState(false);
  const prevPathsRef = useRef('');

  // Watch workspace roots based ONLY on paths, ignoring visibility/presets
  useEffect(() => {
    let isMounted = true;
    const currentPaths = [project?.rootPath, ...(project?.foreignPaths || [])].filter(Boolean).sort().join('|');

    if (isWatcherReady && prevPathsRef.current === currentPaths) {
      return; // Already watching these exact paths
    }
    
    setIsWatcherReady(false);
    prevPathsRef.current = currentPaths;

    const pathsToWatch = [project?.rootPath, ...(project?.foreignPaths || [])].filter(Boolean);

    if (pathsToWatch.length > 0) {
      window.electronAPI.watchWorkspace({ paths: pathsToWatch })
        .then(() => {
          if (isMounted) setIsWatcherReady(true);
        })
        .catch(err => {
          console.error("Watcher initialization error:", err);
          if (isMounted) setIsWatcherReady(true); 
        });

    } else {
      setIsWatcherReady(true); 
    }

    return () => { isMounted = false; };
  },[project?.rootPath, project?.foreignPaths?.length]);

  useEffect(() => { return () => { window.electronAPI.watchWorkspace({ paths: [] }); }; },[]);

  // Handle ephemeral delete states cleanup
  useEffect(() => {
    const interval = setInterval(() => {
      if (!project?.nodes) return;
      let needsCleanup = false;
      const deletedPaths = [];

      const checkNeedsCleanup = (nodes) => {
        for (const n of nodes) {
          if (n._pendingDelete && Date.now() - (n._event?.ts || 0) > 500) {
            needsCleanup = true;
            deletedPaths.push(n.path);
          }
          if (n.children && n.children.length > 0) {
            checkNeedsCleanup(n.children);
          }
        }
      };

      checkNeedsCleanup(project.nodes);

      if (needsCleanup) {
        if (onDeleteNode) {
            deletedPaths.forEach(p => onDeleteNode(p));
        }

        onUpdateNodes(prevNodes => {
          const cleanNodes = (nodes) => nodes
            .filter(n => !(n._pendingDelete && Date.now() - (n._event?.ts || 0) > 500))
            .map(n => ({
              ...n,
              children: n.children ? cleanNodes(n.children) : undefined
            }));
          return cleanNodes(prevNodes);
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [project, onUpdateNodes, onDeleteNode]);

  // Handle incoming file events from Electron
  useEffect(() => {
    const handleFileEvent = (eventData) => {
      onUpdateNodes(prevNodes => {
        
        // Single event processing since IPC doesn't queue anymore
        let currentTree = prevNodes;
        let treeChanged = false;

        const { action, filePath, type } = eventData;
        const normalizedFilePath = normalizePath(filePath);
        const parentPath = normalizedFilePath.substring(0, normalizedFilePath.lastIndexOf('/'));
        const itemName = normalizedFilePath.substring(normalizedFilePath.lastIndexOf('/') + 1);

        const walkAndApply = (nodes) => {
          let hasChanges = false;
          const newNodes = nodes.map(node => {
            const normalizedNodePath = normalizePath(node.path);

            if ((action === 'unlink' || action === 'unlinkDir') && normalizedNodePath === normalizedFilePath) {
              hasChanges = true;
              return { ...node, _pendingDelete: true, _event: { type: action, ts: Date.now() } };
            }

            if ((action === 'add' || action === 'addDir') && node.type === 'folder' && normalizedNodePath === parentPath) {
              const existingIndex = node.children?.findIndex(c => normalizePath(c.path) === normalizedFilePath);
              if (existingIndex === -1 || existingIndex === undefined) {
                hasChanges = true;
                const newItem = {
                  id: window.crypto.randomUUID(),
                  name: itemName, path: filePath, type: type,
                  _event: { type: action, ts: Date.now() },
                  ...(type === 'folder' ? { children: [] } : {})
                };
                const updatedChildren = [...(node.children || []), newItem].sort((a, b) => {
                  if (a.type === b.type) return a.name.localeCompare(b.name);
                  return a.type === 'folder' ? -1 : 1;
                });
                return { ...node, children: updatedChildren };
              } else {
                hasChanges = true;
                const updatedChildren = [...node.children];
                updatedChildren[existingIndex] = {
                  ...updatedChildren[existingIndex],
                  _pendingDelete: false, _event: { type: action, ts: Date.now() }
                };
                return { ...node, children: updatedChildren };
              }
            }

            if (action === 'change' && normalizedNodePath === normalizedFilePath) {
              hasChanges = true;
              return { ...node, lastModified: Date.now(), _event: { type: action, ts: Date.now() } };
            }

            if (node.type === 'folder' && node.children) {
              const updatedChildren = walkAndApply(node.children);
              if (updatedChildren !== node.children) {
                hasChanges = true; return { ...node, children: updatedChildren };
              }
            }

            return node;
          }).filter(Boolean);

          return hasChanges ? newNodes : nodes;
        };

        const appliedTree = walkAndApply(currentTree);
        if (appliedTree !== currentTree) {
          currentTree = appliedTree; treeChanged = true;
        }
        
        return treeChanged ? currentTree : prevNodes;
      });
    };

    window.electronAPI.onFileEvent(handleFileEvent);
  },[onUpdateNodes, onRenameNode]);

  return { isWatcherReady };
}

