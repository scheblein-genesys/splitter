export function cleanName(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getAssignedResources(splits) {
  return new Map(splits.flatMap(split => getSplitResources(split).map(resource => [resource, split.name])));
}

export function resourceMatchesQuery(resource, query) {
  return resource.toLowerCase().includes(query.toLowerCase());
}

export function getAvailableResources({ resources, assigned, noSyncSet, query }) {
  return resources
    .filter(resource => !assigned.has(resource) && !noSyncSet.has(resource))
    .filter(resource => resourceMatchesQuery(resource, query));
}

export function getResourceStats({ resources, splits, noSyncResources, assigned, noSyncSet }) {
  return {
    knownResourceCount: resources.length,
    exportedResourceCount: splits.reduce((total, split) => total + getSplitResources(split).length, 0),
    noSyncResourceCount: noSyncResources.length,
    unassignedResourceCount: resources.filter(resource => !assigned.has(resource) && !noSyncSet.has(resource)).length,
  };
}

export function validateSplits({ resources, splits, noSyncSet, coreDefaultExcludeSet = new Set() }) {
  const exportCounts = new Map();

  splits.forEach(split => {
    getSplitResources(split).forEach(resource => {
      exportCounts.set(resource, (exportCounts.get(resource) || 0) + 1);
    });
  });

  const duplicates = [...exportCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([resource]) => resource);

  const uncovered = resources.filter(resource => {
    if (noSyncSet.has(resource)) return false;
    if (coreDefaultExcludeSet.has(resource)) return false;
    if (exportCounts.has(resource)) return false;
    return true;
  });
  const excludedAndExported = [...noSyncSet].filter(resource => exportCounts.has(resource));

  return {
    duplicates,
    uncovered,
    excludedAndExported,
    ok: duplicates.length === 0 && uncovered.length === 0 && excludedAndExported.length === 0,
  };
}

const DEPENDENCY_EXPANSION_BLOCKLIST = new Set([
  'genesyscloud_flow',
  'genesyscloud_script',
]);

export function getFirstLevelDependencies({ selectedResources, dependencyMap }) {
  const selectedSet = new Set(selectedResources);
  const dependencies = new Set();

  selectedResources.forEach(resource => {
    if (DEPENDENCY_EXPANSION_BLOCKLIST.has(resource)) return;

    (dependencyMap.get(resource) || []).forEach(dependency => {
      if (!selectedSet.has(dependency)) {
        dependencies.add(dependency);
      }
    });
  });

  return [...dependencies].sort();
}

export function getExportResources({ selectedResources, dependencyMap }) {
  return [...new Set([
    ...selectedResources,
    ...getFirstLevelDependencies({ selectedResources, dependencyMap }),
  ])].sort();
}

export function getSplitResources(split) {
  if (!split) return [];
  return Array.isArray(split.selectedResources) ? split.selectedResources : [];
}

/**
 * Normalize split ownership after import or catalog refresh.
 * Core owns catalog types except no-sync, focused assignments, and coreDefaultExcludes
 * (TF policy + non-exportable — intentionally off core until assigned elsewhere).
 */
export function reconcileSplitOwnership(resourceTypes, splits, noSyncResources, coreDefaultExcludes = []) {
  const resourceTypeSet = new Set(resourceTypes);
  const noSyncSet = new Set(noSyncResources);
  const coreDefaultExcludeSet = new Set(coreDefaultExcludes);
  const focusedSplits = splits.filter(split => split.kind !== 'default');
  const coreSplit = splits.find(split => split.kind === 'default') || {
    id: 'core',
    name: 'core',
    kind: 'default',
  };

  const focusedSelectedSet = new Set();
  const normalizedFocused = focusedSplits.map(split => {
    const selectedResources = getSplitResources(split)
      .filter(resource => resourceTypeSet.has(resource) && !noSyncSet.has(resource))
      .sort();

    selectedResources.forEach(resource => focusedSelectedSet.add(resource));

    return { ...split, selectedResources };
  });

  const coreSelectedResources = resourceTypes
    .filter(resource => !noSyncSet.has(resource))
    .filter(resource => !focusedSelectedSet.has(resource))
    .filter(resource => !coreDefaultExcludeSet.has(resource))
    .sort();

  return [{ ...coreSplit, selectedResources: coreSelectedResources }, ...normalizedFocused];
}