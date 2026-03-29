import React from 'react';
import { AlertTriangle } from 'lucide-react';

export default function ConfirmDialog({ isOpen, title, message, confirmText = 'Confirm', confirmStyle = 'danger', onConfirm, onCancel }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl w-[400px] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-gray-700 bg-gray-850 flex items-center space-x-3">
          {confirmStyle === 'danger' && <AlertTriangle className="w-5 h-5 text-red-500" />}
          <h3 className="text-lg font-semibold text-gray-100">{title}</h3>
        </div>
        <div className="px-6 py-6 text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
          {message}
        </div>
        <div className="px-6 py-4 bg-gray-900 border-t border-gray-700 flex justify-end space-x-3">
          <button onClick={onCancel} className="px-4 py-2 hover:bg-gray-700 rounded-lg text-sm text-gray-300 font-medium transition-colors">Cancel</button>
          <button 
            onClick={onConfirm} 
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${confirmStyle === 'danger' ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}







