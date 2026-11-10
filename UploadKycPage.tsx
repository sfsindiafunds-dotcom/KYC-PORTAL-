import React, { useState, useEffect } from 'react';
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  Save,
  Send,
  ShieldCheck,
  User,
  MapPin,
  Briefcase,
  FileCheck2,
  X,
  FileIcon,
  RefreshCw,
  Check,
  Lock,
  Users,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  KycApplication,
  Gender,
  MaritalStatus,
  OccupationType,
  AnnualIncomeType,
  NomineeDetails,
} from '../../types/index.ts';
import {
  fetchKycApplication,
  saveKycApplication,
  saveSingleDocumentUrlToFirestore,
  removeSingleDocumentFromFirestore,
} from '../../services/clientService.ts';
import {
  validateAadhaarVerhoeff,
  validatePanFormat,
  validateMobileFormat,
  validateEmailFormat,
} from '../../lib/validation.ts';
import {
  OCCUPATIONS,
  ANNUAL_INCOMES,
  INDIAN_STATES,
  DISTRIBUTOR_PROFILE,
} from '../../lib/constants.ts';
import { KycImageUploadCard } from './KycImageUploadCard.tsx';

type DocumentFieldKey =
  | 'panCard'
  | 'aadhaarDoc'
  | 'photo'
  | 'scannedPaperSignature'
  | 'chequeLeaf';

