/** Path segment that opens the API on-demand fair use calculator dialog. */
export const API_CALCULATOR_SEGMENT = 'apis';

function normalizePath(pathname) {
  const path = String(pathname || '/');
  if (path.length > 1 && path.endsWith('/')) {
    return path.slice(0, -1);
  }
  return path || '/';
}

/** App mount path without trailing slash (e.g. `/splitter` or `/`). */
export function getAppBasePath() {
  const baseUrl = import.meta.env.BASE_URL || '/';
  if (baseUrl === './') {
    const path = normalizePath(window.location.pathname);
    const suffix = `/${API_CALCULATOR_SEGMENT}`;
    if (path === suffix || path.endsWith(suffix)) {
      const parent = path.slice(0, -suffix.length);
      return parent || '/';
    }
    return path;
  }
  return normalizePath(new URL(baseUrl, 'http://localhost').pathname);
}

export function getAppRootHref(search = window.location.search) {
  const base = getAppBasePath();
  const path = base === '/' ? '/' : `${base}/`;
  return `${path}${search}`;
}

export function getApiCalculatorPath() {
  const base = getAppBasePath();
  return base === '/' ? `/${API_CALCULATOR_SEGMENT}` : `${base}/${API_CALCULATOR_SEGMENT}`;
}

export function isApiCalculatorPathOpen(pathname = window.location.pathname) {
  return normalizePath(pathname) === normalizePath(getApiCalculatorPath());
}

/** Upgrade old `#apis` bookmarks to `/apis`. */
export function migrateLegacyApiCalculatorHash() {
  const legacy = String(window.location.hash || '').replace(/^#/, '');
  if (legacy !== API_CALCULATOR_SEGMENT) return false;
  window.history.replaceState(
    null,
    '',
    `${getApiCalculatorPath()}${window.location.search}`,
  );
  return true;
}

export function setApiCalculatorPathOpen(open) {
  const search = window.location.search;
  if (open) {
    if (!isApiCalculatorPathOpen()) {
      window.history.pushState(
        { apiCalculator: true },
        '',
        `${getApiCalculatorPath()}${search}`,
      );
    }
    return;
  }
  if (isApiCalculatorPathOpen()) {
    window.history.replaceState(null, '', getAppRootHref(search));
  }
}
