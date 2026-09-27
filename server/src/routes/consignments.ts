import { Router, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth';
import { handleMulterError } from '../middleware/upload';
import { GoogleDriveProvider } from '../storage';
import { config } from '../config';
import { FIELD_DEFS, ConsignmentValues } from '../consignment/fields';
import { validateConsignment, normalizeTruck, parseIndianDate } from '../consignment/normalize';
import { extractConsignment, ExtractionError } from '../consignment/extractor';
import { appendConsignmentRow, findDuplicates } from '../consignment/excel';
import { sanitizeFilename } from '../utils/fileUtils';

const router = Router();

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const WORKBOOK_TYPE = 'consignment-workbook';
const PHOTOS_FOLDER_TYPE = 'consignment-photos-folder';

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.consignments.maxImageSize, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!config.consignments.allowedMimeTypes.includes(file.mimetype)) {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: JPG, PNG, WEBP`));
      return;
    }
    cb(null, true);
  },
});

const valuesSchema = z
  .record(z.string(), z.string().max(300))
  .transform((v): ConsignmentValues => Object.fromEntries(FIELD_DEFS.map((f) => [f.key, (v[f.key] ?? '').trim()])));

const appendPayloadSchema = z.object({
  values: valuesSchema,
  acknowledgedIssueIds: z.array(z.string()).default([]),
  allowDuplicate: z.boolean().default(false),
});

// Serializes workbook read-modify-write per user so concurrent appends don't overwrite each other.
const userLocks = new Map<string, Promise<unknown>>();
async function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const previous = userLocks.get(userId) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(fn);
  userLocks.set(userId, run);
  try {
    return await run;
  } finally {
    if (userLocks.get(userId) === run) userLocks.delete(userId);
  }
}

function getDrive(req: AuthRequest): GoogleDriveProvider {
  return new GoogleDriveProvider(req.accessToken!, req.refreshToken);
}

router.get('/fields', authenticate, (req: AuthRequest, res: Response) => {
  res.json({ success: true, data: FIELD_DEFS });
});

router.post(
  '/extract',
  authenticate,
  imageUpload.single('image'),
  handleMulterError,
  async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Upload a photo of the consignment (field "image")' });
    }
    const rotate = Number(req.body.rotate ?? 0);
    if (![0, 90, 180, 270].includes(rotate)) {
      return res.status(400).json({ success: false, message: 'rotate must be 0, 90, 180 or 270' });
    }

    try {
      const result = await extractConsignment(req.file.buffer, rotate);
      const values = Object.fromEntries(Object.entries(result.fields).map(([k, f]) => [k, f.value]));
      const issues = [...result.reviewIssues, ...validateConsignment(values)];
      return res.json({ success: true, data: { ...result, issues } });
    } catch (error) {
      if (error instanceof ExtractionError) {
        return res.status(error.status).json({ success: false, message: error.message });
      }
      console.error('Consignment extraction error:', error);
      return res.status(500).json({ success: false, message: 'Failed to read the consignment. Please try again.' });
    }
  }
);

router.post('/validate', authenticate, (req: AuthRequest, res: Response) => {
  const parsed = valuesSchema.safeParse(req.body?.values);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Invalid values' });
  }
  return res.json({ success: true, data: { issues: validateConsignment(parsed.data) } });
});

router.post(
  '/append',
  authenticate,
  imageUpload.single('image'),
  handleMulterError,
  async (req: AuthRequest, res: Response) => {
    let payload: z.infer<typeof appendPayloadSchema>;
    try {
      payload = appendPayloadSchema.parse(JSON.parse(req.body.payload ?? ''));
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid payload' });
    }
    const { values, acknowledgedIssueIds, allowDuplicate } = payload;

    // Re-run every check server-side; errors must be fixed or explicitly overridden.
    const issues = validateConsignment(values);
    const errors = issues.filter((i) => i.severity === 'error');
    const unacknowledged = errors.filter((i) => !acknowledgedIssueIds.includes(i.id));
    if (unacknowledged.length) {
      return res.status(422).json({
        success: false,
        message: 'Some checks failed. Fix the values or confirm them before appending.',
        data: { issues },
      });
    }

    if (req.file) {
      try {
        await sharp(req.file.buffer).metadata();
      } catch {
        return res.status(400).json({ success: false, message: 'The attached photo is not a valid image' });
      }
    }

    try {
      const drive = getDrive(req);
      const result = await withUserLock(req.userId!, async () => {
        const workbook = await drive.findAppFile(WORKBOOK_TYPE);
        const existing = workbook ? await drive.downloadFile(workbook.fileId) : null;

        const duplicates = await findDuplicates(existing, values);
        if (duplicates.length && !allowDuplicate) {
          return { duplicates };
        }

        let sourcePhotoLink: string | undefined;
        if (req.file) {
          const folder =
            (await drive.findAppFile(PHOTOS_FOLDER_TYPE)) ??
            (await drive.createAppFile(PHOTOS_FOLDER_TYPE, config.consignments.imagesFolderName, 'application/vnd.google-apps.folder'));
          const truck = normalizeTruck(values.truckNumber);
          const date = parseIndianDate(values.lrDate);
          const ext = req.file.mimetype === 'image/png' ? '.png' : req.file.mimetype === 'image/webp' ? '.webp' : '.jpg';
          const name = sanitizeFilename(
            ['LR', values.lrNumber, truck.ok ? truck.value : values.truckNumber, date.ok ? date.value : ''].filter(Boolean).join('_')
          ) + ext;
          const photo = await drive.uploadFile(folder.fileId, name, req.file.mimetype, req.file.buffer);
          sourcePhotoLink = photo.fileLink;
        }

        const { buffer, rowNumber } = await appendConsignmentRow(existing, values, {
          appendedAt: new Date(),
          appendedBy: req.userEmail ?? '',
          overriddenChecks: [
            ...errors.map((i) => i.message),
            ...(duplicates.length ? duplicates.map((d) => `Duplicate: ${d.reason}`) : []),
          ],
          sourcePhotoLink,
        });

        let workbookLink: string;
        if (workbook) {
          await drive.updateFileContent(workbook.fileId, XLSX_MIME, buffer);
          workbookLink = workbook.fileLink;
        } else {
          workbookLink = (await drive.createAppFile(WORKBOOK_TYPE, config.consignments.workbookName, XLSX_MIME, buffer)).fileLink;
        }
        return { rowNumber, workbookLink, sourcePhotoLink };
      });

      if ('duplicates' in result) {
        return res.status(409).json({
          success: false,
          message: 'This consignment looks like it is already in the sheet.',
          data: { duplicates: result.duplicates },
        });
      }
      return res.json({ success: true, data: result });
    } catch (error) {
      console.error('Consignment append error:', error);
      return res.status(500).json({ success: false, message: 'Failed to update the Excel file in Google Drive.' });
    }
  }
);

router.get('/workbook', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const drive = getDrive(req);
    const workbook = await drive.findAppFile(WORKBOOK_TYPE);
    if (!workbook) {
      return res.status(404).json({ success: false, message: 'No consignments have been saved yet' });
    }
    const buffer = await drive.downloadFile(workbook.fileId);
    res.setHeader('Content-Type', XLSX_MIME);
    res.setHeader('Content-Disposition', `attachment; filename="${config.consignments.workbookName}"`);
    return res.send(buffer);
  } catch (error) {
    console.error('Workbook download error:', error);
    return res.status(500).json({ success: false, message: 'Failed to download the Excel file' });
  }
});

router.get('/workbook/link', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const workbook = await getDrive(req).findAppFile(WORKBOOK_TYPE);
    return res.json({ success: true, data: { workbookLink: workbook?.fileLink ?? null } });
  } catch (error) {
    console.error('Workbook lookup error:', error);
    return res.status(500).json({ success: false, message: 'Failed to look up the Excel file' });
  }
});

export default router;
