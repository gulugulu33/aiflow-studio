export function normalizeUploadedFilename(name: string): string {
  if (!name) return '';

  // Only attempt to fix mojibake when the string is entirely within the Latin-1 range.
  // This avoids corrupting already-correct Unicode filenames.
  for (const char of name) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) continue;
    if (codePoint > 0xff) {
      return name;
    }
  }

  const candidate = Buffer.from(name, 'latin1').toString('utf8');

  // If the conversion produces replacement characters, treat as invalid and keep original.
  if (candidate.includes('\uFFFD')) {
    return name;
  }

  return candidate;
}
