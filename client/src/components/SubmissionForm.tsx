import React, { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Send, AlertCircle } from 'lucide-react';
import { submissionSchema, SubmissionInput, documentTypes, DocumentType } from '../validation/schemas';
import { submitForm } from '../api/client';
import { SubmissionResult } from '../types';
import { Input } from './ui/Input';
import { Button } from './ui/Button';
import { FileUpload } from './FileUpload';
import { SuccessPage } from './SuccessPage';

type DocumentFiles = Record<DocumentType, File | null>;
type DocumentErrors = Record<DocumentType, string | null>;

const initialFiles: DocumentFiles = {
  aadhaar: null,
  pan: null,
  rc: null,
  invoice: null,
  insurance: null,
};

const initialErrors: DocumentErrors = {
  aadhaar: null,
  pan: null,
  rc: null,
  invoice: null,
  insurance: null,
};

export function SubmissionForm() {
  const [files, setFiles] = useState<DocumentFiles>(initialFiles);
  const [fileErrors, setFileErrors] = useState<DocumentErrors>(initialErrors);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmissionResult | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<SubmissionInput>({
    resolver: zodResolver(submissionSchema),
  });

  const handleFileSelect = useCallback((docType: DocumentType, file: File | null) => {
    setFiles((prev) => ({ ...prev, [docType]: file }));
    setFileErrors((prev) => ({ ...prev, [docType]: null }));
  }, []);

  const onSubmit = async (data: SubmissionInput) => {

    setSubmitting(true);
    setSubmitError(null);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('customerName', data.customerName);
      formData.append('mobileNumber', data.mobileNumber);
      formData.append('vehicleNumber', data.vehicleNumber);
      formData.append('bankName', data.bankName);

      for (const docType of documentTypes) {
        if (files[docType]) {
          formData.append(docType, files[docType]!);
        }
      }

      const response = await submitForm(formData, setUploadProgress);

      if (response.success && response.data) {
        setResult(response.data);
      } else {
        setSubmitError(response.message || 'Submission failed');
      }
    } catch (err: any) {
      const message = err.response?.data?.message || err.message || 'Submission failed';
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleNewSubmission = () => {
    setResult(null);
    setFiles(initialFiles);
    setFileErrors(initialErrors);
    setUploadProgress(0);
    reset();
  };

  if (result) {
    return <SuccessPage result={result} onNewSubmission={handleNewSubmission} />;
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Submit Documents</h2>
        <p className="text-gray-600 mt-1">Upload customer and vehicle documents to your Google Drive</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-6">
          {submitError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{submitError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">
                Customer Details
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Input
                  label="Customer Name"
                  placeholder="Enter full name"
                  required
                  error={errors.customerName?.message}
                  {...register('customerName')}
                />
                <Input
                  label="Mobile Number"
                  placeholder="9876543210"
                  required
                  error={errors.mobileNumber?.message}
                  {...register('mobileNumber')}
                />
                <Input
                  label="Vehicle Number"
                  placeholder="MH12AB1234"
                  required
                  error={errors.vehicleNumber?.message}
                  {...register('vehicleNumber')}
                />
                <Input
                  label="Bank Name"
                  placeholder="Enter bank name"
                  required
                  error={errors.bankName?.message}
                  {...register('bankName')}
                />
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b">
                Document Uploads
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Upload documents as available. You may add remaining documents later.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {documentTypes.map((docType) => (
                  <FileUpload
                    key={docType}
                    docType={docType}
                    file={files[docType]}
                    error={fileErrors[docType]}
                    onFileSelect={handleFileSelect}
                  />
                ))}
              </div>
            </section>

            {submitting && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Uploading documents...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="pt-4">
              <Button
                type="submit"
                loading={submitting}
                disabled={submitting}
                className="w-full"
              >
                <Send className="w-4 h-4" />
                Submit Documents
              </Button>
            </div>
          </form>
      </div>
    </div>
  );
}
