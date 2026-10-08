// Static at build time. Sync: paste into ~/Documents/Scripts/gcapigetapifairuse.py (FAIR_USE_SKU_MAP).
// Pair with fairUseApiOnDemand.json (rates from Genesys fair use policy) and fairUseSkuMap.json (this file).
import skuMapData from '../data/fairUseSkuMap.json';

export const FAIR_USE_SKU_MAP = skuMapData;

const GROUPING_SET = new Set(
  (skuMapData.subscriptionLicenseGroupings || []).map(value => String(value).toLowerCase()),
);

const GROUPING_PREFIXES = (skuMapData.subscriptionLicenseGroupingRules?.prefixes || []).map(
  value => String(value).toLowerCase(),
);
const GROUPING_SUFFIXES = (skuMapData.subscriptionLicenseGroupingRules?.suffixes || []).map(
  value => String(value).toLowerCase(),
);

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function* iterPartRules() {
  for (const row of skuMapData.licenseRows || []) {
    const billableUserType = row.billableUserType;
    const licenseTier = row.licenseTier;
    for (const partNumber of row.partNumbers || []) {
      yield { partNumber, billableUserType, licenseTier };
    }
  }
  for (const rule of skuMapData.partNumbers || []) {
    yield rule;
  }
}

function* iterNameRules() {
  for (const row of skuMapData.licenseRows || []) {
    const billableUserType = row.billableUserType;
    const licenseTier = row.licenseTier;
    for (const name of row.subscriptionNames || []) {
      const pattern = `^${escapeRegex(name)}$`;
      yield { pattern, billableUserType, licenseTier };
    }
  }
  for (const rule of skuMapData.namePatterns || []) {
    yield rule;
  }
}

export function isSubscriptionLicenseGrouping(grouping) {
  const g = String(grouping || '').trim().toLowerCase();
  if (!g || g === 'api') return false;
  if (GROUPING_SET.has(g)) return true;
  if (GROUPING_PREFIXES.some(prefix => g.startsWith(prefix)) && GROUPING_SUFFIXES.some(suffix => g.endsWith(suffix))) {
    return true;
  }
  return g === 'user-license' || g.endsWith('-user-license');
}

/**
 * Map subscriptionoverview name/partNumber to fair-use tier keys, or null if not in catalog.
 */
export function mapSubscriptionLine(name, partNumber = '') {
  const normalizedName = String(name || '').trim();
  const normalizedPart = String(partNumber || '').trim();

  for (const rule of iterPartRules()) {
    if (normalizedPart && normalizedPart === rule.partNumber) {
      return {
        billableUserType: rule.billableUserType,
        licenseTier: rule.licenseTier,
        rule: `partNumber:${rule.partNumber}`,
      };
    }
  }

  for (const rule of iterNameRules()) {
    const pattern = new RegExp(rule.pattern);
    if (pattern.test(normalizedName)) {
      return {
        billableUserType: rule.billableUserType,
        licenseTier: rule.licenseTier,
        rule: `name:${rule.pattern}`,
      };
    }
  }

  return null;
}

/** Policy table rows (8 + 6 + 6 + 4) for validation UI or docs. */
export function listFairUseLicenseRows() {
  return (skuMapData.licenseRows || []).map(row => ({
    billableUserType: row.billableUserType,
    licenseTier: row.licenseTier,
    partNumbers: [...(row.partNumbers || [])],
    subscriptionNames: [...(row.subscriptionNames || [])],
  }));
}
