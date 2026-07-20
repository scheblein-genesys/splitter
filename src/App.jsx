import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, ArrowRight, RotateCcw, Download, Upload, CheckCircle2, Search, ClipboardCopy } from 'lucide-react';
import resources from './data/resources.json';
import defaultCSVExcludes from './data/defaultCSVExcludes.json';
import defaultTFExcludes from './data/defaultTFExcludes.json';
import supportedAutoReplaceResources from './data/supportedAutoReplaceResources.json';
import { buildFallbackCatalog, parseResourceCatalog } from './lib/resourceCatalog.js';
import { buildSplitModel } from './lib/splitModel.js';
import { cleanName, getAssignedResources, getAvailableResources, getResourceStats, getSplitResources, validateSplits } from './lib/resourceModel.js';
import { buildWorkspace, DEFAULT_REPLACE_ENTITIES_MODE, downloadJsonFile, getCheckExportResourceList, parseWorkspace } from './lib/workspace.js';
import { buildDependencyTreeUrl, buildDependencyTreeVersionOptionsFromIndex, cacheDependencyTreeVersionOptions, DEPENDENCY_TREE_INDEX_URL, getCachedDependencyTreeVersionOptions, getDependencyTreeVersionLabel, LATEST_DEPENDENCY_TREE_VERSION } from './lib/dependencyTreeVersions.js';

const BUNDLED_RESOURCE_CATALOG = buildFallbackCatalog(resources);
const DEFAULT_CSV_EXCLUDE_RESOURCES = defaultCSVExcludes;
const DEFAULT_TF_EXCLUDE_RESOURCES = defaultTFExcludes;
const SUPPORTED_AUTO_REPLACE_RESOURCES = supportedAutoReplaceResources;

function formatTerraformResourceList(values) {
  return values.map(value => `    "${value}"`).join(',\n');
}

function getLegacyArchitectFlowExporterLine(split) {
  if (split?.useLegacyArchitectFlowExporter === false) {
    return '  use_legacy_architect_flow_exporter = false\n';
  }

  if (split?.useLegacyArchitectFlowExporter === true) {
    return '  use_legacy_architect_flow_exporter = true\n';
  }

  return '';
}

function getExportFilterConfig(split) {
  if (split?.kind === 'default') {
    const resources = split?.excludeFilterResources || [];

    if (resources.length === 0) return null;

    return {
      name: 'exclude_filter_resources',
      resources,
    };
  }

  return {
    name: 'include_filter_resources',
    resources: split?.includeFilterResources || [],
  };
}

function buildExportFilterBlock(split) {
  const filterConfig = getExportFilterConfig(split);

  if (!filterConfig) return '';

  return `  ${filterConfig.name} = [
${formatTerraformResourceList(filterConfig.resources)}
  ]
`;
}

function buildSourceExportTemplate(split) {
  return `resource "genesyscloud_tf_export" "export" {
  directory             = "./genesyscloud"
  include_state_file    = false
  export_as_hcl         = true
  log_permission_errors = true
${getLegacyArchitectFlowExporterLine(split)}${buildExportFilterBlock(split)}}`;
}

function buildExcludeResourcesCsv(excludeResources = []) {
  return ['name', ...excludeResources].join('\n');
}

function buildConfigsJson({
  autoReplaceResourceList = [],
  checkExportResourceList = [],
  includeAutoReplaceResourceList = true,
} = {}) {
  const checkExportResourceListLine = `  "CheckExportResourceList": "${checkExportResourceList.join(',')}"`;

  if (includeAutoReplaceResourceList) {
    return `  "AutoReplaceResourceList": "${autoReplaceResourceList.join(',')}",
${checkExportResourceListLine}`;
  }

  return checkExportResourceListLine;
}

function buildCoreSplit(resourceTypes, noSyncResources, tfExcludeResources = DEFAULT_TF_EXCLUDE_RESOURCES) {
  const noSyncSet = new Set(noSyncResources);
  const tfExcludeSet = new Set(tfExcludeResources);

  return {
    id: 'core',
    name: 'core',
    kind: 'default',
    replaceEntitiesMode: DEFAULT_REPLACE_ENTITIES_MODE,
    selectedResources: resourceTypes
      .filter(resource => !noSyncSet.has(resource))
      .filter(resource => !tfExcludeSet.has(resource)),
  };
}

function getReplaceEntitiesMode(split) {
  return split?.replaceEntitiesMode === 'use' ? 'use' : DEFAULT_REPLACE_ENTITIES_MODE;
}

