import ExcelJS from 'exceljs';
import { FIELD_DEFS, FieldDef, ConsignmentValues } from './fields';
import { parseAmount, parseIndianDate, parseWeightMt, normalizeTruck } from './normalize';

const SHEET_NAME = 'Consignments';
const IST_OFFSET_MS = 330 * 60 * 1000;

interface ColumnDef {
  header: string;
  width: number;
  field?: FieldDef;
}

const META_BEFORE: ColumnDef[] = [{ header: 'Appended At (IST)', width: 20 }];
const META_AFTER: ColumnDef[] = [
  { header: 'Overridden Checks', width: 40 },
  { header: 'Source Photo', width: 30 },
  { header: 'Appended By', width: 28 },
];

export const COLUMNS: ColumnDef[] = [
  ...META_BEFORE,
  ...FIELD_DEFS.map((f) => ({ header: f.label, width: f.kind === 'text' ? 22 : 15, field: f })),
  ...META_AFTER,
];

export interface RowMeta {
  appendedAt: Date;
  appendedBy: string;
  overriddenChecks: string[];
  sourcePhotoLink?: string;
}

function cellValue(def: FieldDef, raw: string): ExcelJS.CellValue {
  const v = raw.trim();
  if (!v) return null;
  switch (def.kind) {
    case 'weight': {
      const p = parseWeightMt(v);
      return p.ok ? p.value : v;
    }
    case 'amount': {
      const p = parseAmount(v);
      return p.ok ? p.value : v;
    }
    case 'date': {
      const p = parseIndianDate(v);
      if (!p.ok) return v;
      const [y, m, d] = p.value.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d));
    }
    case 'truck': {
      const p = normalizeTruck(v);
      return p.ok ? p.value : v;
    }
    default:
      return v;
  }
}

function numFmt(def?: FieldDef): string | undefined {
  if (def?.kind === 'weight') return '0.000';
  if (def?.kind === 'amount') return '#,##0.00';
  if (def?.kind === 'date') return 'dd-mm-yyyy';
  return undefined;
}

async function loadOrCreate(existing: Buffer | null): Promise<{ workbook: ExcelJS.Workbook; sheet: ExcelJS.Worksheet }> {
  const workbook = new ExcelJS.Workbook();
  if (existing) {
    await workbook.xlsx.load(existing as unknown as ArrayBuffer);
  }
  let sheet = workbook.getWorksheet(SHEET_NAME);
  if (!sheet) {
    sheet = workbook.addWorksheet(SHEET_NAME, { views: [{ state: 'frozen', ySplit: 1 }] });
    const header = sheet.getRow(1);
    COLUMNS.forEach((c, i) => {
      header.getCell(i + 1).value = c.header;
      sheet!.getColumn(i + 1).width = c.width;
    });
    header.font = { bold: true };
    header.commit();
  }
  return { workbook, sheet };
}

/**
 * Maps header text to column number, adding any of our columns that are
 * missing. Matching by header keeps working if someone reorders or adds
 * columns in Excel.
 */
function headerIndex(sheet: ExcelJS.Worksheet): Map<string, number> {
  const header = sheet.getRow(1);
  const index = new Map<string, number>();
  header.eachCell((cell, col) => index.set(String(cell.text).trim().toLowerCase(), col));
  let next = Math.max(0, ...index.values()) + 1;
  for (const c of COLUMNS) {
    const key = c.header.toLowerCase();
    if (!index.has(key)) {
      header.getCell(next).value = c.header;
      header.getCell(next).font = { bold: true };
      sheet.getColumn(next).width = c.width;
      index.set(key, next++);
    }
  }
  header.commit();
  return index;
}

export interface Duplicate {
  rowNumber: number;
  reason: string;
}

function cellText(row: ExcelJS.Row, col: number | undefined): string {
  return col ? String(row.getCell(col).text ?? '').trim().toUpperCase() : '';
}

/** Finds rows that already record this LR (same LR No + truck) or this gate pass number. */
export async function findDuplicates(existing: Buffer | null, values: ConsignmentValues): Promise<Duplicate[]> {
  if (!existing) return [];
  const { sheet } = await loadOrCreate(existing);
  const index = headerIndex(sheet);
  const lrCol = index.get('lr no');
  const truckCol = index.get('truck no');
  const gpCol = index.get('gate pass no');

  const lrNo = (values.lrNumber ?? '').trim().toUpperCase();
  const truckParsed = normalizeTruck(values.truckNumber ?? '');
  const truck = truckParsed.ok ? truckParsed.value : (values.truckNumber ?? '').trim().toUpperCase();
  const gpNo = (values.gatePassNumber ?? '').trim().toUpperCase();

  const duplicates: Duplicate[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    if (lrNo && cellText(row, lrCol) === lrNo && cellText(row, truckCol) === truck) {
      duplicates.push({ rowNumber, reason: `LR No ${lrNo} for truck ${truck} is already in row ${rowNumber}` });
    } else if (gpNo && cellText(row, gpCol) === gpNo) {
      duplicates.push({ rowNumber, reason: `Gate Pass No ${gpNo} is already in row ${rowNumber}` });
    }
  });
  return duplicates;
}

export async function appendConsignmentRow(
  existing: Buffer | null,
  values: ConsignmentValues,
  meta: RowMeta
): Promise<{ buffer: Buffer; rowNumber: number }> {
  const { workbook, sheet } = await loadOrCreate(existing);
  const index = headerIndex(sheet);

  let lastUsed = 1;
  sheet.eachRow((_row, n) => (lastUsed = n));
  const rowNumber = lastUsed + 1;
  const row = sheet.getRow(rowNumber);
  const set = (header: string, value: ExcelJS.CellValue, fmt?: string) => {
    const cell = row.getCell(index.get(header.toLowerCase())!);
    cell.value = value;
    if (fmt) cell.numFmt = fmt;
  };

  // Excel has no time zones: store India wall-clock time.
  set('Appended At (IST)', new Date(meta.appendedAt.getTime() + IST_OFFSET_MS), 'dd-mm-yyyy hh:mm');
  for (const def of FIELD_DEFS) {
    const value = cellValue(def, values[def.key] ?? '');
    set(def.label, value, typeof value === 'number' || value instanceof Date ? numFmt(def) : undefined);
  }
  set('Overridden Checks', meta.overriddenChecks.join('; ') || null);
  set(
    'Source Photo',
    meta.sourcePhotoLink ? { text: 'View photo', hyperlink: meta.sourcePhotoLink } : null
  );
  set('Appended By', meta.appendedBy);
  row.commit();

  const out = await workbook.xlsx.writeBuffer();
  return { buffer: Buffer.from(out as ArrayBuffer), rowNumber };
}
