import React, { useState, useMemo } from 'react';
import { FolderGit2, Trash2, Edit2, Plus, Search, Clock, Layers, FileText, X } from 'lucide-react';
import ConfirmDialog from './common/ConfirmDialog';

export default function ProjectDashboard({ projects, onCreate, onDelete, onRename, onOpen }) {
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectRoot, setNewProjectRoot] = useState('');
  
  const [renameData, setRenameData] = useState(null); 
  const [projectToDelete, setProjectToDelete] = useState(null);

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    return projects.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [projects, searchQuery]);

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!newProjectName.trim() || !newProjectRoot) return;
    onCreate(newProjectName.trim(), newProjectRoot);
    setNewProjectName('');
    setNewProjectRoot('');
    setIsCreateModalOpen(false);
  };

  const handleRenameSubmit = (e) => {
    e.preventDefault();
    if (!renameData || !renameData.name.trim()) return;
    onRename(renameData.id, renameData.name.trim());
    setRenameData(null);
  };

  const formatDate = (idStr) => {
    try {
      const date = new Date(parseInt(idStr, 10));
      return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return 'Unknown Date';
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-950 overflow-hidden relative">
      
      <div className="shrink-0 px-10 pt-12 pb-6 border-b border-gray-900 bg-gray-950 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-100 tracking-tight mb-2">Projects</h1>
            <p className="text-sm text-gray-500">Manage your prompt workspaces and configurations.</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative group">
              <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-blue-500 transition-colors" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 bg-gray-900 border border-gray-800 focus:border-blue-500 rounded-lg pl-9 pr-4 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none transition-all shadow-inner focus:shadow-[0_0_15px_rgba(59,130,246,0.1)]"
              />
            </div>
            <button 
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg text-sm font-medium transition-all shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40"
            >
              <Plus className="w-4 h-4" />
              <span>New Project</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-10 py-8">
        <div className="max-w-7xl mx-auto">
          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4 border-2 border-dashed border-gray-800 rounded-2xl bg-gray-900/30">
              <div className="w-20 h-20 bg-gray-900 rounded-full flex items-center justify-center mb-6 shadow-inner border border-gray-800">
                <FolderGit2 className="w-10 h-10 text-blue-500" />
              </div>
              <h2 className="text-xl font-semibold text-gray-200 mb-2">No projects yet</h2>
              <p className="text-gray-500 text-sm max-w-sm text-center mb-8">
                Create your first project to start importing files, building prompt configurations, and generating context.
              </p>
              <button 
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center space-x-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4 text-blue-400" />
                <span>Create your first project</span>
              </button>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-20">
              <Search className="w-12 h-12 text-gray-700 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-300">No projects found</h3>
              <p className="text-gray-500 text-sm mt-1">We couldn't find anything matching "{searchQuery}"</p>
              <button onClick={() => setSearchQuery('')} className="mt-4 text-blue-400 hover:text-blue-300 text-sm font-medium">Clear search</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredProjects.map(project => {
                const presetCount = project.presets?.length || 0;

                return (
                  <div 
                    key={project.id}
                    onClick={() => onOpen(project.id)}
                    className="group flex flex-col bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-blue-500/50 hover:shadow-xl hover:shadow-blue-900/10 transition-all duration-200 cursor-pointer h-56 relative"
                  >
                    <div className="px-5 pt-5 pb-3 flex items-start justify-between">
                      <div className="w-10 h-10 rounded-lg bg-gray-950 border border-gray-800 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-inner">
                        <FolderGit2 className="w-5 h-5 text-blue-500" />
                      </div>
                      
                      <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                        <button 
                          onClick={() => setRenameData({ id: project.id, name: project.name })}
                          className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
                          title="Rename Project"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setProjectToDelete(project)}
                          className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          title="Delete Project"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="px-5 flex-1 min-h-0 flex flex-col justify-start">
                      <h3 className="font-semibold text-gray-100 text-lg truncate mb-1" title={project.name}>
                        {project.name}
                      </h3>
                      <div className="flex items-center text-xs text-gray-500 space-x-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Created {formatDate(project.id)}</span>
                      </div>
                    </div>

                    <div className="px-5 py-4 bg-gray-950/50 border-t border-gray-800/50 flex items-center justify-between text-xs text-gray-500">
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center space-x-1" title={`${presetCount} presets`}>
                          <Layers className="w-3.5 h-3.5 text-gray-600 group-hover:text-purple-400/70 transition-colors" />
                          <span>{presetCount}</span>
                        </div>
                      </div>
                      <div className="text-[10px] uppercase font-bold tracking-wider text-blue-500/0 group-hover:text-blue-500 transition-colors">
                        Open Workspace &rarr;
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="text-lg font-semibold text-gray-100">Create New Project</h2>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-gray-500 hover:text-gray-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateSubmit}>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Project Name</label>
                  <input
                    autoFocus
                    type="text"
                    placeholder="e.g. Frontend App Refactor"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 focus:border-blue-500 rounded-lg px-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Main Root Folder</label>
                  <button 
                    type="button"
                    onClick={async () => {
                      const folder = await window.electronAPI.selectSingleFolder();
                      if (folder) setNewProjectRoot(folder);
                    }}
                    className="w-full bg-gray-950 border border-gray-800 hover:border-blue-500 rounded-lg px-4 py-2.5 text-sm text-gray-300 transition-colors flex items-center justify-between shadow-inner overflow-hidden"
                  >
                    <span className="truncate">{newProjectRoot || "Select Folder..."}</span>
                    <FolderGit2 className="w-4 h-4 text-blue-500 shrink-0 ml-2" />
                  </button>
                </div>
              </div>
              <div className="px-6 py-4 bg-gray-950 border-t border-gray-800 flex justify-end space-x-3">
                <button 
                  type="button" 
                  onClick={() => setIsCreateModalOpen(false)} 
                  className="px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={!newProjectName.trim() || !newProjectRoot}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {renameData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="text-lg font-semibold text-gray-100">Rename Project</h2>
              <button onClick={() => setRenameData(null)} className="text-gray-500 hover:text-gray-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleRenameSubmit}>
              <div className="p-6">
                <label className="block text-sm font-medium text-gray-400 mb-2">Project Name</label>
                <input
                  autoFocus
                  type="text"
                  value={renameData.name}
                  onChange={(e) => setRenameData({ ...renameData, name: e.target.value })}
                  className="w-full bg-gray-950 border border-gray-800 focus:border-blue-500 rounded-lg px-4 py-2.5 text-sm text-gray-100 outline-none transition-colors"
                />
              </div>
              <div className="px-6 py-4 bg-gray-950 border-t border-gray-800 flex justify-end space-x-3">
                <button 
                  type="button" 
                  onClick={() => setRenameData(null)} 
                  className="px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={!renameData.name.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!projectToDelete}
        title="Delete Project"
        message={`Are you sure you want to delete "${projectToDelete?.name}"?\nThis action cannot be undone.`}
        confirmText="Delete Project"
        confirmStyle="danger"
        onConfirm={() => { onDelete(projectToDelete.id); setProjectToDelete(null); }}
        onCancel={() => setProjectToDelete(null)}
      />
    </div>
  );
}

