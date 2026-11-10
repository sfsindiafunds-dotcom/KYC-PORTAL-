export type KycStatus =
  | 'draft'
  | 'pending'
  | 'under_review'
  | 'correction_requested'
  | 'resubmission_requested'
  | 'resubmitted'
  | 'completed';

export type Gender = 'Male' | 'Female' | 'Other';
export type MaritalStatus = 'Single' | 'Married';

export type OccupationType =
  | 'Salaried – Private Sector'
  | 'Salaried – Government'
  | 'Business / Self-Employed'
  | 'Professional'
  | 'Agriculture'
  | 'Retired'
  | 'Housewife'
  | 'Student'
  | 'Others';

export type AnnualIncomeType =
  | 'Below ₹1 Lakh'
  | '₹1–5 Lakh'
  | '₹5–10 Lakh'
  | '₹10–25 Lakh'
  | '₹25 Lakh–1 Crore'
  | 'Above ₹1 Crore';

export interface ClientAddress {
  street: string;
  city: string;
  state: string;
  pincode: string;
}

export interface NomineeDetails {
  fullName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  idType: 'PAN' | 'Aadhaar';
  idNumber: string; // Full PAN (e.g. ABCDE1234F) or Full 12-digit Aadhaar
  confirmed?: boolean;
}

export interface KycDocuments {
  // 1. PAN Card Copy *
  panCardUrl?: string;
  panCardName?: string;
  panCardSize?: number;

  // 2. Aadhaar Proof *
  aadhaarDocUrl?: string;
  aadhaarDocName?: string;
  aadhaarDocSize?: number;

  // 3. Passport-Size Photograph *
  photoUrl?: string;
  photoName?: string;
  photoSize?: number;

  // 4. Scanned signature drawn on white paper *
  scannedPaperSignatureUrl?: string;
  scannedPaperSignatureName?: string;
  scannedPaperSignatureSize?: number;

  // 5. Cheque Leaf *
  chequeLeafUrl?: string;
  chequeLeafName?: string;
  chequeLeafSize?: number;

  // Backward-compatibility alias
  signatureUrl?: string;
  signatureName?: string;
  signatureSize?: number;
}

export interface KycApplication {
  id?: string;
  userId: string;
  applicationId?: string;
  email: string;

  // Form Fields
  fullName: string;
  dateOfBirth: string; // YYYY-MM-DD
  gender: Gender;
  maritalStatus: MaritalStatus;
  mobile: string;
  pan: string;
  aadhaarNumber: string; // Full 12-digit Aadhaar verified via Verhoeff
  aadhaarLast4?: string; // Masked for display
  aadhaarConsentGranted: boolean;
  address: ClientAddress;
  occupation: OccupationType;
  annualIncome: AnnualIncomeType;

  // Nominee Details
  nominee?: NomineeDetails;

  // Mandatory Documents (5 Required)
  documents: KycDocuments;

  // Submission & Status
  status: KycStatus;
  consentCheckbox: boolean;
  adminRemarks?: string;

  // Resubmission controls
  resubmissionRequested?: boolean;
  resubmissionNotes?: string;
  resubmissionRequestedAt?: string;
  resubmittedAt?: string;

  submittedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  action: string;
  actorId: string;
  actorEmail: string;
  targetApplicationId?: string;
  details: string;
  timestamp: string;
}
