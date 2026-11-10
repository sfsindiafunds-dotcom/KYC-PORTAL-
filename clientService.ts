import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  limit,
  addDoc,
  onSnapshot,
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, auth, storage, AUTHORIZED_ADVISOR_EMAIL } from './firebase.ts';
import { handleFirestoreError, OperationType } from './firebaseErrors.ts';
import { KycApplication, KycStatus, AuditLog } from './index.ts';

const APPLICATIONS_COLL = 'clients';
const AUDIT_COLL = 'auditLogs';

// Internal application reference ID generator (used internally for audit & document tracking)
export function generateApplicationReferenceNumber(): string {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `SFS-KYC-${new Date().getFullYear()}-${rand}`;
}

// Enforce One Email – One Client Application in database & backend
export async function checkEmailAlreadyRegistered(email: string, currentUserId?: string): Promise<boolean> {
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail) return false;

  try {
    // 1. Query Firestore clients collection
    const q = query(
      collection(db, APPLICATIONS_COLL),
      where('email', '==', normalizedEmail),
      limit(2)
    );
    const snap = await getDocs(q);

    for (const d of snap.docs) {
      if (!currentUserId || d.id !== currentUserId) {
        // If advisor requested resubmission for this application, allow them to re-access
        const data = d.data() as KycApplication;
        if (data.status === 'resubmission_requested' || data.resubmissionRequested) {
          return false;
        }
        return true;
      }
    }

    // 2. Query backend duplicate prevention check
    const res = await fetch('/api/check-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.resubmissionAllowed) return false;
      return !!data.exists;
    }

    return false;
  } catch (err) {
    console.warn('Email uniqueness check note:', err);
    return false;
  }
}

export async function fetchKycApplication(userId: string): Promise<KycApplication | null> {
  const path = `${APPLICATIONS_COLL}/${userId}`;
  try {
    const docRef = doc(db, APPLICATIONS_COLL, userId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return null;
    }
    return { id: snap.id, ...snap.data() } as KycApplication;
  } catch (error: any) {
    if (error?.code === 'permission-denied' || error?.message?.includes('permission')) {
      console.warn(`Firestore get note on ${path}:`, error.message);
      return null;
    }
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

export async function saveKycApplication(
  userId: string,
  appData: Partial<KycApplication>,
  isFinalSubmit = false
): Promise<KycApplication> {
  const path = `${APPLICATIONS_COLL}/${userId}`;
  const normalizedEmail = (auth.currentUser?.email || appData.email || '').trim().toLowerCase();

  try {
    const docRef = doc(db, APPLICATIONS_COLL, userId);
    const existingSnap = await getDoc(docRef);
    const existingData = existingSnap.exists() ? (existingSnap.data() as KycApplication) : null;
    const now = new Date().toISOString();

    // Check if duplicate on final submit (unless updating their own existing record or responding to resubmission)
    if (isFinalSubmit && !existingSnap.exists()) {
      const isDuplicate = await checkEmailAlreadyRegistered(normalizedEmail, userId);
      if (isDuplicate) {
        throw new Error('This email address is already registered. Please sign in using your existing account.');
      }
    }

    let status: KycStatus = 'draft';
    if (isFinalSubmit) {
      if (existingData?.status === 'resubmission_requested' || existingData?.resubmissionRequested) {
        status = 'resubmitted';
      } else {
        status = 'pending';
      }
    } else {
      status = appData.status || (existingData?.status ?? 'draft');
    }

    const payload: Partial<KycApplication> = {
      ...appData,
      userId,
      email: normalizedEmail,
      status,
      updatedAt: now,
    };

    if (isFinalSubmit) {
      payload.submittedAt = now;
      payload.consentCheckbox = true;
      if (status === 'resubmitted') {
        payload.resubmittedAt = now;
        payload.resubmissionRequested = false;
      }
    }

    if (!existingSnap.exists()) {
      payload.createdAt = now;
      payload.applicationId = generateApplicationReferenceNumber();
      await setDoc(docRef, payload);
    } else {
      await updateDoc(docRef, payload);
    }

    // Register email on backend server
    fetch('/api/register-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail }),
    }).catch(() => {});

    // Audit log entry
    await recordAuditLog(
      isFinalSubmit ? (status === 'resubmitted' ? 'KYC_APPLICATION_RESUBMITTED' : 'KYC_APPLICATION_SUBMITTED') : 'KYC_DRAFT_SAVED',
      `Application updated (${status}) for ${payload.fullName || userId}`,
      userId
    );

    return { id: userId, ...(existingData || {}), ...payload } as KycApplication;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Real-Time Firebase Listener for Live Advisor Dashboard updates
export function subscribeToLiveApplications(
  onUpdate: (applications: KycApplication[]) => void,
  onError?: (err: Error) => void
): () => void {
  const collRef = collection(db, APPLICATIONS_COLL);
  const q = query(collRef, limit(200));

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const apps = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as KycApplication));
      // Sort newest submissions at top
      apps.sort((a, b) => {
        const timeA = new Date(a.submittedAt || a.updatedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.submittedAt || b.updatedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      });
      onUpdate(apps);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, APPLICATIONS_COLL);
      onError?.(error);
    }
  );

  return unsubscribe;
}

