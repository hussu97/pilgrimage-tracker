import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateImageFile, compressImage } from '@/lib/utils/imageUpload';

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

function makeFile(type: string, size: number): File {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], 'test.jpg', { type });
}

describe('validateImageFile()', () => {
  it('accepts a valid JPEG file under 5 MB', () => {
    const file = makeFile('image/jpeg', 1024);
    const result = validateImageFile(file);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts a valid PNG file under 5 MB', () => {
    const file = makeFile('image/png', 512 * 1024);
    const result = validateImageFile(file);
    expect(result.valid).toBe(true);
  });

  it('accepts a valid WebP file under 5 MB', () => {
    const file = makeFile('image/webp', 1024 * 1024);
    const result = validateImageFile(file);
    expect(result.valid).toBe(true);
  });

  it('rejects an invalid file type (GIF)', () => {
    const file = makeFile('image/gif', 1024);
    const result = validateImageFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/jpeg|png|webp/i);
  });

  it('rejects a PDF file', () => {
    const file = makeFile('application/pdf', 1024);
    const result = validateImageFile(file);
    expect(result.valid).toBe(false);
  });

  it('rejects a file larger than 5 MB', () => {
    const file = makeFile('image/jpeg', MAX_SIZE + 1);
    const result = validateImageFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/5MB/i);
  });

  it('accepts a file at exactly the 5 MB boundary', () => {
    const file = makeFile('image/jpeg', MAX_SIZE);
    const result = validateImageFile(file);
    expect(result.valid).toBe(true);
  });

  it('returns valid:false with an error string for invalid type', () => {
    const file = makeFile('text/plain', 100);
    const result = validateImageFile(file);
    expect(result.valid).toBe(false);
    expect(typeof result.error).toBe('string');
    expect(result.error!.length).toBeGreaterThan(0);
  });
});

// ─── compressImage() ──────────────────────────────────────────────────────────

describe('compressImage()', () => {
  let mockImageInstance: {
    onload: (() => void) | null;
    onerror: (() => void) | null;
    src: string;
    width: number;
    height: number;
  };

  beforeEach(() => {
    mockImageInstance = { onload: null, onerror: null, src: '', width: 800, height: 600 };
    // Use a regular function (not arrow) so it can be used as a constructor
    vi.stubGlobal(
      'Image',
      vi.fn(function () {
        return mockImageInstance;
      }),
    );
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:mock') });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function makeCanvas(
    ctx: object | null,
    blob: Blob | null = new Blob(['x'], { type: 'image/jpeg' }),
  ) {
    return {
      getContext: vi.fn(() => ctx),
      width: 0,
      height: 0,
      toBlob: vi.fn((cb: (blob: Blob | null) => void) => cb(blob)),
    };
  }

  it('resolves with the blob, width and height for a normal-sized image', async () => {
    const mockBlob = new Blob(['img'], { type: 'image/jpeg' });
    const mockCtx = { drawImage: vi.fn() };
    vi.spyOn(document, 'createElement').mockReturnValueOnce(makeCanvas(mockCtx, mockBlob) as any);

    const file = makeFile('image/jpeg', 1024);
    const promise = compressImage(file);
    mockImageInstance.onload?.();

    const result = await promise;
    expect(result.blob).toBe(mockBlob);
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });

  it('resizes width to maxWidth and scales height proportionally', async () => {
    mockImageInstance.width = 2400;
    mockImageInstance.height = 1800;

    const mockBlob = new Blob(['img'], { type: 'image/jpeg' });
    const mockCtx = { drawImage: vi.fn() };
    const canvas = makeCanvas(mockCtx, mockBlob);
    vi.spyOn(document, 'createElement').mockReturnValueOnce(canvas as any);

    const file = makeFile('image/jpeg', 1024);
    const promise = compressImage(file);
    mockImageInstance.onload?.();

    const result = await promise;
    expect(result.width).toBe(1200);
    expect(result.height).toBe(900);
  });

  it('rejects when canvas context cannot be obtained', async () => {
    vi.spyOn(document, 'createElement').mockReturnValueOnce(makeCanvas(null) as any);

    const file = makeFile('image/jpeg', 1024);
    await expect(compressImage(file)).rejects.toThrow('Failed to get canvas context');
  });

  it('rejects when toBlob returns null', async () => {
    const mockCtx = { drawImage: vi.fn() };
    vi.spyOn(document, 'createElement').mockReturnValueOnce(makeCanvas(mockCtx, null) as any);

    const file = makeFile('image/jpeg', 1024);
    const promise = compressImage(file);
    mockImageInstance.onload?.();

    await expect(promise).rejects.toThrow('Failed to compress image');
  });

  it('rejects when the image fails to load', async () => {
    const mockCtx = { drawImage: vi.fn() };
    const canvas = { getContext: vi.fn(() => mockCtx), width: 0, height: 0, toBlob: vi.fn() };
    vi.spyOn(document, 'createElement').mockReturnValueOnce(canvas as any);

    const file = makeFile('image/jpeg', 1024);
    const promise = compressImage(file);
    mockImageInstance.onerror?.();

    await expect(promise).rejects.toThrow('Failed to load image');
  });

  it('uses a custom maxWidth when provided', async () => {
    mockImageInstance.width = 800;
    mockImageInstance.height = 600;

    const mockBlob = new Blob(['img'], { type: 'image/jpeg' });
    const mockCtx = { drawImage: vi.fn() };
    const canvas = makeCanvas(mockCtx, mockBlob);
    vi.spyOn(document, 'createElement').mockReturnValueOnce(canvas as any);

    const file = makeFile('image/jpeg', 1024);
    // Restrict to maxWidth=400 — image is 800px wide so it must resize
    const promise = compressImage(file, 400);
    mockImageInstance.onload?.();

    const result = await promise;
    expect(result.width).toBe(400);
    expect(result.height).toBe(300);
  });
});
