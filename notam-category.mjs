// FAA JO 7930.2, Appendix B: NOTAM Q-code subject and condition.
export function classifyNotam(selectionCode, type, text, translation = '') {
  const raw = [text, translation].join('\n').toUpperCase();
  const structured = String(selectionCode || '').trim().toUpperCase();
  const fromText = raw.match(/^Q\)\s*[A-Z]{4}\/(Q[A-Z]{4})\//m)?.[1];
  const q = structured && structured !== 'QXXXX' ? structured : fromText || '';
  const subject = /^Q[A-Z]{4}$/.test(q) ? q.slice(1, 3) : '';
  const cancellation = String(type || '').toUpperCase() === 'C' || /\bNOTAMC\b/.test(raw) ||
    /\b(?:CANCELED|CANCELLED)\s*$/.test(raw);
  const isTfr = /\bTEMPORARY FLIGHT RESTRICTIONS?\b/.test(raw) ||
    /\b14 CFR\s+(?:PART\s+)?91\.(?:137|138|139|141|143|145)\b/.test(raw);
  let categoryCode = 'OTHER';
  if (isTfr || /^(?:RA|RD|RO|RP|RR|RT)$/.test(subject)) categoryCode = 'AIRSPACE';
  else if (/^I[A-Z]$|^N[A-Z]$/.test(subject)) categoryCode = 'NAVAID';
  else if (/^(?:MX|MY|LX|LY)$/.test(subject) || /\bAPRON\b[^\n]{0,80}\b(?:TXL|TWY)\b/.test(raw)) categoryCode = 'TAXIWAY';
  else if (/^(?:MR|MD|MT|LA|LC|LE|LH|LI|LL|LM|LP|LT|LV|LZ|FT)$/.test(subject)) {
    categoryCode = /\bFICON\b/.test(raw) ? 'RWY_COND' : 'RUNWAY';
  } else if (!subject || subject === 'XX') {
    const noticeBody = raw.match(/^E\)\s*(.*)/m)?.[1] || raw.trim();
    if (/^(?:[A-Z0-9]{3,4}\s+)?(?:TWY|TAXIWAY|TXL)\b/.test(noticeBody)) categoryCode = 'TAXIWAY';
    else if (/^(?:[A-Z0-9]{3,4}\s+)?(?:RWY|RUNWAY)\b/.test(noticeBody)) categoryCode = /\bFICON\b/.test(raw) ? 'RWY_COND' : 'RUNWAY';
    else if (/^(?:[A-Z0-9]{3,4}\s+)?NAV\b/.test(noticeBody)) categoryCode = 'NAVAID';
  }
  return { categoryCode, isTfr, cancellation };
}
