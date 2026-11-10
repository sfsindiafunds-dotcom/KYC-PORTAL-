import React, { useState } from 'react';
import { Mail, Lock, AlertCircle, ArrowRight, CheckCircle2, UserPlus, KeyRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import { DISTRIBUTOR_PROFILE } from '../../lib/constants.ts';

export const AuthModal: React.FC = () => {
  const { loginWithGoogle, registerWithEmail } = useAuth();

  // Sign Up Form State
  const [signupIdentifier, setSignupIdentifier] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [signupSuccess, setSignupSuccess] = useState<string | null>(null);

  // Google Advisor/Client login state
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  // Handle Create Account (Sign Up)
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError(null);
    setSignupSuccess(null);

    const identifier = signupIdentifier.trim();
    if (!identifier) {
      setSignupError('Please enter your email address or phone number.');
      return;
    }

    if (!identifier.includes('@')) {
      const digits = identifier.replace(/\D/g, '');
      if (digits.length < 10) {
        setSignupError('Please enter a valid 10-digit mobile number or email address.');
        return;
      }
    }

    if (!signupPassword) {
      setSignupError('Please create a password.');
      return;
    }

    if (signupPassword.length < 6) {
      setSignupError('Password must be at least 6 characters long.');
      return;
    }

    if (signupPassword !== signupConfirmPassword) {
      setSignupError('Passwords do not match. Please re-enter.');
      return;
    }

    setSignupLoading(true);
    try {
      await registerWithEmail(identifier, signupPassword);
      setSignupSuccess('Account verified successfully! Loading your KYC portal...');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '';
      if (errMsg.includes('weak-password')) {
        setSignupError('Password is too weak. Please use at least 6 characters.');
      } else {
        setSignupError(errMsg || 'Account setup failed. Please check your details and try again.');
      }
    } finally {
      setSignupLoading(false);
    }
  };

  // Google Login (for Advisor sfsindiafunds@gmail.com and Google users)
  const handleGoogleSignIn = async () => {
    setGoogleError(null);
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
    } catch (err: unknown) {
      setGoogleError(err instanceof Error ? err.message : 'Google sign-in was interrupted.');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-8 sm:py-12">
      <div className="max-w-md w-full">
        {/* Portal Branding Banner with Official Uploaded Logo */}
        <div className="text-center mb-6 bg-white border border-slate-200 rounded-3xl p-6 sm:p-7 shadow-xs">
          <div className="flex justify-center mb-3">
            <img
              src="/logo.png"
              alt="Scientific Fin Serv Logo"
              className="h-20 w-auto object-contain max-w-[180px] transition-transform hover:scale-102"
            />
          </div>
          <h1 className="text-2xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Scientific Fin Serv KYC Portal
          </h1>
          <p className="text-xs font-semibold text-slate-600 mt-1">
            {DISTRIBUTOR_PROFILE.companyDescription}
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 text-sky-900 border border-sky-200 text-[11px] font-mono font-bold">
            {DISTRIBUTOR_PROFILE.arn}
          </div>

          {/* Google Sign In (for Advisor & Google Accounts) */}
          <div className="mt-5 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-800 text-xs font-bold transition shadow-2xs disabled:opacity-60 cursor-pointer"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{googleLoading ? 'Connecting...' : 'Continue with Google (Advisor / Client)'}</span>
            </button>
            {googleError && (
              <p className="text-[11px] text-rose-600 mt-2 font-semibold text-center">{googleError}</p>
            )}
          </div>
        </div>

        {/* SINGLE SIGN UP SECTION (Existing User / Login completely removed) */}
        <div className="bg-white border-2 border-sky-100 rounded-3xl p-6 sm:p-7 shadow-sm">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-950 flex items-center justify-center font-bold">
              <UserPlus className="w-4 h-4 text-sky-700" />
            </div>
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
              Create Account (Sign Up)
            </h2>
          </div>
          <p className="text-xs text-slate-500 mb-5">
            Register with your email address or phone number to submit your KYC.
          </p>

          {signupError && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span className="font-medium leading-relaxed">{signupError}</span>
            </div>
          )}

          {signupSuccess && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span className="font-medium leading-relaxed">{signupSuccess}</span>
            </div>
          )}

          <form onSubmit={handleSignUp} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Email address or phone number <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  required
                  value={signupIdentifier}
                  onChange={(e) => setSignupIdentifier(e.target.value)}
                  placeholder="name@domain.com or 9876543210"
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-900 bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Create password <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="password"
                  required
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-900 bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Confirm password <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="password"
                  required
                  value={signupConfirmPassword}
                  onChange={(e) => setSignupConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-900 bg-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={signupLoading}
              className="w-full mt-2 py-3 bg-sky-950 hover:bg-sky-900 text-white rounded-xl font-bold shadow-xs transition flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
            >
              <span>{signupLoading ? 'Setting up Account...' : 'Sign Up'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-5 pt-3 border-t border-slate-100 text-[11px] text-slate-400 text-center">
            Secured via Firebase Authentication • Encrypted credentials
          </div>
        </div>
      </div>
    </div>
  );
};
