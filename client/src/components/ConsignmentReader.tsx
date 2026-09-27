import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  RotateCw,
  ScanText,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  appendConsignment,
  downloadConsignmentWorkbook,
  extractConsignment,
  getConsignmentFields,
  getConsignmentWorkbookLink,
  validateConsignment,
} from '../api/client';
import {
  ConsignmentAppendResult,
  ConsignmentExtraction,
  ConsignmentFieldDef,
  ConsignmentIssue,
} from '../types';
import { Button } from './ui/Button';

type Stage = 'upload' | 'reading' | 'review' | 'done';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 15 * 1024 * 1024;

function errorMessage(err: any, fallback: string): string {
  return err?.response?.data?.message || err?.message || fallback;
}

/** Renders the photo rotated (respecting EXIF) so the preview matches what the server reads. */
async function rotatedPreview(file: File, degrees: number): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const swap = degrees % 180 !== 0;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? bitmap.height : bitmap.width;
  canvas.height = swap ? bitmap.width : bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  return URL.createObjectURL(blob!);
}

export function ConsignmentReader() {
  const [fieldDefs, setFieldDefs] = useState<ConsignmentFieldDef[]>([]);
  const [workbookLink, setWorkbookLink] = useState<string | null>(null);

  const [stage, setStage] = useState<Stage>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [rotate, setRotate] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [extraction, setExtraction] = useState<ConsignmentExtraction | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<ConsignmentIssue[]>([]);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState(false);

  const [saving, setSaving] = useState(false);
  const [duplicates, setDuplicates] = useState<{ rowNumber: number; reason: string }[] | null>(null);
  const [result, setResult] = useState<ConsignmentAppendResult | null>(null);

  useEffect(() => {
    getConsignmentFields()
      .then((r) => r.data && setFieldDefs(r.data))
      .catch((err) => {
        if (err?.response?.status === 401) {
          setError('Session expired or authentication required. Please sign in again.');
        } else {
          setError('Could not load consignment fields. Is the server running?');
        }
      });
    getConsignmentWorkbookLink()
      .then((r) => setWorkbookLink(r.data?.workbookLink ?? null))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    rotatedPreview(file, rotate)
      .then((u) => {
        if (cancelled) URL.revokeObjectURL(u);
        else setPreview((url = u));
      })
      .catch(() => setError('Could not open this image'));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file, rotate]);

  // Re-run the server-side checks whenever values change (debounced).
  const validateTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (stage !== 'review') return;
    window.clearTimeout(validateTimer.current);
    setChecking(true);
    validateTimer.current = window.setTimeout(() => {
      validateConsignment(values)
        .then((r) => r.data && setChecks(r.data.issues))
        .catch(() => undefined)
        .finally(() => setChecking(false));
    }, 400);
    return () => window.clearTimeout(validateTimer.current);
  }, [values, stage]);

  const reviewIssues = useMemo(() => extraction?.reviewIssues ?? [], [extraction]);

  const issuesByField = useMemo(() => {
    const map = new Map<string, ConsignmentIssue[]>();
    for (const issue of [...reviewIssues, ...checks]) {
      for (const f of issue.fields) map.set(f, [...(map.get(f) ?? []), issue]);
    }
    return map;
  }, [reviewIssues, checks]);

  // Every AI review flag must be confirmed; every failed check must be fixed or overridden.
  const blocking = useMemo(
    () => [
      ...reviewIssues.filter((i) => !confirmed.has(i.id)),
      ...checks.filter((i) => i.severity === 'error' && !confirmed.has(i.id)),
    ],
    [reviewIssues, checks, confirmed]
  );

  const selectFile = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (!ACCEPTED.includes(f.type)) {
      setError('Use a JPG, PNG or WEBP photo.');
      return;
    }
    if (f.size > MAX_SIZE) {
      setError('Photo is larger than 15MB.');
      return;
    }
    setFile(f);
    setRotate(0);
  };

  const readPhoto = async () => {
    if (!file) return;
    setStage('reading');
    setError(null);
    try {
      const r = await extractConsignment(file, rotate);
      if (!r.success || !r.data) throw new Error(r.message || 'Failed to read the photo');
      setExtraction(r.data);
      setValues(Object.fromEntries(Object.entries(r.data.fields).map(([k, f]) => [k, f.value])));
      setChecks(r.data.issues.filter((i) => !i.id.startsWith('review:')));
      setConfirmed(new Set());
      setStage('review');
    } catch (err) {
      setError(errorMessage(err, 'Failed to read the photo'));
      setStage('upload');
    }
  };

  const setValue = (key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setConfirmed((c) => {
      const next = new Set(c);
      // Typing or picking a reading means a person has checked this field...
      next.add(`review:${key}`);
      // ...but an override given for the old value must be given again.
      checks.filter((i) => i.fields.includes(key)).forEach((i) => next.delete(i.id));
      return next;
    });
  };

  const toggleConfirmed = (id: string) =>
    setConfirmed((c) => {
      const next = new Set(c);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async (allowDuplicate: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const r = await appendConsignment(values, [...confirmed], allowDuplicate, file);
      if (!r.success || !r.data) throw new Error(r.message);
      setResult(r.data);
      setWorkbookLink(r.data.workbookLink);
      setDuplicates(null);
      setStage('done');
    } catch (err: any) {
      const status = err?.response?.status;
      const data = err?.response?.data?.data;
      if (status === 409 && data?.duplicates) {
        setDuplicates(data.duplicates);
      } else if (status === 422 && data?.issues) {
        setChecks(data.issues);
        setError(errorMessage(err, 'Some checks failed'));
      } else {
        setError(errorMessage(err, 'Failed to append to Excel'));
      }
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setStage('upload');
    setFile(null);
    setExtraction(null);
    setValues({});
    setChecks([]);
    setConfirmed(new Set());
    setDuplicates(null);
    setResult(null);
    setError(null);
    setZoomed(false);
  };

  const download = async () => {
    try {
      const blob = await downloadConsignmentWorkbook();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'FinDocs Consignments.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(errorMessage(err, 'Failed to download the Excel file'));
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Read Consignment</h1>
          <p className="text-xs sm:text-sm text-gray-500">
            Photo of LR / gate pass → check every value → append a row to your Excel sheet.
          </p>
        </div>
        {workbookLink && (
          <div className="flex flex-wrap gap-2">
            <a
              href={workbookLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <FileSpreadsheet className="w-4 h-4 shrink-0" /> Open in Drive
            </a>
            <button
              onClick={download}
              className="flex items-center gap-1.5 px-3 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <Download className="w-4 h-4 shrink-0" /> Download .xlsx
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {stage === 'done' && result && (
        <div className="bg-white rounded-xl shadow-sm border p-8 text-center space-y-4">
          <CheckCircle className="w-12 h-12 text-green-600 mx-auto" />
          <h2 className="text-xl font-semibold text-gray-900">Added as row {result.rowNumber}</h2>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href={result.workbookLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <ExternalLink className="w-4 h-4" /> Open Excel
            </a>
            <Button onClick={reset}>Read next consignment</Button>
          </div>
        </div>
      )}

      {(stage === 'upload' || stage === 'reading') && (
        <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-6 space-y-4">
          {!file ? (
            <label
              className="block border-2 border-dashed border-gray-300 rounded-lg p-6 sm:p-10 text-center cursor-pointer hover:border-gray-400 bg-gray-50"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                selectFile(e.dataTransfer.files?.[0]);
              }}
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => selectFile(e.target.files?.[0])}
              />
              <Upload className="w-8 h-8 sm:w-10 sm:h-10 mx-auto text-gray-400 mb-2 sm:mb-3" />
              <p className="text-sm sm:text-base text-gray-700 font-medium">Take or choose a photo of the consignment</p>
              <p className="text-xs text-gray-500 mt-1">
                JPG, PNG or WEBP. For best accuracy: flat paper, good light, whole document in frame, original
                resolution (WhatsApp compresses photos — send as “Document”).
              </p>
            </label>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs sm:text-sm text-gray-600">
                  Rotate until the text reads upright — the AI reads the photo exactly as shown.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={stage === 'reading'}
                    onClick={() => setRotate((r) => (r + 270) % 360)}
                    className="p-2 rounded-lg border hover:bg-gray-50 disabled:opacity-50"
                    title="Rotate left"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={stage === 'reading'}
                    onClick={() => setRotate((r) => (r + 90) % 360)}
                    className="p-2 rounded-lg border hover:bg-gray-50 disabled:opacity-50"
                    title="Rotate right"
                  >
                    <RotateCw className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {preview && (
                <img src={preview} alt="Consignment" className="max-h-[70vh] mx-auto rounded border object-contain w-full" />
              )}
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
                <Button variant="outline" onClick={reset} disabled={stage === 'reading'} className="w-full sm:w-auto">
                  Choose another photo
                </Button>
                <Button onClick={readPhoto} loading={stage === 'reading'} className="w-full sm:w-auto">
                  <ScanText className="w-4 h-4 shrink-0" />
                  {stage === 'reading' ? 'Reading… (up to a minute)' : 'Read photo'}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {stage === 'review' && extraction && (
        <div className="grid lg:grid-cols-2 gap-6 items-start">
          <div className="bg-white rounded-xl shadow-sm border p-3 lg:sticky lg:top-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700">Photo</span>
              <button
                type="button"
                onClick={() => setZoomed((z) => !z)}
                className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
              >
                {zoomed ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
                {zoomed ? 'Fit' : 'Zoom'}
              </button>
            </div>
            <div className={zoomed ? 'overflow-auto max-h-[80vh]' : ''}>
              {preview && (
                <img
                  src={preview}
                  alt="Consignment"
                  className={zoomed ? 'max-w-none w-[250%]' : 'w-full max-h-[80vh] object-contain'}
                />
              )}
            </div>
          </div>

          <div className="space-y-4">
            <ChecksPanel
              blocking={blocking}
              warnings={checks.filter((i) => i.severity === 'warning')}
              extraction={extraction}
              checking={checking}
            />

            {(['lr', 'gp'] as const).map((section) => (
              <div key={section} className="bg-white rounded-xl shadow-sm border p-4">
                <h2 className="font-semibold text-gray-900 mb-3">
                  {section === 'lr' ? 'Lorry Receipt' : 'Gate Pass'}
                  {!(section === 'lr' ? extraction.documents.lorryReceipt : extraction.documents.gatePass) && (
                    <span className="ml-2 text-xs font-normal text-gray-500">(not found in photo)</span>
                  )}
                </h2>
                <div className="grid sm:grid-cols-2 gap-x-4 gap-y-3">
                  {fieldDefs
                    .filter((d) => d.section === section)
                    .map((def) => (
                      <FieldInput
                        key={def.key}
                        def={def}
                        value={values[def.key] ?? ''}
                        result={extraction.fields[def.key]}
                        issues={issuesByField.get(def.key) ?? []}
                        confirmed={confirmed}
                        onChange={(v) => setValue(def.key, v)}
                        onToggle={toggleConfirmed}
                      />
                    ))}
                </div>
              </div>
            ))}

            {duplicates && (
              <div className="p-4 rounded-lg bg-amber-50 border border-amber-300 space-y-2">
                <p className="font-medium text-amber-900">This consignment may already be in the sheet:</p>
                <ul className="list-disc ml-5 text-sm text-amber-900">
                  {duplicates.map((d) => (
                    <li key={d.rowNumber}>{d.reason}</li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setDuplicates(null)}>
                    Cancel
                  </Button>
                  <Button onClick={() => save(true)} loading={saving}>
                    Append anyway
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 pt-2">
              <Button variant="outline" onClick={reset} disabled={saving} className="w-full sm:w-auto">
                Discard
              </Button>
              <Button onClick={() => save(false)} loading={saving} disabled={blocking.length > 0 || checking || !!duplicates} className="w-full sm:w-auto">
                <FileSpreadsheet className="w-4 h-4 shrink-0" />
                {blocking.length ? `${blocking.length} item(s) to check` : 'Append to Excel'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChecksPanel({
  blocking,
  warnings,
  extraction,
  checking,
}: {
  blocking: ConsignmentIssue[];
  warnings: ConsignmentIssue[];
  extraction: ConsignmentExtraction;
  checking: boolean;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-4 space-y-2 text-sm">
      <div className="flex items-center gap-2 font-medium">
        {checking ? (
          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        ) : blocking.length ? (
          <AlertCircle className="w-4 h-4 text-red-600" />
        ) : (
          <CheckCircle className="w-4 h-4 text-green-600" />
        )}
        {blocking.length
          ? `${blocking.length} item(s) need your check before saving`
          : 'All checks passed — review the values once more, then append'}
      </div>
      {blocking.length > 0 && (
        <ul className="list-disc ml-6 text-red-700">
          {blocking.map((i) => (
            <li key={i.id}>{i.message}</li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <ul className="list-disc ml-6 text-amber-700">
          {warnings.map((i) => (
            <li key={i.id}>{i.message}</li>
          ))}
        </ul>
      )}
      {extraction.readingNotes.length > 0 && (
        <details className="text-gray-600">
          <summary className="cursor-pointer">AI reading notes ({extraction.readingNotes.length})</summary>
          <ul className="list-disc ml-6 mt-1">
            {extraction.readingNotes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-xs text-gray-400">
        Read {extraction.passes}× independently ({extraction.readers.join(' + ')}); fields where the readings differ
        are flagged.
      </p>
    </div>
  );
}

function FieldInput({
  def,
  value,
  result,
  issues,
  confirmed,
  onChange,
  onToggle,
}: {
  def: ConsignmentFieldDef;
  value: string;
  result?: { raw: string | null; alternatives: string[] };
  issues: ConsignmentIssue[];
  confirmed: Set<string>;
  onChange: (v: string) => void;
  onToggle: (id: string) => void;
}) {
  const open = issues.filter((i) => !confirmed.has(i.id));
  const hasError = open.some((i) => i.severity === 'error');
  const hasWarning = open.length > 0 && !hasError;
  const placeholder =
    def.kind === 'date' ? 'DD/MM/YYYY' : def.kind === 'weight' ? 'MT, e.g. 47.220' : def.kind === 'truck' ? 'GJ39TB4445' : '';

  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600">
        {def.label}
        {def.required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          hasError ? 'border-red-500 bg-red-50' : hasWarning ? 'border-amber-400 bg-amber-50' : 'border-gray-300'
        }`}
      />
      {result && result.alternatives.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="text-gray-500">Readings:</span>
          {result.alternatives.map((alt) => (
            <button
              key={alt}
              type="button"
              onClick={() => onChange(alt)}
              className={`px-2 py-0.5 rounded border ${
                alt === value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-100'
              }`}
            >
              {alt || '(blank)'}
            </button>
          ))}
        </div>
      )}
      {result?.raw && result.raw !== value && (
        <p className="text-xs text-gray-400">Written as: “{result.raw}”</p>
      )}
      {issues.map((issue) => {
        const isCheck = !issue.id.startsWith('review:');
        // Cross-field issues get their override checkbox only on the first field they mention.
        if (isCheck && issue.fields[0] !== def.key) return null;
        const needsAck = issue.id.startsWith('review:') || issue.severity === 'error';
        return (
          <div key={issue.id} className="text-xs">
            {needsAck ? (
              <label className="flex items-start gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={confirmed.has(issue.id)}
                  onChange={() => onToggle(issue.id)}
                />
                <span className={confirmed.has(issue.id) ? 'text-gray-400' : isCheck ? 'text-red-700' : 'text-amber-800'}>
                  {isCheck ? `${issue.message} — correct as written (override)` : 'Checked against photo'}
                </span>
              </label>
            ) : (
              <span className="flex items-start gap-1 text-amber-700">
                <AlertTriangle className="w-3 h-3 mt-0.5" /> {issue.message}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
