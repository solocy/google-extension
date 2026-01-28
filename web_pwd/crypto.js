// crypto.js - stub for encryption helpers (prototype)
// For production, implement PBKDF2 + AES-GCM encryption. This file provides placeholder functions.

export async function deriveKeyFromPassword(password, salt) {
  // placeholder - not implemented in prototype
  return null;
}

export async function encryptString(plain) {
  // placeholder - return base64 of plain for prototype
  return btoa(unescape(encodeURIComponent(plain)));
}

export async function decryptString(cipher) {
  // placeholder
  try {
    return decodeURIComponent(escape(atob(cipher)));
  } catch (e) {
    return cipher;
  }
}
