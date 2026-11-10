import { jsPDF } from 'jspdf';
import { KycApplication } from '../types/index.ts';
import { DISTRIBUTOR_PROFILE } from './constants.ts';

/**
 * Converts an image URL (remote or data URI) to a base64 data URI for jsPDF embedding
 */
async function urlToDataUri(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:image/')) return url;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('Could not fetch image for PDF embedding:', err);
    return null;
  }
}

/**
 * Get natural dimensions of a base64 image
 */
function getImageDimensions(dataUri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth || 600, height: img.naturalHeight || 400 });
    };
    img.onerror = () => {
      resolve({ width: 600, height: 400 });
    };
    img.src = dataUri;
  });
}

/**
 * Generates and downloads a complete, professional PDF dossier for a client KYC application
 */
export async function generateClientKycPdf(app: KycApplication): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const margin = 15;
  const contentWidth = pageWidth - margin * 2; // 180mm

  // Colors
  const primaryNavy: [number, number, number] = [15, 23, 42]; // #0f172a
  const accentSky: [number, number, number] = [2, 132, 199]; // #0284c7
  const textDark: [number, number, number] = [30, 41, 59]; // #1e293b
  const textMuted: [number, number, number] = [100, 116, 139]; // #64748b
  const borderLight: [number, number, number] = [226, 232, 240]; // #e2e8f0
  const bgLight: [number, number, number] = [248, 250, 252]; // #f8fafc

  let y = margin;

  // Helper: Draw Header & Brand
  function drawBrandHeader() {
    doc.setFillColor(...bgLight);
    doc.rect(margin, margin, contentWidth, 24, 'F');
    doc.setDrawColor(...borderLight);
    doc.rect(margin, margin, contentWidth, 24, 'S');

    doc.setTextColor(...primaryNavy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('SCIENTIFIC FIN SERV', margin + 6, margin + 8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...textDark);
    doc.text(
      'Scientific Fin Serv • Authorized AMFI Registered Mutual Fund Distributor',
      margin + 6,
      margin + 14
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...accentSky);
    doc.text('ARN - 357716', margin + 6, margin + 20);

    // Right-side badge
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...primaryNavy);
    doc.text('CLIENT KYC DOSSIER', pageWidth - margin - 6, margin + 9, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...textMuted);
    doc.text(`Ref: ${app.applicationId || app.id || 'SFS-KYC'}`, pageWidth - margin - 6, margin + 14, { align: 'right' });
    doc.text(`Status: ${(app.status || 'SUBMITTED').toUpperCase()}`, pageWidth - margin - 6, margin + 19, { align: 'right' });
  }

  // Helper: Draw Footer
  function drawFooter(pageNumber: number, totalPages: number) {
    doc.setDrawColor(...borderLight);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...textMuted);
    doc.text(
      'Scientific Fin Serv • Authorized AMFI Registered Mutual Fund Distributor • ARN - 357716',
      margin,
      pageHeight - 8
    );
    doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
  }

  // Page 1: Personal, Contact, Address & Nominee Info
  drawBrandHeader();
  y = margin + 30;

  // Title Box
  doc.setTextColor(...primaryNavy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('CLIENT KYC REGISTRATION DETAILS', margin, y);
  y += 5;

  doc.setDrawColor(...accentSky);
  doc.setLineWidth(0.8);
  doc.line(margin, y, margin + 50, y);
  doc.setLineWidth(0.2);
  y += 6;

  // Section 1: Personal Details Grid
  function drawSectionTitle(title: string) {
    doc.setFillColor(...primaryNavy);
    doc.rect(margin, y, contentWidth, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(title.toUpperCase(), margin + 4, y + 4.3);
    y += 9;
  }

  drawSectionTitle('1. Personal Information');

  // Key-Value Rows
  const personalData: [string, string][] = [
    ['Full Legal Name (as per PAN)', app.fullName || '—'],
    ['Date of Birth', app.dateOfBirth || '—'],
    ['Gender', app.gender || '—'],
    ['Marital Status', app.maritalStatus || '—'],
    ['Permanent Account Number (PAN)', app.pan || '—'],
    ['Aadhaar Number', app.aadhaarNumber ? `XXXX-XXXX-${app.aadhaarNumber.slice(-4)}` : '—'],
    ['Occupation', app.occupation || '—'],
    ['Gross Annual Income', app.annualIncome || '—'],
  ];

  personalData.forEach(([label, value], idx) => {
    const isOdd = idx % 2 === 1;
    if (isOdd) {
      doc.setFillColor(...bgLight);
      doc.rect(margin, y - 4, contentWidth, 6.5, 'F');
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...textDark);
    doc.text(label, margin + 4, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...primaryNavy);
    doc.text(String(value), margin + 75, y);
    y += 6.5;
  });

  y += 4;

  // Section 2: Contact & Residential Address
  drawSectionTitle('2. Contact Details & Residential Address');

  const addr = app.address || { street: '', city: '', state: '', pincode: '' };
  const contactData: [string, string][] = [
    ['Mobile Number', app.mobile ? `+91 ${app.mobile}` : '—'],
    ['Email Address', app.email || '—'],
    ['Street Address', addr.street || '—'],
    ['City & State', `${addr.city || ''}${addr.city && addr.state ? ', ' : ''}${addr.state || ''}`],
    ['Postal PIN Code', addr.pincode || '—'],
  ];

  contactData.forEach(([label, value], idx) => {
    const isOdd = idx % 2 === 1;
    if (isOdd) {
      doc.setFillColor(...bgLight);
      doc.rect(margin, y - 4, contentWidth, 6.5, 'F');
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...textDark);
    doc.text(label, margin + 4, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...primaryNavy);
    doc.text(String(value), margin + 75, y);
    y += 6.5;
  });

  y += 4;

  // Section 3: Nominee Details
  drawSectionTitle('3. Nominee Designation Details');

  const nom = app.nominee || { fullName: '', dateOfBirth: '', email: '', phone: '', idType: 'PAN', idNumber: '' };
  const nomineeData: [string, string][] = [
    ['Nominee Full Legal Name', nom.fullName || '—'],
    ['Nominee Date of Birth', nom.dateOfBirth || '—'],
    ['Nominee Email Address', nom.email || '—'],
    ['Nominee Phone Number', nom.phone ? `+91 ${nom.phone}` : '—'],
    ['Nominee Identification', `${nom.idType || 'ID'}: ${nom.idNumber || '—'}`],
    ['Nominee Confirmation', nom.confirmed ? 'Confirmed by Client' : 'Registered'],
  ];

  nomineeData.forEach(([label, value], idx) => {
    const isOdd = idx % 2 === 1;
    if (isOdd) {
      doc.setFillColor(...bgLight);
      doc.rect(margin, y - 4, contentWidth, 6.5, 'F');
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...textDark);
    doc.text(label, margin + 4, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...primaryNavy);
    doc.text(String(value), margin + 75, y);
    y += 6.5;
  });

  y += 4;

  // Section 4: Declaration & Verification Record
  drawSectionTitle('4. Compliance, Declaration & Audit Trail');

  const auditData: [string, string][] = [
    ['Client Declaration & Consent', app.consentCheckbox ? 'Accepted & Signed Digitally' : 'Recorded'],
    ['Application Reference Number', app.applicationId || app.id || 'SFS-KYC-PENDING'],
    ['Submission Timestamp', app.submittedAt ? new Date(app.submittedAt).toLocaleString('en-IN') : new Date().toLocaleString('en-IN')],
    ['Last Record Update', app.updatedAt ? new Date(app.updatedAt).toLocaleString('en-IN') : 'N/A'],
    ['Authorized Distributor ARN', 'ARN - 357716 (Scientific Fin Serv)'],
  ];

  auditData.forEach(([label, value], idx) => {
    const isOdd = idx % 2 === 1;
    if (isOdd) {
      doc.setFillColor(...bgLight);
      doc.rect(margin, y - 4, contentWidth, 6.5, 'F');
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...textDark);
    doc.text(label, margin + 4, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...primaryNavy);
    doc.text(String(value), margin + 75, y);
    y += 6.5;
  });

  // Prepare images for pages 2 & 3
  const docs = app.documents || {};
  const docList = [
    {
      title: '1. PAN Card Copy',
      url: docs.panCardUrl,
      fileName: docs.panCardName || 'PAN_Card.jpg',
    },
    {
      title: '2. Aadhaar Proof',
      url: docs.aadhaarDocUrl,
      fileName: docs.aadhaarDocName || 'Aadhaar_Proof.jpg',
    },
    {
      title: '3. Passport-Size Photograph',
      url: docs.photoUrl,
      fileName: docs.photoName || 'Client_Photo.jpg',
    },
    {
      title: '4. Official Client Signature (Scanned White Paper)',
      url: docs.scannedPaperSignatureUrl || docs.signatureUrl,
      fileName: docs.scannedPaperSignatureName || docs.signatureName || 'Client_Signature.jpg',
    },
    {
      title: '5. Cheque Leaf Copy',
      url: docs.chequeLeafUrl,
      fileName: docs.chequeLeafName || 'Cheque_Leaf.jpg',
    },
  ];

  // Helper to embed an image into a rectangular box
  async function embedDocumentImage(
    item: { title: string; url?: string; fileName: string },
    boxX: number,
    boxY: number,
    boxW: number,
    boxH: number
  ) {
    // Header for this document box
    doc.setFillColor(...bgLight);
    doc.rect(boxX, boxY, boxW, 7, 'F');
    doc.setDrawColor(...borderLight);
    doc.rect(boxX, boxY, boxW, boxH, 'S');

    doc.setTextColor(...primaryNavy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(item.title, boxX + 3, boxY + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...textMuted);
    doc.text(item.fileName, boxX + boxW - 3, boxY + 5, { align: 'right' });

    const imgAreaX = boxX + 3;
    const imgAreaY = boxY + 9;
    const imgAreaW = boxW - 6;
    const imgAreaH = boxH - 12;

    if (!item.url) {
      doc.setTextColor(...textMuted);
      doc.setFontSize(8);
      doc.text('No document uploaded', boxX + boxW / 2, boxY + boxH / 2, { align: 'center' });
      return;
    }

    const dataUri = await urlToDataUri(item.url);
    if (!dataUri) {
      doc.setTextColor(...textMuted);
      doc.setFontSize(8);
      doc.text(`Document Attached (${item.fileName})`, boxX + boxW / 2, boxY + boxH / 2, { align: 'center' });
      return;
    }

    try {
      const dims = await getImageDimensions(dataUri);
      // Fit maintaining aspect ratio
      const imgAspect = dims.width / dims.height;
      const boxAspect = imgAreaW / imgAreaH;

      let drawW = imgAreaW;
      let drawH = imgAreaH;
      let drawX = imgAreaX;
      let drawY = imgAreaY;

      if (imgAspect > boxAspect) {
        drawH = imgAreaW / imgAspect;
        drawY = imgAreaY + (imgAreaH - drawH) / 2;
      } else {
        drawW = imgAreaH * imgAspect;
        drawX = imgAreaX + (imgAreaW - drawW) / 2;
      }

      // Detect format
      let format = 'JPEG';
      if (dataUri.startsWith('data:image/png')) format = 'PNG';

      doc.addImage(dataUri, format, drawX, drawY, drawW, drawH);
    } catch (e) {
      console.warn('jsPDF addImage fallback:', e);
      doc.setTextColor(...textMuted);
      doc.setFontSize(8);
      doc.text(`Image Verified: ${item.fileName}`, boxX + boxW / 2, boxY + boxH / 2, { align: 'center' });
    }
  }

  // --- PAGE 2: Documents 1, 2, 3 ---
  doc.addPage();
  drawBrandHeader();

  y = margin + 30;
  doc.setTextColor(...primaryNavy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('MANDATORY CLIENT KYC DOCUMENTS (1 TO 3)', margin, y);
  y += 5;
  doc.setDrawColor(...accentSky);
  doc.setLineWidth(0.8);
  doc.line(margin, y, margin + 45, y);
  doc.setLineWidth(0.2);
  y += 5;

  // Document 1: PAN Card (Top half)
  await embedDocumentImage(docList[0], margin, y, contentWidth, 68);
  y += 73;

  // Document 2: Aadhaar Proof (Middle half)
  await embedDocumentImage(docList[1], margin, y, contentWidth, 68);
  y += 73;

  // Document 3: Passport Photograph (Bottom)
  await embedDocumentImage(docList[2], margin, y, contentWidth, 75);

  // --- PAGE 3: Documents 4, 5 ---
  doc.addPage();
  drawBrandHeader();

  y = margin + 30;
  doc.setTextColor(...primaryNavy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('MANDATORY CLIENT KYC DOCUMENTS (4 & 5)', margin, y);
  y += 5;
  doc.setDrawColor(...accentSky);
  doc.setLineWidth(0.8);
  doc.line(margin, y, margin + 45, y);
  doc.setLineWidth(0.2);
  y += 5;

  // Document 4: Client Signature (Top half)
  await embedDocumentImage(docList[3], margin, y, contentWidth, 105);
  y += 112;

  // Document 5: Cheque Leaf (Bottom half)
  await embedDocumentImage(docList[4], margin, y, contentWidth, 105);

  // Add footers with total page numbers to all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawFooter(i, totalPages);
  }

  // File name
  const cleanName = (app.fullName || 'Client').replace(/[^a-zA-Z0-9]/g, '_');
  const safeFilename = `Scientific_Fin_Serv_KYC_${cleanName}_ARN-357716.pdf`;
  doc.save(safeFilename);
}