export async function fetchAllApplications(): Promise<KycApplication[]> {
  const path = APPLICATIONS_COLL;
  try {
    const collRef = collection(db, APPLICATIONS_COLL);
    const snap = await getDocs(collRef);
    const apps = snap.docs.map((d) => ({ id: d.id, ...d.data() } as KycApplication));
    apps.sort((a, b) => {
      const timeA = new Date(a.submittedAt || a.updatedAt || 0).getTime();
      const timeB = new Date(b.submittedAt || b.updatedAt || 0).getTime();
      return timeB - timeA;
    });
    return apps;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function updateApplicationStatus(
  docId: string,
  status: KycStatus,
  adminRemarks?: string
): Promise<void> {
  const path = `${APPLICATIONS_COLL}/${docId}`;
  try {
    const docRef = doc(db, APPLICATIONS_COLL, docId);
    const now = new Date().toISOString();

    const updates: Record<string, unknown> = {
      status,
      updatedAt: now,
      adminRemarks: adminRemarks || '',
      reviewedAt: now,
      reviewedBy: auth.currentUser?.email || AUTHORIZED_ADVISOR_EMAIL,
    };

    await updateDoc(docRef, updates);

    await recordAuditLog(
      `STATUS_CHANGED_${status.toUpperCase()}`,
      `Application status set to ${status}. Remarks: ${adminRemarks || 'None'}`,
      docId
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// Advisor Action A: Delete Client KYC Submission
export async function deleteClientApplication(
  docId: string,
  clientEmail?: string,
  clientFullName?: string
): Promise<void> {
  const path = `${APPLICATIONS_COLL}/${docId}`;
  try {
    const docRef = doc(db, APPLICATIONS_COLL, docId);
    await deleteDoc(docRef);

    // Call backend endpoint to notify and release email index
    await fetch('/api/advisor/delete-client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        advisorEmail: auth.currentUser?.email || AUTHORIZED_ADVISOR_EMAIL,
        clientEmail: clientEmail || '',
        clientId: docId,
      }),
    });

    await recordAuditLog(
      'ADVISOR_DELETED_CLIENT',
      `Deleted KYC application for ${clientFullName || 'Client'} (${clientEmail || docId})`,
      docId
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Advisor Action B: Request Client to Re-enter Information (Resubmission)
export async function requestClientResubmission(
  docId: string,
  clientEmail: string,
  notes: string,
  clientFullName?: string
): Promise<void> {
  const path = `${APPLICATIONS_COLL}/${docId}`;
  try {
    const docRef = doc(db, APPLICATIONS_COLL, docId);
    const now = new Date().toISOString();

    const updates: Record<string, unknown> = {
      status: 'resubmission_requested',
      resubmissionRequested: true,
      resubmissionNotes: notes || 'Please review and re-submit your KYC documents.',
      resubmissionRequestedAt: now,
      updatedAt: now,
      adminRemarks: notes || 'Resubmission requested by advisor.',
      reviewedAt: now,
      reviewedBy: auth.currentUser?.email || AUTHORIZED_ADVISOR_EMAIL,
    };

    await updateDoc(docRef, updates);

    // Notify backend to authorize reopening form for this specific email
    await fetch('/api/advisor/request-resubmission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        advisorEmail: auth.currentUser?.email || AUTHORIZED_ADVISOR_EMAIL,
        clientEmail,
        notes,
      }),
    });

    await recordAuditLog(
      'ADVISOR_REQUESTED_RESUBMISSION',
      `Requested KYC resubmission from ${clientFullName || 'Client'} (${clientEmail}). Instructions: ${notes}`,
      docId
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function recordAuditLog(
  action: string,
  details: string,
  targetApplicationId?: string
): Promise<void> {
  const path = AUDIT_COLL;
  try {
    const currentUser = auth.currentUser;
    const logData: Omit<AuditLog, 'id'> = {
      action,
      actorId: currentUser?.uid || 'system',
      actorEmail: currentUser?.email || 'unauthenticated@system.local',
      targetApplicationId,
      details,
      timestamp: new Date().toISOString(),
    };
    await addDoc(collection(db, AUDIT_COLL), logData);

    fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(logData),
    }).catch(() => {});
  } catch {
    // Non-blocking
  }
}

// Save a single uploaded document directly to the client's Firestore record immediately
export async function saveSingleDocumentUrlToFirestore(
  userId: string,
  field: string,
  url: string,
  fileName: string,
  fileSize: number
): Promise<void> {
  const path = `${APPLICATIONS_COLL}/${userId}`;
  try {
    const docRef = doc(db, APPLICATIONS_COLL, userId);
    const existingSnap = await getDoc(docRef);
    const now = new Date().toISOString();

    const docUpdates: Record<string, unknown> = {
      [`documents.${field}Url`]: url,
      [`documents.${field}Name`]: fileName,
      [`documents.${field}Size`]: fileSize,
      [`documents.${field}Status`]: 'uploaded',
      [`documents.${field}UploadedAt`]: now,
      updatedAt: now,
    };

    if (field === 'scannedPaperSignature') {
      docUpdates['documents.signatureUrl'] = url;
      docUpdates['documents.signatureName'] = fileName;
      docUpdates['documents.signatureSize'] = fileSize;
      docUpdates['documents.signatureStatus'] = 'uploaded';
    }

    if (!existingSnap.exists()) {
      await setDoc(
        docRef,
        {
          userId,
          status: 'draft',
          createdAt: now,
          updatedAt: now,
          documents: {
            [`${field}Url`]: url,
            [`${field}Name`]: fileName,
            [`${field}Size`]: fileSize,
            [`${field}Status`]: 'uploaded',
            [`${field}UploadedAt`]: now,
            ...(field === 'scannedPaperSignature'
              ? { signatureUrl: url, signatureName: fileName, signatureSize: fileSize, signatureStatus: 'uploaded' }
              : {}),
          },
        },
        { merge: true }
      );
    } else {
      await updateDoc(docRef, docUpdates);
    }

    await recordAuditLog(
      'DOCUMENT_UPLOADED_IMMEDIATELY',
      `Client uploaded ${field} (${fileName}) to Firebase Storage and updated Firestore.`,
      userId
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// Remove a single document reference from client's Firestore record
export async function removeSingleDocumentFromFirestore(
  userId: string,
  field: string
): Promise<void> {
  const path = `${APPLICATIONS_COLL}/${userId}`;
  try {
    const docRef = doc(db, APPLICATIONS_COLL, userId);
    const existingSnap = await getDoc(docRef);
    if (!existingSnap.exists()) return;

    const docUpdates: Record<string, unknown> = {
      [`documents.${field}Url`]: null,
      [`documents.${field}Name`]: null,
      [`documents.${field}Size`]: null,
      [`documents.${field}Status`]: 'not_uploaded',
      updatedAt: new Date().toISOString(),
    };

    if (field === 'scannedPaperSignature') {
      docUpdates['documents.signatureUrl'] = null;
      docUpdates['documents.signatureName'] = null;
      docUpdates['documents.signatureSize'] = null;
      docUpdates['documents.signatureStatus'] = 'not_uploaded';
    }

    await updateDoc(docRef, docUpdates);

    await recordAuditLog(
      'DOCUMENT_REMOVED',
      `Client removed ${field} from application.`,
      userId
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// Resilient file upload helper using uploadBytesResumable (Max 5MB, JPG, JPEG, PNG)
// Stored securely in clients/{userId}/kyc/{field}/{uniqueFileName}
export function uploadKycDocument(
  file: File | Blob,
  folder: string,
  userId: string,
  originalFileName?: string,
  oldUrlToCleanup?: string,
  onProgress?: (percentage: number) => void
): Promise<{ url: string; fileName: string; size: number }> {
  const size = file.size;
  if (size > 5 * 1024 * 1024) {
    return Promise.reject(new Error('File size exceeds the 5 MB maximum limit.'));
  }

  const rawName = (file instanceof File ? file.name : originalFileName) || `${folder}_image.jpg`;
  const extMatch = rawName.match(/\.(jpe?g|png)$/i);
  let ext = extMatch ? extMatch[1].toLowerCase() : 'jpg';
  if (ext === 'jpeg') ext = 'jpg';

  const mimeType = file.type || (ext === 'png' ? 'image/png' : 'image/jpeg');
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png'];
  if (!allowedMimes.includes(mimeType) && !rawName.match(/\.(jpe?g|png)$/i)) {
    return Promise.reject(new Error('Permitted file formats are JPG, JPEG and PNG.'));
  }

  // Safe unique filename: e.g. panCard_usr123_1730000000000_a1b2c.jpg
  const sanitizedUserId = userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
  const randomSalt = Math.random().toString(36).substring(2, 7);
  const uniqueFileName = `${folder}_${sanitizedUserId}_${Date.now()}_${randomSalt}.${ext}`;
  // Exact path structure per requirements: clients/{clientUID}/kyc/{image}
  const storagePath = `clients/${userId}/kyc/${folder}/${uniqueFileName}`;

  const storageRef = ref(storage, storagePath);
  const uploadTask = uploadBytesResumable(storageRef, file, {
    contentType: mimeType,
    customMetadata: {
      userId,
      folder,
      originalName: rawName,
      uploadedAt: new Date().toISOString(),
    },
  });

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        if (onProgress) {
          onProgress(isNaN(progress) ? 0 : Math.min(100, Math.max(0, progress)));
        }
      },
      (error) => {
        console.warn('Firebase Storage direct upload note (fallback to server storage service):', error?.message || error);
        if (onProgress) onProgress(50);
        
        // Resilient fallback to server-side storage endpoint (stores real physical image files on disk)
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            if (onProgress) onProgress(75);
            const base64Data = reader.result as string;
            const res = await fetch('/api/upload-document', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId,
                folder,
                fileName: rawName,
                base64Data,
                contentType: mimeType,
              }),
            });

            if (!res.ok) {
              const errBody = await res.json().catch(() => ({}));
              throw new Error(errBody.error || 'Server storage upload failed.');
            }

            const data = await res.json();
            if (onProgress) onProgress(100);

            resolve({
              url: data.url,
              fileName: data.fileName || rawName,
              size: data.size || size,
            });
          } catch (fallbackErr: any) {
            reject(new Error(fallbackErr.message || 'Image upload failed. Please try again.'));
          }
        };
        reader.onerror = () => reject(new Error('Failed to read image file.'));
        reader.readAsDataURL(file);
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);

          // Clean up old file from Firebase Storage only after replacement is safely uploaded and verified
          if (oldUrlToCleanup && oldUrlToCleanup.includes('firebasestorage.googleapis.com')) {
            try {
              const oldStorageRef = ref(storage, oldUrlToCleanup);
              deleteObject(oldStorageRef).catch(() => {});
            } catch {
              // Non-blocking cleanup
            }
          }

          resolve({
            url: downloadUrl,
            fileName: rawName,
            size,
          });
        } catch (urlErr) {
          reject(urlErr);
        }
      }
    );
  });
}
