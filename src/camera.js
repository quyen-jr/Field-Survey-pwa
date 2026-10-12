/**
 * camera.js - Field Photo Capture & Client-side Compression
 */

/**
 * Compresses an image file or blob via Canvas to max dimensions and optimal quality
 * @param {File|Blob} file 
 * @param {number} maxWidth 
 * @param {number} maxHeight 
 * @param {number} quality 
 * @returns {Promise<{ dataUrl: string, size: number, width: number, height: number }>}
 */
export async function compressImage(file, maxWidth = 1400, maxHeight = 1400, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calculate scaling ratio
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Draw image with crisp smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Add optional timestamp watermark in bottom right for field survey authenticity
        const now = new Date();
        const watermarkText = now.toLocaleString('vi-VN');
        ctx.font = 'bold 16px sans-serif';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        const textMetrics = ctx.measureText(watermarkText);
        ctx.fillRect(width - textMetrics.width - 24, height - 34, textMetrics.width + 16, 26);
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(watermarkText, width - textMetrics.width - 16, height - 16);

        // Export as JPEG
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        
        // Approximate size in bytes
        const head = 'data:image/jpeg;base64,';
        const base64Length = dataUrl.length - head.length;
        const sizeInBytes = Math.round((base64Length * 3) / 4);

        resolve({
          dataUrl,
          size: sizeInBytes,
          width,
          height,
          timestamp: now.toISOString()
        });
      };

      img.onerror = (err) => reject(new Error('Lỗi khi tải ảnh để xử lý nén: ' + err));
    };

    reader.onerror = (err) => reject(new Error('Không thể đọc file ảnh: ' + err));
  });
}

/**
 * Format bytes to readable KB/MB
 */
export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
