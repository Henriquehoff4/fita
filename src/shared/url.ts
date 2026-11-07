const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/i;

export function isHttpUrl(value: string): boolean {
  if (value.length > 4096) return false;
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.includes('.');
  } catch {
    return false;
  }
}

export function extractUrl(text: string): string | null {
  const match = text.match(URL_PATTERN);
  if (!match) return null;
  const cleaned = match[0].replace(/[),.;:!?\]}»]+$/, '');
  return isHttpUrl(cleaned) ? cleaned : null;
}
