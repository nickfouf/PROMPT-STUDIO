// AI Prompt Builder 2/my-app/src/renderer/src/hooks/useFileWatcher.js
import { useEffect, useState } from 'react';
import { normalizePath, findNode, updateChildrenPaths } from '../utils/fileTreeUtils';


export function useFileWatcher(project, onUpdateNodes) {
  const [isWatcherReady, setIsWatcherReady] = useState(false);
  const [scanProgress, setScanProgress] = useState({ count: 0, path: '' });

  // Watch workspace roots
  useEffect(() => {
    let isMounted = true;
    setIsWatcherReady(false);
    setScanProgress({ count: 0, path: '' });

    if (window.electronAPI.onScanProgress) {
      window.electronAPI.onScanProgress((data) => {
        if (isMounted) setScanProgress(data);
      });
    }

    if (project && project.nodes && project.nodes.length > 0) {
      const rootPaths = project.nodes.map(n => n.path);
      
      // Fire watcher and wait for it to be ready
      window.electronAPI.watchWorkspace(rootPaths)
        .then(() => {
          if (isMounted) setIsWatcherReady(true);
        })
        .catch(err => {
          console.error("Watcher initialization error:", err);
          if (isMounted) setIsWatcherReady(true); // Failsafe proceed
        });
    } else {
      setIsWatcherReady(true);
    }

    return () => {
      isMounted = false;
      // Terminate memory leaks / background file watchers when project unmounts
      window.electronAPI.watchWorkspace([]);
    };
  }, [project?.id, project?.nodes?.length]);

  // Handle ephemeral delete states cleanup
  useEffect(() => {
    // Reduced frequency from 250ms to 1000ms to free up React Render Thread
    const interval = setInterval(() => {
      if (!project?.nodes) return;
      let needsCleanup = false;

      const checkNeedsCleanup = (nodes) => {
        for (const n of nodes) {
          if (n._pendingDelete && Date.now() - (n._event?.ts || 0) > 500) {
            needsCleanup = true;
            return;
          }
          if (n.children && n.children.length > 0) {
            checkNeedsCleanup(n.children);
            if (needsCleanup) return;
          }
        }
      };

      checkNeedsCleanup(project.nodes);

      if (needsCleanup) {
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
  }, [project, onUpdateNodes]);

  // Handle incoming file events from Electron
  useEffect(() => {
    const handleFileEvent = (events) => {
      onUpdateNodes(prevNodes => {
        const eventBatch = Array.isArray(events) ? events : [events];
        if (eventBatch.length === 0) return prevNodes;

        const processedBatch = eventBatch.map(e => ({ ...e }));
        const adds = processedBatch.filter(e => e.action === 'add' || e.action === 'addDir');

        adds.forEach(addEv => {
          const unlink = processedBatch.find(e =>
            (e.action === 'unlink' || e.action === 'unlinkDir') && e.type === addEv.type
          );

          if (unlink) {
            addEv.action = addEv.action === 'add' ? 'rename' : 'renameDir';
            addEv.oldPath = unlink.filePath;

            const oldNode = findNode(prevNodes, unlink.filePath);
            if (oldNode) {
              addEv.preservedId = oldNode.id;
              if (oldNode.children) {
                addEv.preservedChildren = updateChildrenPaths(oldNode.children, unlink.filePath, addEv.filePath);
              }
            }
            unlink.action = 'hard-unlink';
          }
        });

        let currentTree = prevNodes;
        let treeChanged = false;

        for (const eventData of processedBatch) {
          const { action, filePath, type } = eventData;
          const normalizedFilePath = normalizePath(filePath);
          const parentPath = normalizedFilePath.substring(0, normalizedFilePath.lastIndexOf('/'));
          const itemName = normalizedFilePath.substring(normalizedFilePath.lastIndexOf('/') + 1);

          const walkAndApply = (nodes) => {
            let hasChanges = false;
            const newNodes = nodes.map(node => {
              const normalizedNodePath = normalizePath(node.path);

              if (action === 'hard-unlink' && normalizedNodePath === normalizedFilePath) {
                hasChanges = true; return null;
              }

              if ((action === 'unlink' || action === 'unlinkDir') && normalizedNodePath === normalizedFilePath) {
                hasChanges = true;
                return { ...node, _pendingDelete: true, _event: { type: action, ts: Date.now() } };
              }

              if ((action === 'add' || action === 'addDir' || action === 'rename' || action === 'renameDir') && node.type === 'folder' && normalizedNodePath === parentPath) {
                const existingIndex = node.children?.findIndex(c => normalizePath(c.path) === normalizedFilePath);
                if (existingIndex === -1 || existingIndex === undefined) {
                  hasChanges = true;
                  const newItem = {
                    id: eventData.preservedId || window.crypto.randomUUID(),
                    name: itemName, path: filePath, type: type,
                    _event: { type: action, ts: Date.now() },
                    ...(type === 'folder' ? { children: eventData.preservedChildren || [] } : {})
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
        }
        return treeChanged ? currentTree : prevNodes;
      });
    };

    
    window.electronAPI.onFileEvent(handleFileEvent);
  }, [onUpdateNodes]);

  return { isWatcherReady, scanProgress };
}







