
import React, { useState, useEffect, useCallback } from 'react';
import ProjectDashboard from './components/ProjectDashboard';
import ProjectWorkspace from './components/ProjectWorkspace';

// Helper to prevent saving ephemeral UI animation flags
const stripInternalFlags = (nodes) => {
  return nodes
    .filter(n => !n._pendingDelete)
    .map(({ _event, _pendingDelete, children, ...rest }) => ({
      ...rest,
      ...(children ? { children: stripInternalFlags(children) } : {})
    }));
};

// Helper to patch legacy saved files with IDs and extract legacy visibility
const ensureDefaults = (nodes, visibilityMap) => nodes.map(n => {
  const id = n.id || window.crypto.randomUUID();
  
  // Migrate legacy visibility to the map
  if (n.visibility !== undefined) {
    visibilityMap[id] = n.visibility;
  }
  
  // Strip visibility from node representation
  const { visibility, ...restNode } = n;

  return {
    ...restNode,
    id,
    children: restNode.children ? ensureDefaults(restNode.children, visibilityMap) : undefined
  };
});

export default function App() {
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      const savedProjects = await window.electronAPI.getProjects();
      if (savedProjects) {
        // Patch existing data & Migrate to Presets
        const patchedProjects = savedProjects.map(p => {
          let visibilityMap = {};
          let patchedNodes =[];
          
          if (p.presets && p.presets.length > 0) {
            // Already migrated (just ensure IDs are valid)
            patchedNodes = p.nodes ? ensureDefaults(p.nodes, {}) :[];
          } else {
            // Needs migration (extract visibility states)
            patchedNodes = p.nodes ? ensureDefaults(p.nodes, visibilityMap) :[];
          }

          const presets = p.presets ||[{
            id: window.crypto.randomUUID(),
            name: 'Default',
            visibilityMap,
            expandedFolders: [] // Ensures backward compatibility
          }];

          const patchedPresets = presets.map(pr => ({
            ...pr,
            expandedFolders: pr.expandedFolders ||[]
          }));

          
          const activePresetId = p.activePresetId || patchedPresets[0].id;

          const prompts = p.prompts ||[{
            id: window.crypto.randomUUID(),
            name: 'Main Prompt',
            content: ''
          }];
          const activePromptId = p.activePromptId || prompts[0].id;

          return {
            ...p,
            nodes: patchedNodes,
            presets: patchedPresets,
            activePresetId,
            prompts,
            activePromptId
          };
        });
        setProjects(patchedProjects);
      }
      setIsLoading(false);
    };
    loadData();
  },[]);

  
  const saveAndUpdateProjects = (newProjects) => {
    setProjects(newProjects);
  };

  
  const handleCreateProject = (name) => {
    const defaultPresetId = window.crypto.randomUUID();
    const defaultPromptId = window.crypto.randomUUID();
    const newProject = {
      id: Date.now().toString(),
      name,
      nodes: [],
      presets:[{
        id: defaultPresetId,
        name: 'Default',
        visibilityMap: {},
        expandedFolders: [] // Initial default preset starts completely collapsed and fully visible
      }],
      activePresetId: defaultPresetId,
      prompts:[{
        id: defaultPromptId,
        name: 'Main Prompt',
        content: ''
      }],
      activePromptId: defaultPromptId
    };
    saveAndUpdateProjects([...projects, newProject]);
  };

  const handleDeleteProject = (id) => {
    saveAndUpdateProjects(projects.filter(p => p.id !== id));
    if (activeProjectId === id) setActiveProjectId(null);
  };

  const handleRenameProject = (id, newName) => {
    saveAndUpdateProjects(projects.map(p => p.id === id ? { ...p, name: newName } : p));
  };

  
  useEffect(() => {
    if (isLoading) return;
    const saveTimeout = setTimeout(() => {
      const projectsToSave = projects.map(p => ({
        ...p,
        nodes: stripInternalFlags(p.nodes)
      }));
      window.electronAPI.saveProjects(projectsToSave);
    }, 500);
    return () => clearTimeout(saveTimeout);
  }, [projects, isLoading]);

  const handleUpdateProject = useCallback((projectId, projectUpdater) => {
    setProjects(prevProjects => {
      return prevProjects.map(p => {
        if (p.id === projectId) {
          const newProjectData = typeof projectUpdater === 'function'
            ? projectUpdater(p)
            : projectUpdater;
          return { ...p, ...newProjectData };
        }
        return p;
      });
    });
  },[]);

  const handleUpdateProjectNodes = useCallback((projectId, newNodesOrUpdater) => {
    handleUpdateProject(projectId, (p) => {
      const newNodes = typeof newNodesOrUpdater === 'function'
        ? newNodesOrUpdater(p.nodes)
        : newNodesOrUpdater;
      return { nodes: newNodes };
    });
  }, [handleUpdateProject]);

  const activeProject = projects.find(p => p.id === activeProjectId);

  const updateActiveProjectNodes = useCallback((nodesOrUpdater) => {
    if (activeProjectId) handleUpdateProjectNodes(activeProjectId, nodesOrUpdater);
  }, [activeProjectId, handleUpdateProjectNodes]);

  const updateActiveProject = useCallback((updater) => {
    if (activeProjectId) handleUpdateProject(activeProjectId, updater);
  },[activeProjectId, handleUpdateProject]);

  if (isLoading) {
    return <div className="h-screen w-screen bg-gray-900 flex items-center justify-center text-gray-400">Loading workspace...</div>;
  }

  return (
    <div className="h-screen w-screen bg-gray-900 text-gray-100 font-sans flex flex-col overflow-hidden">
      <header className="h-10 bg-gray-950 border-b border-gray-800 flex items-center pl-6 pr-36 shrink-0 drag-region select-none">
        <h1 className="text-lg font-bold tracking-wider text-blue-500">
          AI PROMPT BUILDER <span className="text-gray-400 font-light">2</span>
        </h1>
        
        {activeProject && (
          <div className="ml-8 flex items-center space-x-4">
            <span className="text-gray-500">/</span>
            <span className="text-sm font-medium">{activeProject.name}</span>
            <button 
              onClick={() => setActiveProjectId(null)}
              className="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded transition-colors no-drag"
            >
              Back to Projects
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 overflow-hidden">
        
        {!activeProject ? (
          <ProjectDashboard
            projects={projects}
            onCreate={handleCreateProject}
            onDelete={handleDeleteProject}
            onRename={handleRenameProject}
            onOpen={setActiveProjectId}
          />
        ) : (
          <ProjectWorkspace
            project={activeProject}
            onUpdateNodes={updateActiveProjectNodes}
            onUpdateProject={updateActiveProject}
          />
        )}
      </main>
    </div>
  );
}







