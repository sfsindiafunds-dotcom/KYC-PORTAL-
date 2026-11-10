import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// CRITICAL: The app will break without specifying firestoreDatabaseId
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export const AUTHORIZED_ADVISOR_EMAIL = 'sfsindiafunds@gmail.com';
export const AUTHORIZED_ADMIN_EMAIL = AUTHORIZED_ADVISOR_EMAIL;

export function isUserAdvisor(user?: { email?: string | null; emailVerified?: boolean; providerData?: { providerId: string }[] } | null): boolean {
  if (!user || !user.email) return false;
  const isTargetEmail = user.email.trim().toLowerCase() === AUTHORIZED_ADVISOR_EMAIL.toLowerCase();
  if (!isTargetEmail) return false;

  // Must be authenticated via Google OAuth with email verified
  const hasGoogleProvider = user.providerData?.some((p) => p.providerId === 'google.com') ?? true;
  const isVerified = user.emailVerified ?? true;

  return isTargetEmail && hasGoogleProvider && isVerified;
}

export function isUserAdmin(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === AUTHORIZED_ADVISOR_EMAIL.toLowerCase();
}

// Connection test mandated by Firebase Skill
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

// Invoke on boot
testConnection();
