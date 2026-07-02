import { getFirstLevelDependencies, getExportResources, getSplitResources } from './resourceModel.js';

const FLOW_RESOURCE_TYPE = 'genesyscloud_flow';

function getLegacyArchitectFlowExporter(selectedResources, firstLevelDependencies) {
  if (selectedResources.includes(FLOW_RESOURCE_TYPE)) return false;
  if (firstLevelDependencies.includes(FLOW_RESOURCE_TYPE)) return true;
  return null;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function isCoreSplit(split) {
  return split.kind === 'default';
}

export function buildSplitModel({ resources, dependencyMap = new Map(), splits, noSyncResources, noSyncSet, stats, validation, coreExcludeFilterResourceExcludes = [] }) {
  const resourceTypes = resources;
  const coreExcludeFilterResourceExcludeSet = new Set(coreExcludeFilterResourceExcludes);
  const effectiveNoSyncSet = noSyncSet || new Set(noSyncResources);
  const effectiveNoSyncResources = uniqueSorted(noSyncResources || [...effectiveNoSyncSet])
    .filter(resource => !coreExcludeFilterResourceExcludeSet.has(resource));
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

  const coreFirstLevelDependencySet = new Set(coreFirstLevelDependencies);
  const coreFocusedDependencyResources = focusedSelectedResources.filter(resource => coreFirstLevelDependencySet.has(resource));
  const coreFocusedFilterResources = focusedSelectedResources.filter(resource => !coreFirstLevelDependencySet.has(resource));
  const coreExcludeFilterResources = uniqueSorted([
    ...coreFocusedFilterResources,
    ...coreExcludeFilterResourceExcludes,
  ]);
  const coreExcludeResources = uniqueSorted([
    ...effectiveNoSyncResources,
    ...coreFocusedDependencyResources,
  ]);

  const coreModel = {
    name: configuredCoreSplit?.name || 'core',
    kind: 'default',
    selectedResources: coreSelectedResources,
    firstLevelDependencies: coreFirstLevelDependencies,
    includeFilterResources: coreExportResources,
    excludeFilterResources: coreExcludeFilterResources,
    excludeResources: coreExcludeResources,
    useLegacyArchitectFlowExporter: getLegacyArchitectFlowExporter(coreSelectedResources, coreFirstLevelDependencies),
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
      useLegacyArchitectFlowExporter: getLegacyArchitectFlowExporter(selectedResources, firstLevelDependencies),
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
