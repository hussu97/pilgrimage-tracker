/**
 * Unit tests for src/lib/utils/imageUpload.ts.
 */

// ─── Expo module mocks ────────────────────────────────────────────────────────
// jest.mock is hoisted so factories must only use literals / jest.fn() inline

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}));

import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

import {
  validateImage,
  pickImages,
  compressImage,
  type PickedImage,
} from '../lib/utils/imageUpload';

const requestPermsMock = ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;
const launchPickerMock = ImagePicker.launchImageLibraryAsync as jest.Mock;
const manipulateMock = ImageManipulator.manipulateAsync as jest.Mock;

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_DIMENSION = 4000;

function makeImage(overrides: Partial<PickedImage> = {}): PickedImage {
  return {
    uri: 'file:///tmp/test.jpg',
    width: 800,
    height: 600,
    fileSize: 1024 * 1024, // 1 MB
    ...overrides,
  };
}

// ─── validateImage() ──────────────────────────────────────────────────────────

describe('validateImage()', () => {
  it('returns valid:true for an image within all limits', () => {
    const result = validateImage(makeImage());
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('returns valid:false when fileSize exceeds 5 MB', () => {
    const result = validateImage(makeImage({ fileSize: MAX_SIZE + 1 }));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/5MB/i);
  });

  it('accepts an image at exactly the 5 MB boundary', () => {
    const result = validateImage(makeImage({ fileSize: MAX_SIZE }));
    expect(result.valid).toBe(true);
  });

  it('returns valid:false when width exceeds 4000', () => {
    const result = validateImage(makeImage({ width: MAX_DIMENSION + 1, height: 100 }));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/4000/);
  });

  it('returns valid:false when height exceeds 4000', () => {
    const result = validateImage(makeImage({ width: 100, height: MAX_DIMENSION + 1 }));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/4000/);
  });

  it('accepts an image at exactly the 4000x4000 boundary', () => {
    const result = validateImage(makeImage({ width: MAX_DIMENSION, height: MAX_DIMENSION }));
    expect(result.valid).toBe(true);
  });

  it('skips the file size check when fileSize is not provided', () => {
    const image: PickedImage = { uri: 'file:///tmp/x.jpg', width: 800, height: 600 };
    const result = validateImage(image);
    expect(result.valid).toBe(true);
  });

  it('returns error string when invalid', () => {
    const result = validateImage(makeImage({ fileSize: MAX_SIZE + 100 }));
    expect(typeof result.error).toBe('string');
    expect(result.error!.length).toBeGreaterThan(0);
  });
});

// ─── pickImages() ─────────────────────────────────────────────────────────────

describe('pickImages()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws when permission is denied', async () => {
    requestPermsMock.mockResolvedValue({ status: 'denied' });
    await expect(pickImages()).rejects.toThrow('Permission to access photos was denied');
  });

  it('returns empty array when user cancels the picker', async () => {
    requestPermsMock.mockResolvedValue({ status: 'granted' });
    launchPickerMock.mockResolvedValue({ canceled: true, assets: [] });
    const result = await pickImages();
    expect(result).toEqual([]);
  });

  it('returns mapped assets when images are selected', async () => {
    requestPermsMock.mockResolvedValue({ status: 'granted' });
    launchPickerMock.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///img1.jpg', width: 800, height: 600, fileSize: 1024 },
        { uri: 'file:///img2.jpg', width: 1920, height: 1080, fileSize: 2048 },
      ],
    });

    const result = await pickImages(5);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ uri: 'file:///img1.jpg', width: 800, height: 600, fileSize: 1024 });
    expect(result[1]).toEqual({
      uri: 'file:///img2.jpg',
      width: 1920,
      height: 1080,
      fileSize: 2048,
    });
  });

  it('passes maxCount as selectionLimit to the picker', async () => {
    requestPermsMock.mockResolvedValue({ status: 'granted' });
    launchPickerMock.mockResolvedValue({ canceled: true, assets: [] });
    await pickImages(3);
    expect(launchPickerMock).toHaveBeenCalledWith(expect.objectContaining({ selectionLimit: 3 }));
  });
});

// ─── compressImage() ──────────────────────────────────────────────────────────

describe('compressImage()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns compressed image without resizing when width <= maxWidth', async () => {
    manipulateMock
      .mockResolvedValueOnce({ uri: 'file:///img.jpg', width: 800, height: 600 })
      .mockResolvedValueOnce({ uri: 'file:///compressed.jpg', width: 800, height: 600 });

    const result = await compressImage('file:///img.jpg');
    expect(result).toEqual({ uri: 'file:///compressed.jpg', width: 800, height: 600 });
    expect(manipulateMock).toHaveBeenNthCalledWith(2, 'file:///img.jpg', [], expect.any(Object));
  });

  it('resizes image when width exceeds maxWidth', async () => {
    manipulateMock
      .mockResolvedValueOnce({ uri: 'file:///img.jpg', width: 2400, height: 1800 })
      .mockResolvedValueOnce({ uri: 'file:///resized.jpg', width: 1200, height: 900 });

    const result = await compressImage('file:///img.jpg', 1200);
    expect(result).toEqual({ uri: 'file:///resized.jpg', width: 1200, height: 900 });
    expect(manipulateMock).toHaveBeenNthCalledWith(
      2,
      'file:///img.jpg',
      [{ resize: { width: 1200, height: 900 } }],
      expect.any(Object),
    );
  });

  it('uses the provided quality parameter', async () => {
    manipulateMock
      .mockResolvedValueOnce({ uri: 'file:///img.jpg', width: 800, height: 600 })
      .mockResolvedValueOnce({ uri: 'file:///out.jpg', width: 800, height: 600 });

    await compressImage('file:///img.jpg', 1200, 0.5);
    expect(manipulateMock).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ compress: 0.5 }),
    );
  });
});
