export const MIN_DEPENDENCY_TREE_VERSION = '1.60.0';
export const LATEST_DEPENDENCY_TREE_VERSION = 'latest';
export const DEPENDENCY_TREE_BASE_URL = 'https://cxascode.github.io/dependency-tree-merged-json';
const DEPENDENCY_TREE_VERSION_CACHE_KEY = 'orgsync-split-modeler-dependency-tree-version-cache';
const DEPENDENCY_TREE_VERSION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function buildDependencyTreeUrl(version = LATEST_DEPENDENCY_TREE_VERSION) {
  if (!version || version === LATEST_DEPENDENCY_TREE_VERSION) {
    return `${DEPENDENCY_TREE_BASE_URL}/latest.json`;
  }

  return `${DEPENDENCY_TREE_BASE_URL}/${version}.json`;
}

function parseVersion(version) {
  if (!version || version === LATEST_DEPENDENCY_TREE_VERSION) return null;

  const parts = version.split('.').map(value => Number.parseInt(value, 10));
  if (parts.length !== 3 || parts.some(value => Number.isNaN(value))) return null;

  const [major, minor, patch] = parts;
  return { major, minor, patch };
}

export function normalizeDependencyTreeVersion(version) {
  if (!version || version === LATEST_DEPENDENCY_TREE_VERSION) return LATEST_DEPENDENCY_TREE_VERSION;

  const parsed = parseVersion(String(version));
  if (!parsed) return LATEST_DEPENDENCY_TREE_VERSION;

  return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
}

export function buildDependencyTreeVersionOptions(latestVersion, minVersion = MIN_DEPENDENCY_TREE_VERSION) {
  const latest = parseVersion(latestVersion);
  const min = parseVersion(minVersion);

  if (!latest || !min || latest.major !== min.major || latest.minor < min.minor) {
    return [LATEST_DEPENDENCY_TREE_VERSION, minVersion];
  }

  const versions = [];

  for (let minor = latest.minor; minor >= min.minor; minor -= 1) {
    versions.push(`${latest.major}.${minor}.0`);
  }

  return [LATEST_DEPENDENCY_TREE_VERSION, ...versions];
}

export function getCachedDependencyTreeVersionOptions(now = Date.now()) {
  if (typeof window === 'undefined') return null;

  try {
    const cached = JSON.parse(window.localStorage.getItem(DEPENDENCY_TREE_VERSION_CACHE_KEY));
    if (!cached || !Array.isArray(cached.options) || !cached.cachedAt) return null;
    if (now - cached.cachedAt > DEPENDENCY_TREE_VERSION_CACHE_TTL_MS) return null;

    return cached.options;
  } catch {
    return null;
  }
}

export function cacheDependencyTreeVersionOptions(latestVersion, now = Date.now()) {
  const options = buildDependencyTreeVersionOptions(latestVersion);

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(DEPENDENCY_TREE_VERSION_CACHE_KEY, JSON.stringify({
        latestVersion,
        options,
        cachedAt: now,
      }));
    } catch {
      // Ignore storage failures. The app can still rebuild options from latest.json.
    }
  }

  return options;
}

export function getDependencyTreeVersionLabel(version) {
  return version === LATEST_DEPENDENCY_TREE_VERSION ? 'Latest' : `v${version}`;
}