/**
 * Resources listed in excludeResources but omitted from autoReplaceExcludeResources
 * (auto replace only supports a fixed allowlist of types).
 */
export function getResourcesOmittedFromAutoReplaceCsv(excludeResources, autoReplaceExcludeResources) {
  const autoSet = new Set(autoReplaceExcludeResources || []);
  return (excludeResources || []).filter(resource => !autoSet.has(resource)).sort();
}

/**
 * Subset of omissions for types explicitly assigned to a focused split (not core).
 */
export function getFocusedOwnedAutoReplaceOmissions(omissions, assignedResourceToSplit) {
  if (!assignedResourceToSplit || omissions.length === 0) return [];

  return omissions
    .filter(resource => assignedResourceToSplit.has(resource))
    .map(resource => ({
      resource,
      splitName: assignedResourceToSplit.get(resource),
    }))
    .sort((left, right) => left.resource.localeCompare(right.resource));
}
