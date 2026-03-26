import React from 'react';

export default function WorkspaceModals({
  confirmModal,
  setConfirmModal,
  confirmPaste,
  conflictModal,
  newPresetModal,
  setNewPresetModal,
  newPresetName,
  setNewPresetName,
  confirmAddPreset
}) {
  return (
    <>
      {/* Paste/Move Confirmation */}
      {confirmModal && (() => {
        const isMove = confirmModal.action === 'cut';
        const numFiles = confirmModal.nodes.filter(n => n.type === 'file').length;
        const numDirs = confirmModal.nodes.filter(n => n.type === 'folder').length;
        let content = '';
        if (confirmModal.nodes.length === 1) {
          const n = confirmModal.nodes[0];
          const typeStr = n.type === 'file' ? 'file' : 'directory';
          content = `${isMove ? 'Move' : 'Copy'} ${typeStr} "${n.name}"\nTo directory "${confirmModal.targetDir}"`;
        } else if (numFiles > 0 && numDirs === 0) {
          content = `${isMove ? 'Move' : 'Copy'} specified files (${numFiles})\nTo directory "${confirmModal.targetDir}"`;
        } else if (numDirs > 0 && numFiles === 0) {
          content = `${isMove ? 'Move' : 'Copy'} specified directories (${numDirs})\nTo directory "${confirmModal.targetDir}"`;
        } else {
          content = `${isMove ? 'Move' : 'Copy'} specified files and directories (${confirmModal.nodes.length})\nTo directory "${confirmModal.targetDir}"`;
        }
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-xl w-[400px] flex flex-col overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-700 bg-gray-850 text-base font-bold text-gray-100">
                {isMove ? 'Move' : 'Copy'}
              </div>
              <div className="px-5 py-5 text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                {content}
              </div>
              <div className="px-5 py-4 bg-gray-900 border-t border-gray-700 flex justify-end space-x-3">
                <button onClick={() => setConfirmModal(null)} className="px-4 py-2 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors">Cancel</button>
                <button onClick={confirmPaste} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm text-white font-medium transition-colors">
                  {isMove ? 'Move' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Conflict Modal */}
      {conflictModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-xl w-[420px] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-700 bg-gray-850 text-base font-bold text-gray-100">
              {conflictModal.title}
            </div>
            <div className="px-5 py-5 text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
              {conflictModal.message}
            </div>
            <div className="px-5 py-4 bg-gray-900 border-t border-gray-700 flex justify-end space-x-2">
              <button onClick={() => conflictModal.onResolve('cancel')} className="px-3 py-2 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors mr-auto">Cancel</button>
              {conflictModal.isMultiple && (
                <>
                  <button onClick={() => conflictModal.onResolve('skip_all')} className="px-3 py-2 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors">Skip for all</button>
                  <button onClick={() => conflictModal.onResolve('overwrite_all')} className="px-3 py-2 hover:bg-gray-700 rounded-lg text-sm text-red-400 hover:text-red-300 transition-colors">Overwrite for all</button>
                </>
              )}
              <button onClick={() => conflictModal.onResolve('skip')} className="px-3 py-2 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors">Skip</button>
              <button onClick={() => conflictModal.onResolve('overwrite')} className="px-3 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm text-white font-medium transition-colors">Overwrite</button>
            </div>
          </div>
        </div>
      )}

      {/* New Preset Modal */}
      {newPresetModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-xl w-[400px] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-700 bg-gray-850 text-base font-bold text-gray-100">
              Create New Preset
            </div>
            <div className="px-5 py-5 text-sm flex flex-col space-y-3">
              <label className="text-gray-400 font-medium">Preset Name</label>
              <input
                autoFocus
                value={newPresetName}
                onChange={e => setNewPresetName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') confirmAddPreset();
                  if (e.key === 'Escape') setNewPresetModal(false);
                }}
                className="bg-gray-900 border border-gray-700 focus:border-blue-500 rounded-lg px-4 py-2 outline-none text-white transition-colors"
                placeholder="e.g. Backend View"
              />
            </div>
            <div className="px-5 py-4 bg-gray-900 border-t border-gray-700 flex justify-end space-x-3">
              <button onClick={() => setNewPresetModal(false)} className="px-4 py-2 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors">Cancel</button>
              <button
                onClick={confirmAddPreset}
                disabled={!newPresetName.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white font-medium transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}







