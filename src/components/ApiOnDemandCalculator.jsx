import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Calculator, RotateCcw } from 'lucide-react';
import {
  API_ON_DEMAND_FAIR_USE,
  createCalculatorRow,
  formatApiCount,
  getBillableUserTypeOptions,
  getLicenseTierOptions,
  normalizeCalculatorRow,
  summarizeCalculatorRows,
} from '../lib/apiOnDemandFairUse.js';

function createDefaultCalculatorRows() {
  return [createCalculatorRow()];
}

/** Survives close/unmount so reopening the dialog keeps in-progress work. */
let savedCalculatorRows = null;

function loadCalculatorRows() {
  return savedCalculatorRows ?? createDefaultCalculatorRows();
}

const SUBSCRIPTION_SKUS_WITHOUT_API_POOL = [
  'Genesys Cloud Collaborate User',
  'CX Cloud from Genesys and Salesforce Concurrent',
  'Genesys Cloud for Salesforce Concurrent Add-on',
  'Unified Experience from Genesys and ServiceNow Concurrent',
  'DEV Genesys Cloud Customer Bundle (and other lab/dev bundles)',
  'WEM, Digital, Agent Assist, Work Automation, Agent Copilot, and Speech and Text Analytics add-ons',
];

function CalculatorTableRow({ lineItem, onChange, onRemove, canRemove }) {
  const billableUserTypeOptions = getBillableUserTypeOptions();
  const licenseTierOptions = getLicenseTierOptions(lineItem.billableUserType);
  const showsFullTierList = lineItem.billableUserType === 'named';

  function update(patch) {
    onChange(normalizeCalculatorRow({ ...lineItem, ...patch }));
  }

  return (
    <tr>
      <td>
        <select
          aria-label="Billable user type"
          value={lineItem.billableUserType}
          onChange={event => update({
            billableUserType: event.target.value,
            licenseTier: getLicenseTierOptions(event.target.value)[0]?.id,
          })}
        >
          {billableUserTypeOptions.map(option => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </td>
      <td>
        <select
          aria-label="License tier"
          value={lineItem.licenseTier}
          onChange={event => update({ licenseTier: event.target.value })}
          title={showsFullTierList
            ? 'All eight base tiers from the Named fair use table'
            : 'Tiers available for this user type in the fair use policy'}
        >
          {licenseTierOptions.map(option => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
        {!showsFullTierList && (
          <span className="api-calculator-tier-hint">
            {licenseTierOptions.length} tiers for this user type
          </span>
        )}
      </td>
      <td>
        <input
          aria-label="User count"
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={lineItem.quantity}
          onChange={event => update({ quantity: event.target.value })}
        />
      </td>
      <td className="numeric readonly">{formatApiCount(lineItem.allocationPerUser)}</td>
      <td className="numeric readonly"><strong>{formatApiCount(lineItem.rowTotal)}</strong></td>
      <td className="row-actions">
        <button
          type="button"
          className="ghost danger icon-only"
          onClick={onRemove}
          disabled={!canRemove}
          title="Remove row"
          aria-label="Remove row"
        >
          <Trash2 size={16} />
        </button>
      </td>
    </tr>
  );
}

export default function ApiOnDemandCalculator({ onClose }) {
  const [rows, setRows] = useState(loadCalculatorRows);

  useEffect(() => {
    savedCalculatorRows = rows;
  }, [rows]);

  const summary = useMemo(() => summarizeCalculatorRows(rows), [rows]);

  function updateRow(id, nextRow) {
    setRows(current => current.map(row => (row.id === id ? nextRow : row)));
  }

  function removeRow(id) {
    setRows(current => current.filter(row => row.id !== id));
  }

  function addRow() {
    setRows(current => [...current, createCalculatorRow()]);
  }

  function resetCalculator() {
    const next = createDefaultCalculatorRows();
    savedCalculatorRows = next;
    setRows(next);
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="card api-calculator-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-calculator-title"
        onClick={event => event.stopPropagation()}
      >
        <div className="section-title">
          <div>
            <p className="eyebrow"><Calculator size={14} aria-hidden="true" /> Fair use</p>
            <h2 id="api-calculator-title">API on-demand monthly allocation</h2>
            <p>
              Per-user allocations from the{' '}
              <a href={API_ON_DEMAND_FAIR_USE.sourceUrl} target="_blank" rel="noreferrer">
                Genesys Cloud fair use policy
              </a>
              . Base license tiers are Communicate, CX 1–4 (including Digital), and EX for
              Named users; Concurrent and Hourly user types in the policy include only the tiers
              listed for that type.
            </p>
          </div>
          <div className="api-calculator-dialog-actions">
            <button type="button" className="ghost" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="api-calculator-table-section">
          <div className="api-calculator-table-toolbar">
            <div className="split-nav-actions">
              <button type="button" onClick={addRow}><Plus size={16} /> Add row</button>
              <button type="button" className="ghost" onClick={resetCalculator}>
                <RotateCcw size={16} /> Reset
              </button>
            </div>
          </div>

          <div className="api-calculator-table-wrap">
            <table className="api-calculator-table">
            <thead>
              <tr>
                <th>User type</th>
                <th>License tier</th>
                <th>Users</th>
                <th className="numeric">Per user / month</th>
                <th className="numeric">Row total</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {summary.lineItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="api-calculator-empty">
                    No rows yet. Use Add row to begin.
                  </td>
                </tr>
              )}
              {summary.lineItems.map(lineItem => (
                <CalculatorTableRow
                  key={lineItem.id}
                  lineItem={lineItem}
                  canRemove
                  onChange={nextRow => updateRow(lineItem.id, nextRow)}
                  onRemove={() => removeRow(lineItem.id)}
                />
              ))}
            </tbody>
            </table>
          </div>
        </div>

        <details className="api-calculator-no-pool">
          <summary>Common subscriptions with no API on-demand</summary>
          <div className="api-calculator-no-pool-body">
            <p>
              This calculator follows the fair use <strong>API on-demand</strong> table only (Communicate,
              CX, EX by user type). Lines on your subscription overview that are not in that table do not
              increase prepay allocation — the tool is not missing them.
            </p>
            <ul>
              {SUBSCRIPTION_SKUS_WITHOUT_API_POOL.map(label => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          </div>
        </details>

        <div className="api-calculator-footer">
          <div className="api-calculator-totals">
            <div className="api-calculator-total-card">
              <p className="eyebrow">Billable users</p>
              <strong>{formatApiCount(summary.billableUserCount)}</strong>
            </div>
            <div className="api-calculator-total-card primary">
              <p className="eyebrow">Monthly API on-demand allocation</p>
              <strong>{formatApiCount(summary.monthlyAllocation)}</strong>
              <span>{API_ON_DEMAND_FAIR_USE.unit}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
