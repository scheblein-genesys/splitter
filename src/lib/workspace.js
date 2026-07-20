export const WORKSPACE_SCHEMA = 'orgsync-split-modeler';
export const WORKSPACE_VERSION = 1;
export const DEFAULT_REPLACE_ENTITIES_MODE = 'auto';

function getWorkspaceSplitKind(split) {
  if (split.kind === 'default' || split.kind === 'focused') return split.kind;
  throw new Error('INVALID_SPLIT_KIND');
}

function parseReplaceEntitiesMode(value) {
  return value === 'use' ? 'use' : DEFAULT_REPLACE_ENTITIES_MODE;
}

export function getCheckExportResourceList(generatedSplit) {
  if (generatedSplit?.kind !== 'focused') return [];
  return generatedSplit.selectedResources || [];
}

function buildSplitGeneratedOutputs(generatedSplit) {
  const kind = generatedSplit?.kind === 'focused' ? 'focused' : 'default';

  return {
    firstLevelDependencies: generatedSplit?.firstLevelDependencies || [],
    excludeResources: generatedSplit?.excludeResources || [],
    autoReplaceExcludeResources: generatedSplit?.autoReplaceExcludeResources || [],
    autoReplaceResourceList: generatedSplit?.autoReplaceResourceList || [],
    checkExportResourceList: getCheckExportResourceList(generatedSplit),
    useLegacyArchitectFlowExporter: generatedSplit?.useLegacyArchitectFlowExporter ?? null,
    ...(kind === 'default'
      ? { excludeFilterResources: generatedSplit?.excludeFilterResources || [] }
      : { includeFilterResources: generatedSplit?.includeFilterResources || [] }),
  };
}

export function buildWorkspace({ splits, noSyncResources, model, catalogVersion = null }) {
  return {
    schema: WORKSPACE_SCHEMA,
    version: WORKSPACE_VERSION,
    exportedAt: new Date().toISOString(),
    catalogVersion,
    splits: splits.map(split => {
      const generatedSplit = model?.splits?.find(item => item.name === split.name);
      const kind = getWorkspaceSplitKind(split);

      return {
        name: split.name,
        kind,
        selectedResources: Array.isArray(split.selectedResources) ? split.selectedResources : [],
        replaceEntitiesMode: parseReplaceEntitiesMode(split.replaceEntitiesMode),
        ...buildSplitGeneratedOutputs(generatedSplit),
      };
    }),
    noSyncResources,
  };
}

export function downloadJsonFile({ filename, data }) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}

export function parseWorkspace({ rawText, knownResources, cleanName, createId }) {
  const workspace = JSON.parse(rawText || '{}');

  if (workspace.schema !== WORKSPACE_SCHEMA || !Array.isArray(workspace.splits) || !Array.isArray(workspace.noSyncResources)) {
    throw new Error('INVALID_WORKSPACE');
  }

  const knownResourceSet = new Set(knownResources);

  const noSyncResources = [...new Set(workspace.noSyncResources)]
    .filter(resource => knownResourceSet.has(resource))
    .sort();

  const seenNames = new Set();
  const splits = workspace.splits
    .map(split => {
      const name = cleanName(String(split.name || ''));
      const selectedResources = Array.isArray(split.selectedResources)
        ? [...new Set(split.selectedResources)].filter(resource => knownResourceSet.has(resource)).sort()
        : [];
      const kind = getWorkspaceSplitKind(split);

      return {
        id: kind === 'default' ? 'core' : createId(),
        name,
        kind,
        selectedResources,
        replaceEntitiesMode: parseReplaceEntitiesMode(split.replaceEntitiesMode),
      };
    })
    .filter(split => {
      if (!split.name || seenNames.has(split.name)) return false;
      seenNames.add(split.name);
      return true;
    });

  return { splits, noSyncResources, catalogVersion: workspace.catalogVersion || null };
}