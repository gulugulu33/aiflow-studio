import { normalizeUploadedFilename } from './normalize-uploaded-filename';

describe('normalizeUploadedFilename', () => {
  it('keeps ASCII filenames unchanged', () => {
    expect(normalizeUploadedFilename('hello.md')).toBe('hello.md');
  });

  it('fixes common mojibake (latin1-decoded UTF-8 bytes)', () => {
    const mojibake = 'é®é¢è®°å½.md';
    expect(normalizeUploadedFilename(mojibake)).toBe('问题记录.md');
  });

  it('does not corrupt valid Latin-1 extended characters (e.g., café.md)', () => {
    expect(normalizeUploadedFilename('café.md')).toBe('café.md');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeUploadedFilename('')).toBe('');
  });
});
