import { FIELD_DEFS, FieldDef, ConsignmentValues } from './fields';

/**
 * Deterministic parsing and cross-checks for consignment values.
 * Nothing here calls the model, so every check is reproducible and testable.
 */

export type Severity = 'error' | 'warning';

export interface Issue {
  /** Stable id so the client can acknowledge a specific issue. */
  id: string;
  severity: Severity;
  fields: string[];
  message: string;
}

type Parsed<T> = { ok: true; value: T; note?: string } | { ok: false; error: string };

// Weights within this many MT are treated as equal (half a kilogram).
const WEIGHT_TOLERANCE_MT = 0.0005;

/**
 * Parses a weight into metric tonnes.
 * LRs are usually written in MT with 3 decimals ("47.220"); gate passes and
 * weighbridge slips in kg ("47220"). A whole number >= 1000 is taken as kg.
 */
export function parseWeightMt(raw: string): Parsed<number> {
  let s = raw.trim().toUpperCase();
  const saysKg = /KG/.test(s);
  const saysMt = /\b(MT|TON|TONS|TONNE|TONNES|T)\b/.test(s);
  s = s.replace(/KGS?\.?|MTS?\.?|TONNES?|TONS?|\bT\b/g, '').replace(/\s+/g, '');

  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
    s = s.replace(/,/g, '');
  } else if (s.includes(',')) {
    return { ok: false, error: `"${raw}" has a comma that could be a decimal point or a thousands separator` };
  }
  if (!/^\d+(\.\d+)?$/.test(s)) {
    return { ok: false, error: `"${raw}" is not a number` };
  }

  const n = Number(s);
  const hasDecimal = s.includes('.');
  if (saysKg || (!saysMt && !hasDecimal && n >= 1000)) {
    return { ok: true, value: roundMt(n / 1000), note: 'converted from kg' };
  }
  if (n >= 1000) {
    return { ok: false, error: `"${raw}" is too large to be tonnes and has a decimal point; check the unit` };
  }
  return { ok: true, value: roundMt(n) };
}

function roundMt(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function formatMt(n: number): string {
  return n.toFixed(3);
}

export function parseAmount(raw: string): Parsed<number> {
  const s = raw.trim().replace(/^(RS\.?|INR|₹)\s*/i, '').replace(/[,\s]/g, '').replace(/\/-$/, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    return { ok: false, error: `"${raw}" is not an amount` };
  }
  return { ok: true, value: Number(s) };
}

/** Parses Indian day-first dates: 5/8/26, 05-08-2026, 08.05.26, 5 8 26. Returns YYYY-MM-DD. */
export function parseIndianDate(raw: string): Parsed<string> {
  const m = raw.trim().match(/^(\d{1,2})\s*[/.\-\s:]\s*(\d{1,2})\s*[/.\-\s:]\s*(\d{2}|\d{4})$/);
  if (!m) {
    return { ok: false, error: `"${raw}" is not a DD/MM/YY date` };
  }
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return { ok: false, error: `"${raw}" is not a real calendar date` };
  }
  return { ok: true, value: `${year}-${pad2(month)}-${pad2(day)}` };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatIndianDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Standard series (GJ39TB4445, MH12AB1234, DL1CAB1234) and Bharat series (22BH1234AA).
const TRUCK_PATTERNS = [/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/, /^\d{2}BH\d{4}[A-Z]{1,2}$/];

export function normalizeTruck(raw: string): Parsed<string> {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!TRUCK_PATTERNS.some((p) => p.test(s))) {
    return { ok: false, error: `"${raw}" does not look like an Indian registration number` };
  }
  return { ok: true, value: s };
}

/** Canonical form of a value for display, comparison and storage. Unparseable values are returned trimmed. */
export function canonicalize(def: FieldDef, raw: string): string {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return '';
  switch (def.kind) {
    case 'weight': {
      const p = parseWeightMt(s);
      return p.ok ? formatMt(p.value) : s;
    }
    case 'date': {
      const p = parseIndianDate(s);
      return p.ok ? formatIndianDate(p.value) : s;
    }
    case 'truck': {
      const p = normalizeTruck(s);
      return p.ok ? p.value : s.toUpperCase();
    }
    case 'amount': {
      const p = parseAmount(s);
      return p.ok ? String(p.value) : s;
    }
    default:
      return s;
  }
}

/** Loose comparison key: ignores case, spaces and punctuation. */
export function comparisonKey(def: FieldDef, raw: string | null): string {
  return canonicalize(def, raw ?? '').toUpperCase().replace(/[^A-Z0-9.]/g, '');
}

function get(values: ConsignmentValues, key: string): string {
  return (values[key] ?? '').trim();
}

/**
 * Validates reviewed values. Errors must be fixed or explicitly overridden
 * before the row is written; warnings are informational.
 */
