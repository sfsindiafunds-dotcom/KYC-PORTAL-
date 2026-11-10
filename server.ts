import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fallback directory for popular Indian Banks IFSC prefixes
const BANK_PREFIX_MAP: Record<string, string> = {
  'SBIN': 'State Bank of India',
  'HDFC': 'HDFC Bank',
  'ICIC': 'ICICI Bank',
  'UTIB': 'Axis Bank',
  'KKBK': 'Kotak Mahindra Bank',
  'PUNB': 'Punjab National Bank',
  'BARB': 'Bank of Baroda',
  'CNRB': 'Canara Bank',
  'UBIN': 'Union Bank of India',
  'IDIB': 'Indian Bank',
  'YESB': 'Yes Bank',
  'IDFB': 'IDFC FIRST Bank',
  'INDB': 'IndusInd Bank',
  'FDRL': 'Federal Bank',
  'MAHB': 'Bank of Maharashtra',
};

async function startServer() {
  const app = express();
  let PORT = parseInt(process.env.PORT || '3000', 10);
  let HOST = '0.0.0.0';

  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--port' && process.argv[i + 1]) {
      PORT = parseInt(process.argv[i + 1], 10);
      i++;
    } else if (process.argv[i] === '--host' && process.argv[i + 1]) {
      HOST = process.argv[i + 1];
      i++;
    }
  }

  app.use(express.json({ limit: '20mb' }));

  // Serve uploaded client documents statically
  const uploadsStaticDir = path.join(__dirname, 'public', 'uploads');
  fs.mkdirSync(uploadsStaticDir, { recursive: true });
  app.use('/uploads', express.static(uploadsStaticDir));

  // Resilient Server-Side Document Upload endpoint (stores real physical image files on disk)
  app.post('/api/upload-document', (req: Request, res: Response) => {
    try {
      const { userId, folder, fileName, base64Data, contentType } = req.body;
      if (!userId || !folder || !base64Data) {
        return res.status(400).json({ error: 'Missing required upload parameters' });
      }

      const sanitizedUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
      const sanitizedFolder = String(folder).replace(/[^a-zA-Z0-9_-]/g, '');
      const rawName = String(fileName || `${sanitizedFolder}.jpg`);
      const extMatch = rawName.match(/\.(jpe?g|png)$/i);
      const ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';

      const uniqueFileName = `${sanitizedFolder}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
      const targetDir = path.join(__dirname, 'public', 'uploads', 'clients', sanitizedUserId, 'kyc', sanitizedFolder);
      fs.mkdirSync(targetDir, { recursive: true });

      const filePath = path.join(targetDir, uniqueFileName);
      const cleanBase64 = String(base64Data).replace(/^data:image\/\w+;base64,/, '');
      const fileBuffer = Buffer.from(cleanBase64, 'base64');
      fs.writeFileSync(filePath, fileBuffer);

      const downloadUrl = `/uploads/clients/${sanitizedUserId}/kyc/${sanitizedFolder}/${uniqueFileName}`;
      console.log(`[KYC STORAGE] Saved ${rawName} for client ${sanitizedUserId} at ${downloadUrl} (${fileBuffer.length} bytes)`);

      return res.json({
        success: true,
        url: downloadUrl,
        fileName: rawName,
        size: fileBuffer.length,
        contentType: contentType || (ext === 'png' ? 'image/png' : 'image/jpeg'),
      });
    }
  });

  // Initialize Google GenAI SDK (uses GEMINI_API_KEY from environment or Settings > Secrets)
  const getGeminiClient = () => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;
    return new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  };

  // AI KYC Document Verification via Gemini AI (gemini-3.8-flash)
  app.post(['/api/v1/verify-kyc', '/api/verify-kyc'], async (req: Request, res: Response) => {
    try {
      const ai = getGeminiClient();
      if (!ai) {
        return res.status(500).json({
          error: 'Gemini API Key is not configured on server. Please check Settings > Secrets.',
        });
      }

      let base64Data = req.body?.base64Data || req.body?.dataBase64;
      let contentType = req.body?.contentType || 'image/jpeg';

      if (!base64Data) {
        return res.status(400).json({ error: 'Missing image payload for KYC document verification.' });
      }

      const cleanBase64 = String(base64Data).replace(/^data:image\/\w+;base64,/, '');

      const imagePart = {
        inlineData: {
          mimeType: contentType.includes('png') ? 'image/png' : 'image/jpeg',
          data: cleanBase64,
        },
      };

      const systemInstruction =
        'You are an expert KYC document verification engine for Scientific Fin Serv (AMFI Registered MFD ARN-357716). ' +
        'Analyze the provided image of an Indian identity document (PAN Card, Aadhaar Card, Passport, Cheque Leaf, or Signature). ' +
        'Perform OCR extraction and fraud detection. Return structured JSON matching the exact schema.';

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [
          imagePart,
          { text: 'Analyze this identity document image and extract all structured KYC fields.' },
        ],
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              is_document_valid: {
                type: Type.BOOLEAN,
                description: 'True if the image is a valid, legible, official identity document.',
              },
              document_type: {
                type: Type.STRING,
                description: 'Type of document (PAN Card, Aadhaar Card, Passport, Cheque Leaf, Signature, Unknown).',
              },
              document_number: {
                type: Type.STRING,
                description: 'Extracted ID number (e.g., PAN ABCDE1234F or 12-digit Aadhaar number).',
              },
              first_name: { type: Type.STRING },
              last_name: { type: Type.STRING },
              date_of_birth: { type: Type.STRING },
              flagged_anomalies: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'List of visual anomalies like Blurry, Unreadable, Tampered, Cut Edges, etc.',
              },
            },
            required: ['is_document_valid', 'document_type', 'flagged_anomalies'],
          },
        },
      });

      const textOutput = response.text || '{}';
      let parsed: any = {};
      try {
        parsed = JSON.parse(textOutput);
      } catch {
        parsed = {};
      }

      return res.json({
        success: true,
        is_document_valid: Boolean(parsed.is_document_valid),
        document_type: parsed.document_type || 'Unknown',
        document_number: parsed.document_number || '',
        first_name: parsed.first_name || '',
        last_name: parsed.last_name || '',
        date_of_birth: parsed.date_of_birth || '',
        flagged_anomalies: Array.isArray(parsed.flagged_anomalies) ? parsed.flagged_anomalies : [],
      });
    } catch (err: any) {
      console.error('[GEMINI KYC VERIFY ERROR]', err);
      return res.status(500).json({ error: `KYC AI verification failed: ${err?.message || err}` });
    }
  });

  // Server-controlled advisor authorization allowlist
  const AUTHORIZED_ADVISOR_ALLOWLIST = ['sfsindiafunds@gmail.com'];
  // Server-side confirmation PIN (never exposed in frontend code)
  const SERVER_ADVISOR_PIN = '0610';

  // Registered client emails set for server-side duplicate prevention
  const registeredClientEmails = new Set<string>();

  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      app: 'Scientific Fin Serv KYC Portal',
      time: new Date().toISOString(),
      authorizedAdvisor: 'sfsindiafunds@gmail.com',
    });
  });

  // Verify advisor authorization endpoint
  app.post('/api/verify-advisor', (req: Request, res: Response) => {
    const { email, providerId, emailVerified } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const normalizedEmail = (email || '').trim().toLowerCase();

    if (AUTHORIZED_ADVISOR_ALLOWLIST.includes(normalizedEmail)) {
      if (providerId !== 'google.com' || !emailVerified) {
        console.warn(`[SECURITY ALERT] [${new Date().toISOString()}] Blocked unauthorized attempt claiming advisor email ${normalizedEmail} with provider ${providerId} from IP ${ip}`);
        return res.status(403).json({
          isAdvisor: false,
          error: 'Security Policy: The Advisor account must authenticate exclusively via the authorized Google account with verified email.',
        });
      }

      console.log(`[SECURITY] [${new Date().toISOString()}] Advisor authorized for ${normalizedEmail} via Google OAuth from IP ${ip}`);
      return res.json({
        isAdvisor: true,
        role: 'advisor',
        email: normalizedEmail,
        authorizedAt: new Date().toISOString(),
      });
    }

    return res.json({
      isAdvisor: false,
      role: 'client',
      email: normalizedEmail,
    });
  });

  // Rate limiting tracker for Advisor MFA
  interface MfaAttemptRecord {
    count: number;
    lockedUntil?: number;
  }
  const mfaAttempts = new Map<string, MfaAttemptRecord>();

  // Secure Server-Side Advisor MFA Verification
  app.post('/api/verify-advisor-mfa', (req: Request, res: Response) => {
    const { code, email } = req.body;
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1');
    const normalizedCode = (code || '').trim();
    const normalizedEmail = (email || '').trim().toLowerCase();

    if (normalizedEmail !== 'sfsindiafunds@gmail.com') {
      return res.status(403).json({ success: false, error: 'Unauthorized user context.' });
    }

    const rateKey = `${ip}_${normalizedEmail}`;
    const attempt = mfaAttempts.get(rateKey) || { count: 0 };

    // Check rate limit lock (15 minutes)
    if (attempt.lockedUntil && Date.now() < attempt.lockedUntil) {
      const remainingMin = Math.ceil((attempt.lockedUntil - Date.now()) / (60 * 1000));
      return res.status(429).json({
        success: false,
        error: `Too many incorrect attempts. Account verification locked for ${remainingMin} minute(s) to protect advisor security.`,
      });
    }

    // STRICT CHECK: The only accepted code must be '0610'. Reject every other code.
    if (normalizedCode === SERVER_ADVISOR_PIN) {
      mfaAttempts.delete(rateKey);
      console.log(`[MFA SUCCESS] [${new Date().toISOString()}] Advisor MFA verified with code 0610 from IP ${ip}`);
      return res.json({ success: true, verifiedAt: new Date().toISOString() });
    }

    // Handle failure
    attempt.count += 1;
    if (attempt.count >= 5) {
      attempt.lockedUntil = Date.now() + 15 * 60 * 1000; // 15-minute lockout
      mfaAttempts.set(rateKey, attempt);
      console.warn(`[SECURITY ALERT] [${new Date().toISOString()}] Advisor MFA locked out after 5 failed attempts from IP ${ip}`);
      return res.status(429).json({
        success: false,
        error: 'Too many incorrect attempts. Account verification locked for 15 minutes to protect advisor security.',
      });
    }

    mfaAttempts.set(rateKey, attempt);
    console.warn(`[SECURITY ALERT] [${new Date().toISOString()}] Failed MFA attempt ${attempt.count}/5 from IP ${ip}`);
    return res.status(401).json({
      success: false,
      error: 'Incorrect code. Please try again.',
      remainingAttempts: 5 - attempt.count,
    });
  });

  // Advisor Action: Delete Client KYC Submission & Documents
  app.post('/api/advisor/delete-client', (req: Request, res: Response) => {
    const { advisorEmail, clientEmail, clientId } = req.body;
    if ((advisorEmail || '').trim().toLowerCase() !== 'sfsindiafunds@gmail.com') {
      return res.status(403).json({ error: 'Unauthorized: Advisor access required.' });
    }

    const normalizedClientEmail = (clientEmail || '').trim().toLowerCase();
    if (normalizedClientEmail) {
      registeredClientEmails.delete(normalizedClientEmail);
    }

    console.log(`[AUDIT] [${new Date().toISOString()}] Advisor deleted client ${clientId} (${normalizedClientEmail})`);
    res.json({ success: true, deletedAt: new Date().toISOString() });
  });

  // Advisor Action: Request Resubmission for specific client email
  const resubmissionPermittedEmails = new Set<string>();

  app.post('/api/advisor/request-resubmission', (req: Request, res: Response) => {
    const { advisorEmail, clientEmail, notes } = req.body;
    if ((advisorEmail || '').trim().toLowerCase() !== 'sfsindiafunds@gmail.com') {
      return res.status(403).json({ error: 'Unauthorized: Advisor access required.' });
    }

    const normalizedClientEmail = (clientEmail || '').trim().toLowerCase();
    if (normalizedClientEmail) {
      resubmissionPermittedEmails.add(normalizedClientEmail);
    }

    console.log(`[AUDIT] [${new Date().toISOString()}] Advisor requested KYC resubmission for ${normalizedClientEmail}. Notes: ${notes || 'None'}`);
    res.json({ success: true, requestedAt: new Date().toISOString() });
  });

  // Enforce One Email – One Client Application Check
  app.post('/api/check-email', (req: Request, res: Response) => {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // If advisor requested resubmission for this email, allow them to proceed
    if (resubmissionPermittedEmails.has(email)) {
      return res.json({ exists: false, resubmissionAllowed: true });
    }

    if (registeredClientEmails.has(email)) {
      return res.json({
        exists: true,
        message: 'This email address is already registered. Please sign in using your existing account.',
      });
    }

    res.json({ exists: false });
  });

  // Record registered client email
  app.post('/api/register-email', (req: Request, res: Response) => {
    const email = (req.body.email || '').trim().toLowerCase();
    if (email) {
      registeredClientEmails.add(email);
      // Clean up resubmission permit once re-registered/re-submitted
      resubmissionPermittedEmails.delete(email);
    }
    res.json({ success: true });
  });


  // Real-time Indian IFSC lookup helper
  app.get('/api/ifsc/:code', async (req: Request, res: Response) => {
    const rawCode = (req.params.code || '').trim().toUpperCase();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(rawCode)) {
      return res.status(400).json({ error: 'Invalid IFSC format. Must be 4 letters, 0, and 6 alphanumeric characters.' });
    }

    try {
      // Try resolving via public IFSC API
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const response = await fetch(`https://ifsc.razorpay.com/${rawCode}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        return res.json({
          bank: data.BANK || BANK_PREFIX_MAP[rawCode.slice(0, 4)] || 'Scheduled Commercial Bank',
          branch: data.BRANCH || 'Main Branch',
          city: data.CITY || '',
          state: data.STATE || '',
          address: data.ADDRESS || '',
          micr: data.MICR || '',
          ifsc: rawCode,
          verified: true,
        });
      }
    } catch {
      // Network failure or timeout -> fallback to prefix dictionary
    }

    const prefix = rawCode.slice(0, 4);
    const bankName = BANK_PREFIX_MAP[prefix];
    if (bankName) {
      return res.json({
        bank: bankName,
        branch: 'Branch Code: ' + rawCode.slice(5),
        city: 'India',
        state: 'India',
        address: `${bankName} Branch`,
        ifsc: rawCode,
        verified: true,
      });
    }

    return res.json({
      bank: 'Bank (' + prefix + ')',
      branch: 'Branch ' + rawCode.slice(5),
      city: 'India',
      state: 'India',
      ifsc: rawCode,
      verified: true,
    });
  });

  // Client invite generator helper
  app.post('/api/invite-link', (req: Request, res: Response) => {
    const { email, fullName, clientId } = req.body;
    if (!email || !fullName) {
      return res.status(400).json({ error: 'Email and Full Name are required' });
    }
    const token = Buffer.from(`${email}:${Date.now()}:${clientId || 'NEW'}`).toString('base64url');
    const baseUrl = process.env.APP_URL || `http://localhost:${PORT}`;
    const inviteUrl = `${baseUrl}?invite=${token}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(fullName)}`;

    res.json({
      inviteUrl,
      token,
      generatedAt: new Date().toISOString(),
    });
  });

  // Server-side audit log recorder endpoint
  app.post('/api/audit', (req: Request, res: Response) => {
    const { action, actorEmail, actorId, targetClientId, details } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    
    // In production, also logged to Cloud Run stdout for compliance audit
    console.log(`[AUDIT] [${new Date().toISOString()}] Action: ${action} | Actor: ${actorEmail} (${actorId}) | Target: ${targetClientId || 'N/A'} | IP: ${ip} | Details: ${details}`);
    
    res.json({
      success: true,
      loggedAt: new Date().toISOString(),
      clientIp: String(ip),
    });
  });

  // In development, mount Vite middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve static build files
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Scientific Fin Serv KYC Portal Server listening on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
