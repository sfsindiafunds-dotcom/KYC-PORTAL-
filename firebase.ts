import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from './firebase-applet-config.json';

// Reuse the default app during Vite hot reload instead of initializing a
// second Firebase app and triggering the "already exists" runtime error.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// AI Studio provisions a named Firestore database for this app. Keep the
// configured database ID rather than silently falling back to "(default)".
if (!firebaseConfig.projectId || !firebaseConfig.appId || !firebaseConfig.apiKey ||
    !firebaseConfig.authDomain || !firebaseConfig.storageBucket ||
    !firebaseConfig.firestoreDatabaseId) {
  throw new Error(
    'Firebase configuration is incomplete. Check firebase-applet-config.json and the Firebase project settings.'
  );
}

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({ prompt: 'select_account' });

export const AUTHORIZED_ADVISOR_EMAIL = 'sfsindiafunds@gmail.com';
export const AUTHORIZED_ADMIN_EMAIL = AUTHORIZED_ADVISOR_EMAIL;

export function isUserAdvisor(user?: {
  email?: string | null;
  emailVerified?: boolean;
  providerData?: { providerId: string }[];
} | null): boolean {
  if (!user?.email) return false;
  const isTargetEmail =
    user.email.trim().toLowerCase() === AUTHORIZED_ADVISOR_EMAIL.toLowerCase();
  const hasGoogleProvider =
    user.providerData?.some((provider) => provider.providerId === 'google.com') ?? false;

  return isTargetEmail && hasGoogleProvider && user.emailVerified === true;
}

export function isUserAdmin(email?: string | null): boolean {
  return !!email &&
    email.trim().toLowerCase() === AUTHORIZED_ADVISOR_EMAIL.toLowerCase();
}
