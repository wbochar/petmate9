import { parseClipboardFramebufferPayload } from './clipboardFramebuffer';

function mkFramebuf(overrides: Partial<any> = {}) {
  return {
    width: 2,
    height: 1,
    backgroundColor: 6,
    borderColor: 14,
    borderOn: true,
    charset: 'upper',
    framebuf: [[{ code: 1, color: 1 }, { code: 2, color: 2 }]],
    ...overrides,
  };
}

describe('parseClipboardFramebufferPayload', () => {
  it('rejects non-JSON input', () => {
    const result = parseClipboardFramebufferPayload('{not valid json');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/not valid/i);
    }
  });

  it('rejects valid JSON missing the framebufs field', () => {
    const result = parseClipboardFramebufferPayload(JSON.stringify({ version: 1 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/Pasted clipboard data/);
    }
  });

  it('rejects a framebuf whose pixel data does not match its declared dimensions', () => {
    const bad = mkFramebuf({ framebuf: [] }); // height says 1, but framebuf is empty
    const result = parseClipboardFramebufferPayload(JSON.stringify({ version: 1, framebufs: bad }));
    expect(result.ok).toBe(false);
  });

  it('accepts a well-formed payload with no charsets, returning an empty charsets object', () => {
    const fb = mkFramebuf();
    const result = parseClipboardFramebufferPayload(JSON.stringify({ version: 1, framebufs: fb }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.framebuf).toEqual(fb);
      expect(result.data.charsets).toEqual({});
    }
  });

  it('passes through embedded charsets when present', () => {
    const fb = mkFramebuf({ charset: 'myFont' });
    const charsets = { myFont: { name: 'My Font', bits: [1, 2], charOrder: [0, 1] } };
    const result = parseClipboardFramebufferPayload(JSON.stringify({ version: 1, framebufs: fb, charsets }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.charsets).toEqual(charsets);
    }
  });

  it('treats a non-object charsets field as empty rather than throwing', () => {
    const fb = mkFramebuf();
    const result = parseClipboardFramebufferPayload(JSON.stringify({ version: 1, framebufs: fb, charsets: 'oops' }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.charsets).toEqual({});
    }
  });
});
