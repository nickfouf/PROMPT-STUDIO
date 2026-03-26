import React from 'react';
import { History } from 'lucide-react';

export default function HistoryPanel({ width }) {
  return (
    <aside
      style={{ width }}
      className="bg-gray-900 flex flex-col h-full shrink-0 relative select-none border-l border-gray-800"
    >
      <div className="p-3 border-b border-gray-800 flex items-center justify-between shrink-0 bg-gray-900/50">
        <div className="flex items-center space-x-2 text-gray-400">
          <History className="w-4 h-4" />
          <h3 className="text-xs font-bold uppercase tracking-wider">History</h3>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center text-gray-500">
        <div className="text-xs text-center space-y-2">
          <History className="w-8 h-8 mx-auto opacity-20 mb-2" />
          <p>Project history will appear here.</p>
        </div>
      </div>
    </aside>
  );
}