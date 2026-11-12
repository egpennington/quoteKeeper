// OCR Lab access control (temporary Sprint 2A-0 test view).
//
// The lab is shown only at /#ocr-lab and only to signed-in Firebase users whose
// UID is listed in VITE_SMARTSCAN_LAB_UIDS (comma-separated). If the variable is
// unset or empty, the lab is disabled for everyone (fails closed).
//
// This is a client-side gate: it hides a test tool that reads and writes no user
// data. It is not a security boundary, and nothing secret is protected by it.

export const LAB_HASH = '#ocr-lab';

// Read the variable directly so Vite inlines only this value, not the whole env object.
export function labAllowList(raw = import.meta.env.VITE_SMARTSCAN_LAB_UIDS) {
  return (raw || '')
    .split(',')
    .map((uid) => uid.trim())
    .filter(Boolean);
}

export function isLabUser(user, allowList = labAllowList()) {
  return Boolean(user?.uid) && allowList.includes(user.uid);
}
