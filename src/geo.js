/**
 * geo.js - Geolocation Manager for Field Survey
 */

import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

function normalizePosition(position) {
  const { latitude, longitude, accuracy } = position.coords;
  return {
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6)),
    accuracy: Math.round(accuracy),
    timestamp: position.timestamp,
    mapUrl: `https://www.google.com/maps?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`,
    displayStr: `${latitude.toFixed(5)}°, ${longitude.toFixed(5)}° (±${Math.round(accuracy)}m)`
  };
}

export async function getCurrentCoordinates() {
  if (Capacitor.isNativePlatform()) {
    const permission = await Geolocation.requestPermissions();
    if (permission.location === 'denied' && permission.coarseLocation === 'denied') {
      throw new Error('Bạn đã từ chối quyền vị trí. Hãy bật quyền GPS trong Cài đặt Android.');
    }

    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 5000
    });
    return normalizePosition(position);
  }

  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Thiết bị hoặc trình duyệt không hỗ trợ GPS Geolocation.'));
      return;
    }

    const options = {
      enableHighAccuracy: true, // Request precise GPS chip reading
      timeout: 12000,           // 12 seconds timeout
      maximumAge: 5000          // Max 5s cached position
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve(normalizePosition(position));
      },
      (error) => {
        let msg = 'Không thể lấy tọa độ GPS.';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            msg = 'Bạn đã từ chối cấp quyền truy cập vị trí. Hãy bật lại quyền Vị trí (GPS) trên trình duyệt.';
            break;
          case error.POSITION_UNAVAILABLE:
            msg = 'Tín hiệu GPS không khả dụng tại vị trí hiện tại.';
            break;
          case error.TIMEOUT:
            msg = 'Hết thời gian chờ lấy tín hiệu GPS. Vui lòng bấm thử lại.';
            break;
        }
        reject(new Error(msg));
      },
      options
    );
  });
}
