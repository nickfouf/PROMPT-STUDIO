import React, { useState, useEffect, useCallback } from 'react';
import { ChevronDown, Cpu, Loader2, AlertTriangle } from 'lucide-react';
import ProjectDashboard from './components/ProjectDashboard';
import ProjectWorkspace from './components/ProjectWorkspace';

const stripInternalFlags = (nodes) => {
  return nodes
    .filter(n => !n._pendingDelete)
    .map(({ _event, _pendingDelete, children, ...rest }) => ({
      ...rest,
      ...(children ? { children: stripInternalFlags(children) } : {})
    }));
};

const ensureDefaults = (nodes, visibilityMap) => nodes.map(n => {
  const id = n.id || window.crypto.randomUUID();
  if (n.visibility !== undefined) { visibilityMap[id] = n.visibility; }
  const { visibility, ...restNode } = n;
  return { ...restNode, id, children: restNode.children ? ensureDefaults(restNode.children, visibilityMap) : undefined };
});

export default function App() {
  const[projects, setProjects] = useState([]);
  const[activeProjectId, setActiveProjectId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      const savedProjects = await window.electronAPI.getProjects();
      
      if (savedProjects) {
        const patchedProjects = await Promise.all(savedProjects.map(async p => {
          
          const rootPath = p.rootPath || null;
          const foreignPaths = p.foreignPaths || [];

          let localState = {};
          if (rootPath && window.electronAPI.readProjectState) {
             const stateData = await window.electronAPI.readProjectState(rootPath);
             if (stateData) localState = stateData;
          }

          let presets = localState.presets || p.presets || [{
            id: window.crypto.randomUUID(), name: 'Default', visibilityMap: {}, expandedFolders: []
          }];
          const activePresetId = localState.activePresetId || p.activePresetId || presets[0].id;
          const activePreset = presets.find(pr => pr.id === activePresetId) || presets[0];
          const activeVisMap = activePreset?.visibilityMap || {};

          let patchedNodes = [];
          if ((rootPath || foreignPaths.length > 0) && window.electronAPI.buildTree) {
             patchedNodes = await window.electronAPI.buildTree({ 
               rootPath, foreignPaths, visibilityMap: activeVisMap 
             });

             // --- NEW: ON-LOAD GHOST CLEANUP ---
             // 1. Build a set of all paths that actually exist right now
             const validPaths = new Set();
             const populateValidPaths = (nodes) => {
                for (const n of nodes) {
                   validPaths.add(n.path.replace(/\\/g, '/'));
                   if (n.children) populateValidPaths(n.children);
                }
             };
             populateValidPaths(patchedNodes);

             // 2. Prune the presets to remove any paths that aren't valid anymore
             presets = presets.map(preset => {
                if (!preset.visibilityMap) return preset;
                const cleanedVisMap = {};
                for (const [key, vis] of Object.entries(preset.visibilityMap)) {
                   // Keep it if it exists in the tree OR if it's the root/foreign root itself
                   if (validPaths.has(key) || key === rootPath || foreignPaths.includes(key)) {
                      cleanedVisMap[key] = vis;
                   }
                }
                return { ...preset, visibilityMap: cleanedVisMap };
             });
             // ----------------------------------
          }

          const prompts = localState.prompts || p.prompts || [{ id: window.crypto.randomUUID(), name: 'Main Prompt', content: '' }];
          let protocolUid = localState.protocolUid || p.protocolUid;
          if (!protocolUid) protocolUid = await window.electronAPI.generateUid();

          return {
            id: p.id,
            name: p.name,
            rootPath,
            foreignPaths,
            nodes: patchedNodes,
            presets,
            activePresetId,
            prompts,
            activePromptId: localState.activePromptId || p.activePromptId || prompts[0].id,
            selectedModel: localState.selectedModel || p.selectedModel || 'Google Gemini',
            selectedProtocol: localState.selectedProtocol || p.selectedProtocol || 'srp',
            protocolUid,
            updaterParsed: null,
            updaterBlockStatus: {}
          };
        }));
        setProjects(patchedProjects);
      }
      setIsLoading(false);
    };
    loadData();
  },[]);

  const saveAndUpdateProjects = (newProjects) => { setProjects(newProjects); };

  const handleCreateProject = async (name, rootPath) => {
    const defaultPresetId = window.crypto.randomUUID();
    const defaultPromptId = window.crypto.randomUUID();
    const newUid = await window.electronAPI.generateUid();
    
    const nodes = rootPath 
      ? await window.electronAPI.buildTree({ rootPath, foreignPaths: [], visibilityMap: {} }) 
      : [];

    const newProject = {
      id: Date.now().toString(),
      name, rootPath, foreignPaths: [], nodes,
      presets:[{ id: defaultPresetId, name: 'Default', visibilityMap: {}, expandedFolders: [] }],
      activePresetId: defaultPresetId,
      prompts:[{ id: defaultPromptId, name: 'Main Prompt', content: '' }],
      activePromptId: defaultPromptId,
      selectedModel: 'Google Gemini', selectedProtocol: 'srp', protocolUid: newUid, updaterParsed: null, updaterBlockStatus: {}
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
      const globalProjectsConfig = [];
      for (const p of projects) {
        globalProjectsConfig.push({ id: p.id, name: p.name, rootPath: p.rootPath, foreignPaths: p.foreignPaths });
        if (p.rootPath && window.electronAPI.writeProjectState) {
          const localState = {
             presets: p.presets, activePresetId: p.activePresetId,
             prompts: p.prompts, activePromptId: p.activePromptId,
             selectedModel: p.selectedModel, selectedProtocol: p.selectedProtocol, protocolUid: p.protocolUid
          };
          window.electronAPI.writeProjectState(p.rootPath, localState);
        }
      }
      window.electronAPI.saveProjects(globalProjectsConfig);
    }, 500);
    return () => clearTimeout(saveTimeout);
  },[projects, isLoading]);

  const handleUpdateProject = useCallback((projectId, projectUpdater) => {
    setProjects(prevProjects => prevProjects.map(p => p.id === projectId ? { ...p, ...(typeof projectUpdater === 'function' ? projectUpdater(p) : projectUpdater) } : p));
  },[]);

  const handleUpdateProjectNodes = useCallback((projectId, newNodesOrUpdater) => {
    handleUpdateProject(projectId, (p) => ({ nodes: typeof newNodesOrUpdater === 'function' ? newNodesOrUpdater(p.nodes) : newNodesOrUpdater }));
  },[handleUpdateProject]);

  const activeProject = projects.find(p => p.id === activeProjectId);
  const updateActiveProjectNodes = useCallback((nodesOrUpdater) => { if (activeProjectId) handleUpdateProjectNodes(activeProjectId, nodesOrUpdater); }, [activeProjectId, handleUpdateProjectNodes]);
  const updateActiveProject = useCallback((updater) => { if (activeProjectId) handleUpdateProject(activeProjectId, updater); },[activeProjectId, handleUpdateProject]);

  if (isLoading) return <div className="h-screen w-screen bg-gray-900 flex items-center justify-center text-gray-400">Loading workspace...</div>;

  return (
    <div className="h-screen w-screen bg-gray-900 text-gray-100 font-sans flex flex-col overflow-hidden">
      <header className="h-10 bg-gray-950 border-b border-gray-800 flex items-center pl-6 pr-36 shrink-0 drag-region select-none">
        <h1 className="text-lg font-bold tracking-wider text-blue-500 shrink-0">PROMPT <span className="text-gray-400 font-light">STUDIO</span></h1>
        {activeProject && (
          <>
            <div className="ml-8 flex items-center space-x-4 shrink-0">
              <span className="text-gray-500">/</span><span className="text-sm font-medium truncate max-w-[150px]">{activeProject.name}</span>
              <button onClick={() => setActiveProjectId(null)} className="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded transition-colors no-drag shrink-0">Back to Projects</button>
            </div>
            <div className="ml-auto flex items-center space-x-3 no-drag shrink-0">
              <div className={`flex items-center bg-gray-900 border rounded-md px-2.5 py-1 shadow-inner transition-colors duration-300 ${activeProject.tokenError ? 'border-red-900/50' : 'border-gray-800'}`}>
                {activeProject.isCountingTokens ? <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin mr-2 shrink-0" /> : activeProject.tokenError ? <AlertTriangle className="w-3.5 h-3.5 text-red-500 mr-2 shrink-0" /> : <Cpu className="w-3.5 h-3.5 text-gray-500 mr-2 shrink-0" />}
                <span className="text-xs font-medium text-gray-400 mr-2">Tokens:</span>
                <span className={`text-xs font-mono font-bold ${activeProject.tokenError ? 'text-red-500' : 'text-blue-400'}`}>
                  {activeProject.tokenError ? "Error" : (typeof activeProject.tokenCount === 'number' ? `${activeProject.isApproximateTokens ? '~' : ''}${activeProject.tokenCount.toLocaleString()}` : "0")}
                </span>
              </div>
              <div className="relative">
                <select value={activeProject.selectedModel || 'Google Gemini'} onChange={(e) => updateActiveProject({ selectedModel: e.target.value })} className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-md pl-3 pr-8 py-1 text-xs font-medium text-gray-200 focus:outline-none focus:border-blue-500 appearance-none cursor-pointer transition-colors shadow-inner w-[160px]">
                  <option value="Google Gemini">Google Gemini</option><option value="Anthropic Claude">Anthropic Claude</option><option value="OpenAI">OpenAI (GPT / o-series)</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-gray-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </>
        )}
      </header>

      <main className="flex-1 overflow-hidden">
        {!activeProject ? <ProjectDashboard projects={projects} onCreate={handleCreateProject} onDelete={handleDeleteProject} onRename={handleRenameProject} onOpen={setActiveProjectId} /> : <ProjectWorkspace key={activeProject.id} project={activeProject} onUpdateNodes={updateActiveProjectNodes} onUpdateProject={updateActiveProject} />}
      </main>
    </div>
  );
}