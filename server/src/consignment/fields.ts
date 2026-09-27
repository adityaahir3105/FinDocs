import type { GatePassExtraction, LorryReceiptExtraction } from './schema';

/**
 * Single source of truth for consignment fields: drives the review form
 * (sent to the client), normalization/validation, and the Excel columns.
 */

export type FieldKind = 'text' | 'date' | 'weight' | 'amount' | 'truck';
export type FieldSection = 'lr' | 'gp';

export interface FieldDef {
  key: string;
  label: string;
  section: FieldSection;
  kind: FieldKind;
  required?: boolean;
  /** Property of the matching extraction object (lorry_receipt / gate_pass). */
  source: keyof LorryReceiptExtraction | keyof GatePassExtraction;
}

export const FIELD_DEFS: FieldDef[] = [
  // Lorry receipt
  { key: 'lrNumber', label: 'LR No', section: 'lr', kind: 'text', required: true, source: 'lr_number' },
  { key: 'lrDate', label: 'LR Date', section: 'lr', kind: 'date', required: true, source: 'lr_date' },
  { key: 'truckNumber', label: 'Truck No', section: 'lr', kind: 'truck', required: true, source: 'truck_number' },
  { key: 'consignor', label: 'Consignor', section: 'lr', kind: 'text', source: 'consignor' },
  { key: 'consignee', label: 'Consignee', section: 'lr', kind: 'text', source: 'consignee' },
  { key: 'fromLocation', label: 'From', section: 'lr', kind: 'text', source: 'from_location' },
  { key: 'toLocation', label: 'To', section: 'lr', kind: 'text', source: 'to_location' },
  { key: 'material', label: 'Material', section: 'lr', kind: 'text', source: 'material' },
  { key: 'grossWeight', label: 'Gross Wt (MT)', section: 'lr', kind: 'weight', source: 'gross_weight' },
  { key: 'tareWeight', label: 'Tare Wt (MT)', section: 'lr', kind: 'weight', source: 'tare_weight' },
  { key: 'netWeight', label: 'Net Wt (MT)', section: 'lr', kind: 'weight', required: true, source: 'net_weight' },
  { key: 'ratePerMt', label: 'Rate / MT', section: 'lr', kind: 'amount', source: 'rate_per_mt' },
  { key: 'freightAmount', label: 'Freight', section: 'lr', kind: 'amount', source: 'freight_amount' },
  { key: 'advance', label: 'Advance', section: 'lr', kind: 'amount', source: 'advance' },
  { key: 'transporterName', label: 'Transporter', section: 'lr', kind: 'text', source: 'transporter_name' },
  { key: 'remarks', label: 'Remarks', section: 'lr', kind: 'text', source: 'remarks' },

  // Gate pass
  { key: 'gatePassNumber', label: 'Gate Pass No', section: 'gp', kind: 'text', source: 'gate_pass_number' },
  { key: 'gatePassDate', label: 'Gate Pass Date', section: 'gp', kind: 'date', source: 'date' },
  { key: 'shift', label: 'Shift', section: 'gp', kind: 'text', source: 'shift' },
  { key: 'gpTruckNumber', label: 'GP Truck No', section: 'gp', kind: 'truck', source: 'truck_number' },
  { key: 'importerExporter', label: 'Importer / Exporter', section: 'gp', kind: 'text', source: 'importer_exporter' },
  { key: 'goodsDescription', label: 'Goods Description', section: 'gp', kind: 'text', source: 'description_of_goods' },
  { key: 'driverName', label: 'Driver', section: 'gp', kind: 'text', source: 'driver_name' },
  { key: 'billOfEntry', label: 'Bill of Entry / TP No', section: 'gp', kind: 'text', source: 'bill_of_entry_number' },
  { key: 'wharfageEntryNumber', label: 'Wharfage Entry No', section: 'gp', kind: 'text', source: 'wharfage_entry_number' },
  { key: 'wharfageEntryDate', label: 'Wharfage Entry Date', section: 'gp', kind: 'date', source: 'wharfage_entry_date' },
  { key: 'vesselName', label: 'Vessel', section: 'gp', kind: 'text', source: 'vessel_name' },
  { key: 'gpGrossWeight', label: 'GP Gross Wt (MT)', section: 'gp', kind: 'weight', source: 'gross_weight' },
  { key: 'gpTareWeight', label: 'GP Tare Wt (MT)', section: 'gp', kind: 'weight', source: 'tare_weight' },
  { key: 'gpNetWeight', label: 'GP Net Wt (MT)', section: 'gp', kind: 'weight', source: 'net_weight' },
  { key: 'gpIssuer', label: 'Gate Pass Issuer', section: 'gp', kind: 'text', source: 'issuer_name' },
];

export const FIELD_BY_KEY = new Map(FIELD_DEFS.map((f) => [f.key, f]));

/** Reviewed values keyed by FieldDef.key. Always strings so the form can edit them. */
export type ConsignmentValues = Record<string, string>;
