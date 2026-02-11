import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, ArrowLeft } from 'lucide-react';

export function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <Link to="/" className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900">FinDocs</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>

        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 lg:p-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            Privacy Policy – FinDocs
          </h1>
          <p className="text-gray-500 mb-8">Effective Date: February 11, 2026</p>

          <div className="prose prose-gray max-w-none">
            <p className="text-gray-700 leading-relaxed mb-6">
              FinDocs is a document management application that allows users to upload customer and vehicle-related documents directly to their own Google Drive accounts.
            </p>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                1. Information We Collect
              </h2>
              <p className="text-gray-700 mb-3">FinDocs collects:</p>
              <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
                <li>Customer name</li>
                <li>Mobile number</li>
                <li>Vehicle number</li>
                <li>Bank name</li>
                <li>Uploaded documents (Aadhaar, PAN, RC, Invoice, Insurance)</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                2. Google Account Access
              </h2>
              <p className="text-gray-700 mb-3">
                FinDocs uses Google OAuth to access your Google Drive with the <code className="bg-gray-100 px-2 py-1 rounded text-sm">drive.file</code> permission.
              </p>
              <p className="text-gray-700 mb-3">This permission allows FinDocs to:</p>
              <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4 mb-4">
                <li>Create folders in your Google Drive</li>
                <li>Upload files created by this application</li>
              </ul>
              <p className="text-gray-700 mb-3">FinDocs does <strong>NOT</strong>:</p>
              <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
                <li>Access other files in your Drive</li>
                <li>Modify existing files</li>
                <li>Share files without your permission</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                3. Data Storage
              </h2>
              <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
                <li>FinDocs does not permanently store your documents on its own servers.</li>
                <li>All uploaded documents are stored directly in your Google Drive.</li>
                <li>Authentication tokens are securely handled and not shared with third parties.</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                4. Data Security
              </h2>
              <p className="text-gray-700 mb-3">We implement:</p>
              <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
                <li>Secure HTTPS communication</li>
                <li>OAuth 2.0 authentication</li>
                <li>Secure server-side token handling</li>
                <li>Rate limiting and validation mechanisms</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                5. Third-Party Services
              </h2>
              <p className="text-gray-700 mb-3">FinDocs uses:</p>
              <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
                <li>Google OAuth 2.0</li>
                <li>Google Drive API</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                6. User Control
              </h2>
              <p className="text-gray-700">
                You may revoke access anytime from:{' '}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  https://myaccount.google.com/permissions
                </a>
              </p>
            </section>

            <section className="mb-4">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                7. Contact
              </h2>
              <p className="text-gray-700">
                For questions, contact:{' '}
                <a
                  href="mailto:ahiraditya31@gmail.com"
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  ahiraditya31@gmail.com
                </a>
              </p>
            </section>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-gray-500 text-sm">
              © {new Date().getFullYear()} FinDocs. All rights reserved.
            </p>
            <div className="flex gap-6">
              <Link
                to="/privacy"
                className="text-gray-500 hover:text-gray-700 text-sm transition-colors"
              >
                Privacy Policy
              </Link>
              <Link
                to="/terms"
                className="text-gray-500 hover:text-gray-700 text-sm transition-colors"
              >
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
