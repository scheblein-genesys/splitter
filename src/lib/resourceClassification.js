import {
  LATEST_DEPENDENCY_TREE_VERSION,
  normalizeDependencyTreeVersion,
} from './dependencyTreeVersions.js';

export const RESOURCE_CLASSIFICATION_BASE_URL = 'https://cxascode.github.io/resource-classification';
export const RESOURCE_CLASSIFICATION_INDEX_URL = `${RESOURCE_CLASSIFICATION_BASE_URL}/index.json`;

export function buildResourceClassificationUrl(version = LATEST_DEPENDENCY_TREE_VERSION) {
  if (!version || version === LATEST_DEPENDENCY_TREE_VERSION) {
    return `${RESOURCE_CLASSIFICATION_BASE_URL}/latest.json`;
  }

  return `${RESOURCE_CLASSIFICATION_BASE_URL}/${version}.json`;
}

function normalizeTypeList(values) {
  if (!Array.isArray(values)) return [];

  return [
    ...new Set(
      values
        .filter(entry => typeof entry === 'string' && entry.trim())
        .map(entry => entry.trim()),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

export function normalizeClassificationDocument(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return {
    version: value.version || null,
    deprecatedResourceTypes: normalizeTypeList(value.deprecatedResourceTypes),
    nonExportableResourceTypes: normalizeTypeList(value.nonExportableResourceTypes),
    cannotBeDestroyedResourceTypes: normalizeTypeList(value.cannotBeDestroyedResourceTypes),
  };
}

function parseVersionParts(version) {
  if (!version || version === LATEST_DEPENDENCY_TREE_VERSION) return null;

  const parts = String(version).split('.').map(value => Number.parseInt(value, 10));
  if (parts.length !== 3 || parts.some(value => Number.isNaN(value))) return null;

  return parts;
}

function compareVersionParts(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }

  return 0;
}

export function normalizeClassificationVersionList(index) {
  const entries = Array.isArray(index)
    ? index
    : Array.isArray(index?.versions)
      ? index.versions
      : [];

  return entries
    .map(entry => normalizeDependencyTreeVersion(typeof entry === 'string' ? entry : entry?.version))
    .filter(version => version && version !== LATEST_DEPENDENCY_TREE_VERSION);
}

export function resolveClassificationFileVersion(requestedVersion, availableVersions, catalogVersion = null) {
  const normalizedAvailable = normalizeClassificationVersionList(availableVersions);
  if (normalizedAvailable.length === 0) {
    return requestedVersion || LATEST_DEPENDENCY_TREE_VERSION;
  }

  const targetVersion = requestedVersion !== LATEST_DEPENDENCY_TREE_VERSION
    ? normalizeDependencyTreeVersion(requestedVersion)
    : catalogVersion
      ? normalizeDependencyTreeVersion(catalogVersion)
      : normalizedAvailable[0];

  if (!targetVersion || targetVersion === LATEST_DEPENDENCY_TREE_VERSION) {
    return LATEST_DEPENDENCY_TREE_VERSION;
  }

  if (normalizedAvailable.includes(targetVersion)) {
    return targetVersion;
  }

  const targetParts = parseVersionParts(targetVersion);
  if (!targetParts) return LATEST_DEPENDENCY_TREE_VERSION;

  const nearestLower = normalizedAvailable
    .map(version => ({ version, parts: parseVersionParts(version) }))
    .filter(entry => entry.parts && compareVersionParts(entry.parts, targetParts) <= 0)
    .sort((left, right) => compareVersionParts(right.parts, left.parts))[0];

  return nearestLower?.version || normalizedAvailable[normalizedAvailable.length - 1];
}

function filterToKnownTypes(types, knownResourceTypes) {
  if (!knownResourceTypes) return normalizeTypeList(types);

  const knownSet = new Set(knownResourceTypes);
  return normalizeTypeList(types).filter(type => knownSet.has(type));
}

/**
 * Split OrgSync policy from provider exportability signals.
 *
 * exclude_filter_resources should list exportable types you intentionally skip.
 * Non-exportable types are omitted from that filter — excluding them is redundant
 * (same rule as cxascode lab package generation).
 */
export function resolveCoreExportClassification(
  policyExcludes,
  classification,
  knownResourceTypes = null,
) {
  const policyExcludeResources = filterToKnownTypes(policyExcludes, knownResourceTypes);
  const nonExportableResourceTypes = filterToKnownTypes(
    classification?.nonExportableResourceTypes,
    knownResourceTypes,
  );
  const nonExportableSet = new Set(nonExportableResourceTypes);

  // Policy excludes apply only while the type can still be bulk-exported.
  const excludeFilterResources = policyExcludeResources.filter(type => !nonExportableSet.has(type));

  const coreSelectionExcludes = filterToKnownTypes([
    ...policyExcludeResources,
    ...nonExportableResourceTypes,
  ], knownResourceTypes);

  return {
    excludeFilterResources,
    nonExportableResourceTypes,
    coreSelectionExcludes,
  };
}

export async function fetchResourceClassificationDocument(version, {
  catalogVersion = null,
  availableVersions = null,
  signal = null,
} = {}) {
  let versions = availableVersions;

  if (!versions) {
    const indexResponse = await fetch(RESOURCE_CLASSIFICATION_INDEX_URL, {
      cache: 'no-store',
      signal,
    });

    if (!indexResponse.ok) {
      throw new Error(`Resource classification index request failed: ${indexResponse.status}`);
    }

    versions = await indexResponse.json();
  }

  const fileVersion = resolveClassificationFileVersion(version, versions, catalogVersion);
  const response = await fetch(buildResourceClassificationUrl(fileVersion), {
    cache: 'no-store',
    signal,
  });

  if (!response.ok) {
    throw new Error(`Resource classification request failed: ${response.status}`);
  }

  const document = normalizeClassificationDocument(await response.json());
  if (!document) {
    throw new Error('Resource classification response was not a valid JSON document.');
  }

  return document;
}
