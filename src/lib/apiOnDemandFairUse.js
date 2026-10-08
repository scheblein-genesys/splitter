// Static at build time (Vite bundles ../data/*.json). Not fetched from the web.
// fairUseApiOnDemand.json — API requests/user/month from the Genesys fair use policy article.
// fairUseSkuMap.json — subscriptionoverview partNumber/name → user type + tier (curated).
// Paste both into ~/Documents/Scripts/gcapigetapifairuse.py (FAIR_USE and FAIR_USE_SKU_MAP).
import fairUseData from '../data/fairUseApiOnDemand.json';

const BILLABLE_USER_TYPE_ORDER = [
  'named',
  'concurrent',
  'hourlyInteracting',
  'hourlyLoggedIn',
];

export const API_ON_DEMAND_FAIR_USE = fairUseData;

export function getBillableUserTypeOptions() {
  return BILLABLE_USER_TYPE_ORDER.map(id => ({
    id,
    label: fairUseData.billableUserTypes[id].label,
  }));
}

const LICENSE_TIER_ORDER = fairUseData.licenseTierOrder || Object.keys(fairUseData.licenseTierLabels);

export function getLicenseTierOptions(billableUserType) {
  const config = fairUseData.billableUserTypes[billableUserType];
  if (!config) return [];

  return LICENSE_TIER_ORDER
    .filter(tierId => typeof config.allocationsPerUser[tierId] === 'number')
    .map(tierId => ({
      id: tierId,
      label: fairUseData.licenseTierLabels[tierId] || tierId,
      allocationPerUser: config.allocationsPerUser[tierId],
    }));
}

export function getAllocationPerUser(billableUserType, licenseTier) {
  const config = fairUseData.billableUserTypes[billableUserType];
  if (!config) return null;

  const value = config.allocationsPerUser[licenseTier];
  return typeof value === 'number' ? value : null;
}

export function getDefaultLicenseTier(billableUserType) {
  const options = getLicenseTierOptions(billableUserType);
  return options[0]?.id || 'cx1';
}

export function createCalculatorRow(overrides = {}) {
  const billableUserType = overrides.billableUserType || 'named';

  return {
    id: overrides.id || crypto.randomUUID(),
    billableUserType,
    licenseTier: overrides.licenseTier || getDefaultLicenseTier(billableUserType),
    quantity: overrides.quantity ?? 1,
  };
}

export function normalizeCalculatorRow(row) {
  const billableUserType = fairUseData.billableUserTypes[row.billableUserType]
    ? row.billableUserType
    : 'named';
  const tierOptions = getLicenseTierOptions(billableUserType);
  const tierSet = new Set(tierOptions.map(option => option.id));
  const licenseTier = tierSet.has(row.licenseTier)
    ? row.licenseTier
    : getDefaultLicenseTier(billableUserType);
  const quantity = Number.isFinite(Number(row.quantity)) ? Math.max(0, Math.floor(Number(row.quantity))) : 0;

  return {
    id: row.id || crypto.randomUUID(),
    billableUserType,
    licenseTier,
    quantity,
  };
}

export function summarizeCalculatorRows(rows) {
  const normalizedRows = rows.map(normalizeCalculatorRow);

  const lineItems = normalizedRows.map(row => {
    const allocationPerUser = getAllocationPerUser(row.billableUserType, row.licenseTier) || 0;
    const rowTotal = allocationPerUser * row.quantity;

    return {
      ...row,
      allocationPerUser,
      rowTotal,
      billableUserTypeLabel: fairUseData.billableUserTypes[row.billableUserType].label,
      licenseTierLabel: fairUseData.licenseTierLabels[row.licenseTier] || row.licenseTier,
    };
  });

  const monthlyAllocation = lineItems.reduce((sum, item) => sum + item.rowTotal, 0);
  const billableUserCount = lineItems.reduce((sum, item) => sum + item.quantity, 0);

  return {
    lineItems,
    monthlyAllocation,
    billableUserCount,
  };
}

export function formatApiCount(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}
