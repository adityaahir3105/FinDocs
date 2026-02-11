import React from 'react';
import { CheckCircle, ExternalLink, FolderOpen, FileText, Plus } from 'lucide-react';
import { SubmissionResult } from '../types';
import { Button } from './ui/Button';

interface SuccessPageProps {
  result: SubmissionResult;
  onNewSubmission: () => void;
}

export function SuccessPage({ result, onNewSubmission }: SuccessPageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Submission Successful!
          </h1>
          <p className="text-gray-600 mb-8">
            Your documents have been uploaded successfully.
          </p>

          <div className="bg-gray-50 rounded-xl p-6 mb-8 text-left">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-blue-600" />
              Submission Details
            </h2>

            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-600">Submission ID</span>
                <span className="font-mono font-semibold text-blue-600">
                  {result.submissionId}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-600">Customer Name</span>
                <span className="font-medium">{result.customerName}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-600">Vehicle Number</span>
                <span className="font-medium">{result.vehicleNumber}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-600">Bank Name</span>
                <span className="font-medium">{result.bankName}</span>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Uploaded Files</h3>
              <div className="flex flex-wrap gap-2">
                {result.uploadedFiles.map((file) => (
                  <span
                    key={file}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm"
                  >
                    <FileText className="w-3 h-3" />
                    {file}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href={result.folderLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              View in Drive
            </a>
            <Button variant="outline" onClick={onNewSubmission}>
              <Plus className="w-4 h-4" />
              New Submission
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