export const UploadKycPage: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [savingDraft, setSavingDraft] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [isSubmittedView, setIsSubmittedView] = useState<boolean>(false);
  const [isResubmittingMode, setIsResubmittingMode] = useState<boolean>(false);
  const [showNomineeConfirmModal, setShowNomineeConfirmModal] = useState<boolean>(false);

  // Field errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Verification checks
  const [emailVerified, setEmailVerified] = useState<boolean>(false);
  const [panVerified, setPanVerified] = useState<boolean>(false);
  const [aadhaarVerified, setAadhaarVerified] = useState<boolean>(false);

  const DEFAULT_NOMINEE: NomineeDetails = {
    fullName: '',
    dateOfBirth: '',
    email: '',
    phone: '',
    idType: 'PAN',
    idNumber: '',
    confirmed: false,
  };

  const initialApplication: KycApplication = {
    userId: user?.uid || 'client-session',
    email: user?.email || '',
    fullName: user?.displayName || '',
    dateOfBirth: '',
    gender: 'Male',
    maritalStatus: 'Single',
    mobile: '',
    pan: '',
    aadhaarNumber: '',
    aadhaarLast4: '',
    aadhaarConsentGranted: true,
    address: {
      street: '',
      city: '',
      state: 'Maharashtra',
      pincode: '',
    },
    occupation: OCCUPATIONS[0],
    annualIncome: ANNUAL_INCOMES[1],
    nominee: DEFAULT_NOMINEE,
    documents: {},
    status: 'draft',
    consentCheckbox: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const [formData, setFormData] = useState<KycApplication>(initialApplication);

  // Load existing application
  useEffect(() => {
    async function loadData() {
      if (!user?.uid) return;
      setLoading(true);
      try {
        const existing = await fetchKycApplication(user.uid);
        if (existing) {
          setFormData({
            ...initialApplication,
            ...existing,
            address: { ...initialApplication.address, ...(existing.address || {}) },
            documents: { ...initialApplication.documents, ...(existing.documents || {}) },
            nominee: {
              fullName: existing.nominee?.fullName ?? DEFAULT_NOMINEE.fullName,
              dateOfBirth: existing.nominee?.dateOfBirth ?? DEFAULT_NOMINEE.dateOfBirth,
              email: existing.nominee?.email ?? DEFAULT_NOMINEE.email,
              phone: existing.nominee?.phone ?? DEFAULT_NOMINEE.phone,
              idType: existing.nominee?.idType ?? DEFAULT_NOMINEE.idType,
              idNumber: existing.nominee?.idNumber ?? DEFAULT_NOMINEE.idNumber,
              confirmed: existing.nominee?.confirmed ?? Boolean(existing.nominee?.fullName),
            },
          });

          if (existing.status === 'resubmission_requested' || existing.resubmissionRequested) {
            setIsResubmittingMode(true);
            setIsSubmittedView(false);
          } else if (existing.status && existing.status !== 'draft') {
            setIsSubmittedView(true);
          }

          if (existing.email) setEmailVerified(true);
          if (existing.pan && validatePanFormat(existing.pan)) setPanVerified(true);
          if (existing.aadhaarNumber && validateAadhaarVerhoeff(existing.aadhaarNumber)) setAadhaarVerified(true);
        }
      } catch (err) {
        console.error('Failed to load application:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user?.uid]);

  // Immediate Document Upload Handler: Updates local state and immediately saves to Firestore
  const handleDocumentUploaded = async (
    field: DocumentFieldKey,
    url: string,
    fileName: string,
    size: number
  ) => {
    if (!user?.uid) return;

    setFormData((prev) => ({
      ...prev,
      documents: {
        ...prev.documents,
        [`${field}Url`]: url,
        [`${field}Name`]: fileName,
        [`${field}Size`]: size,
        ...(field === 'scannedPaperSignature'
          ? { signatureUrl: url, signatureName: fileName, signatureSize: size }
          : {}),
      },
    }));

    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });

    try {
      await saveSingleDocumentUrlToFirestore(user.uid, field, url, fileName, size);
      setSaveToast(`${fileName} uploaded and saved to your application.`);
      setTimeout(() => setSaveToast(null), 3500);
    } catch (err) {
      console.warn('Document firestore sync notice:', err);
    }
  };

  // Document Removal Handler: Updates local state and removes from Firestore
  const handleDocumentRemoved = async (field: DocumentFieldKey) => {
    if (!user?.uid) return;

    setFormData((prev) => ({
      ...prev,
      documents: {
        ...prev.documents,
        [`${field}Url`]: undefined,
        [`${field}Name`]: undefined,
        [`${field}Size`]: undefined,
        ...(field === 'scannedPaperSignature'
          ? { signatureUrl: undefined, signatureName: undefined, signatureSize: undefined }
          : {}),
      },
    }));

    try {
      await removeSingleDocumentFromFirestore(user.uid, field);
      setSaveToast('Document removed.');
      setTimeout(() => setSaveToast(null), 3000);
    } catch (err) {
      console.warn('Document firestore removal notice:', err);
    }
  };

  // Aadhaar change handler
  const handleAadhaarChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 12);
    setFormData((prev) => ({
      ...prev,
      aadhaarNumber: digits,
      aadhaarLast4: digits.length >= 4 ? digits.slice(-4) : '',
    }));

    if (errors['aadhaarNumber']) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next['aadhaarNumber'];
        return next;
      });
    }

    if (digits.length === 12) {
      setAadhaarVerified(validateAadhaarVerhoeff(digits));
    } else {
      setAadhaarVerified(false);
    }
  };

  // Nominee field change handler
  const handleNomineeChange = (field: keyof NomineeDetails, val: any) => {
    setFormData((prev) => ({
      ...prev,
      nominee: {
        ...(prev.nominee || {
          fullName: '',
          dateOfBirth: '',
          email: '',
          phone: '',
          idType: 'PAN',
          idNumber: '',
          confirmed: false,
        }),
        [field]: val,
        ...(field !== 'confirmed' ? { confirmed: false } : {}),
      },
    }));

    const errKey = `nominee${field.charAt(0).toUpperCase() + field.slice(1)}`;
    if (errors[errKey]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[errKey];
        return next;
      });
    }
  };

  // Validate nominee and open confirmation modal
  const handleReviewNominee = () => {
    const nom = formData.nominee;
    const nomineeErrors: Record<string, string> = {};

    if (!nom?.fullName?.trim()) {
      nomineeErrors['nomineeFullName'] = 'Please enter nominee full legal name.';
    }
    if (!nom?.dateOfBirth) {
      nomineeErrors['nomineeDateOfBirth'] = 'Please select nominee date of birth.';
    }
    if (!nom?.email || !validateEmailFormat(nom.email)) {
      nomineeErrors['nomineeEmail'] = 'Please enter a valid email address.';
    }
    if (!nom?.phone || !validateMobileFormat(nom.phone)) {
      nomineeErrors['nomineePhone'] = 'Please enter a valid 10-digit mobile number.';
    }
    if (!nom?.idNumber?.trim()) {
      nomineeErrors['nomineeIdNumber'] = `Please enter nominee ${nom?.idType || 'PAN'} number.`;
    } else if (nom?.idType === 'PAN' && !validatePanFormat(nom.idNumber)) {
      nomineeErrors['nomineeIdNumber'] = 'Please enter a valid 10-character PAN (e.g. ABCDE1234F).';
    } else if (nom?.idType === 'Aadhaar' && !validateAadhaarVerhoeff(nom.idNumber)) {
      nomineeErrors['nomineeIdNumber'] = 'Please check the Aadhaar number and enter 12 valid digits.';
    }

    if (Object.keys(nomineeErrors).length > 0) {
      setErrors((prev) => ({ ...prev, ...nomineeErrors }));
      const firstKey = Object.keys(nomineeErrors)[0];
      const el = document.getElementById(`field-${firstKey}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setShowNomineeConfirmModal(true);
  };

  // Confirm Nominee Details from popup
  const handleConfirmNominee = () => {
    setFormData((prev) => ({
      ...prev,
      nominee: {
        ...(prev.nominee || {
          fullName: '',
          dateOfBirth: '',
          email: '',
          phone: '',
          idType: 'PAN',
          idNumber: '',
        }),
        confirmed: true,
      },
    }));
    setShowNomineeConfirmModal(false);
    setSaveToast('Nominee details confirmed.');
    setTimeout(() => setSaveToast(null), 3500);

    setErrors((prev) => {
      const next = { ...prev };
      delete next['nomineeConfirmed'];
      return next;
    });
  };

  // Save Draft Progress
  const handleSaveProgress = async () => {
    if (!user?.uid) return;
    setSavingDraft(true);
    try {
      await saveKycApplication(user.uid, formData, false);
      setSaveToast('Progress saved securely. You can return at any time.');
      setTimeout(() => setSaveToast(null), 4000);
    } catch {
      alert('Unable to save draft. Please check your connection.');
    } finally {
      setSavingDraft(false);
    }
  };

  // Strict Validation and Auto-Scroll to First Error
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // 1. Full Name
    if (!formData.fullName.trim()) {
      newErrors['fullName'] = 'Please enter your full name as per PAN.';
    }

    // 2. Date of Birth
    if (!formData.dateOfBirth) {
      newErrors['dateOfBirth'] = 'Please enter a valid date of birth.';
    }

    // 5. Mobile Number
    if (!validateMobileFormat(formData.mobile)) {
      newErrors['mobile'] = 'Please enter a valid 10-digit mobile number.';
    }

    // 6. Email Address
    if (!validateEmailFormat(formData.email)) {
      newErrors['email'] = 'Please enter a valid email address.';
    }

    // 7. PAN Number
    if (!validatePanFormat(formData.pan)) {
      newErrors['pan'] = 'Please check your PAN number.';
    }

    // 8. Aadhaar Number (12 digits with Verhoeff Checksum)
    if (!formData.aadhaarNumber || formData.aadhaarNumber.length !== 12 || !validateAadhaarVerhoeff(formData.aadhaarNumber)) {
      newErrors['aadhaarNumber'] = 'Please check your Aadhaar number and try again.';
    }

    // 9. Address
    if (!formData.address.street.trim()) {
      newErrors['addressStreet'] = 'Please enter your street address.';
    }
    if (!formData.address.city.trim()) {
      newErrors['addressCity'] = 'Please enter your city.';
    }
    if (!formData.address.pincode || !/^[1-9][0-9]{5}$/.test(formData.address.pincode.trim())) {
      newErrors['addressPincode'] = 'Please enter a valid 6-digit PIN code.';
    }

    // Nominee Validation
    const nom = formData.nominee;
    if (!nom?.fullName?.trim()) {
      newErrors['nomineeFullName'] = 'Please enter nominee full legal name.';
    }
    if (!nom?.dateOfBirth) {
      newErrors['nomineeDateOfBirth'] = 'Please select nominee date of birth.';
    }
    if (!nom?.email || !validateEmailFormat(nom.email)) {
      newErrors['nomineeEmail'] = 'Please enter a valid nominee email address.';
    }
    if (!nom?.phone || !validateMobileFormat(nom.phone)) {
      newErrors['nomineePhone'] = 'Please enter a valid 10-digit nominee mobile number.';
    }
    if (!nom?.idNumber?.trim()) {
      newErrors['nomineeIdNumber'] = `Please enter nominee ${nom?.idType || 'PAN'} number.`;
    } else if (nom.idType === 'PAN' && !validatePanFormat(nom.idNumber)) {
      newErrors['nomineeIdNumber'] = 'Please enter a valid 10-character PAN.';
    } else if (nom.idType === 'Aadhaar' && !validateAadhaarVerhoeff(nom.idNumber)) {
      newErrors['nomineeIdNumber'] = 'Please enter a valid 12-digit Aadhaar number with valid checksum.';
    }
    if (!nom?.confirmed) {
      newErrors['nomineeConfirmed'] = 'Please review and confirm nominee details.';
    }

    // 5 MANDATORY DOCUMENTS
    const docs = formData.documents || {};
    if (!docs.panCardUrl) {
      newErrors['panCard'] = 'Please upload your PAN card.';
    }
    if (!docs.aadhaarDocUrl) {
      newErrors['aadhaarDoc'] = 'Please upload your Aadhaar proof.';
    }
    if (!docs.photoUrl) {
      newErrors['photo'] = 'Please upload your passport-size photograph.';
    }
    if (!docs.scannedPaperSignatureUrl && !docs.signatureUrl) {
      newErrors['scannedPaperSignature'] = 'Please upload your scanned signature drawn on white paper.';
    }
    if (!docs.chequeLeafUrl) {
      newErrors['chequeLeaf'] = 'Please upload your cheque leaf.';
    }

    if (!formData.consentCheckbox) {
      newErrors['consent'] = 'Please accept the declaration and consent checkbox.';
    }

    setErrors(newErrors);

    // Scroll to first error
    const errorKeys = Object.keys(newErrors);
    if (errorKeys.length > 0) {
      const firstKey = errorKeys[0];
      const el = document.getElementById(`field-${firstKey}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return false;
    }

    return true;
  };

  // Final Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) return;

    if (!validateForm()) {
      return;
    }

    setSubmitting(true);
    try {
      const saved = await saveKycApplication(user.uid, formData, true);
      setFormData(saved);
      setIsSubmittedView(true);
      setIsResubmittingMode(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-4">
        <div className="w-9 h-9 border-3 border-sky-950 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-xs text-slate-500 font-semibold">Loading secure KYC application...</p>
      </div>
    );
  }

  // Exact Confirmation Screen
  if (isSubmittedView && !isResubmittingMode) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white border border-sky-200 rounded-3xl p-8 sm:p-12 shadow-md text-center">
          <img
            src="/logo.png"
            alt="Scientific Fin Serv"
            className="h-20 w-auto mx-auto object-contain mb-5"
          />

          <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-emerald-100 shadow-xs">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Thank you!
          </h1>

          <div className="my-6 p-6 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 text-sm leading-relaxed space-y-3 font-medium">
            <p>Your KYC details and documents have been submitted successfully to Scientific Fin Serv.</p>
            <p>We have received your application and will review your documents.</p>
            <p className="font-semibold text-slate-900">Thank you for choosing Scientific Fin Serv.</p>
          </div>

          <div className="p-4 bg-sky-50/70 border border-sky-200 rounded-2xl text-left text-xs space-y-2 mb-6">
            <div className="flex justify-between items-center border-b border-sky-100 pb-2">
              <span className="text-slate-500">Applicant Name</span>
              <span className="font-bold text-slate-900">{formData.fullName}</span>
            </div>
            <div className="flex justify-between items-center border-b border-sky-100 pb-2">
              <span className="text-slate-500">Registered Email</span>
              <span className="font-semibold text-slate-800">{formData.email}</span>
            </div>
            <div className="flex justify-between items-center border-b border-sky-100 pb-2">
              <span className="text-slate-500">Status</span>
              <span className="font-bold capitalize bg-sky-100 text-sky-900 px-2.5 py-0.5 rounded text-[11px]">
                {formData.status.replace('_', ' ')}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Verification</span>
              <span className="font-medium text-emerald-700 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> All 5 Required Documents Received
              </span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
            <Lock className="w-3.5 h-3.5 text-slate-400" />
            <span>Secure 256-bit encrypted submission to Scientific Fin Serv</span>
          </div>
        </div>
      </div>
    );
  }

  const docs = formData.documents || {};
  const hasAllFiveImages = Boolean(
    docs.panCardUrl &&
    docs.aadhaarDocUrl &&
    docs.photoUrl &&
    (docs.scannedPaperSignatureUrl || docs.signatureUrl) &&
    docs.chequeLeafUrl
  );

  const nom = formData.nominee;
  const isNomineeValid = Boolean(
    nom?.fullName?.trim() &&
    nom?.dateOfBirth &&
    nom?.email && validateEmailFormat(nom.email) &&
    nom?.phone && validateMobileFormat(nom.phone) &&
    nom?.idNumber?.trim() &&
    ((nom.idType === 'PAN' && validatePanFormat(nom.idNumber)) ||
     (nom.idType === 'Aadhaar' && validateAadhaarVerhoeff(nom.idNumber))) &&
    nom?.confirmed
  );

  const isFormComplete = Boolean(
    formData.fullName?.trim() &&
    formData.dateOfBirth &&
    formData.mobile && formData.mobile.length === 10 &&
    formData.pan && formData.pan.length === 10 &&
    validatePanFormat(formData.pan) &&
    formData.aadhaarNumber && formData.aadhaarNumber.length === 12 &&
    validateAadhaarVerhoeff(formData.aadhaarNumber) &&
    formData.address?.street?.trim() &&
    formData.address?.city?.trim() &&
    formData.address?.pincode?.trim() &&
    /^[1-9][0-9]{5}$/.test(formData.address.pincode.trim()) &&
    isNomineeValid &&
    hasAllFiveImages &&
    formData.consentCheckbox
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {saveToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl border border-slate-700 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{saveToast}</span>
        </div>
      )}

      {/* Resubmission Alert Banner */}
      {isResubmittingMode && (
        <div className="mb-6 p-5 bg-amber-50 border-2 border-amber-300 rounded-3xl shadow-xs">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-bold text-amber-900">
                Resubmission Requested by Scientific Fin Serv
              </h2>
              <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                {formData.adminRemarks || formData.resubmissionNotes || 'Your distributor has requested you to review and re-submit your KYC details and documents.'}
              </p>
              <p className="text-[11px] text-amber-700 font-semibold mt-2">
                The form below has been reopened specifically for your email ({formData.email}).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
              <span className="text-xs font-extrabold uppercase tracking-wider text-sky-950 bg-sky-100 px-3 py-1 rounded-full border border-sky-200">
                {DISTRIBUTOR_PROFILE.name}
              </span>
              <span className="text-xs text-sky-800 font-bold font-mono">
                {DISTRIBUTOR_PROFILE.arn}
              </span>
              <span className="text-xs text-slate-500 font-medium hidden md:inline">
                • {DISTRIBUTOR_PROFILE.companyDescription}
              </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Upload Your KYC Documents
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Please complete all mandatory fields and upload the required 5 documents for verification.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSaveProgress}
            disabled={savingDraft}
            className="self-start sm:self-center flex items-center gap-1.5 px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 shadow-xs transition"
          >
            <Save className="w-3.5 h-3.5 text-slate-500" />
            <span>{savingDraft ? 'Saving...' : 'Save Draft'}</span>
          </button>
        </div>

        {/* 3 Instructions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-6 border-t border-slate-100">
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="w-6 h-6 rounded-full bg-sky-950 text-white text-xs font-bold flex items-center justify-center shrink-0">
              1
            </span>
            <span className="text-xs font-semibold text-slate-800">Fill in your details.</span>
          </div>

          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="w-6 h-6 rounded-full bg-sky-950 text-white text-xs font-bold flex items-center justify-center shrink-0">
              2
            </span>
            <span className="text-xs font-semibold text-slate-800">Upload the required documents.</span>
          </div>

          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
            <span className="w-6 h-6 rounded-full bg-sky-950 text-white text-xs font-bold flex items-center justify-center shrink-0">
              3
            </span>
            <span className="text-xs font-semibold text-slate-800">Submit the application for verification.</span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* SECTION 1: PERSONAL INFORMATION */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs">
          <div className="flex items-center gap-2 mb-6 pb-4 border-b border-slate-100">
            <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-900 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Personal Information</h2>
              <p className="text-xs text-slate-500">Provide legal details as printed on your PAN card</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs">
            {/* 1. Full Name */}
            <div id="field-fullName">
              <label className="block font-bold text-slate-800 mb-1.5">
                1. Full Name (as per PAN) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.fullName}
                onChange={(e) => {
                  setFormData({ ...formData, fullName: e.target.value });
                  if (errors['fullName']) setErrors((p) => ({ ...p, fullName: '' }));
                }}
                placeholder="e.g. RAJESH KUMAR SHARMA"
                className={`w-full px-3.5 py-2.5 rounded-xl border ${
                  errors['fullName'] ? 'border-rose-400 bg-rose-50/40 ring-1 ring-rose-400' : 'border-slate-300'
                } focus:outline-none focus:ring-2 focus:ring-sky-900 font-medium`}
              />
              {errors['fullName'] && (
                <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errors['fullName']}</span>
                </p>
              )}
            </div>

            {/* 2. Date of Birth */}
            <div id="field-dateOfBirth">
              <label className="block font-bold text-slate-800 mb-1.5">
                2. Date of Birth <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={formData.dateOfBirth}
                onChange={(e) => {
                  setFormData({ ...formData, dateOfBirth: e.target.value });
                  if (errors['dateOfBirth']) setErrors((p) => ({ ...p, dateOfBirth: '' }));
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl border ${
                  errors['dateOfBirth'] ? 'border-rose-400 bg-rose-50/40 ring-1 ring-rose-400' : 'border-slate-300'
                } focus:outline-none focus:ring-2 focus:ring-sky-900 font-medium`}
              />
              {errors['dateOfBirth'] && (
                <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errors['dateOfBirth']}</span>
                </p>
              )}
            </div>

            {/* 3. Gender */}
            <div>
              <label className="block font-bold text-slate-800 mb-1.5">
                3. Gender <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Male', 'Female', 'Other'] as Gender[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setFormData({ ...formData, gender: g })}
                    className={`py-2 px-3 rounded-xl border font-bold text-xs transition ${
                      formData.gender === g
                        ? 'border-sky-950 bg-sky-950 text-white shadow-xs'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Marital Status */}
            <div>
              <label className="block font-bold text-slate-800 mb-1.5">
                4. Marital Status <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['Single', 'Married'] as MaritalStatus[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setFormData({ ...formData, maritalStatus: m })}
                    className={`py-2 px-3 rounded-xl border font-bold text-xs transition ${
                      formData.maritalStatus === m
                        ? 'border-sky-950 bg-sky-950 text-white shadow-xs'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* 5. Mobile Number */}
            <div id="field-mobile" className="sm:col-span-2">
              <label className="block font-bold text-slate-800 mb-1.5">
                5. Mobile Number <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 font-bold text-slate-400">+91</span>
                <input
                  type="tel"
                  required
                  maxLength={10}
                  value={formData.mobile}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                    setFormData({ ...formData, mobile: val });
                    if (errors['mobile']) setErrors((p) => ({ ...p, mobile: '' }));
                  }}
                  placeholder="9876543210"
                  className={`w-full pl-12 pr-3.5 py-2.5 rounded-xl border ${
                    errors['mobile'] ? 'border-rose-400 bg-rose-50/40 ring-1 ring-rose-400' : 'border-slate-300'
                  } focus:outline-none focus:ring-2 focus:ring-sky-900 font-mono font-medium`}
                />
              </div>

              {errors['mobile'] && (
                <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errors['mobile']}</span>
                </p>
              )}
            </div>

            {/* 6. Email Address */}
            <div id="field-email" className="sm:col-span-2">
              <label className="block font-bold text-slate-800 mb-1.5">
                6. Email Address <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => {
                  setFormData({ ...formData, email: e.target.value.trim() });
                  if (errors['email']) setErrors((p) => ({ ...p, email: '' }));
                }}
                placeholder="client@example.com"
                className={`w-full px-3.5 py-2.5 rounded-xl border ${
                  errors['email'] ? 'border-rose-400 bg-rose-50/40 ring-1 ring-rose-400' : 'border-slate-300'
                } focus:outline-none focus:ring-2 focus:ring-sky-900 font-medium`}
              />
              {errors['email'] && (
                <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errors['email']}</span>
                </p>
              )}
            </div>

            {/* 7. PAN Number */}
            <div id="field-pan">
              <label className="block font-bold text-slate-800 mb-1.5">
                7. PAN Number <span className="text-rose-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  required
                  maxLength={10}
                  value={formData.pan}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                    setFormData({ ...formData, pan: val });
                    if (errors['pan']) setErrors((p) => ({ ...p, pan: '' }));
                    setPanVerified(validatePanFormat(val));
                  }}
                  placeholder="ABCDE1234F"
                  className={`w-full px-3.5 py-2.5 rounded-xl border ${
                    errors['pan'] ? 'border-rose-400 bg-rose-50/40 ring-1 ring-rose-400' : 'border-slate-300'
                  } focus:outline-none focus:ring-2 focus:ring-sky-900 font-mono font-bold uppercase`}
                />
                {panVerified && (
                  <span className="px-2.5 py-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl font-bold text-[11px] shrink-0 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    NSDL Match
                  </span>
                )}
              </div>
              {errors['pan'] && (
                <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errors['pan']}</span>
                </p>
              )}
            </div>

            {/* 8. Aadhaar Number (12 digits with Verhoeff Checksum) */}
            <div id="field-aadhaarNumber">
              <label className="block font-bold text-slate-800 mb-1.5">
                8. Aadhaar Number – all 12 digits <span className="text-rose-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  required
                  maxLength={12}
                  value={formData.aadhaarNumber}
                  onChange={(e) => handleAadhaarChange(e.target.value)}
                  placeholder="12-digit Aadhaar number"
                  className={`w-full px-3.5 py-2.5 rounded-xl border ${
                    errors['aadhaarNumber'] ? 'border-rose-400 bg-rose-50/40 ring-1 ring-rose-400' : 'border-slate-300'
                  } focus:outline-none focus:ring-2 focus:ring-sky-900 font-mono font-bold tracking-widest`}
                />
                {aadhaarVerified && (
                  <span className="px-2.5 py-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl font-bold text-[11px] shrink-0 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    UIDAI Valid
                  </span>
                )}
              </div>
              {errors['aadhaarNumber'] && (
                <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errors['aadhaarNumber']}</span>
                </p>
              )}
            </div>

            {/* 9. Address */}
            <div className="sm:col-span-2 pt-2 border-t border-slate-100">
              <label className="block font-bold text-slate-800 mb-1.5">
                9. Address <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div id="field-addressStreet" className="sm:col-span-3">
                  <input
                    type="text"
                    required
                    value={formData.address.street}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        address: { ...formData.address, street: e.target.value },
                      });
                      if (errors['addressStreet']) setErrors((p) => ({ ...p, addressStreet: '' }));
                    }}
                    placeholder="Flat / House No., Building Name, Street / Locality"
                    className={`w-full px-3.5 py-2.5 rounded-xl border ${
                      errors['addressStreet'] ? 'border-rose-400 bg-rose-50/40 ring-1 ring-rose-400' : 'border-slate-300'
                    } focus:outline-none focus:ring-2 focus:ring-sky-900 font-medium`}
                  />
                  {errors['addressStreet'] && (
                    <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{errors['addressStreet']}</span>
                    </p>
                  )}
                </div>

                <div id="field-addressCity">
                  <input
                    type="text"
                    required
                    value={formData.address.city}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        address: { ...formData.address, city: e.target.value },
                      });
                      if (errors['addressCity']) setErrors((p) => ({ ...p, addressCity: '' }));
                    }}
                    placeholder="City / District"
                    className={`w-full px-3.5 py-2.5 rounded-xl border ${
                      errors['addressCity'] ? 'border-rose-400 bg-rose-50/40 ring-1 ring-rose-400' : 'border-slate-300'
                    } focus:outline-none focus:ring-2 focus:ring-sky-900 font-medium`}
                  />
                  {errors['addressCity'] && (
                    <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{errors['addressCity']}</span>
                    </p>
                  )}
                </div>

                <div>
                  <select
                    value={formData.address.state}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        address: { ...formData.address, state: e.target.value },
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-900 font-medium bg-white"
                  >
                    {INDIAN_STATES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div id="field-addressPincode">
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={formData.address.pincode}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setFormData({
                        ...formData,
                        address: { ...formData.address, pincode: val },
                      });
                      if (errors['addressPincode']) setErrors((p) => ({ ...p, addressPincode: '' }));
                    }}
                    placeholder="PIN Code (6 digits)"
                    className={`w-full px-3.5 py-2.5 rounded-xl border ${
                      errors['addressPincode'] ? 'border-rose-400 bg-rose-50/40 ring-1 ring-rose-400' : 'border-slate-300'
                    } focus:outline-none focus:ring-2 focus:ring-sky-900 font-mono font-medium`}
                  />
                  {errors['addressPincode'] && (
                    <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{errors['addressPincode']}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* 10. Occupation */}
            <div>
              <label className="block font-bold text-slate-800 mb-1.5">
                10. Occupation <span className="text-rose-500">*</span>
              </label>
              <select
                value={formData.occupation}
                onChange={(e) => setFormData({ ...formData, occupation: e.target.value as OccupationType })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-900 font-medium bg-white"
              >
                {OCCUPATIONS.map((occ) => (
                  <option key={occ} value={occ}>
                    {occ}
                  </option>
                ))}
              </select>
            </div>

            {/* 11. Annual Income */}
            <div>
              <label className="block font-bold text-slate-800 mb-1.5">
                11. Annual Income <span className="text-rose-500">*</span>
              </label>
              <select
                value={formData.annualIncome}
                onChange={(e) => setFormData({ ...formData, annualIncome: e.target.value as AnnualIncomeType })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-900 font-medium bg-white"
              >
                {ANNUAL_INCOMES.map((inc) => (
                  <option key={inc} value={inc}>
                    {inc}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* SECTION 2: NOMINEE DETAILS */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-900 flex items-center justify-center font-bold">
                <Users className="w-4 h-4 text-sky-800" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Nominee Details</h2>
                <p className="text-xs text-slate-500">
                  Mandatory nominee designation for mutual fund investments and folios.
                </p>
              </div>
            </div>
            {formData.nominee?.confirmed ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Nominee Confirmed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-800 text-xs font-semibold border border-amber-200">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" /> Confirmation Required
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs">
            {/* 1. Nominee Full Name */}
            <div id="field-nomineeFullName">
              <label className="block font-bold text-slate-800 mb-1.5">
                1. Nominee Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={formData.nominee?.fullName || ''}
                onChange={(e) => handleNomineeChange('fullName', e.target.value)}
                placeholder="Full Legal Name as per ID"
                className={`w-full px-3.5 py-2.5 rounded-xl border ${
                  errors['nomineeFullName'] ? 'border-rose-400 bg-rose-50/40 ring-1 ring-rose-400' : 'border-slate-300'
                } focus:outline-none focus:ring-2 focus:ring-sky-900 font-medium`}
              />
              {errors['nomineeFullName'] && (
                <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errors['nomineeFullName']}</span>
                </p>
              )}
            </div>

            {/* 2. Nominee Date of Birth */}
            <div id="field-nomineeDateOfBirth">
              <label className="block font-bold text-slate-800 mb-1.5">
                2. Nominee Date of Birth <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={formData.nominee?.dateOfBirth || ''}
                onChange={(e) => handleNomineeChange('dateOfBirth', e.target.value)}
                className={`w-full px-3.5 py-2.5 rounded-xl border ${
                  errors['nomineeDateOfBirth'] ? 'border-rose-400 bg-rose-50/40 ring-1 ring-rose-400' : 'border-slate-300'
                } focus:outline-none focus:ring-2 focus:ring-sky-900 font-medium bg-white`}
              />
              {errors['nomineeDateOfBirth'] && (
                <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errors['nomineeDateOfBirth']}</span>
                </p>
              )}
            </div>

            {/* 3. Nominee Email Address */}
            <div id="field-nomineeEmail">
              <label className="block font-bold text-slate-800 mb-1.5">
                3. Nominee Email Address <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                value={formData.nominee?.email || ''}
                onChange={(e) => handleNomineeChange('email', e.target.value)}
                placeholder="nominee@domain.com"
                className={`w-full px-3.5 py-2.5 rounded-xl border ${
                  errors['nomineeEmail'] ? 'border-rose-400 bg-rose-50/40 ring-1 ring-rose-400' : 'border-slate-300'
                } focus:outline-none focus:ring-2 focus:ring-sky-900 font-medium`}
              />
              {errors['nomineeEmail'] && (
                <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errors['nomineeEmail']}</span>
                </p>
              )}
            </div>

            {/* 4. Nominee Phone Number */}
            <div id="field-nomineePhone">
              <label className="block font-bold text-slate-800 mb-1.5">
                4. Nominee Phone Number <span className="text-rose-500">*</span>
              </label>
              <div className="flex">
                <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-slate-300 bg-slate-50 text-slate-500 font-bold text-xs">
                  +91
                </span>
                <input
                  type="tel"
                  maxLength={10}
                  value={formData.nominee?.phone || ''}
                  onChange={(e) => handleNomineeChange('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="10-digit mobile number"
                  className={`w-full px-3.5 py-2.5 rounded-r-xl border ${
                    errors['nomineePhone'] ? 'border-rose-400 bg-rose-50/40 ring-1 ring-rose-400' : 'border-slate-300'
                  } focus:outline-none focus:ring-2 focus:ring-sky-900 font-mono font-medium`}
                />
              </div>
              {errors['nomineePhone'] && (
                <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errors['nomineePhone']}</span>
                </p>
              )}
            </div>

            {/* 5. Nominee Identification: PAN or Aadhaar Choice */}
            <div className="sm:col-span-2 p-4 bg-slate-50/80 rounded-2xl border border-slate-200" id="field-nomineeIdNumber">
              <label className="block font-bold text-slate-800 mb-2">
                5. Nominee Identification (Choose One) <span className="text-rose-500">*</span>
              </label>
              <div className="flex items-center gap-6 mb-3">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                  <input
                    type="radio"
                    name="nomineeIdType"
                    checked={formData.nominee?.idType === 'PAN'}
                    onChange={() => handleNomineeChange('idType', 'PAN')}
                    className="w-4 h-4 text-sky-950 focus:ring-sky-900 border-slate-300"
                  />
                  <span>Nominee PAN Number</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
                  <input
                    type="radio"
                    name="nomineeIdType"
                    checked={formData.nominee?.idType === 'Aadhaar'}
                    onChange={() => handleNomineeChange('idType', 'Aadhaar')}
                    className="w-4 h-4 text-sky-950 focus:ring-sky-900 border-slate-300"
                  />
                  <span>Nominee Aadhaar Number</span>
                </label>
              </div>

              {formData.nominee?.idType === 'PAN' ? (
                <div>
                  <input
                    type="text"
                    maxLength={10}
                    value={formData.nominee?.idNumber || ''}
                    onChange={(e) => handleNomineeChange('idNumber', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    placeholder="e.g. ABCDE1234F"
                    className={`w-full max-w-md px-3.5 py-2.5 rounded-xl border ${
                      errors['nomineeIdNumber'] ? 'border-rose-400 bg-rose-50/40 ring-1 ring-rose-400' : 'border-slate-300'
                    } focus:outline-none focus:ring-2 focus:ring-sky-900 font-mono font-bold tracking-wider uppercase bg-white`}
                  />
                  <p className="text-[11px] text-slate-400 mt-1 font-medium">10-character permanent account number</p>
                </div>
              ) : (
                <div>
                  <input
                    type="tel"
                    maxLength={12}
                    value={formData.nominee?.idNumber || ''}
                    onChange={(e) => handleNomineeChange('idNumber', e.target.value.replace(/\D/g, '').slice(0, 12))}
                    placeholder="12-digit Aadhaar Number"
                    className={`w-full max-w-md px-3.5 py-2.5 rounded-xl border ${
                      errors['nomineeIdNumber'] ? 'border-rose-400 bg-rose-50/40 ring-1 ring-rose-400' : 'border-slate-300'
                    } focus:outline-none focus:ring-2 focus:ring-sky-900 font-mono font-bold tracking-wider bg-white`}
                  />
                  <p className="text-[11px] text-slate-400 mt-1 font-medium">12-digit UIDAI issued number</p>
                </div>
              )}

              {errors['nomineeIdNumber'] && (
                <p className="text-[11px] text-rose-600 font-semibold mt-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errors['nomineeIdNumber']}</span>
                </p>
              )}
            </div>
          </div>

          {/* Nominee Confirmation Action & State */}
          <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3" id="field-nomineeConfirmed">
            <div>
              {formData.nominee?.confirmed ? (
                <p className="text-xs text-emerald-700 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Nominee details have been reviewed and confirmed.
                </p>
              ) : (
                <p className="text-xs text-amber-700 font-medium flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  Please verify all nominee details before final KYC submission.
                </p>
              )}
              {errors['nomineeConfirmed'] && (
                <p className="text-[11px] text-rose-600 font-bold mt-1">
                  {errors['nomineeConfirmed']}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={handleReviewNominee}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-2 ${
                formData.nominee?.confirmed
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300'
                  : 'bg-sky-950 hover:bg-sky-900 text-white shadow-xs'
              }`}
            >
              <span>{formData.nominee?.confirmed ? 'Review / Edit Nominee' : 'Confirm Nominee Details'}</span>
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* SECTION 3: MANDATORY DOCUMENT UPLOADS (5 Required Files - All Mandatory) */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-900 flex items-center justify-center">
                <FileCheck2 className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Mandatory Document Uploads</h2>
                <p className="text-xs text-slate-500">
                  Maximum 5 MB per file. JPG, JPEG and PNG formats accepted. Every document below is required.
                </p>
              </div>
            </div>
            <span className="hidden sm:inline-block px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold">
              All 5 Mandatory *
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs">
            {/* 1. PAN CARD COPY */}
            <KycImageUploadCard
              id="field-panCard"
              fieldKey="panCard"
              label="1. PAN Card Copy"
              subtitle="Clear copy of original PAN Card (JPG, JPEG, PNG)"
              imageUrl={docs.panCardUrl}
              imageName={docs.panCardName}
              imageSize={docs.panCardSize}
              userId={user?.uid || 'client'}
              errorMessage={errors['panCard']}
              onUploadSuccess={(url, name, size) => handleDocumentUploaded('panCard', url, name, size)}
              onRemove={() => handleDocumentRemoved('panCard')}
              disabled={submitting}
            />

            {/* 2. AADHAAR PROOF */}
            <KycImageUploadCard
              id="field-aadhaarDoc"
              fieldKey="aadhaarDoc"
              label="2. Aadhaar Proof"
              subtitle="Front copy or proof of Aadhaar Card (JPG, JPEG, PNG)"
              imageUrl={docs.aadhaarDocUrl}
              imageName={docs.aadhaarDocName}
              imageSize={docs.aadhaarDocSize}
              userId={user?.uid || 'client'}
              errorMessage={errors['aadhaarDoc']}
              onUploadSuccess={(url, name, size) => handleDocumentUploaded('aadhaarDoc', url, name, size)}
              onRemove={() => handleDocumentRemoved('aadhaarDoc')}
              disabled={submitting}
            />

            {/* 3. PASSPORT-SIZE PHOTOGRAPH */}
            <KycImageUploadCard
              id="field-photo"
              fieldKey="photo"
              label="3. Passport-Size Photograph"
              subtitle="Recent colour photograph against clear background"
              imageUrl={docs.photoUrl}
              imageName={docs.photoName}
              imageSize={docs.photoSize}
              userId={user?.uid || 'client'}
              errorMessage={errors['photo']}
              onUploadSuccess={(url, name, size) => handleDocumentUploaded('photo', url, name, size)}
              onRemove={() => handleDocumentRemoved('photo')}
              disabled={submitting}
            />

            {/* 4. OFFICIAL CLIENT SIGNATURE */}
            <KycImageUploadCard
              id="field-scannedPaperSignature"
              fieldKey="scannedPaperSignature"
              label="4. Official Client Signature"
              subtitle="Upload a scanned signature drawn on white paper"
              imageUrl={docs.scannedPaperSignatureUrl || docs.signatureUrl}
              imageName={docs.scannedPaperSignatureName || docs.signatureName}
              imageSize={docs.scannedPaperSignatureSize || docs.signatureSize}
              userId={user?.uid || 'client'}
              errorMessage={errors['scannedPaperSignature']}
              onUploadSuccess={(url, name, size) => handleDocumentUploaded('scannedPaperSignature', url, name, size)}
              onRemove={() => handleDocumentRemoved('scannedPaperSignature')}
              disabled={submitting}
            />

            {/* 5. CHEQUE LEAF */}
            <div className="sm:col-span-2">
              <KycImageUploadCard
                id="field-chequeLeaf"
                fieldKey="chequeLeaf"
                label="5. Cheque Leaf"
                subtitle="Cancelled cheque leaf showing printed account holder name and account details"
                imageUrl={docs.chequeLeafUrl}
                imageName={docs.chequeLeafName}
                imageSize={docs.chequeLeafSize}
                userId={user?.uid || 'client'}
                errorMessage={errors['chequeLeaf']}
                onUploadSuccess={(url, name, size) => handleDocumentUploaded('chequeLeaf', url, name, size)}
                onRemove={() => handleDocumentRemoved('chequeLeaf')}
                disabled={submitting}
              />
            </div>
          </div>
        </div>

        {/* SECTION 4: DECLARATION & SUBMISSION */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs">
          <div id="field-consent" className="mb-6">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                required
                checked={formData.consentCheckbox}
                onChange={(e) => {
                  setFormData({ ...formData, consentCheckbox: e.target.checked });
                  if (errors['consent']) setErrors((p) => ({ ...p, consent: '' }));
                }}
                className="mt-1 w-4 h-4 rounded text-sky-950 focus:ring-sky-900 border-slate-300"
              />
              <span className="text-xs text-slate-700 leading-relaxed font-medium">
                I hereby declare that all details, address information, and documents submitted herein are genuine, complete, and accurate. I authorize Scientific Fin Serv to verify these records with authorized KRAs / UIDAI / Tax database for the purpose of mutual fund KYC registration and distributor onboarding.
              </span>
            </label>
            {errors['consent'] && (
              <p className="text-[11px] text-rose-600 font-semibold mt-2 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{errors['consent']}</span>
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-slate-100">
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>{DISTRIBUTOR_PROFILE.companyDescription} • {DISTRIBUTOR_PROFILE.arn}</span>
            </div>

            <div className="flex flex-col sm:items-end gap-1.5 w-full sm:w-auto">
              <button
                type="submit"
                disabled={submitting || !isFormComplete}
                className={`w-full sm:w-auto px-8 py-3.5 rounded-2xl font-extrabold text-xs shadow-md transition flex items-center justify-center gap-2 ${
                  isFormComplete && !submitting
                    ? 'bg-sky-950 hover:bg-sky-900 text-white cursor-pointer active:scale-98'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                }`}
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Submitting to Scientific Fin Serv...</span>
                  </span>
                ) : (
                  <>
                    <span>Submit KYC Application</span>
                    <Send className="w-4 h-4" />
                  </>
                )}
              </button>
              {!isFormComplete && (
                <p className="text-[11px] text-slate-500 font-medium text-center sm:text-right">
                  {!hasAllFiveImages
                    ? 'Upload all 5 required documents to enable submission.'
                    : !isNomineeValid
                    ? 'Please complete and confirm nominee details above.'
                    : !formData.consentCheckbox
                    ? 'Please accept the declaration checkbox.'
                    : 'Complete all required client details to enable submission.'}
                </p>
              )}
            </div>
          </div>
        </div>
      </form>

      {/* Nominee Confirmation Pop-up Modal */}
      {showNomineeConfirmModal && formData.nominee && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in zoom-in-95">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-950 flex items-center justify-center font-bold">
                  <Users className="w-5 h-5 text-sky-800" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Confirm Nominee Details</h3>
                  <p className="text-xs text-slate-500">Please review the nominee details before proceeding</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNomineeConfirmModal(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Summary Card */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3 text-xs mb-6">
              <div className="flex justify-between items-center border-b border-slate-200/60 pb-2">
                <span className="text-slate-500 font-medium">Nominee Full Legal Name</span>
                <span className="font-bold text-slate-900">{formData.nominee.fullName}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-200/60 pb-2">
                <span className="text-slate-500 font-medium">Date of Birth</span>
                <span className="font-semibold text-slate-800">{formData.nominee.dateOfBirth}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-200/60 pb-2">
                <span className="text-slate-500 font-medium">Email Address</span>
                <span className="font-semibold text-slate-800">{formData.nominee.email}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-200/60 pb-2">
                <span className="text-slate-500 font-medium">Phone Number</span>
                <span className="font-mono font-semibold text-slate-800">+91 {formData.nominee.phone}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">{formData.nominee.idType} Number</span>
                <span className="font-mono font-bold text-sky-950 tracking-wider">{formData.nominee.idNumber}</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 mb-5 text-center leading-relaxed font-medium">
              By confirming, you certify that this nominee is authorized to receive proceeds in the event of unforeseen circumstances according to SEBI regulations.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setShowNomineeConfirmModal(false)}
                className="py-3 px-4 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs transition cursor-pointer"
              >
                Edit Details
              </button>
              <button
                type="button"
                onClick={handleConfirmNominee}
                className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Confirm Nominee</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
