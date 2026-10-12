/**
 * sync.js - Data Synchronization Engine for Google Sheets & Google Drive
 */

import { getPendingSurveys, saveSurvey, getSetting } from './db.js';
import { sendSystemNotification, showToast } from './notify.js';

let isSyncing = false;
const syncListeners = new Set();

export function onSyncChange(callback) {
  syncListeners.add(callback);
  return () => syncListeners.delete(callback);
}

function notifySyncListeners(state) {
  syncListeners.forEach(cb => {
    try { cb(state); } catch (e) { console.error(e); }
  });
}

export function isOnline() {
  return navigator.onLine;
}

/**
 * Sync a single survey to Google Apps Script
 */
export async function syncSingleSurvey(survey, scriptUrl) {
  if (!scriptUrl) {
    throw new Error('Chưa cấu hình Google Apps Script URL trong mục Cài đặt.');
  }

  // Validate URL to prevent common mistakes
  if (scriptUrl.includes('docs.google.com/spreadsheets')) {
    throw new Error('Bạn đang dán nhầm link Google Sheet! Cần dán URL Ứng dụng web (Web App) có đuôi /exec của Google Apps Script.');
  }

  if (!scriptUrl.includes('script.google.com/macros/s/')) {
    throw new Error('URL không hợp lệ. URL Web App hợp lệ phải bắt đầu bằng https://script.google.com/macros/s/.../exec');
  }

  const payload = {
    action: 'addSurvey',
    id: survey.id,
    interviewer: survey.interviewer,
    content: survey.content,
    timestamp: survey.timestamp,
    timeFormatted: survey.timeFormatted,
    latitude: survey.location ? survey.location.latitude : '',
    longitude: survey.location ? survey.location.longitude : '',
    accuracy: survey.location ? survey.location.accuracy : '',
    mapUrl: survey.location ? survey.location.mapUrl : '',
    photoBase64: survey.photo ? survey.photo.dataUrl : '',
    photoName: `field_${survey.id}_${Date.now()}.jpg`
  };

  // Using text/plain prevents CORS preflight OPTIONS issues with Google Apps Script
  const response = await fetch(scriptUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Máy chủ phản hồi mã lỗi: ${response.status}`);
  }

  const result = await response.json();

  if (result.status !== 'success') {
    throw new Error(result.message || 'Lỗi xử lý từ Google Apps Script.');
  }

  // Update local record
  survey.syncStatus = 'synced';
  survey.syncedAt = new Date().toISOString();
  survey.driveUrl = result.driveUrl || '';
  survey.syncError = null;
  await saveSurvey(survey);

  return result;
}

/**
 * Sync all pending surveys
 */
export async function syncAllPending(isAuto = false) {
  if (isSyncing) {
    console.log('[Sync] Synchronization already in progress...');
    return { success: 0, failed: 0, total: 0 };
  }

  if (!navigator.onLine) {
    if (!isAuto) {
      showToast('Thiết bị đang Offline. Dữ liệu sẽ tự động đồng bộ khi có mạng internet.', 'warning');
    }
    return { success: 0, failed: 0, total: 0 };
  }

  const scriptUrl = await getSetting('scriptUrl');
  if (!scriptUrl) {
    if (!isAuto) {
      showToast('Vui lòng vào tab "Cài đặt" để nhập URL Google Apps Script trước khi đồng bộ.', 'warning');
    }
    return { success: 0, failed: 0, total: 0 };
  }

  const pending = await getPendingSurveys();
  if (pending.length === 0) {
    if (!isAuto) {
      showToast('Tất cả dữ liệu đã được đồng bộ lên Google Sheets!', 'info');
    }
    return { success: 0, failed: 0, total: 0 };
  }

  isSyncing = true;
  notifySyncListeners({ isSyncing: true, current: 0, total: pending.length });

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < pending.length; i++) {
    const item = pending[i];
    notifySyncListeners({ isSyncing: true, current: i + 1, total: pending.length, currentItem: item });

    try {
      await syncSingleSurvey(item, scriptUrl);
      successCount++;
    } catch (err) {
      console.error(`[Sync] Error syncing survey #${item.id}:`, err);
      failCount++;
      item.syncError = err.message;
      await saveSurvey(item);
    }
  }

  isSyncing = false;
  notifySyncListeners({ isSyncing: false, success: successCount, failed: failCount, total: pending.length });

  if (successCount > 0) {
    const msg = `Đã đồng bộ thành công ${successCount} phiên điều tra lên Google Sheet!`;
    showToast(msg, 'success');
    sendSystemNotification('Đồng bộ hoàn tất', {
      body: msg
    });
  }

  if (failCount > 0) {
    showToast(`Có ${failCount} phiên chưa đồng bộ được. Hãy kiểm tra kết nối mạng hoặc URL Apps Script.`, 'error');
  }

  return { success: successCount, failed: failCount, total: pending.length };
}

/**
 * Setup auto sync triggers on network reconnect
 */
export function initAutoSync() {
  window.addEventListener('online', async () => {
    console.log('[Sync] Network reconnected (online)');
    showToast('Đã khôi phục kết nối mạng internet. Đang tự động đồng bộ...', 'info');
    try {
      const registration = await navigator.serviceWorker?.ready;
      if (registration && 'sync' in registration) {
        await registration.sync.register('field-survey-sync');
        return;
      }
    } catch (error) {
      console.warn('[Sync] Background Sync unavailable, using foreground fallback.', error);
    }
    setTimeout(() => syncAllPending(true), 1500);
  });

  window.addEventListener('offline', () => {
    console.log('[Sync] Network lost (offline)');
    showToast('Thiết bị đang Offline. Mọi dữ liệu và ảnh sẽ được lưu trữ an toàn trong máy.', 'warning');
  });
}
