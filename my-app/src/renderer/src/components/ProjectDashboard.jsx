import React, { useState } from 'react';
import { FolderGit2, Trash2, Edit2, ArrowRight } from 'lucide-react';
import ConfirmDialog from './common/ConfirmDialog';

export default function ProjectDashboard({ projects, onCreate, onDelete, onRename, onOpen }) {
  const [newProjectName, setNewProjectName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [projectToDelete, setProjectToDelete] = useState(null); // <-- Added state

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    onCreate(newProjectName);
    setNewProjectName('');
  };

  const saveRename = () => {
    if (editName.trim()) onRename(editingId, editName);
    setEditingId(null);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto h-full overflow-y-auto relative">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-2xl font-semibold">Your Projects</h2>
        <form onSubmit={handleCreate} className="flex space-x-2">
          <input 
            type="text" 
            placeholder="Project Name..." 
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-4 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors"
          />
          <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors">
            Create Project
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-500 border border-dashed border-gray-700 rounded-lg">
            No projects yet. Create one to get started.
          </div>
        )}
        {projects.map(project => (
          <div key={project.id} className="bg-gray-800 border border-gray-700 rounded-lg p-5 flex flex-col hover:border-gray-600 transition-colors">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <FolderGit2 className="w-8 h-8 text-blue-500" />
                {editingId === project.id ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={saveRename}
                    onKeyDown={(e) => e.key === 'Enter' && saveRename()}
                    className="bg-gray-900 border border-blue-500 rounded px-2 py-1 text-sm w-full outline-none"
                  />
                ) : (
                  <h3 className="font-medium text-lg truncate" title={project.name}>{project.name}</h3>
                )}
              </div>
            </div>
            
            <div className="mt-auto pt-4 flex items-center justify-between border-t border-gray-700">
              <div className="flex space-x-2">
                <button onClick={() => { setEditingId(project.id); setEditName(project.name); }} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors" title="Rename">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => setProjectToDelete(project)} className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors" title="Delete">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <button onClick={() => onOpen(project.id)} className="flex items-center space-x-2 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 hover:text-blue-300 text-sm px-4 py-2 rounded transition-colors">
                <span>Open</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Reusable Confirm Dialog replacing the standard window.confirm */}
      <ConfirmDialog
        isOpen={!!projectToDelete}
        title="Delete Project"
        message={`Are you sure you want to delete the project "${projectToDelete?.name}"?\nThis action cannot be undone.`}
        confirmText="Delete Project"
        confirmStyle="danger"
        onConfirm={() => {
          onDelete(projectToDelete.id);
          setProjectToDelete(null);
        }}
        onCancel={() => setProjectToDelete(null)}
      />
    </div>
  );
}