export function validateConsignment(values: ConsignmentValues, today: Date = new Date()): Issue[] {
  const issues: Issue[] = [];
  const weights: Record<string, number> = {};
  const dates: Record<string, string> = {};

  for (const def of FIELD_DEFS) {
    const v = get(values, def.key);
    if (!v) {
      if (def.required) {
        issues.push({ id: `required:${def.key}`, severity: 'error', fields: [def.key], message: `${def.label} is required` });
      }
      continue;
    }

    let parsed: Parsed<unknown> | null = null;
    if (def.kind === 'weight') parsed = parseWeightMt(v);
    else if (def.kind === 'date') parsed = parseIndianDate(v);
    else if (def.kind === 'truck') parsed = normalizeTruck(v);
    else if (def.kind === 'amount') parsed = parseAmount(v);

    if (parsed && !parsed.ok) {
      issues.push({ id: `format:${def.key}`, severity: 'error', fields: [def.key], message: `${def.label}: ${parsed.error}` });
      continue;
    }
    if (parsed?.ok && def.kind === 'weight') weights[def.key] = parsed.value as number;
    if (parsed?.ok && def.kind === 'date') dates[def.key] = parsed.value as string;
  }

  checkNet(issues, weights, 'grossWeight', 'tareWeight', 'netWeight', 'LR');
  checkNet(issues, weights, 'gpGrossWeight', 'gpTareWeight', 'gpNetWeight', 'Gate pass');

  for (const def of FIELD_DEFS.filter((d) => d.kind === 'weight' && d.section === 'lr')) {
    const gpKey = `gp${def.key[0].toUpperCase()}${def.key.slice(1)}`;
    const a = weights[def.key];
    const b = weights[gpKey];
    if (a !== undefined && b !== undefined && Math.abs(a - b) > WEIGHT_TOLERANCE_MT) {
      issues.push({
        id: `mismatch:${def.key}`,
        severity: 'error',
        fields: [def.key, gpKey],
        message: `${def.label} on LR (${formatMt(a)}) differs from gate pass (${formatMt(b)})`,
      });
    }
  }

  const lrTruck = normalizeTruck(get(values, 'truckNumber'));
  const gpTruck = normalizeTruck(get(values, 'gpTruckNumber'));
  if (lrTruck.ok && gpTruck.ok && lrTruck.value !== gpTruck.value) {
    issues.push({
      id: 'mismatch:truckNumber',
      severity: 'error',
      fields: ['truckNumber', 'gpTruckNumber'],
      message: `Truck No on LR (${lrTruck.value}) differs from gate pass (${gpTruck.value})`,
    });
  }

  if (dates.lrDate && dates.gatePassDate && dates.lrDate !== dates.gatePassDate) {
    issues.push({
      id: 'mismatch:date',
      severity: 'warning',
      fields: ['lrDate', 'gatePassDate'],
      message: `LR date (${formatIndianDate(dates.lrDate)}) differs from gate pass date (${formatIndianDate(dates.gatePassDate)})`,
    });
  }

  const todayIso = indiaDate(today);
  const yearAgo = indiaDate(new Date(today.getTime() - 365 * 24 * 3600 * 1000));
  for (const key of ['lrDate', 'gatePassDate']) {
    const iso = dates[key];
    if (!iso) continue;
    const label = FIELD_DEFS.find((d) => d.key === key)!.label;
    if (iso > todayIso) {
      issues.push({ id: `future:${key}`, severity: 'error', fields: [key], message: `${label} ${formatIndianDate(iso)} is in the future — day and month may be swapped or misread` });
    } else if (iso < yearAgo) {
      issues.push({ id: `old:${key}`, severity: 'warning', fields: [key], message: `${label} ${formatIndianDate(iso)} is more than a year old` });
    }
  }

  if (!get(values, 'gatePassNumber') && Object.keys(values).some((k) => k.startsWith('gp') && get(values, k))) {
    issues.push({ id: 'required:gatePassNumber', severity: 'warning', fields: ['gatePassNumber'], message: 'Gate pass details present but Gate Pass No is empty' });
  }

  return issues;
}

/** YYYY-MM-DD in India time, so documents dated "today" never look like they are in the future. */
function indiaDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function checkNet(
  issues: Issue[],
  w: Record<string, number>,
  grossKey: string,
  tareKey: string,
  netKey: string,
  label: string
) {
  const gross = w[grossKey];
  const tare = w[tareKey];
  const net = w[netKey];
  if (gross === undefined || tare === undefined || net === undefined) return;
  const expected = roundMt(gross - tare);
  if (Math.abs(expected - net) > WEIGHT_TOLERANCE_MT) {
    issues.push({
      id: `arith:${netKey}`,
      severity: 'error',
      fields: [grossKey, tareKey, netKey],
      message: `${label}: Gross ${formatMt(gross)} − Tare ${formatMt(tare)} = ${formatMt(expected)}, but Net is ${formatMt(net)}`,
    });
  }
  if (tare >= gross) {
    issues.push({ id: `arith:${tareKey}`, severity: 'error', fields: [grossKey, tareKey], message: `${label}: Tare weight is not less than gross weight` });
  }
}
