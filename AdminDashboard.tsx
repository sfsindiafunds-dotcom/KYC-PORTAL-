import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Users,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Download,
  Trash2,
  RotateCcw,
  Bell,
  FileIcon,
  ShieldCheck,
  Check,
  X,
  FileText,
  ExternalLink,
  ChevronRight,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  User,
  ZoomIn,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { KycApplication, KycStatus } from '../../types/index.ts';
import {
  subscribeToLiveApplications,
  updateApplicationStatus,
  deleteClientApplication,
  requestClientResubmission,
  recordAuditLog,
} from '../../services/clientService.ts';
import { DISTRIBUTOR_PROFILE } from '../../lib/constants.ts';
import { generateClientKycPdf } from '../../lib/pdfGenerator.ts';

export const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const [applications, setApplications] = useState<KycApplication[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Client Information Detailed Popup State
  const [selectedClientPopup, setSelectedClientPopup] = useState<KycApplication | null>(null);

  // Image Viewer Lightbox Modal State
  const [viewingImage, setViewingImage] = useState<{ url: string; title: string; fileName: string } | null>(null);

  // PDF Generation State
  const [generatingPdf, setGeneratingPdf] = useState<boolean>(false);

  // Live submission notification
  const [liveNotification, setLiveNotification] = useState<string | null>(null);
  const prevCountRef = useRef<number | null>(null);

  // Correction note state
  const [correctionNote, setCorrectionNote] = useState<string>('');
  const [showStatusRemarks, setShowStatusRemarks] = useState<boolean>(false);

  // Delete confirmation modal state
  const [clientToDelete, setClientToDelete] = useState<KycApplication | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  // Resubmission request modal state
  const [clientToResubmit, setClientToResubmit] = useState<KycApplication | null>(null);
  const [resubmissionNoteInput, setResubmissionNoteInput] = useState<string>('');
  const [requestingResubmit, setRequestingResubmit] = useState<boolean>(false);

  // Aadhaar visibility toggle per client
  const [showFullAadhaar, setShowFullAadhaar] = useState<Record<string, boolean>>({});

  // Real-time Firestore subscription (Live Advisor Dashboard updates)
  useEffect(() => {
    setLoading(true);

    const unsubscribe = subscribeToLiveApplications(
      (liveApps) => {
        if (prevCountRef.current !== null && liveApps.length > prevCountRef.current) {
          const newest = liveApps[0];
          setLiveNotification(`New KYC submission received from ${newest.fullName || 'Client'} (${newest.email})`);
          setTimeout(() => setLiveNotification(null), 6000);
        }
        prevCountRef.current = liveApps.length;
        setApplications(liveApps);

        // Keep popup in sync if open
        setSelectedClientPopup((prev) => {
          if (!prev) return null;
          const updated = liveApps.find((a) => (a.id || a.userId) === (prev.id || prev.userId));
          return updated || prev;
        });

        setLoading(false);
      },
      (err) => {
        console.error('Live subscription error:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Filtered applications: Search by name, email or PAN
  const filteredApplications = useMemo(() => {
    return applications.filter((app) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        app.fullName?.toLowerCase().includes(q) ||
        app.email?.toLowerCase().includes(q) ||
        app.pan?.toLowerCase().includes(q) ||
        app.mobile?.includes(q) ||
        app.nominee?.fullName?.toLowerCase().includes(q);

      const matchStatus = statusFilter === 'all' || app.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [applications, searchQuery, statusFilter]);

  // Handle Download Complete PDF
  const handleDownloadPdf = async (app: KycApplication) => {
    setGeneratingPdf(true);
    try {
      await generateClientKycPdf(app);
      recordAuditLog(
        'ADVISOR_DOWNLOADED_PDF',
        `Downloaded complete KYC PDF dossier for ${app.fullName || 'Client'} (${app.email})`,
        app.id || app.userId
      ).catch(() => {});
    } catch (err) {
      console.error('PDF generation error:', err);
      alert('Unable to generate PDF document. Please try again.');
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Handle Download Single Document File
  const handleDownloadSingleImage = async (url: string, fileName: string) => {
    try {
      if (url.startsWith('data:')) {
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName || 'document.jpg';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName || 'document.jpg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || 'document.jpg';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Status Change
  const handleStatusUpdate = async (docId: string, status: KycStatus, remarks?: string) => {
    try {
      await updateApplicationStatus(docId, status, remarks);
      setShowStatusRemarks(false);
      setCorrectionNote('');
    } catch {
      alert('Failed to update application status.');
    }
  };

  // Trigger Action A: Confirm & Delete Client
  const handleConfirmDelete = async () => {
    if (!clientToDelete) return;
    const docId = clientToDelete.id || clientToDelete.userId;
    setDeleting(true);
    try {
      await deleteClientApplication(docId, clientToDelete.email, clientToDelete.fullName);
      if (selectedClientPopup && (selectedClientPopup.id || selectedClientPopup.userId) === docId) {
        setSelectedClientPopup(null);
      }
      setClientToDelete(null);
    } catch {
      alert('Failed to delete client application. Please check your permissions.');
    } finally {
      setDeleting(false);
    }
  };

  // Trigger Action B: Confirm & Request Resubmission
  const handleConfirmResubmission = async () => {
    if (!clientToResubmit) return;
    const docId = clientToResubmit.id || clientToResubmit.userId;
    setRequestingResubmit(true);
    try {
      await requestClientResubmission(
        docId,
        clientToResubmit.email,
        resubmissionNoteInput.trim() || 'Please re-enter your details and upload the required documents again.',
        clientToResubmit.fullName
      );
      setClientToResubmit(null);
      setResubmissionNoteInput('');
    } catch {
      alert('Failed to request resubmission. Please check your permissions.');
    } finally {
      setRequestingResubmit(false);
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    if (!filteredApplications.length) {
      alert('No client applications to export.');
      return;
    }

    const rows = filteredApplications.map((app) => ({
      'Applicant Full Name': app.fullName,
      'Email Address': app.email,
      'Mobile Number': `+91 ${app.mobile}`,
      'PAN Number': app.pan,
      'Aadhaar Number': app.aadhaarNumber || 'N/A',
      'Date of Birth': app.dateOfBirth,
      Gender: app.gender,
      'Marital Status': app.maritalStatus,
      'Residential Address': `${app.address?.street || ''}, ${app.address?.city || ''}, ${app.address?.state || ''} - ${app.address?.pincode || ''}`,
      Occupation: app.occupation,
      'Annual Income': app.annualIncome,
      'Nominee Full Name': app.nominee?.fullName || 'N/A',
      'Nominee DOB': app.nominee?.dateOfBirth || 'N/A',
      'Nominee Email': app.nominee?.email || 'N/A',
      'Nominee Phone': app.nominee?.phone ? `+91 ${app.nominee.phone}` : 'N/A',
      'Nominee ID Type': app.nominee?.idType || 'N/A',
      'Nominee ID Number': app.nominee?.idNumber || 'N/A',
      'Nominee Confirmed': app.nominee?.confirmed ? 'YES' : 'NO',
      'KYC Status': app.status.toUpperCase(),
      'PAN Card Uploaded': app.documents?.panCardUrl ? 'YES' : 'NO',
      'Aadhaar Proof Uploaded': app.documents?.aadhaarDocUrl ? 'YES' : 'NO',
      'Photograph Uploaded': app.documents?.photoUrl ? 'YES' : 'NO',
      'White Paper Signature Uploaded': app.documents?.scannedPaperSignatureUrl || app.documents?.signatureUrl ? 'YES' : 'NO',
      'Cheque Leaf Uploaded': app.documents?.chequeLeafUrl ? 'YES' : 'NO',
      'Submission Timestamp': app.submittedAt ? new Date(app.submittedAt).toLocaleString('en-IN') : '',
      'Reviewed Timestamp': app.reviewedAt ? new Date(app.reviewedAt).toLocaleString('en-IN') : '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Client_KYC_Records');

    const fileName = `Scientific_Fin_Serv_KYC_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, fileName);

    recordAuditLog(
      'ADVISOR_EXPORTED_APPLICATIONS',
      `Exported ${filteredApplications.length} client applications to Excel`,
      'BATCH'
    ).catch(() => {});
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Live Submission Notification Toast */}
      {liveNotification && (
        <div className="fixed top-20 right-4 z-50 bg-sky-950 text-white p-4 rounded-2xl shadow-xl border border-sky-800 flex items-center gap-3 animate-fade-in">
          <Bell className="w-5 h-5 text-sky-300 shrink-0" />
          <div className="text-xs">
            <span className="font-bold block">Live Submission Alert</span>
            <span>{liveNotification}</span>
          </div>
        </div>
      )}

      {/* Top Header */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-sky-950 text-white font-mono">
                {DISTRIBUTOR_PROFILE.name}
              </span>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-900 border border-sky-200 font-mono">
                {DISTRIBUTOR_PROFILE.arn}
              </span>
              <span className="text-xs text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Live Real-Time Sync
              </span>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 mt-2">
              Private Advisor Dashboard
            </h1>
            <p className="text-xs text-slate-600 mt-1 font-medium">
              {DISTRIBUTOR_PROFILE.companyDescription} • Authorized Advisor: <strong className="text-slate-900">{DISTRIBUTOR_PROFILE.principalEmail}</strong>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition shadow-xs cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Export to Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* Search Bar & Filter */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs mb-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search clients by name, email or PAN"
            className="w-full pl-10 pr-4 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-900 bg-white"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-3 text-xs text-slate-400 hover:text-slate-600 font-medium"
            >
              Clear
            </button>
          )}
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-900 font-medium cursor-pointer"
          >
            <option value="all">All Statuses ({applications.length})</option>
            <option value="pending">Pending</option>
            <option value="under_review">Under Review</option>
            <option value="correction_requested">Correction Required</option>
            <option value="resubmission_requested">Resubmission Requested</option>
            <option value="resubmitted">Resubmitted</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {/* Client List (Clean Table / Cards with instant Popup on Click) */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-sky-900" />
            <h2 className="text-sm font-bold text-slate-900">
              Client KYC Submissions ({filteredApplications.length})
            </h2>
          </div>
          <span className="text-[11px] text-slate-500 hidden sm:block">
            Click or tap any client row to view the detailed KYC dossier popup & download PDF
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-3 border-sky-950 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-xs text-slate-500 font-semibold">Connecting to live client stream...</p>
          </div>
        ) : filteredApplications.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800">
              {searchQuery ? 'No clients match your search' : 'No client KYC applications submitted yet'}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              {searchQuery
                ? `No results for "${searchQuery}". Try clearing search filter.`
                : 'As clients submit their KYC documents, their applications appear here in real time automatically.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredApplications.map((app) => {
              const currentDocId = app.id || app.userId;
              const docs = app.documents || {};
              const uploadedCount = [
                docs.panCardUrl,
                docs.aadhaarDocUrl,
                docs.photoUrl,
                docs.scannedPaperSignatureUrl || docs.signatureUrl,
                docs.chequeLeafUrl,
              ].filter(Boolean).length;

              return (
                <div
                  key={currentDocId}
                  onClick={() => setSelectedClientPopup(app)}
                  className="p-4 sm:p-5 hover:bg-slate-50 transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                >
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-2xl bg-sky-950 text-white flex items-center justify-center font-extrabold text-sm shrink-0 shadow-2xs group-hover:bg-sky-900 transition">
                      {app.fullName ? app.fullName.charAt(0).toUpperCase() : 'C'}
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm group-hover:text-sky-900 transition">
                          {app.fullName || 'Client Applicant'}
                        </span>
                        {app.applicationId && (
                          <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {app.applicationId}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1 font-medium">
                        <span className="flex items-center gap-1 text-slate-700">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          {app.email}
                        </span>
                        {app.mobile && (
                          <span className="flex items-center gap-1 text-slate-700">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            +91 {app.mobile}
                          </span>
                        )}
                        {app.pan && (
                          <span className="font-mono font-bold text-slate-800">
                            PAN: {app.pan}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 sm:gap-4 justify-between sm:justify-end">
                    <div className="text-left sm:text-right">
                      <span className="text-[11px] text-slate-400 block">
                        {app.submittedAt
                          ? new Date(app.submittedAt).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })
                          : 'Recent'}
                      </span>
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 inline-block mt-0.5">
                        {uploadedCount}/5 Images Uploaded
                      </span>
                    </div>

                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold capitalize ${
                        app.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : app.status === 'under_review'
                          ? 'bg-purple-100 text-purple-800'
                          : app.status === 'correction_requested'
                          ? 'bg-amber-100 text-amber-800'
                          : app.status === 'resubmission_requested'
                          ? 'bg-rose-100 text-rose-800'
                          : app.status === 'resubmitted'
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-sky-100 text-sky-800'
                      }`}
                    >
                      {app.status.replace('_', ' ')}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedClientPopup(app);
                      }}
                      className="p-2 rounded-xl text-slate-400 group-hover:text-sky-950 group-hover:bg-sky-100/50 transition flex items-center gap-1 text-xs font-bold"
                    >
                      <span className="hidden md:inline">View Dossier</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 5. CLIENT INFORMATION POPUP MODAL (Detailed Popup as required)          */}
      {/* ========================================================================= */}
      {selectedClientPopup && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 bg-slate-900 text-white flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="font-bold text-sm text-sky-300">
                    Scientific Fin Serv KYC Dossier
                  </span>
                  <span className="text-[10px] font-mono bg-white/10 px-2 py-0.5 rounded text-white border border-white/20">
                    {selectedClientPopup.applicationId || 'SFS-KYC'}
                  </span>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 capitalize">
                    {selectedClientPopup.status.replace('_', ' ')}
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                  {selectedClientPopup.fullName || 'Client KYC Details'}
                </h2>
                <p className="text-xs text-slate-300 mt-1">
                  Submitted: {selectedClientPopup.submittedAt ? new Date(selectedClientPopup.submittedAt).toLocaleString('en-IN') : 'Recent'} • ARN - 357716
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/* 6. Complete PDF Download Button */}
                <button
                  type="button"
                  onClick={() => handleDownloadPdf(selectedClientPopup)}
                  disabled={generatingPdf}
                  className="flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs rounded-xl transition shadow-sm cursor-pointer disabled:opacity-60"
                  title="Download complete formatted dossier as PDF"
                >
                  <Download className="w-4 h-4" />
                  <span>{generatingPdf ? 'Generating PDF...' : 'Download PDF'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedClientPopup(null)}
                  className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-6 text-xs text-slate-800">
              {/* Section 1: Personal Information */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-3 text-sky-950 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-sky-900" />
                  1. Personal Information
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Full Name</span>
                    <span className="font-bold text-slate-900">{selectedClientPopup.fullName || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Date of Birth</span>
                    <span className="font-semibold text-slate-800">{selectedClientPopup.dateOfBirth || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Gender</span>
                    <span className="font-semibold text-slate-800">{selectedClientPopup.gender || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Marital Status</span>
                    <span className="font-semibold text-slate-800">{selectedClientPopup.maritalStatus || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Permanent Account Number</span>
                    <span className="font-mono font-bold text-slate-900 text-sm">{selectedClientPopup.pan || '—'}</span>
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 block text-[11px]">Aadhaar Number</span>
                      <button
                        type="button"
                        onClick={() =>
                          setShowFullAadhaar((prev) => ({
                            ...prev,
                            popup: !prev['popup'],
                          }))
                        }
                        className="text-[10px] text-sky-900 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        {showFullAadhaar['popup'] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        {showFullAadhaar['popup'] ? 'Hide' : 'Reveal'}
                      </button>
                    </div>
                    <span className="font-mono font-bold text-slate-900 text-sm">
                      {showFullAadhaar['popup']
                        ? selectedClientPopup.aadhaarNumber || '—'
                        : `XXXX-XXXX-${selectedClientPopup.aadhaarLast4 || (selectedClientPopup.aadhaarNumber ? selectedClientPopup.aadhaarNumber.slice(-4) : '0000')}`}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Occupation</span>
                    <span className="font-semibold text-slate-800">{selectedClientPopup.occupation || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Annual Income</span>
                    <span className="font-semibold text-slate-800">{selectedClientPopup.annualIncome || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Section 2: Contact & Address */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-3 text-sky-950 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-sky-900" />
                  2. Contact & Residential Address
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Mobile Number</span>
                    <a
                      href={`tel:+91${selectedClientPopup.mobile}`}
                      className="font-bold text-sky-950 hover:underline flex items-center gap-1"
                    >
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      +91 {selectedClientPopup.mobile || '—'}
                    </a>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Email Address</span>
                    <a
                      href={`mailto:${selectedClientPopup.email}`}
                      className="font-bold text-sky-950 hover:underline flex items-center gap-1"
                    >
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      {selectedClientPopup.email || '—'}
                    </a>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Full Residential Address</span>
                    <span className="font-medium text-slate-800">
                      {selectedClientPopup.address?.street
                        ? `${selectedClientPopup.address.street}, ${selectedClientPopup.address.city}, ${selectedClientPopup.address.state} - ${selectedClientPopup.address.pincode}`
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 3: Nominee Designation Details */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider text-sky-950 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-sky-900" />
                    3. Nominee Designation Details
                  </h3>
                  {selectedClientPopup.nominee?.confirmed && (
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Confirmed by Client
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Nominee Full Legal Name</span>
                    <span className="font-bold text-slate-900">{selectedClientPopup.nominee?.fullName || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Nominee Date of Birth</span>
                    <span className="font-semibold text-slate-800">{selectedClientPopup.nominee?.dateOfBirth || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Nominee Phone & Email</span>
                    <span className="font-medium text-slate-800">
                      {selectedClientPopup.nominee?.phone ? `+91 ${selectedClientPopup.nominee.phone}` : ''}
                      {selectedClientPopup.nominee?.email ? ` | ${selectedClientPopup.nominee.email}` : ''}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">
                      {selectedClientPopup.nominee?.idType || 'Nominee ID'}
                    </span>
                    <span className="font-mono font-bold text-slate-900">
                      {selectedClientPopup.nominee?.idNumber || '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 4: All Five Uploaded Documents */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider text-sky-950 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-sky-900" />
                    4. Uploaded Client KYC Documents (All 5 Required)
                  </h3>
                  <span className="text-[11px] font-semibold text-slate-500">
                    High-resolution document previews & individual downloads
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Document 1: PAN Card Copy */}
                  <DocumentPreviewCard
                    title="1. PAN Card Copy"
                    url={selectedClientPopup.documents?.panCardUrl}
                    fileName={selectedClientPopup.documents?.panCardName || 'PAN_Card_Copy.jpg'}
                    fileSize={selectedClientPopup.documents?.panCardSize}
                    onView={() =>
                      setViewingImage({
                        url: selectedClientPopup.documents?.panCardUrl || '',
                        title: 'PAN Card Copy',
                        fileName: selectedClientPopup.documents?.panCardName || 'PAN_Card.jpg',
                      })
                    }
                    onDownload={() =>
                      handleDownloadSingleImage(
                        selectedClientPopup.documents?.panCardUrl || '',
                        selectedClientPopup.documents?.panCardName || 'PAN_Card.jpg'
                      )
                    }
                  />

                  {/* Document 2: Aadhaar Proof */}
                  <DocumentPreviewCard
                    title="2. Aadhaar Proof"
                    url={selectedClientPopup.documents?.aadhaarDocUrl}
                    fileName={selectedClientPopup.documents?.aadhaarDocName || 'Aadhaar_Proof.jpg'}
                    fileSize={selectedClientPopup.documents?.aadhaarDocSize}
                    onView={() =>
                      setViewingImage({
                        url: selectedClientPopup.documents?.aadhaarDocUrl || '',
                        title: 'Aadhaar Proof Document',
                        fileName: selectedClientPopup.documents?.aadhaarDocName || 'Aadhaar_Proof.jpg',
                      })
                    }
                    onDownload={() =>
                      handleDownloadSingleImage(
                        selectedClientPopup.documents?.aadhaarDocUrl || '',
                        selectedClientPopup.documents?.aadhaarDocName || 'Aadhaar_Proof.jpg'
                      )
                    }
                  />

                  {/* Document 3: Passport-Size Photograph */}
                  <DocumentPreviewCard
                    title="3. Passport Photograph"
                    url={selectedClientPopup.documents?.photoUrl}
                    fileName={selectedClientPopup.documents?.photoName || 'Client_Photo.jpg'}
                    fileSize={selectedClientPopup.documents?.photoSize}
                    onView={() =>
                      setViewingImage({
                        url: selectedClientPopup.documents?.photoUrl || '',
                        title: 'Client Passport Photograph',
                        fileName: selectedClientPopup.documents?.photoName || 'Passport_Photo.jpg',
                      })
                    }
                    onDownload={() =>
                      handleDownloadSingleImage(
                        selectedClientPopup.documents?.photoUrl || '',
                        selectedClientPopup.documents?.photoName || 'Passport_Photo.jpg'
                      )
                    }
                  />

                  {/* Document 4: Official Client Signature */}
                  <DocumentPreviewCard
                    title="4. Official Signature (White Paper)"
                    url={selectedClientPopup.documents?.scannedPaperSignatureUrl || selectedClientPopup.documents?.signatureUrl}
                    fileName={
                      selectedClientPopup.documents?.scannedPaperSignatureName ||
                      selectedClientPopup.documents?.signatureName ||
                      'Official_Signature.png'
                    }
                    fileSize={
                      selectedClientPopup.documents?.scannedPaperSignatureSize ||
                      selectedClientPopup.documents?.signatureSize
                    }
                    onView={() =>
                      setViewingImage({
                        url:
                          selectedClientPopup.documents?.scannedPaperSignatureUrl ||
                          selectedClientPopup.documents?.signatureUrl ||
                          '',
                        title: 'Official Client Signature',
                        fileName:
                          selectedClientPopup.documents?.scannedPaperSignatureName ||
                          selectedClientPopup.documents?.signatureName ||
                          'Signature.png',
                      })
                    }
                    onDownload={() =>
                      handleDownloadSingleImage(
                        selectedClientPopup.documents?.scannedPaperSignatureUrl ||
                          selectedClientPopup.documents?.signatureUrl ||
                          '',
                        selectedClientPopup.documents?.scannedPaperSignatureName ||
                          selectedClientPopup.documents?.signatureName ||
                          'Signature.png'
                      )
                    }
                  />

                  {/* Document 5: Cheque Leaf */}
                  <DocumentPreviewCard
                    title="5. Cheque Leaf Copy"
                    url={selectedClientPopup.documents?.chequeLeafUrl}
                    fileName={selectedClientPopup.documents?.chequeLeafName || 'Cheque_Leaf.jpg'}
                    fileSize={selectedClientPopup.documents?.chequeLeafSize}
                    onView={() =>
                      setViewingImage({
                        url: selectedClientPopup.documents?.chequeLeafUrl || '',
                        title: 'Cheque Leaf Copy',
                        fileName: selectedClientPopup.documents?.chequeLeafName || 'Cheque_Leaf.jpg',
                      })
                    }
                    onDownload={() =>
                      handleDownloadSingleImage(
                        selectedClientPopup.documents?.chequeLeafUrl || '',
                        selectedClientPopup.documents?.chequeLeafName || 'Cheque_Leaf.jpg'
                      )
                    }
                  />
                </div>
              </div>

              {/* Section 5: Advisor Actions & Status Review */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-3 text-sky-950">
                  5. Advisor Verification & Approval Actions
                </h3>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      handleStatusUpdate(
                        selectedClientPopup.id || selectedClientPopup.userId,
                        'completed',
                        'KYC documents verified and approved.'
                      )
                    }
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Approve & Complete KYC</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleStatusUpdate(
                        selectedClientPopup.id || selectedClientPopup.userId,
                        'under_review',
                        'Application placed under verification review.'
                      )
                    }
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Clock className="w-4 h-4" />
                    <span>Mark Under Review</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setClientToResubmit(selectedClientPopup);
                      setResubmissionNoteInput(selectedClientPopup.resubmissionNotes || '');
                    }}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Request Document Resubmission</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setClientToDelete(selectedClientPopup)}
                    className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer ml-auto"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Record</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-100 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <span className="text-slate-500 font-medium">
                Scientific Fin Serv • Authorized AMFI Registered Mutual Fund Distributor • ARN - 357716
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadPdf(selectedClientPopup)}
                  disabled={generatingPdf}
                  className="flex items-center gap-2 px-5 py-2.5 bg-sky-950 hover:bg-sky-900 text-white font-bold text-xs rounded-xl transition shadow-xs cursor-pointer disabled:opacity-60"
                >
                  <Download className="w-4 h-4 text-sky-300" />
                  <span>{generatingPdf ? 'Generating PDF...' : 'Download All Information as PDF'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedClientPopup(null)}
                  className="px-4 py-2.5 border border-slate-300 rounded-xl bg-white hover:bg-slate-50 font-bold text-slate-700 text-xs transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* IMAGE VIEWER LIGHTBOX MODAL                                              */}
      {/* ========================================================================= */}
      {viewingImage && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 rounded-3xl max-w-4xl w-full p-4 sm:p-6 text-white border border-slate-800 shadow-2xl flex flex-col max-h-[95vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div>
                <h3 className="text-base font-bold text-white">{viewingImage.title}</h3>
                <p className="text-xs text-slate-400 font-mono">{viewingImage.fileName}</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadSingleImage(viewingImage.url, viewingImage.fileName)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewingImage(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto flex items-center justify-center p-2 bg-slate-950/60 rounded-2xl min-h-[300px]">
              {viewingImage.url.startsWith('data:application/pdf') || viewingImage.fileName.endsWith('.pdf') ? (
                <div className="text-center p-8">
                  <FileIcon className="w-16 h-16 text-rose-500 mx-auto mb-3" />
                  <p className="font-bold text-sm mb-3">PDF Document Attached</p>
                  <a
                    href={viewingImage.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-xl text-xs font-bold"
                  >
                    <ExternalLink className="w-4 h-4" /> Open PDF in New Tab
                  </a>
                </div>
              ) : (
                <img
                  src={viewingImage.url}
                  alt={viewingImage.title}
                  className="max-h-[70vh] w-auto max-w-full object-contain rounded-xl shadow-lg"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action A: Delete Client Confirmation Modal */}
      {clientToDelete && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900 mb-2">Delete Client KYC Record?</h3>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Are you sure you want to delete the KYC application for{' '}
              <strong>{clientToDelete.fullName || 'Client'}</strong> ({clientToDelete.email})? This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setClientToDelete(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-60"
              >
                {deleting ? 'Deleting...' : 'Delete Application'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action B: Request Resubmission Modal */}
      {clientToResubmit && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mb-4">
              <RotateCcw className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900 mb-2">Request Client Resubmission</h3>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              This will notify <strong>{clientToResubmit.fullName || 'Client'}</strong> ({clientToResubmit.email}) and reopen their KYC submission form.
            </p>

            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Instructions / Correction Notes for Client
              </label>
              <textarea
                rows={3}
                value={resubmissionNoteInput}
                onChange={(e) => setResubmissionNoteInput(e.target.value)}
                placeholder="e.g. Please re-upload a clear copy of your PAN card and cheque leaf."
                className="w-full p-3 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-sky-900"
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setClientToResubmit(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmResubmission}
                disabled={requestingResubmit}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-60"
              >
                {requestingResubmit ? 'Sending Request...' : 'Send Resubmission Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Clean Document Preview Card Helper for Popup Modal
 */
const DocumentPreviewCard: React.FC<{
  title: string;
  url?: string;
  fileName: string;
  fileSize?: number;
  onView: () => void;
  onDownload: () => void;
}> = ({ title, url, fileName, fileSize, onView, onDownload }) => {
  return (
    <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between hover:border-slate-300 transition">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-xs text-slate-900 truncate max-w-[170px]">{title}</span>
          {url ? (
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Check className="w-3 h-3" /> Uploaded
            </span>
          ) : (
            <span className="text-[10px] font-bold text-slate-400 bg-slate-200 px-2 py-0.5 rounded-full">
              Missing
            </span>
          )}
        </div>

        {/* Thumbnail Preview Area */}
        <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-white h-32 flex items-center justify-center mb-2.5">
          {url ? (
            url.startsWith('data:application/pdf') || fileName.endsWith('.pdf') ? (
              <div className="flex flex-col items-center justify-center p-2 text-slate-600">
                <FileIcon className="w-8 h-8 text-rose-500 mb-1" />
                <span className="text-[10px] font-bold truncate max-w-[130px]">{fileName}</span>
              </div>
            ) : (
              <img
                src={url}
                alt={title}
                className="h-full w-full object-contain cursor-pointer hover:scale-105 transition"
                onClick={onView}
              />
            )
          ) : (
            <span className="text-xs text-slate-400 font-medium">No document</span>
          )}
        </div>

        <p className="text-[11px] font-mono text-slate-500 truncate" title={fileName}>
          {fileName}
        </p>
      </div>

      {url && (
        <div className="flex items-center gap-2 pt-2.5 mt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={onView}
            className="flex-1 py-1.5 px-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-800 font-bold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer"
          >
            <ZoomIn className="w-3 h-3 text-sky-900" />
            <span>View</span>
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="flex-1 py-1.5 px-2 bg-sky-950 hover:bg-sky-900 text-white rounded-lg font-bold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer"
          >
            <Download className="w-3 h-3 text-sky-300" />
            <span>Download</span>
          </button>
        </div>
      )}
    </div>
  );
};
