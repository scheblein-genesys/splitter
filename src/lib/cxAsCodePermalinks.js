import { LATEST_DEPENDENCY_TREE_VERSION } from './dependencyTreeVersions.js';

export const CX_AS_CODE_BASE_URL = 'https://cxascode.github.io';
export const ROLE_READ_WRITE_SEGMENT = 'read-write';
export const ROLE_READ_ONLY_SEGMENT = 'read-only';
export const ROLE_READ_WRITE_CSV_SEGMENT = 'read-write-csv';
export const ROLE_READ_ONLY_CSV_SEGMENT = 'read-only-csv';

function toVersionPathSegment(version) {
  if (!version || version === LATEST_DEPENDENCY_TREE_VERSION) return '';

  const bare = String(version).trim().replace(/^v/i, '');
  return bare ? `v${bare}` : '';
}

export function buildRoleDownloadUrl(roleSegment, version = LATEST_DEPENDENCY_TREE_VERSION) {
  const base = `${CX_AS_CODE_BASE_URL}/roles/${roleSegment}`;
  const versionSegment = toVersionPathSegment(version);
  return versionSegment ? `${base}/${versionSegment}` : base;
}
