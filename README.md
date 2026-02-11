# FinDocs - Document Management System

A secure web application for submitting customer and vehicle documents with automatic upload to the user's Google Drive.

## Features

- **Google Sign-In** - OAuth 2.0 with authorization code flow and refresh tokens
- **Personal Drive Storage** - Documents uploaded directly to user's own Google Drive
- **Automatic Token Refresh** - Sessions persist even after access token expiry
- **Submission History** - View all past submissions with links to Drive folders
- **Document Submission Form** - Customer details (required) and document uploads (optional)
- **File Validation** - MIME type + file signature validation, 5MB per file, 25MB total
- **Modern UI** - Dashboard with navigation, responsive design with Tailwind CSS
- **Security** - Rate limiting, file content validation, Helmet.js, CORS protection

## Tech Stack

### Frontend
- React 18 + TypeScript
- Vite
- Tailwind CSS
- React Hook Form + Zod validation
- @react-oauth/google (authorization code flow)
- Axios

### Backend
- Node.js + Express
- TypeScript
- Multer (file uploads)
- Google Drive API (user OAuth with refresh tokens)
- JWT authentication (stores encrypted tokens)
- Rate limiting (stricter for submissions)

## Project Structure

```
FinDocs/
├── client/                 # React frontend
│   ├── src/
│   │   ├── api/           # API client
│   │   ├── components/    # React components
│   │   ├── context/       # Auth context
│   │   ├── types/         # TypeScript types
│   │   └── validation/    # Zod schemas
│   └── ...
├── server/                 # Express backend
│   ├── src/
│   │   ├── config/        # Configuration
│   │   ├── middleware/    # Auth, upload middleware
│   │   ├── routes/        # API routes
│   │   ├── storage/       # Storage providers
│   │   ├── types/         # TypeScript types
│   │   ├── utils/         # Utility functions
│   │   └── validation/    # Zod schemas
│   └── ...
└── README.md
```

## Setup

### Prerequisites
- Node.js 18+
- npm or yarn
- Google Cloud Console account

### 1. Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable the **Google Drive API**:
   - Go to APIs & Services > Library
   - Search for "Google Drive API"
   - Click Enable
4. Configure OAuth Consent Screen:
   - Go to APIs & Services > OAuth consent screen
   - Choose "External" user type
   - Fill in app name, user support email
   - Add scopes: `drive.file`
   - Add test users (your email) if in testing mode
5. Create OAuth 2.0 Credentials:
   - Go to APIs & Services > Credentials
   - Click "Create Credentials" > "OAuth client ID"
   - Application type: **Web application**
   - Add Authorized JavaScript origins:
     - `http://localhost:5173`
     - `http://localhost:5174`
     - `http://localhost:5175`
   - Click Create and copy the **Client ID**

### 2. Clone and Install

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### 3. Configure Environment

**Client** (`client/.env`):
```env
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

**Server** (`server/.env`):
```env
PORT=3001
NODE_ENV=development
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=postmessage
CORS_ORIGIN=http://localhost:5173
```

> **Important**: You need both the Client ID and Client Secret from Google Cloud Console. The Client Secret is required for exchanging authorization codes for tokens with refresh token support.

### 4. Run Development Servers

```bash
# Terminal 1 - Start backend
cd server
npm run dev

# Terminal 2 - Start frontend
cd client
npm run dev
```

### 5. Access Application

- Frontend: http://localhost:5173 (or next available port)
- Backend API: http://localhost:3001

Click "Continue with Google" to sign in. Documents will be uploaded to your personal Google Drive.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/google` | Google OAuth login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/check` | Check auth status |
| POST | `/api/submit` | Submit documents |
| GET | `/api/health` | Health check |

## Document Types

- Aadhaar Card
- PAN Card
- RC Book
- Invoice
- Insurance

## Validation Rules

### Form Fields
- **Customer Name**: 2-100 characters
- **Mobile Number**: 10 digits, Indian format (starts with 6-9)
- **Vehicle Number**: Indian format (e.g., MH12AB1234)
- **Bank Name**: 2-100 characters

### File Uploads
- Formats: JPG, PNG, PDF
- Max size: 5MB per file
- All 5 documents required

## How It Works

1. User signs in with Google (grants `drive.file` permission)
2. User fills out the form and uploads documents
3. Backend creates a folder in user's Google Drive: `CustomerName_VehicleNumber_SubmissionID`
4. All documents are uploaded to that folder
5. User receives a link to view the folder in their Drive

## Storage Providers

The application uses an abstract storage provider pattern:

```typescript
interface StorageProvider {
  createFolder(folderName: string): Promise<{ folderId: string; folderLink: string }>;
  uploadFile(folderId: string, fileName: string, mimeType: string, buffer: Buffer): Promise<{ fileId: string; fileLink: string }>;
}
```

### Available Providers
- `GoogleDriveProvider` - Uses user's OAuth token to upload to their Drive
- `LocalStorageProvider` - Local filesystem (fallback for testing)

### Adding New Providers (Future)

1. Create new provider in `server/src/storage/`
2. Extend `BaseStorageProvider`
3. Update `getStorageProvider()` in `server/src/storage/index.ts`

Example for AWS S3:
```typescript
export class S3StorageProvider extends BaseStorageProvider {
  name = 's3';
  // Implement createFolder and uploadFile
}
```

## Security Features

- **OAuth 2.0**: Google Sign-In with minimal scopes (`drive.file`)
- **JWT Tokens**: HTTP-only cookies for session management
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **CORS**: Configurable origin whitelist
- **Helmet**: Security headers
- **File Validation**: MIME type and size validation
- **Input Sanitization**: Filename sanitization, Zod validation

## Production Deployment

1. Build the applications:
```bash
cd client && npm run build
cd ../server && npm run build
```

2. Update Google OAuth credentials:
   - Add production domain to Authorized JavaScript origins
   - Submit app for verification if needed

3. Set production environment:
```env
NODE_ENV=production
JWT_SECRET=<strong-random-secret>
CORS_ORIGIN=https://your-production-domain.com
```

4. Serve the client build with a static file server or CDN
5. Run the server with `npm start`

## License

MIT
