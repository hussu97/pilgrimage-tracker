/**
 * Image upload utilities for web app.
 * Handles validation, compression, and resizing of images before upload.
 */

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate an image file before upload.
 */
export function validateImageFile(file: File): ValidationResult {
  // Check file type
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: "Only JPEG, PNG, and WebP images are allowed",
    };
  }

  // Check file size (max 5MB)
  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  if (file.size > MAX_SIZE) {
    return {
      valid: false,
      error: "Image size must be less than 5MB",
    };
  }

  return { valid: true };
}

/**
 * Compress an image file using Canvas API.
 * Resizes to max width and compresses to specified JPEG quality.
 */
export async function compressImage(
  file: File,
  maxWidth: number = 1200,
  quality: number = 0.85
): Promise<CompressedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      reject(new Error("Failed to get canvas context"));
      return;
    }

    img.onload = () => {
      let { width, height } = img;

      // Resize if width > maxWidth, maintaining aspect ratio
      if (width > maxWidth) {
        const ratio = maxWidth / width;
        width = maxWidth;
        height = Math.floor(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;

      // Draw image on canvas
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to JPEG blob with specified quality
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to compress image"));
            return;
          }

          resolve({
            blob,
            width,
            height,
          });
        },
        "image/jpeg",
        quality
      );
    };

    img.onerror = () => {
      reject(new Error("Failed to load image"));
    };

    // Load the image
    img.src = URL.createObjectURL(file);
  });
}
