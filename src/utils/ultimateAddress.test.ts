import {
  normalizeUltimatePresets,
  normalizeUltimateUrl,
} from './ultimateAddress';

describe('normalizeUltimateUrl', () => {
  it('returns empty string for empty / whitespace-only input', () => {
    expect(normalizeUltimateUrl('')).toBe('');
    expect(normalizeUltimateUrl('   ')).toBe('');
    expect(normalizeUltimateUrl('\t\n')).toBe('');
  });

  it('passes through valid http:// URLs unchanged', () => {
    expect(normalizeUltimateUrl('http://192.168.1.64')).toBe('http://192.168.1.64');
    expect(normalizeUltimateUrl('http://ultimate.local:8080/v1')).toBe('http://ultimate.local:8080/v1');
  });

  it('rewrites https:// to http:// (Ultimate REST API is HTTP only)', () => {
    expect(normalizeUltimateUrl('https://ultimate.local')).toBe('http://ultimate.local');
    expect(normalizeUltimateUrl('HTTPS://10.0.0.1:80')).toBe('http://10.0.0.1:80');
  });

  it('prefixes bare hostnames / IPs with http://', () => {
    expect(normalizeUltimateUrl('192.168.1.64')).toBe('http://192.168.1.64');
    expect(normalizeUltimateUrl('ultimate.local')).toBe('http://ultimate.local');
  });

  it('trims surrounding whitespace before normalizing', () => {
    expect(normalizeUltimateUrl('  http://x.y  ')).toBe('http://x.y');
    expect(normalizeUltimateUrl('  z.local  ')).toBe('http://z.local');
  });
});

describe('normalizeUltimatePresets', () => {
  it('removes duplicates while preserving first-seen order', () => {
    expect(normalizeUltimatePresets(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
  });

  it('drops empty / whitespace-only entries', () => {
    expect(normalizeUltimatePresets(['', '  ', 'x'])).toEqual(['x']);
  });

  it('trims entries before deduping', () => {
    expect(normalizeUltimatePresets(['  http://a  ', 'http://a'])).toEqual(['http://a']);
  });

  it('skips non-string entries defensively', () => {
    // Cast through unknown so the test exercises the runtime guard.
    const input = ['ok', null, undefined, 42, 'ok2'] as unknown as string[];
    expect(normalizeUltimatePresets(input)).toEqual(['ok', 'ok2']);
  });
});
