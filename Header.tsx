import React from 'react';
import { ShieldCheck, LogOut, Lock } from 'lucide-react';
import { useAuth } from './AuthContext.tsx';
import { DISTRIBUTOR_PROFILE } from './constants.ts';

export const Header: React.FC = () => {
  const { user, isAdvisor, logout } = useAuth();

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Portal Identity */}
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Scientific Fin Serv Logo"
              className="h-10 w-auto object-contain shrink-0"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-sm tracking-tight">
                  Scientific Fin Serv KYC Portal
                </span>
                <span className="text-[10px] font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200 hidden sm:inline">
                  {DISTRIBUTOR_PROFILE.arn}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium hidden sm:block">
                {DISTRIBUTOR_PROFILE.companyDescription}
              </p>
            </div>
          </div>

          {/* Advisor indicator for authenticated Advisor */}
          {user && isAdvisor && (
            <div className="hidden sm:flex items-center px-3 py-1.5 bg-slate-100 text-slate-800 rounded-xl border border-slate-200 text-xs font-bold">
              <span>Advisor Dashboard</span>
            </div>
          )}

          {/* Right Controls */}
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <div className="text-right hidden sm:block">
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="text-xs font-bold text-slate-800 truncate max-w-40">
                      {user.displayName || user.email?.split('@')[0]}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                        isAdvisor
                          ? 'bg-slate-900 text-white'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {isAdvisor ? 'ADVISOR' : 'CLIENT'}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono block">
                    {user.email}
                  </span>
                </div>


                <button
                  type="button"
                  onClick={() => logout()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </>
            ) : (
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-emerald-600" />
                256-Bit SSL
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
