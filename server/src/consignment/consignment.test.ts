import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import type { Extraction, ExtractedField } from './schema';
import { mergePasses } from './extractor';
import { validateConsignment, parseWeightMt, parseIndianDate, normalizeTruck } from './normalize';
import { appendConsignmentRow, findDuplicates } from './excel';

const f = (value: string | null, confidence: ExtractedField['confidence'] = 'high'): ExtractedField => ({ value, confidence });

/** Hand transcription of the sample photo (Frontline Enterprise LR 650 + RCC gate pass 57543). */
function samplePass(): Extraction {
  return {
    lorry_receipt: {
      present: true,
      transporter_name: f('FRONTLINE ENTERPRISE'),
      lr_number: f('650'),
      lr_date: f('5/8/26'),
      truck_number: f('GJ39-TB-4445'),
      consignor: f('ADITYA BIRLA'),
      consignee: f('E.T.L.', 'medium'),
      from_location: f('K.P.T.'),
      to_location: f('Shomakhiyali', 'medium'),
      material: f('S/Coal'),
      gross_weight: f('63.820'),
      tare_weight: f('16.600'),
      net_weight: f('47.220'),
      rate_per_mt: f(null),
      freight_amount: f(null),
      advance: f(null),
      remarks: f(null),
    },
    gate_pass: {
      present: true,
      issuer_name: f('RCC LIMITED'),
      gate_pass_number: f('57543'),
      date: f('5/8/26'),
      shift: f('II'),
      importer_exporter: f('DELTA GLOBAL PVT LTD', 'medium'),
      description_of_goods: f('S-COAL IN BULK'),
      truck_number: f('GJ39TB 4445'),
      driver_name: f(null),
      bill_of_entry_number: f(null),
      wharfage_entry_number: f('9138740'),
      wharfage_entry_date: f('08.05.26', 'medium'),
      vessel_name: f('MV VISHVA PREETI', 'low'),
      gross_weight: f('63820'),
      tare_weight: f('16600'),
      net_weight: f('47220'),
    },
    reading_notes: ['Importer name is written on the Driver\'s Name line'],
  };
}

function valuesOf(merged: ReturnType<typeof mergePasses>): Record<string, string> {
  return Object.fromEntries(Object.entries(merged.fields).map(([k, v]) => [k, v.value]));
}

const TODAY = new Date('2026-09-27T06:00:00Z');

test('sample photo: normalizes values and passes every cross-check', () => {
  const merged = mergePasses([samplePass(), samplePass()]);
  const v = valuesOf(merged);
  assert.equal(v.lrNumber, '650');
  assert.equal(v.lrDate, '05/08/2026');
  assert.equal(v.truckNumber, 'GJ39TB4445');
  assert.equal(v.gpTruckNumber, 'GJ39TB4445');
  assert.equal(v.netWeight, '47.220');
  assert.equal(v.gpNetWeight, '47.220'); // 47220 kg -> MT
  assert.equal(v.wharfageEntryDate, '08/05/2026');

  const errors = validateConsignment(v, TODAY).filter((i) => i.severity === 'error');
  assert.deepEqual(errors, []);
});

test('uncertain readings are flagged for review', () => {
  const merged = mergePasses([samplePass(), samplePass()]);
  const ids = merged.reviewIssues.map((i) => `${i.id}:${i.severity}`);
  assert.ok(ids.includes('review:vesselName:error'), 'low confidence must block');
  assert.ok(ids.includes('review:toLocation:warning'));
  assert.ok(!ids.some((id) => id.startsWith('review:lrNumber')));
});

test('disagreeing passes are flagged with both readings, never silently picked', () => {
  const a = samplePass();
  const b = samplePass();
  b.lorry_receipt.net_weight = f('41.220');
  b.lorry_receipt.lr_number = f('650'); // same
  b.gate_pass.driver_name = f('RAMESH', 'medium');
  const merged = mergePasses([a, b]);
  assert.deepEqual(merged.fields.netWeight.alternatives, ['47.220', '41.220']);
  const issue = merged.reviewIssues.find((i) => i.id === 'review:netWeight');
  assert.equal(issue?.severity, 'error');
  assert.deepEqual(merged.fields.driverName.alternatives, ['', 'RAMESH']);
  assert.deepEqual(merged.fields.lrNumber.alternatives, []);
});

test('formatting differences between passes are not disagreements', () => {
  const a = samplePass();
  const b = samplePass();
  b.lorry_receipt.truck_number = f('GJ 39 TB 4445');
  b.gate_pass.gross_weight = f('63,820');
  b.lorry_receipt.lr_date = f('05/08/2026');
  const merged = mergePasses([a, b]);
  assert.deepEqual(merged.fields.truckNumber.alternatives, []);
  assert.deepEqual(merged.fields.gpGrossWeight.alternatives, []);
  assert.deepEqual(merged.fields.lrDate.alternatives, []);
});

