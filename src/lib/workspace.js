export const WORKSPACE_SCHEMA = 'orgsync-split-workspace';
export const WORKSPACE_VERSION = 1;

function getWorkspaceSplitKind(split) {
  if (split.kind === 'default' || split.kind === 'focused') return split.kind;
  throw new Error('INVALID_SPLIT_KIND');
}

export function buildWorkspace({ splits, noSyncResources, model }) {
  return {
    schema: WORKSPACE_SCHEMA,
    version: WORKSPACE_VERSION,
    exportedAt: new Date().toISOString(),
    splits: splits.map(split => {
      const generatedSplit = model?.splits?.find(item => item.name === split.name);

      return {
        name: split.name,
        kind: getWorkspaceSplitKind(split),
        selectedResources: Array.isArray(split.selectedResources) ? split.selectedResources : [],
        firstLevelDependencies: generatedSplit?.firstLevelDependencies || [],
        includeFilterResources: generatedSplit?.includeFilterResources || [],
        excludeFilterResources: generatedSplit?.excludeFilterResources || [],
        excludeResources: generatedSplit?.excludeResources || [],
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
      };
    })
    .filter(split => {
      if (!split.name || seenNames.has(split.name)) return false;
      seenNames.add(split.name);
      return true;
    });

  return { splits, noSyncResources };
}