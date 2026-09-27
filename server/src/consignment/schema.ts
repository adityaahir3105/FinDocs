import { z } from 'zod';

/**
 * Schema for what Claude returns when reading a consignment photo.
 *
 * Claude only *transcribes*: every value is the text exactly as written on the
 * paper. Parsing numbers/dates, unit conversion and cross-checks happen in
 * normalize.ts, so arithmetic checks (gross - tare = net) are an independent
 * verification of the reading rather than something the model filled in.
 */

const confidence = z
  .enum(['high', 'medium', 'low'])
  .describe(
    'high = every character is clearly legible; medium = legible but one or more characters could be misread; low = guessed or partly illegible'
  );

const field = (description: string) =>
  z
    .object({
      value: z
        .string()
        .nullable()
        .describe('Exactly as written on the document. null if the field is blank, absent, or not visible.'),
      confidence,
    })
    .describe(description);

export const lorryReceiptSchema = z.object({
  present: z.boolean().describe('true if a lorry receipt / consignment note / builty is visible in the image'),
  transporter_name: field('Printed name of the transport company at the top of the receipt'),
  lr_number: field('L.R. No. / consignment note number (often printed in red)'),
  lr_date: field('Date written next to DATE, as written (Indian day/month/year order)'),
  truck_number: field('Truck No. / vehicle registration number'),
  consignor: field('Consignor (sender) name'),
  consignee: field('Consignee (receiver) name'),
  from_location: field('From / origin place'),
  to_location: field('To / destination place'),
  material: field('Product / material / description of goods'),
  gross_weight: field('Gross Wt. as written, keep the decimal point exactly'),
  tare_weight: field('Tare Wt. as written, keep the decimal point exactly'),
  net_weight: field('Net Wt. as written, keep the decimal point exactly'),
  rate_per_mt: field('Rate per MT, if filled'),
  freight_amount: field('Freight / total amount, if filled'),
  advance: field('Advance amount, if filled'),
  remarks: field('Remarks, if filled'),
});

export const gatePassSchema = z.object({
  present: z.boolean().describe('true if a port / customs gate pass is visible in the image'),
  issuer_name: field('Printed name of the company that issued the gate pass (e.g. CHA / clearing agent)'),
  gate_pass_number: field('Gate pass serial number (often printed in red)'),
  date: field('Date on the gate pass, as written (Indian day/month/year order)'),
  shift: field('Shift, if written'),
  importer_exporter: field('Name of the Importer / Exporter'),
  description_of_goods: field('Description of goods'),
  truck_number: field('Truck No. / vehicle registration number'),
  driver_name: field("Driver's name"),
  bill_of_entry_number: field('Bill of Entry / Shipping Bill / T.P. No.'),
  wharfage_entry_number: field('Wharfage Entry No.'),
  wharfage_entry_date: field('Date written next to the wharfage entry number, if any'),
  vessel_name: field("Vessel's name"),
  gross_weight: field('G. Wt. as written'),
  tare_weight: field('T. Wt. as written'),
  net_weight: field('N. Wt. as written'),
});

export const extractionSchema = z.object({
  lorry_receipt: lorryReceiptSchema,
  gate_pass: gatePassSchema,
  reading_notes: z
    .array(z.string())
    .describe(
      'Short notes about anything ambiguous: characters that could be read two ways (say both readings), text that is cut off, blurred, overwritten or written outside its box.'
    ),
});

export type Confidence = z.infer<typeof confidence>;
export type ExtractedField = { value: string | null; confidence: Confidence };
export type LorryReceiptExtraction = z.infer<typeof lorryReceiptSchema>;
export type GatePassExtraction = z.infer<typeof gatePassSchema>;
export type Extraction = z.infer<typeof extractionSchema>;
