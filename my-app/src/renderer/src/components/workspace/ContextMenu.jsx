import React from 'react';
import { Edit2, Scissors, Copy, Trash2, Clipboard } from 'lucide-react';

const ContextMenuItem = ({ icon, label, shortcut, onClick, className = 'hover:bg-blue-600 hover:text-white text-gray-200' }) => (
  <div
    className={`flex items-center justify-between px-3 py-1.5 mx-1 my-0.5 rounded cursor-pointer transition-colors ${className}`}
    onClick={onClick}
  >
    <div className="flex items-center space-x-2 min-w-0">
      {icon}
      <span className="truncate">{label}</span>
    </div>
    {shortcut && <span className="text-xs opacity-50 tracking-widest ml-4 shrink-0">{shortcut}</span>}
  </div>
);

export default function ContextMenu({ contextMenu, selectedIds, clipboard, onAction, isMac }) {
  if (!contextMenu) return null;

  const shortcutRename = 'F2';
  const shortcutCut = isMac ? '⌘X' : 'Ctrl+X';
  const shortcutCopy = isMac ? '⌘C' : 'Ctrl+C';
  const shortcutPaste = isMac ? '⌘V' : 'Ctrl+V';
  const shortcutDelete = isMac ? '⌫' : 'Del';

  return (
    <div
      id="project-context-menu"
      className="fixed z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl py-1 w-56 text-sm select-none"
      style={{ top: contextMenu.y, left: contextMenu.x, maxHeight: 'calc(100vh - 20px)' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-3 py-1.5 text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 border-b border-gray-700/50">
        Options
      </div>
      {selectedIds.size <= 1 && (
        <ContextMenuItem icon={<Edit2 className="w-4 h-4" />} label="Rename" shortcut={shortcutRename} onClick={() => onAction('rename')} />
      )}
      <ContextMenuItem icon={<Scissors className="w-4 h-4" />} label={`Cut${selectedIds.size > 1 && selectedIds.has(contextMenu.node.id) ? ` (${selectedIds.size})` : ''}`} shortcut={shortcutCut} onClick={() => onAction('cut')} />
      <ContextMenuItem icon={<Copy className="w-4 h-4" />} label={`Copy${selectedIds.size > 1 && selectedIds.has(contextMenu.node.id) ? ` (${selectedIds.size})` : ''}`} shortcut={shortcutCopy} onClick={() => onAction('copy')} />
      {clipboard && (
        <ContextMenuItem icon={<Clipboard className="w-4 h-4" />} label={`Paste (${clipboard.nodes.length})`} shortcut={shortcutPaste} onClick={() => onAction('paste')} />
      )}
      <div className="border-t border-gray-700 my-1"></div>
      <ContextMenuItem icon={<Trash2 className="w-4 h-4 text-red-400" />} label={`Delete${selectedIds.size > 1 && selectedIds.has(contextMenu.node.id) ? ` (${selectedIds.size})` : ''}`} shortcut={shortcutDelete} onClick={() => onAction('delete')} className="text-red-400 hover:bg-red-500/20 hover:text-red-300" />
    </div>
  );
}







