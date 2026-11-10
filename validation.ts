/**
 * UIDAI Aadhaar Verhoeff Checksum Algorithm
 * Standard mathematical validation used by UIDAI for Indian 12-digit Aadhaar numbers.
 */

// Multiplication table d
const dTable = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

// Permutation table p
const pTable = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function validateAadhaarVerhoeff(numStr: string): boolean {
  const cleaned = (numStr || '').replace(/\D/g, '');
  if (cleaned.length !== 12) return false;
  // Aadhaar numbers in India cannot start with 0 or 1
  if (cleaned[0] === '0' || cleaned[0] === '1') return false;

  let c = 0;
  const digits = cleaned.split('').map(Number).reverse();
  for (let i = 0; i < digits.length; i++) {
    c = dTable[c][pTable[i % 8][digits[i]]];
  }
  return c === 0;
}

export function validatePanFormat(pan: string): boolean {
  const cleaned = (pan || '').trim().toUpperCase();
  // 5 uppercase letters, 4 digits, 1 uppercase letter
  return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(cleaned);
}

export function validateMobileFormat(mobile: string): boolean {
  const cleaned = (mobile || '').replace(/\D/g, '');
  // Exactly 10 digits, Indian mobile numbers start with 6, 7, 8, 9
  return /^[6-9]\d{9}$/.test(cleaned);
}

export function validateEmailFormat(email: string): boolean {
  const cleaned = (email || '').trim();
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(cleaned);
}
