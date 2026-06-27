import { getFirstLevelDependencies, getExportResources, getSplitResources } from './resourceModel.js';

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function isCoreSplit(split) {
  return split.kind === 'default';
}

export function buildSplitModel({ resources, dependencyMap = new Map(), splits, noSyncResources, noSyncSet, stats, validation }) {
  const resourceTypes = resources;
  const effectiveNoSyncSet = noSyncSet || new Set(noSyncResources);
  const effectiveNoSyncResources = uniqueSorted(noSyncResources || [...effectiveNoSyncSet]);
  const configuredCoreSplit = splits.find(isCoreSplit);
  const focusedSplits = splits.filter(split => !isCoreSplit(split));

  const focusedSelectedResources = uniqueSorted(focusedSplits.flatMap(split => getSplitResources(split)));
  const focusedSelectedSet = new Set(focusedSelectedResources);

  const coreSelectedResources = configuredCoreSplit
    ? getSplitResources(configuredCoreSplit)
      .filter(resource => !effectiveNoSyncSet.has(resource))
      .filter(resource => !focusedSelectedSet.has(resource))
      .sort()
    : resourceTypes
      .filter(resource => !effectiveNoSyncSet.has(resource))
      .filter(resource => !focusedSelectedSet.has(resource))
      .sort();

  const coreFirstLevelDependencies = getFirstLevelDependencies({
    selectedResources: coreSelectedResources,
    dependencyMap,
  });

  const coreExportResources = getExportResources({
    selectedResources: coreSelectedResources,
    dependencyMap,
  });

  const coreExcludeResources = uniqueSorted([
    ...effectiveNoSyncResources,
    ...focusedSelectedResources,
  ]);

  const coreModel = {
    name: configuredCoreSplit?.name || 'core',
    kind: 'default',
    selectedResources: coreSelectedResources,
    firstLevelDependencies: coreFirstLevelDependencies,
    includeFilterResources: coreExportResources,
    excludeResources: coreExcludeResources,
  };

  const focusedModels = focusedSplits.map(split => {
    const selectedResources = getSplitResources(split).sort();
    const firstLevelDependencies = getFirstLevelDependencies({
      selectedResources,
      dependencyMap,
    });
    const exportResources = getExportResources({
      selectedResources,
      dependencyMap,
    });
    const selectedSet = new Set(selectedResources);

    const excludeResources = exportResources.filter(resource => !selectedSet.has(resource)).sort();

    return {
      name: split.name,
      kind: 'focused',
      selectedResources,
      firstLevelDependencies,
      includeFilterResources: exportResources,
      excludeResources,
    };
  });

  return {
    summary: {
      knownResourceTypes: stats.knownResourceCount,
      exportedResources: stats.exportedResourceCount,
      noSyncResources: stats.noSyncResourceCount,
      availableUnassigned: stats.unassignedResourceCount,
      splitCount: splits.length,
    },
    splits: [coreModel, ...focusedModels],
    noSyncResources: effectiveNoSyncResources,
    rawValidation: {
      ...validation,
      startup: splits.length === 0,
    },
  };
}
