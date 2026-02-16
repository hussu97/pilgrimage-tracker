/**
 * Image upload utilities for mobile app.
 * Handles image picking, validation, compression, and resizing.
 */

import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
  fileSize?: number;
}

export interface CompressedImage {
  uri: string;
  width: number;
  height: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Pick images from the device gallery.
 * Requests permissions if needed.
 */
export async function pickImages(maxCount: number = 5): Promise<PickedImage[]> {
  // Request permission
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Permission to access photos was denied');
  }

  // Launch image picker
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    quality: 1,
    selectionLimit: maxCount,
  });

  if (result.canceled) {
    return [];
  }

  return result.assets.map((asset) => ({
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    fileSize: asset.fileSize,
  }));
}

/**
 * Validate an image before upload.
 */
export function validateImage(image: PickedImage): ValidationResult {
  // Check file size (max 5MB)
  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  if (image.fileSize && image.fileSize > MAX_SIZE) {
    return {
      valid: false,
      error: 'Image size must be less than 5MB',
    };
  }

  // Check dimensions (max 4000x4000)
  const MAX_DIMENSION = 4000;
  if (image.width > MAX_DIMENSION || image.height > MAX_DIMENSION) {
    return {
      valid: false,
      error: `Image dimensions must be less than ${MAX_DIMENSION}x${MAX_DIMENSION}`,
    };
  }

  return { valid: true };
}

/**
 * Compress an image using expo-image-manipulator.
 * Resizes to max width and compresses to specified JPEG quality.
 */
export async function compressImage(
  uri: string,
  maxWidth: number = 1200,
  quality: number = 0.85
): Promise<CompressedImage> {
  // Get image dimensions
  const imageInfo = await ImageManipulator.manipulateAsync(uri, [], {
    compress: 1,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  let manipulations: ImageManipulator.Action[] = [];

  // Resize if width > maxWidth
  if (imageInfo.width > maxWidth) {
    const ratio = maxWidth / imageInfo.width;
    const newHeight = Math.floor(imageInfo.height * ratio);

    manipulations.push({
      resize: {
        width: maxWidth,
        height: newHeight,
      },
    });
  }

  // Compress image
  const result = await ImageManipulator.manipulateAsync(uri, manipulations, {
    compress: quality,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
  };
}
