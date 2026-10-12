import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export function getRuntimeLabel() {
  return isNativeApp() ? `Android (${Capacitor.getPlatform()})` : 'PWA Web';
}

export async function selectNativePhoto(source = 'camera') {
  if (!isNativeApp()) return null;

  const image = await Camera.getPhoto({
    quality: 88,
    allowEditing: false,
    correctOrientation: true,
    resultType: CameraResultType.DataUrl,
    source: source === 'gallery' ? CameraSource.Photos : CameraSource.Camera,
    saveToGallery: false,
    promptLabelHeader: 'Ảnh hiện trường',
    promptLabelPhoto: 'Chọn từ thư viện',
    promptLabelPicture: 'Chụp ảnh'
  });

  if (!image.dataUrl) {
    throw new Error('Plugin Camera không trả về dữ liệu ảnh.');
  }

  const response = await fetch(image.dataUrl);
  return response.blob();
}
