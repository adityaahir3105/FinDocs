import { z } from 'zod';

const indianMobileRegex = /^[6-9]\d{9}$/;
const indianVehicleRegex = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/;

export const submissionSchema = z.object({
  customerName: z
    .string()
    .min(2, 'Customer name must be at least 2 characters')
    .max(100, 'Customer name must be less than 100 characters')
    .trim(),
  
  mobileNumber: z
    .string()
    .regex(indianMobileRegex, 'Invalid Indian mobile number (10 digits, starting with 6-9)'),
  
  vehicleNumber: z
    .string()
    .transform((val) => val.toUpperCase().replace(/\s/g, ''))
    .refine((val) => indianVehicleRegex.test(val), {
      message: 'Invalid Indian vehicle number format (e.g., MH12AB1234)',
    }),
  
  bankName: z
    .string()
    .min(2, 'Bank name must be at least 2 characters')
    .max(100, 'Bank name must be less than 100 characters')
    .trim(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export type SubmissionInput = z.infer<typeof submissionSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export const documentTypes = [
  'aadhaar',
  'pan',
  'rc',
  'invoice',
  'insurance',
] as const;

export type DocumentType = typeof documentTypes[number];

export const documentLabels: Record<DocumentType, string> = {
  aadhaar: 'Aadhaar Card',
  pan: 'PAN Card',
  rc: 'RC Book',
  invoice: 'Invoice',
  insurance: 'Insurance',
};
