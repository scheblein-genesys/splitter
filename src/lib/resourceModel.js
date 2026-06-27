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

export function getAvailableResources({ resources, assigned, noSyncSet, query }) {
  return resources
    .filter(resource => !assigned.has(resource) && !noSyncSet.has(resource))
    .filter(resource => resource.includes(query));
}

export function getResourceStats({ resources, splits, noSyncResources, assigned, noSyncSet }) {
  return {
    knownResourceCount: resources.length,
    exportedResourceCount: splits.reduce((total, split) => total + getSplitResources(split).length, 0),
    noSyncResourceCount: noSyncResources.length,
    unassignedResourceCount: resources.filter(resource => !assigned.has(resource) && !noSyncSet.has(resource)).length,
  };
}

export function validateSplits({ resources, splits, noSyncSet }) {
  const exportCounts = new Map();

  splits.forEach(split => {
    getSplitResources(split).forEach(resource => {
      exportCounts.set(resource, (exportCounts.get(resource) || 0) + 1);
    });
  });

  const duplicates = [...exportCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([resource]) => resource);

  const uncovered = resources.filter(resource => !exportCounts.has(resource) && !noSyncSet.has(resource));
  const excludedAndExported = [...noSyncSet].filter(resource => exportCounts.has(resource));

  return {
    duplicates,
    uncovered,
    excludedAndExported,
    ok: duplicates.length === 0 && uncovered.length === 0 && excludedAndExported.length === 0,
  };
}

export function getFirstLevelDependencies({ selectedResources, dependencyMap }) {
  const selectedSet = new Set(selectedResources);
  const dependencies = new Set();

  selectedResources.forEach(resource => {
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