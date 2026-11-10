import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './AuthContext.tsx';
import { Header } from './Header.tsx';
import { AuthModal } from './AuthModal.tsx';
import { UploadKycPage } from './UploadKycPage.tsx';
import { AdminDashboard } from './AdminDashboard.tsx';
import { DISTRIBUTOR_PROFILE } from './constants.ts';
import { ShieldCheck, Lock, KeyRound, AlertCircle, ArrowRight } from 'lucide-react';

const AdvisorMfaChallenge: React.FC = () => {
  const { user, verifyAdvisorMfa, logout } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = code.trim();

    if (!/^\d{4}$/.test(trimmed)) {
      setError('Enter the 4-digit security code.');
      return;
    }

    setVerifying(true);
    try {
      const result = await verifyAdvisorMfa(trimmed);
      if (!result.success) {
        setError(result.error || 'Incorrect code. Please try again.');
      }
    } catch {
      setError('Incorrect code. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="bg-white border border-slate-200 rounded-3xl p-8 sm:p-10 max-w-md w-full shadow-md text-center">
        <div className="w-14 h-14 bg-sky-950 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xs">
          <KeyRound className="w-7 h-7 text-sky-300" />
        </div>

        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
          Advisor Security Verification
        </h2>

        <p className="text-xs text-slate-600 mt-2 font-medium">
          Logged in as <strong className="text-slate-900 font-bold">{user?.email || 'sfsindiafunds@gmail.com'}</strong>.
        </p>

        {error && (
          <div className="my-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2 text-left">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        <form onSubmit={handleVerify} className="mt-6 space-y-4 text-xs text-left">
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              4-Digit Security Code
            </label>
            <input
              type="password"
              maxLength={4}
              autoFocus
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, '').slice(0, 4));
                setError(null);
              }}
              placeholder="••••"
              className="w-full text-center text-2xl font-mono tracking-widest py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-900 bg-slate-50/50"
            />
          </div>

          <button
            type="submit"
            disabled={verifying || code.trim().length === 0}
            className="w-full py-3 bg-sky-950 hover:bg-sky-900 text-white rounded-xl font-bold shadow-xs transition flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
          >
            {verifying ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Verifying...</span>
              </span>
            ) : (
              <>
                <span>Verify & Unlock Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={() => logout()}
            className="text-xs text-slate-500 hover:text-slate-800 font-semibold hover:underline"
          >
            Sign out of Advisor Account
          </button>
        </div>
      </div>
    </div>
  );
};

const MainContent: React.FC = () => {
  const { user, isAdvisor, isAdvisorMfaVerified, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-3 border-slate-900 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-xs font-semibold text-slate-600">Verifying secure authentication...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900 font-sans selection:bg-slate-900 selection:text-white">
      <Header />

      <main className="flex-1">
        {!user ? (
          <AuthModal />
        ) : isAdvisor ? (
          !isAdvisorMfaVerified ? (
            <AdvisorMfaChallenge />
          ) : (
            <AdminDashboard />
          )
        ) : (
          <UploadKycPage />
        )}
      </main>

      {/* Compliance Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 mt-12 text-slate-500 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Logo" className="h-5 w-auto object-contain" />
            <span className="font-semibold text-slate-800">Scientific Fin Serv KYC Portal</span>
            <span className="text-slate-400">|</span>
            <span className="font-medium text-slate-600">{DISTRIBUTOR_PROFILE.companyDescription}</span>
            <span className="text-slate-400">|</span>
            <span className="font-mono text-[11px] font-bold text-sky-900">{DISTRIBUTOR_PROFILE.arn}</span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[11px]">
            <span className="flex items-center gap-1 text-slate-600 font-medium">
              <Lock className="w-3.5 h-3.5 text-emerald-600" />
              256-Bit SSL Encrypted
            </span>
            <span>SEBI / KRA Verification Process</span>
            <span>UIDAI Privacy Compliant (No Full Aadhaar Stored)</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainContent />
    </AuthProvider>
  );
}
