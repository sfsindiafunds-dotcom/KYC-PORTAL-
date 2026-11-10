import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { auth, googleProvider, AUTHORIZED_ADVISOR_EMAIL } from './firebase.ts';
import { recordAuditLog } from './clientService.ts';

export type UserRole = 'advisor' | 'client';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  role: UserRole;
  isAdvisor: boolean;
  isAdvisorMfaVerified: boolean;
  verifyAdvisorMfa: (code: string) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, name?: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [role, setRole] = useState<UserRole>('client');
  const [isAdvisor, setIsAdvisor] = useState<boolean>(false);
  const [isAdvisorMfaVerified, setIsAdvisorMfaVerified] = useState<boolean>(false);

  // Server-side verification of advisor role
  const verifyServerSideRole = async (currentUser: User): Promise<boolean> => {
    try {
      const providerId = currentUser.providerData?.[0]?.providerId || 'password';
      const email = currentUser.email || '';
      const emailVerified = currentUser.emailVerified || providerId === 'google.com';

      const response = await fetch('/api/verify-advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          providerId,
          emailVerified,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return !!data.isAdvisor;
      }
    } catch (err) {
      console.warn('Server verification error:', err);
    }

    // Fallback strict client-side check
    const normalized = (currentUser.email || '').trim().toLowerCase();
    const hasGoogleProvider = currentUser.providerData?.some((p) => p.providerId === 'google.com');
    return normalized === AUTHORIZED_ADVISOR_EMAIL.toLowerCase() && !!hasGoogleProvider;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const verifiedAdvisor = await verifyServerSideRole(currentUser);
        if (verifiedAdvisor) {
          setIsAdvisor(true);
          setRole('advisor');
        } else {
          setIsAdvisor(false);
          setRole('client');
          setIsAdvisorMfaVerified(false);
        }

        recordAuditLog(
          'USER_SESSION_STARTED',
          `Session active for ${currentUser.email} (${verifiedAdvisor ? 'ADVISOR' : 'CLIENT'})`,
          currentUser.uid
        ).catch(() => {});
      } else {
        setIsAdvisor(false);
        setRole('client');
        setIsAdvisorMfaVerified(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      setUser(result.user);
      const verifiedAdvisor = await verifyServerSideRole(result.user);
      if (verifiedAdvisor) {
        setIsAdvisor(true);
        setRole('advisor');
      } else {
        setIsAdvisor(false);
        setRole('client');
      }
    } finally {
      setLoading(false);
    }
  };

  // Normalizes an email or phone number into a secure Firebase Auth identifier
  const formatAuthIdentifier = (input: string): { email: string; isPhone: boolean; phone?: string } => {
    const trimmed = input.trim();
    if (trimmed.includes('@')) {
      return { email: trimmed.toLowerCase(), isPhone: false };
    }
    const cleanPhone = trimmed.replace(/\D/g, '').slice(-10);
    return {
      email: `client.${cleanPhone}@scientificfinserv.auth`,
      isPhone: true,
      phone: cleanPhone,
    };
  };

  const loginWithEmail = async (emailOrPhone: string, pass: string) => {
    const { email: authEmail } = formatAuthIdentifier(emailOrPhone);
    const normalizedIdentifier = emailOrPhone.trim().toLowerCase();

    // Security Mandate: Never grant advisor access based only on typing the advisor email address.
    // The advisor account must strictly authenticate via the verified Google OAuth account.
    if (normalizedIdentifier === AUTHORIZED_ADVISOR_EMAIL.toLowerCase()) {
      throw new Error(
        'Advisor Security Policy: The authorized advisor account must sign in exclusively via "Continue with Google". Password sign-in is disabled for the advisor account.'
      );
    }

    setLoading(true);
    try {
      const result = await signInWithEmailAndPassword(auth, authEmail, pass);
      setUser(result.user);
      setIsAdvisor(false);
      setRole('client');
    } finally {
      setLoading(false);
    }
  };

  const registerWithEmail = async (emailOrPhone: string, pass: string, name?: string) => {
    const { email: authEmail, isPhone, phone } = formatAuthIdentifier(emailOrPhone);
    const normalizedIdentifier = emailOrPhone.trim().toLowerCase();

    // Disallow anyone from attempting to register the advisor email via email/password
    if (normalizedIdentifier === AUTHORIZED_ADVISOR_EMAIL.toLowerCase()) {
      throw new Error(
        'Registration Restricted: The advisor account is pre-provisioned and managed exclusively via authorized Google OAuth.'
      );
    }

    setLoading(true);
    try {
      const result = await createUserWithEmailAndPassword(auth, authEmail, pass);
      const displayName = name || (isPhone ? `Client (${phone})` : emailOrPhone.split('@')[0]);
      await updateProfile(result.user, { displayName });
      setUser(result.user);
      setIsAdvisor(false);
      setRole('client');
    } catch (err: any) {
      if (err?.code === 'auth/email-already-in-use') {
        try {
          const signInRes = await signInWithEmailAndPassword(auth, authEmail, pass);
          setUser(signInRes.user);
          setIsAdvisor(false);
          setRole('client');
          return;
        } catch {
          throw new Error('This account already exists. Please enter your existing password to proceed.');
        }
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const logout = async () => {
    setIsAdvisor(false);
    setIsAdvisorMfaVerified(false);
    setRole('client');
    await signOut(auth);
  };

  // Advisor Second-Factor (MFA) Verification
  // The advisor PIN check is strictly performed on the secure backend (never in frontend code).
  const verifyAdvisorMfa = async (code: string): Promise<{ success: boolean; error?: string }> => {
    const cleaned = code.trim();
    if (!user?.email) {
      return { success: false, error: 'User session expired. Please sign in again.' };
    }

    try {
      const response = await fetch('/api/verify-advisor-mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: cleaned,
          email: user.email,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setIsAdvisorMfaVerified(true);
        recordAuditLog(
          'ADVISOR_MFA_VERIFIED',
          `MFA code verified for authorized advisor ${AUTHORIZED_ADVISOR_EMAIL}`,
          user.uid
        ).catch(() => {});
        return { success: true };
      }

      return {
        success: false,
        error: data.error || 'Incorrect code. Please try again.',
      };
    } catch {
      return {
        success: false,
        error: 'Unable to reach authentication server. Please check your connection and try again.',
      };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        role,
        isAdvisor,
        isAdvisorMfaVerified,
        verifyAdvisorMfa,
        loginWithGoogle,
        loginWithEmail,
        registerWithEmail,
        resetPassword,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
