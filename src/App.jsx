import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, ArrowRight, RotateCcw, Download, Upload, CheckCircle2, Search } from 'lucide-react';
import resources from './data/resources.json';
import defaultExcludes from './data/defaultExcludes.json';
import { buildFallbackCatalog, parseResourceCatalog } from './lib/resourceCatalog.js';
import { buildSplitModel } from './lib/splitModel.js';
import { cleanName, getAssignedResources, getAvailableResources, getResourceStats, getSplitResources, validateSplits } from './lib/resourceModel.js';
import { buildWorkspace, downloadJsonFile, parseWorkspace } from './lib/workspace.js';

const RESOURCE_CATALOG_URL = 'https://cxascode.github.io/dependency-tree-json/latest-merged.json';
const BUNDLED_RESOURCE_CATALOG = buildFallbackCatalog(resources);
const DEFAULT_NO_SYNC_RESOURCES = defaultExcludes;

function formatTerraformResourceList(values) {
  return values.map(value => `    "${value}"`).join(',\n');
}

function buildSourceExportTemplate(includeFilterResources = []) {
  return `resource "genesyscloud_tf_export" "export" {
  directory             = "./genesyscloud"
  include_state_file    = false
  export_as_hcl         = true
  log_permission_errors = true
  #use_legacy_architect_flow_exporter = true
  include_filter_resources = [
${formatTerraformResourceList(includeFilterResources)}
  ]
}`;
}

function buildExcludeResourcesCsv(excludeResources = []) {
  return ['name', ...excludeResources].join('\n');
}

function buildCoreSplit(resourceTypes, noSyncResources) {
  const noSyncSet = new Set(noSyncResources);

  return {
    id: 'core',
    name: 'core',
    kind: 'default',
    selectedResources: resourceTypes.filter(resource => !noSyncSet.has(resource)),
  };
}

