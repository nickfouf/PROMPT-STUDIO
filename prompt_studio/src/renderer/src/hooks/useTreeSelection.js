import { useState, useCallback } from 'react';

export function useTreeSelection(projectNodes, expandedFolders) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [lastSelectedId, setLastSelectedId] = useState(null);

  const getVisibleNodes = useCallback((nodes, expanded) => {
    let visible = [];
    const traverse = (list) => {
      for (const node of list) {
        visible.push(node);
        if (node.type === 'folder' && expanded.has(node.id) && node.children) {
          traverse(node.children);
        }
      }
    };
    traverse(nodes);
    return visible;
  }, []);

  const handleSelect = useCallback((e, node) => {
    e.stopPropagation();
    const visibleNodes = getVisibleNodes(projectNodes, expandedFolders);
    const isMulti = e.metaKey || e.ctrlKey;
    const isShift = e.shiftKey;

    let newSelection = new Set(selectedIds);

    if (isShift && lastSelectedId) {
      const currentIndex = visibleNodes.findIndex(n => n.id === node.id);
      const lastIndex = visibleNodes.findIndex(n => n.id === lastSelectedId);

      if (currentIndex !== -1 && lastIndex !== -1) {
        const start = Math.min(currentIndex, lastIndex);
        const end = Math.max(currentIndex, lastIndex);

        if (!isMulti) newSelection.clear();
        for (let i = start; i <= end; i++) newSelection.add(visibleNodes[i].id);
      } else {
        newSelection.clear(); newSelection.add(node.id);
      }
    } else if (isMulti) {
      if (newSelection.has(node.id)) newSelection.delete(node.id);
      else newSelection.add(node.id);
      setLastSelectedId(node.id);
    } else {
      newSelection.clear(); newSelection.add(node.id);
      setLastSelectedId(node.id);
    }

    setSelectedIds(newSelection);
  }, [projectNodes, expandedFolders, selectedIds, lastSelectedId, getVisibleNodes]);

  return { selectedIds, setSelectedIds, lastSelectedId, setLastSelectedId, handleSelect, getVisibleNodes };
}