test('arithmetic, cross-document and date checks catch misreads', () => {
  const v = valuesOf(mergePasses([samplePass()]));
  const ids = (vals: Record<string, string>) => validateConsignment(vals, TODAY).filter((i) => i.severity === 'error').map((i) => i.id);

  assert.deepEqual(ids({ ...v, netWeight: '41.220' }), ['arith:netWeight', 'mismatch:netWeight']);
  assert.deepEqual(ids({ ...v, gpTruckNumber: 'GJ39TB4446' }), ['mismatch:truckNumber']);
  assert.deepEqual(ids({ ...v, lrDate: '8/5/26', gatePassDate: '8/5/26' }), []);
  assert.deepEqual(ids({ ...v, lrDate: '5/10/26' }), ['future:lrDate']);
  assert.deepEqual(ids({ ...v, lrDate: '31/2/26' }), ['format:lrDate']);
  assert.deepEqual(ids({ ...v, lrNumber: '' }), ['required:lrNumber']);
  assert.deepEqual(ids({ ...v, truckNumber: 'GJ39TB44' }), ['format:truckNumber']);
});

test('parsers', () => {
  assert.deepEqual(parseWeightMt('47.220'), { ok: true, value: 47.22 });
  assert.equal((parseWeightMt('47220') as any).value, 47.22);
  assert.equal((parseWeightMt('47,220 kg') as any).value, 47.22);
  assert.equal((parseWeightMt('16600 Kgs') as any).value, 16.6);
  assert.equal((parseWeightMt('47.220 MT') as any).value, 47.22);
  assert.equal(parseWeightMt('47,22').ok, false);
  assert.equal(parseWeightMt('4722.0').ok, false);
  assert.deepEqual(parseIndianDate('5/8/26'), { ok: true, value: '2026-08-05' });
  assert.deepEqual(parseIndianDate('08.05.26'), { ok: true, value: '2026-05-08' });
  assert.equal(parseIndianDate('29/2/25').ok, false);
  assert.deepEqual(normalizeTruck('gj-39-tb-4445'), { ok: true, value: 'GJ39TB4445' });
  assert.deepEqual(normalizeTruck('22 BH 1234 AA'), { ok: true, value: '22BH1234AA' });
});

test('excel: creates, appends typed cells, detects duplicates', async () => {
  const v = valuesOf(mergePasses([samplePass()]));
  const meta = { appendedAt: new Date('2026-09-27T06:00:00Z'), appendedBy: 'a@b.com', overriddenChecks: [] };

  const first = await appendConsignmentRow(null, v, meta);
  assert.equal(first.rowNumber, 2);
  assert.deepEqual(await findDuplicates(first.buffer, v), [{ rowNumber: 2, reason: 'LR No 650 for truck GJ39TB4445 is already in row 2' }]);
  assert.deepEqual(await findDuplicates(first.buffer, { ...v, lrNumber: '651', gatePassNumber: '57544' }), []);

  const second = await appendConsignmentRow(first.buffer, { ...v, lrNumber: '651', gatePassNumber: '57544' }, meta);
  assert.equal(second.rowNumber, 3);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(second.buffer as unknown as ArrayBuffer);
  const sheet = wb.getWorksheet('Consignments')!;
  const headers = (sheet.getRow(1).values as ExcelJS.CellValue[]).slice(1).map(String);
  const col = (h: string) => headers.indexOf(h) + 1;
  const row = sheet.getRow(2);

  assert.equal(row.getCell(col('LR No')).value, '650');
  assert.equal(row.getCell(col('Net Wt (MT)')).value, 47.22);
  assert.equal(row.getCell(col('Net Wt (MT)')).numFmt, '0.000');
  assert.equal(row.getCell(col('GP Net Wt (MT)')).value, 47.22);
  assert.equal((row.getCell(col('LR Date')).value as Date).toISOString(), '2026-08-05T00:00:00.000Z');
  assert.equal(row.getCell(col('Truck No')).value, 'GJ39TB4445');
  assert.equal(row.getCell(col('Rate / MT')).value, null);
  assert.equal((row.getCell(col('Appended At (IST)')).value as Date).toISOString(), '2026-09-27T11:30:00.000Z');
  assert.equal(sheet.getRow(3).getCell(col('LR No')).value, '651');
});

test('excel: tolerates columns reordered or added by the user', async () => {
  const v = valuesOf(mergePasses([samplePass()]));
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Consignments');
  sheet.getRow(1).values = ['My Notes', 'Truck No', 'LR No'];
  sheet.getRow(2).values = ['checked', 'GJ39TB4445', '650'];
  const existing = Buffer.from(await wb.xlsx.writeBuffer());

  assert.equal((await findDuplicates(existing, v)).length, 1);
  const { buffer, rowNumber } = await appendConsignmentRow(existing, { ...v, lrNumber: '700' }, {
    appendedAt: new Date(), appendedBy: 'x', overriddenChecks: [],
  });
  assert.equal(rowNumber, 3);
  const out = new ExcelJS.Workbook();
  await out.xlsx.load(buffer as unknown as ArrayBuffer);
  const s = out.getWorksheet('Consignments')!;
  assert.equal(s.getRow(3).getCell(3).value, '700');
  assert.equal(s.getRow(3).getCell(2).value, 'GJ39TB4445');
  assert.equal(s.getRow(2).getCell(1).value, 'checked');
});