export default function App() {
  const [resourceCatalog, setResourceCatalog] = useState(BUNDLED_RESOURCE_CATALOG);
  const [resourceCatalogInfo, setResourceCatalogInfo] = useState({ source: 'bundled', version: null, error: null });
  const [splits, setSplits] = useState(() => [buildCoreSplit(BUNDLED_RESOURCE_CATALOG.resourceTypes, DEFAULT_NO_SYNC_RESOURCES)]);
  const [noSyncResources, setNoSyncResources] = useState(DEFAULT_NO_SYNC_RESOURCES);
  const [selectedSplitId, setSelectedSplitId] = useState('core');
  const [newSplitName, setNewSplitName] = useState('');
  const [isAddingSplit, setIsAddingSplit] = useState(false);
  const [resourceDialogType, setResourceDialogType] = useState(null);
  const [query, setQuery] = useState('');
  const importInputRef = useRef(null);

  const allResources = resourceCatalog.resourceTypes;

  useEffect(() => {
    const controller = new AbortController();

    async function loadResourceCatalog() {
      try {
        const response = await fetch(RESOURCE_CATALOG_URL, {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Resource catalog request failed: ${response.status}`);
        }

        const catalog = parseResourceCatalog(await response.json());

        if (catalog.resourceTypes.length === 0) {
          throw new Error('Resource catalog did not contain any resource types.');
        }

        setResourceCatalog(catalog);
        setResourceCatalogInfo({ source: 'live', version: catalog.version || null, error: null });
        setSplits(current => {
          const focusedSelected = new Set(current
            .filter(split => split.kind === 'focused')
            .flatMap(split => getSplitResources(split)));

          return current.map(split => split.kind === 'default'
            ? {
              ...split,
              selectedResources: catalog.resourceTypes
                .filter(resource => !DEFAULT_NO_SYNC_RESOURCES.includes(resource))
                .filter(resource => !focusedSelected.has(resource)),
            }
            : split);
        });
      } catch (error) {
        if (error.name === 'AbortError') return;
        setResourceCatalog(BUNDLED_RESOURCE_CATALOG);
        setResourceCatalogInfo({ source: 'bundled', version: null, error: error.message });
      }
    }

    loadResourceCatalog();

    return () => controller.abort();
  }, []);

  const selectedSplit = splits.find(split => split.id === selectedSplitId) || { id: null, name: 'no split', kind: 'focused', selectedResources: [] };
  const selectedSplitResources = getSplitResources(selectedSplit);
  const coreSplit = splits.find(split => split.kind === 'default');
  const selectedResources = useMemo(() => [...new Set(splits.flatMap(split => getSplitResources(split)))].sort(), [splits]);

  const assigned = useMemo(() => getAssignedResources(splits), [splits]);

  const noSyncSet = useMemo(() => new Set(noSyncResources), [noSyncResources]);

  const availableResources = useMemo(() => {
    if (selectedSplit.kind === 'focused') {
      const selectedSet = new Set(selectedSplitResources);
      return getSplitResources(coreSplit || { selectedResources: [] })
        .filter(resource => !selectedSet.has(resource))
        .filter(resource => resource.includes(query));
    }

    return getAvailableResources({
      resources: allResources,
      assigned,
      noSyncSet,
      query,
    });
  }, [assigned, noSyncSet, query, allResources, selectedSplit.kind, selectedSplitResources, coreSplit]);

  const stats = useMemo(() => {
    return getResourceStats({
      resources: allResources,
      splits,
      noSyncResources,
      assigned,
      noSyncSet,
    });
  }, [assigned, noSyncResources, noSyncSet, splits, allResources]);

  const validation = useMemo(() => {
    return validateSplits({
      resources: allResources,
      splits,
      noSyncSet,
    });
  }, [splits, noSyncSet, allResources]);

  const resourceDialog = useMemo(() => {
    if (resourceDialogType === 'known') {
      return {
        title: 'Known resources',
        description: 'All resource types loaded from the current resource catalog.',
        resources: allResources,
        allowRestore: false,
      };
    }

    if (resourceDialogType === 'selected') {
      return {
        title: 'Selected resources',
        description: 'Resource types currently owned by core or focused splits.',
        resources: selectedResources,
        allowRestore: false,
      };
    }

    if (resourceDialogType === 'excluded') {
      return {
        title: 'No-sync resources',
        description: 'Resources excluded from every split.',
        resources: noSyncResources,
        allowRestore: true,
      };
    }

    return null;
  }, [allResources, noSyncResources, resourceDialogType, selectedResources]);


  const model = useMemo(() => {
    return buildSplitModel({
      resources: allResources,
      dependencyMap: resourceCatalog.dependencyMap,
      splits,
      noSyncResources,
      assigned,
      noSyncSet,
      stats,
      validation,
    });
  }, [assigned, noSyncResources, noSyncSet, splits, stats, validation, allResources, resourceCatalog.dependencyMap]);

  const selectedGeneratedSplit = useMemo(() => {
    return model.splits.find(split => split.name === selectedSplit.name) || model.splits[0] || null;
  }, [model.splits, selectedSplit.name]);

  const selectedSourceExportTemplate = useMemo(() => {
    return buildSourceExportTemplate(selectedGeneratedSplit?.includeFilterResources || []);
  }, [selectedGeneratedSplit]);

  const selectedExcludeResourcesCsv = useMemo(() => {
    return buildExcludeResourcesCsv(selectedGeneratedSplit?.excludeResources || []);
  }, [selectedGeneratedSplit]);

  function startAddingSplit() {
    setNewSplitName('');
    setQuery('');
    setIsAddingSplit(true);
  }

  function cancelAddingSplit() {
    setNewSplitName('');
    setIsAddingSplit(false);
  }

  function addSplit() {
    const name = cleanName(newSplitName || 'focused-split');

    if (!name || name === 'core' || splits.some(split => split.name === name)) return;

    const split = {
      id: crypto.randomUUID(),
      name,
      kind: 'focused',
      selectedResources: [],
    };

    setSplits(current => [...current, split]);
    setSelectedSplitId(split.id);
    setNewSplitName('');
    setQuery('');
    setIsAddingSplit(false);
  }

  function deleteSplit(id) {
    setSplits(current => {
      const deleted = current.find(split => split.id === id);
      if (!deleted || deleted.kind === 'default') return current;

      const deletedResources = getSplitResources(deleted);
      const next = current
        .filter(split => split.id !== id)
        .map(split => split.kind === 'default'
          ? { ...split, selectedResources: [...new Set([...getSplitResources(split), ...deletedResources])].sort() }
          : split);

      setSelectedSplitId('core');
      setQuery('');
      return next;
    });
  }

  function moveToSplit(resource, splitId = selectedSplitId) {
    if (!splitId) return;

    setNoSyncResources(current => current.filter(item => item !== resource));
    setSplits(current => current.map(split => {
      const withoutResource = getSplitResources(split).filter(item => item !== resource);

      if (split.id === splitId) {
        return { ...split, selectedResources: [...withoutResource, resource].sort() };
      }

      return { ...split, selectedResources: withoutResource };
    }));
  }

  function removeFromSplit(resource, splitId) {
    setSplits(current => current.map(split => {
      return split.id === splitId
        ? { ...split, selectedResources: getSplitResources(split).filter(item => item !== resource) }
        : split;
    }));
  }

  function excludeResource(resource) {
    setSplits(current => current.map(split => ({
      ...split,
      selectedResources: getSplitResources(split).filter(item => item !== resource),
    })));
    setNoSyncResources(current => [...new Set([...current, resource])].sort());
  }

  function restoreNoSyncResource(resource) {
    setNoSyncResources(current => current.filter(item => item !== resource));
  }

  function reset() {
    setNoSyncResources(DEFAULT_NO_SYNC_RESOURCES);
    setSplits([buildCoreSplit(allResources, DEFAULT_NO_SYNC_RESOURCES)]);
    setSelectedSplitId('core');
    setNewSplitName('');
    setIsAddingSplit(false);
    setResourceDialogType(null);
    setQuery('');
  }

  function downloadWorkspace() {
    if (splits.length === 0) return;

    downloadJsonFile({
      filename: 'orgsync-split-workspace.json',
      data: buildWorkspace({ splits, noSyncResources, model }),
    });
  }

  function importWorkspaceFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const workspace = parseWorkspace({
          rawText: String(reader.result || '{}'),
          knownResources: allResources,
          cleanName,
          createId: () => crypto.randomUUID(),
        });

        setSplits(workspace.splits);
        setNoSyncResources(workspace.noSyncResources);
        setSelectedSplitId(workspace.splits[0]?.id || null);
        setNewSplitName('');
        setIsAddingSplit(false);
        setResourceDialogType(null);
        setQuery('');
      } catch {
        window.alert('Unable to read that workspace file. Make sure it is a valid OrgSync split workspace JSON file.');
      }
    };

    reader.readAsText(file);
  }

  return <div className="app">
    <header className="hero">
      <div>
        <p className="eyebrow">OrgSync split modeler</p>
        <h1>Design splits without losing the “everything is connected” safety net.</h1>
        <p className="subhead">Core starts with every syncable resource except the default excluded resources. Add focused splits, move resource types out of core, and review the dependencies needed for each split.</p>
      </div>
      <div className="hero-actions">
        <div className="hero-action-buttons">
          <input ref={importInputRef} type="file" accept="application/json,.json" onChange={importWorkspaceFile} hidden />
          <button className="ghost" onClick={() => importInputRef.current?.click()}><Upload size={16}/> Import</button>
          <button className="secondary" onClick={downloadWorkspace} disabled={splits.length === 0} title={splits.length === 0 ? 'Create a split before exporting a workspace.' : 'Export workspace JSON'}><Download size={16}/> Export</button>
          <button className="ghost" onClick={reset}><RotateCcw size={16}/> Reset</button>
        </div>
        <div className="hero-stats">
          <button className="stat-card mini-stat stat-button" onClick={() => setResourceDialogType('known')}>
            <div className="mini-stat-heading"><p className="eyebrow">Known</p><strong>{stats.knownResourceCount}</strong></div>
            <span>Resource types</span>
          </button>
          <button className="stat-card mini-stat stat-button" onClick={() => setResourceDialogType('selected')}>
            <div className="mini-stat-heading"><p className="eyebrow">Selected</p><strong>{stats.exportedResourceCount}</strong></div>
            <span>Owned by splits</span>
          </button>
          <button className="stat-card mini-stat stat-button" onClick={() => setResourceDialogType('excluded')}>
            <div className="mini-stat-heading"><p className="eyebrow">Excluded</p><strong>{stats.noSyncResourceCount}</strong></div>
            <span>No-sync resources</span>
          </button>
        </div>
      </div>
    </header>


    <section className="card split-nav">
      <div className="section-title">
        <div><h2>Splits</h2><p>Select core or a focused split to review and move resources.</p></div>
        {!isAddingSplit && <button onClick={startAddingSplit}><Plus size={16}/> Add focused split</button>}
      </div>
      {isAddingSplit && <div className="field add-split-form">
        <label>Add focused split</label>
        <div className="inline">
          <input value={newSplitName} onChange={event => setNewSplitName(event.target.value)} placeholder="split-name" />
          <button onClick={addSplit}><CheckCircle2 size={16}/> Save</button>
          <button className="ghost" onClick={cancelAddingSplit}>Cancel</button>
        </div>
      </div>}
      <div className="split-list">
        {splits.map(split => <button key={split.id} className={split.id === selectedSplitId ? 'split selected' : 'split'} onClick={() => { setSelectedSplitId(split.id); setQuery(''); }}>
          <span><strong>{split.name}</strong><small>{getSplitResources(split).length} selected</small></span>
          {split.kind !== 'default' && <Trash2 className="danger" size={16} onClick={event => { event.stopPropagation(); deleteSplit(split.id); }} />}
        </button>)}
      </div>
    </section>

    {resourceDialog && <div className="dialog-backdrop" role="presentation" onClick={() => setResourceDialogType(null)}>
        <section className="card resource-dialog" role="dialog" aria-modal="true" aria-labelledby="resource-dialog-title" onClick={event => event.stopPropagation()}>
          <div className="section-title">
            <div><h2 id="resource-dialog-title">{resourceDialog.title}</h2><p>{resourceDialog.description}</p></div>
            <button className="ghost" onClick={() => setResourceDialogType(null)}>Close</button>
          </div>
          <div className="chips scroll short">
            {resourceDialog.resources.map(resource => <span className={resourceDialog.allowRestore ? 'chip excluded' : 'chip'} key={resource}>{resource}{resourceDialog.allowRestore && <button onClick={() => restoreNoSyncResource(resource)}>restore</button>}</span>)}
          </div>
        </section>
      </div>}

      <main className="grid">
        <section className="card selected-panel">
          <div className="section-title">
            <div><h2>{selectedSplit.name}</h2><p>{selectedSplit.kind === 'default' ? 'Baseline resources owned by core.' : 'Resources explicitly selected for this focused split.'}</p></div>
            <strong>{selectedSplitResources.length}</strong>
          </div>
          <div className="resource-list">
            {selectedSplitResources.map(resource => <div className="resource" key={resource}>
              <code>{resource}</code>
              <div className="actions">
                <button className="ghost" onClick={() => removeFromSplit(resource, selectedSplit.id)}>remove</button>
                <button className="ghost danger" onClick={() => excludeResource(resource)}>exclude</button>
              </div>
            </div>)}
          </div>
        </section>

        <section className="card available-panel">
          <div className="section-title">
            <div><h2>{selectedSplit.kind === 'focused' ? 'Core resources available to split' : 'Available resource types'}</h2><p>{selectedSplit.kind === 'focused' ? 'Move resources from core into this focused split.' : 'Not selected and not excluded.'}</p></div>
            <strong>{availableResources.length}</strong>
          </div>
          <div className="search"><Search size={16}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="filter e.g. flow, routing, outbound" /></div>
          <div className="resource-list">
            {availableResources.map(resource => <div className="resource" key={resource}>
              <code>{resource}</code>
              <button onClick={() => moveToSplit(resource)}><ArrowRight size={14}/> add to {selectedSplit.name}</button>
            </div>)}
            {availableResources.length === 0 && <p className="empty">No available resources match that filter.</p>}
          </div>
        </section>

        <section className="card output">
          <div className="section-title">
            <div><h2>Generated tooling output</h2><p>Preview generated from the selected split: {selectedGeneratedSplit?.name || 'none'}.</p></div>
          </div>

          <div className="generated-file">
            <h3>source_export_template.tf</h3>
            <pre>{selectedSourceExportTemplate}</pre>
          </div>

          <div className="generated-file">
            <h3>exclude_resources.csv</h3>
            <pre>{selectedExcludeResourcesCsv}</pre>
          </div>
        </section>
      </main>
  </div>;
}