export default function App() {
  const [resourceCatalog, setResourceCatalog] = useState(BUNDLED_RESOURCE_CATALOG);
  const [selectedCatalogVersion, setSelectedCatalogVersion] = useState(LATEST_DEPENDENCY_TREE_VERSION);
  const [catalogVersionOptions, setCatalogVersionOptions] = useState(() => getCachedDependencyTreeVersionOptions() || [LATEST_DEPENDENCY_TREE_VERSION]);
  const [splits, setSplits] = useState(() => [buildCoreSplit(BUNDLED_RESOURCE_CATALOG.resourceTypes, DEFAULT_CSV_EXCLUDE_RESOURCES)]);
  const [noSyncResources, setNoSyncResources] = useState(DEFAULT_CSV_EXCLUDE_RESOURCES);
  const [selectedSplitId, setSelectedSplitId] = useState('core');
  const [newSplitName, setNewSplitName] = useState('');
  const [isAddingSplit, setIsAddingSplit] = useState(false);
  const [resourceDialogType, setResourceDialogType] = useState(null);
  const [query, setQuery] = useState('');
  const [selectedQuery, setSelectedQuery] = useState('');
  const [copiedOutput, setCopiedOutput] = useState(null);
  const importInputRef = useRef(null);
  const noSyncResourcesRef = useRef(noSyncResources);

  const allResources = resourceCatalog.resourceTypes;

  useEffect(() => {
    noSyncResourcesRef.current = noSyncResources;
  }, [noSyncResources]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCatalogVersions() {
      const cachedOptions = getCachedDependencyTreeVersionOptions();
      if (cachedOptions) return;
      try {
        const response = await fetch(DEPENDENCY_TREE_INDEX_URL, {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Dependency catalog index request failed: ${response.status}`);
        }

        const options = buildDependencyTreeVersionOptionsFromIndex(await response.json());
        setCatalogVersionOptions(cacheDependencyTreeVersionOptions(options));
      } catch (error) {
        if (error.name === 'AbortError') return;
      }
    }

    loadCatalogVersions();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadResourceCatalog() {
      try {
        const response = await fetch(buildDependencyTreeUrl(selectedCatalogVersion), {
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

        const knownResourceSet = new Set(catalog.resourceTypes);
        const coreTfExcludeSet = new Set(DEFAULT_TF_EXCLUDE_RESOURCES);
        const filteredNoSyncResources = noSyncResourcesRef.current.filter(resource => knownResourceSet.has(resource));

        setResourceCatalog(catalog);

        setNoSyncResources(filteredNoSyncResources);
        setSplits(current => {
          const focusedSplits = current
            .filter(split => split.kind === 'focused')
            .map(split => ({
              ...split,
              selectedResources: getSplitResources(split).filter(resource => knownResourceSet.has(resource)),
            }));

          const focusedSelected = new Set(focusedSplits.flatMap(split => getSplitResources(split)));
          const coreSplit = current.find(split => split.kind === 'default') || buildCoreSplit(catalog.resourceTypes, filteredNoSyncResources);
          const nextCoreSplit = {
            ...coreSplit,
            selectedResources: catalog.resourceTypes
              .filter(resource => !filteredNoSyncResources.includes(resource))
              .filter(resource => !focusedSelected.has(resource))
              .filter(resource => !coreTfExcludeSet.has(resource)),
          };

          return [nextCoreSplit, ...focusedSplits];
        });
      } catch (error) {
        if (error.name === 'AbortError') return;
        setResourceCatalog(BUNDLED_RESOURCE_CATALOG);
      }
    }

    loadResourceCatalog();

    return () => controller.abort();
  }, [selectedCatalogVersion]);

  const selectedSplit = splits.find(split => split.id === selectedSplitId) || { id: null, name: 'no split', kind: 'focused', selectedResources: [], replaceEntitiesMode: DEFAULT_REPLACE_ENTITIES_MODE };
  const selectedReplaceEntitiesMode = getReplaceEntitiesMode(selectedSplit);
  const selectedSplitResources = getSplitResources(selectedSplit);
  const filteredSelectedSplitResources = selectedSplitResources.filter(resource => resource.includes(selectedQuery));
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
    }).filter(resource => !DEFAULT_TF_EXCLUDE_RESOURCES.includes(resource));
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
      coreExcludeFilterResourceExcludes: DEFAULT_TF_EXCLUDE_RESOURCES,
      supportedAutoReplaceResources: SUPPORTED_AUTO_REPLACE_RESOURCES,
    });
  }, [assigned, noSyncResources, noSyncSet, splits, stats, validation, allResources, resourceCatalog.dependencyMap]);

  const selectedGeneratedSplit = useMemo(() => {
    return model.splits.find(split => split.name === selectedSplit.name) || model.splits[0] || null;
  }, [model.splits, selectedSplit.name]);

  const selectedSourceExportTemplate = useMemo(() => {
    return buildSourceExportTemplate(selectedGeneratedSplit);
  }, [selectedGeneratedSplit]);

  const selectedExcludeResourcesCsv = useMemo(() => {
    const excludeResources = selectedReplaceEntitiesMode === 'auto'
      ? selectedGeneratedSplit?.autoReplaceExcludeResources
      : selectedGeneratedSplit?.excludeResources;

    return buildExcludeResourcesCsv(excludeResources || []);
  }, [selectedReplaceEntitiesMode, selectedGeneratedSplit]);

  const selectedConfigsJson = useMemo(() => {
    return buildConfigsJson({
      autoReplaceResourceList: selectedGeneratedSplit?.autoReplaceResourceList || [],
      checkExportResourceList: getCheckExportResourceList(selectedGeneratedSplit),
      includeAutoReplaceResourceList: selectedReplaceEntitiesMode === 'auto',
    });
  }, [selectedReplaceEntitiesMode, selectedGeneratedSplit]);

  function setSelectedSplitReplaceEntitiesMode(mode) {
    if (!selectedSplit.id) return;

    setSplits(current => current.map(split => split.id === selectedSplit.id
      ? { ...split, replaceEntitiesMode: mode }
      : split));
  }

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
      replaceEntitiesMode: DEFAULT_REPLACE_ENTITIES_MODE,
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
    setSplits(current => current.map(split => split.kind === 'default'
      ? { ...split, selectedResources: [...new Set([...getSplitResources(split), resource])].sort() }
      : { ...split, selectedResources: getSplitResources(split).filter(item => item !== resource) }));
  }

  function reset() {
    setNoSyncResources(DEFAULT_CSV_EXCLUDE_RESOURCES);
    setSplits([buildCoreSplit(allResources, DEFAULT_CSV_EXCLUDE_RESOURCES)]);
    setSelectedSplitId('core');
    setNewSplitName('');
    setIsAddingSplit(false);
    setResourceDialogType(null);
    setQuery('');
  }

  function downloadWorkspace() {
    if (splits.length === 0) return;

    downloadJsonFile({
      filename: 'orgsync-split-modeler.json',
      data: buildWorkspace({
        splits,
        noSyncResources,
        model,
        catalogVersion: selectedCatalogVersion,
      }),
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
        if (workspace.catalogVersion) {
          setSelectedCatalogVersion(workspace.catalogVersion);
        }
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

  async function copyGeneratedOutput(key, value) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedOutput(key);
      window.setTimeout(() => setCopiedOutput(current => current === key ? null : current), 1500);
    } catch {
      window.alert('Unable to copy to clipboard. Select the text and copy it manually.');
    }
  }

  return <div className="app">
    <header className="hero">
      <div>
        <p className="eyebrow">OrgSync split modeler</p>
        <h1>Design splits without losing the “everything is connected” safety net.</h1>
        <p className="subhead">Core starts with every syncable resource except the default excluded resources. Add focused splits, move resource types out of core, and review the dependencies needed for each split.</p>

        <section className="card split-nav">
          <div className="section-title">
            <div><h2>Splits</h2><p>Select core or a focused split to review and move resources.</p></div>
            <div className="split-nav-actions">
              {!isAddingSplit && <button onClick={startAddingSplit}><Plus size={16}/> Add focused split</button>}
            </div>
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
            {splits.map(split => <button key={split.id} className={split.id === selectedSplitId ? 'split selected' : 'split'} onClick={() => { setSelectedSplitId(split.id); setQuery(''); setSelectedQuery(''); }}>
              <span><strong>{split.name}</strong><small>{getSplitResources(split).length} selected</small></span>
              {split.kind !== 'default' && <Trash2 className="danger" size={16} onClick={event => { event.stopPropagation(); deleteSplit(split.id); }} />}
            </button>)}
          </div>
        </section>
      </div>
      <div className="hero-actions">
        <div className="hero-action-buttons">
          <input ref={importInputRef} type="file" accept="application/json,.json" onChange={importWorkspaceFile} hidden />
          <button className="ghost" onClick={() => importInputRef.current?.click()}><Upload size={16}/> Import</button>
          <button className="secondary" onClick={downloadWorkspace} disabled={splits.length === 0} title={splits.length === 0 ? 'Create a split before exporting a workspace.' : 'Export workspace JSON'}><Download size={16}/> Export</button>
          <button className="ghost" onClick={reset}><RotateCcw size={16}/> Reset</button>
        </div>
        <div className="catalog-version-row">
          <label htmlFor="catalog-version-select">Version:</label>
          <select id="catalog-version-select" className="catalog-version-select" aria-label="Dependency catalog version" value={selectedCatalogVersion} onChange={event => setSelectedCatalogVersion(event.target.value)}>
            {catalogVersionOptions.map(version => <option key={version} value={version}>{getDependencyTreeVersionLabel(version)}</option>)}
          </select>
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
        <section className="card available-panel">
          {selectedSplit.kind === 'default' ? (
            <div className="section-title">
              <div>
                <h2>Excluded resources</h2>
                <p>
                  Looking for items you excluded? Click{' '}
                  <button type="button" className="text-link" onClick={() => setResourceDialogType('excluded')}>here</button>
                  {' '}to restore them.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="section-title">
                <div><h2>Core resources available to split</h2><p>Move resources from core into this focused split.</p></div>
                <strong>{availableResources.length}</strong>
              </div>
              <div className="search">
                <Search size={16}/>
                <input value={query} onChange={event => setQuery(event.target.value)} placeholder="filter e.g. flow, routing, outbound" />
                {query && <button className="ghost search-clear" onClick={() => setQuery('')} type="button">clear</button>}
              </div>
              <div className="resource-list">
                {availableResources.map(resource => <div className="resource" key={resource}>
                  <code>{resource}</code>
                  <button onClick={() => moveToSplit(resource)} title={`Add to ${selectedSplit.name}`}><ArrowRight size={14}/> add</button>
                </div>)}
                {availableResources.length === 0 && <p className="empty">No available resources match that filter.</p>}
              </div>
            </>
          )}
        </section>

        <section className="card selected-panel">
          <div className="section-title">
            <div><h2>{selectedSplit.name}</h2><p>{selectedSplit.kind === 'default' ? 'Baseline resources owned by core.' : 'Resources explicitly selected for this focused split.'}</p></div>
            <strong>{selectedSplitResources.length}</strong>
          </div>
          <div className="search">
            <Search size={16}/>
            <input value={selectedQuery} onChange={event => setSelectedQuery(event.target.value)} placeholder="filter selected resources" />
            {selectedQuery && <button className="ghost search-clear" onClick={() => setSelectedQuery('')} type="button">clear</button>}
          </div>
          <div className="resource-list">
            {filteredSelectedSplitResources.map(resource => <div className="resource" key={resource}>
              <code>{resource}</code>
              <div className="actions">
                {selectedSplit.kind !== 'default' && <button className="ghost" onClick={() => removeFromSplit(resource, selectedSplit.id)}>remove</button>}
                <button className="ghost danger" onClick={() => excludeResource(resource)}>exclude</button>
              </div>
            </div>)}
            {filteredSelectedSplitResources.length === 0 && <p className="empty">No selected resources match that filter.</p>}
          </div>
        </section>

        <section className="card output">
          <div className="section-title">
            <div><h2>Generated tooling output</h2><p>Preview generated from the selected split: {selectedGeneratedSplit?.name || 'none'}.</p></div>
          </div>

          <div className="generated-file">
            <div className="generated-file-header">
              <h3>source_export_template.tf</h3>
              <button className="ghost copy-button" onClick={() => copyGeneratedOutput('source_export_template.tf', selectedSourceExportTemplate)} title="Copy source_export_template.tf to clipboard"><ClipboardCopy size={14}/>{copiedOutput === 'source_export_template.tf' ? 'Copied' : 'Copy'}</button>
            </div>
            <pre>{selectedSourceExportTemplate}</pre>
          </div>

          <div className="generated-file">
            <div className="generated-file-header">
              <h3>exclude_resources.csv</h3>
              <button className="ghost copy-button" onClick={() => copyGeneratedOutput('exclude_resources.csv', selectedExcludeResourcesCsv)} title="Copy exclude_resources.csv to clipboard"><ClipboardCopy size={14}/>{copiedOutput === 'exclude_resources.csv' ? 'Copied' : 'Copy'}</button>
            </div>
            <pre>{selectedExcludeResourcesCsv}</pre>
          </div>

          <div className="generated-file replace-entities-control">
            <div className="generated-file-header">
              <h3>Replace Entities</h3>
              <div className="replace-entities-toggle" role="group" aria-label="Replace entities mode">
                <button
                  type="button"
                  className={selectedReplaceEntitiesMode === 'auto' ? 'active' : undefined}
                  onClick={() => setSelectedSplitReplaceEntitiesMode('auto')}
                >
                  auto
                </button>
                <button
                  type="button"
                  className={selectedReplaceEntitiesMode === 'use' ? 'active' : undefined}
                  onClick={() => setSelectedSplitReplaceEntitiesMode('use')}
                >
                  use
                </button>
              </div>
            </div>
          </div>

          <div className="generated-file">
            <div className="generated-file-header">
              <h3>configs.json</h3>
              <button className="ghost copy-button" onClick={() => copyGeneratedOutput('configs.json', selectedConfigsJson)} title="Copy configs.json to clipboard"><ClipboardCopy size={14}/>{copiedOutput === 'configs.json' ? 'Copied' : 'Copy'}</button>
            </div>
            <pre>{selectedConfigsJson}</pre>
          </div>
        </section>
      </main>
  </div>;
}