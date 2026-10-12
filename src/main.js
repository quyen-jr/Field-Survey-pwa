/**
 * main.js - Master Application Controller for Field Survey PWA
 */

import { initDB, saveSurvey, getAllSurveys, deleteSurvey, getSetting, setSetting } from './db.js';
import { getCurrentCoordinates } from './geo.js';
import { compressImage, formatBytes } from './camera.js';
import { syncAllPending, syncSingleSurvey, onSyncChange, isOnline, initAutoSync } from './sync.js';
import { showToast, requestNotificationPermission, sendSystemNotification } from './notify.js';
import { getRuntimeLabel, isNativeApp, selectNativePhoto } from './native.js';

// State variables
let currentGPS = null;
let currentPhotoData = null;
let activeFilter = 'all';

// DOM Elements
const el = {
  // Navigation
  tabButtons: document.querySelectorAll('.nav-item'),
  tabPanes: document.querySelectorAll('.tab-pane'),
  navPendingBadge: document.getElementById('nav-pending-badge'),
  networkBadge: document.getElementById('network-badge'),
  networkText: document.getElementById('network-text'),
  btnRequestNotify: document.getElementById('btn-request-notify'),
  btnThemeToggle: document.getElementById('btn-theme-toggle'),
  themeIcon: document.getElementById('theme-icon'),
  
  // Survey Form
  liveTimeDisplay: document.getElementById('live-time-display'),
  surveyForm: document.getElementById('survey-form'),
  interviewerName: document.getElementById('interviewer-name'),
  surveyContent: document.getElementById('survey-content'),
  gpsCoords: document.getElementById('gps-coords'),
  gpsAccuracy: document.getElementById('gps-accuracy'),
  btnRefreshGps: document.getElementById('btn-refresh-gps'),
  btnViewMap: document.getElementById('btn-view-map'),
  btnCameraCapture: document.getElementById('btn-camera-capture'),
  btnGalleryPick: document.getElementById('btn-gallery-pick'),
  cameraCaptureInput: document.getElementById('camera-capture-input'),
  fileGalleryInput: document.getElementById('file-gallery-input'),
  photoPreviewCard: document.getElementById('photo-preview-card'),
  photoPreviewImg: document.getElementById('photo-preview-img'),
  photoMetaSize: document.getElementById('photo-meta-size'),
  btnRemovePhoto: document.getElementById('btn-remove-photo'),
  btnSaveSurvey: document.getElementById('btn-save-survey'),
  
  // History Tab
  statTotal: document.getElementById('stat-total'),
  statSynced: document.getElementById('stat-synced'),
  statPending: document.getElementById('stat-pending'),
  btnSyncAll: document.getElementById('btn-sync-all'),
  syncBannerTitle: document.getElementById('sync-banner-title'),
  syncBannerSub: document.getElementById('sync-banner-sub'),
  filterChips: document.querySelectorAll('.chip'),
  surveysList: document.getElementById('surveys-list'),
  
  // Settings Tab
  settingScriptUrl: document.getElementById('setting-script-url'),
  btnSaveSettings: document.getElementById('btn-save-settings'),
  btnTestScript: document.getElementById('btn-test-script'),
  btnCopyCode: document.getElementById('btn-copy-code'),
  btnExportJson: document.getElementById('btn-export-json'),
  btnClearCache: document.getElementById('btn-clear-cache'),
  
  // Modal
  imageModal: document.getElementById('image-modal'),
  modalImage: document.getElementById('modal-image'),
  modalClose: document.getElementById('modal-close')
};

/* ==========================================================================
   INITIALIZATION
   ========================================================================== */

async function initApp() {
  console.log('[App] Initializing Field Survey PWA...');

  // 1. Initialize IndexedDB
  await initDB();

  // Show whether this build runs as an installable PWA or a Capacitor app.
  document.getElementById('sub-header-text').textContent = `Khảo sát offline • ${getRuntimeLabel()}`;

  // 2. Register Service Worker for Offline PWA
  registerServiceWorker();
  listenForServiceWorkerMessages();

  // 3. Setup Network Status Monitoring & Auto-Sync
  setupNetworkMonitor();
  initAutoSync();

  // 4. Setup Clock Tick
  startLiveClock();

  // 5. Load Settings & Saved Values
  await loadSavedSettings();

  // 6. Request Location on Startup
  fetchLocation();

  // 7. Load History
  await refreshSurveysHistory();

  // 8. Attach Event Listeners
  setupEventListeners();

  // 9. Listen for Sync Engine Events
  onSyncChange((state) => {
    handleSyncStateChange(state);
  });
}

/* ==========================================================================
   SERVICE WORKER & OFFLINE SETUP
   ========================================================================== */

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.log('[ServiceWorker] Registered successfully with scope:', reg.scope);
        })
        .catch((err) => {
          console.warn('[ServiceWorker] Registration failed:', err);
        });
    });
  }
}

function listenForServiceWorkerMessages() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'BACKGROUND_SYNC_COMPLETE') {
      showToast(`Đã đồng bộ nền ${event.data.count} bản ghi lên Google Sheets.`, 'success');
      refreshSurveysHistory();
    }
  });
}

function setupNetworkMonitor() {
  const updateStatus = () => {
    const online = isOnline();
    if (online) {
      el.networkBadge.classList.remove('offline');
      el.networkText.textContent = 'Online';
    } else {
      el.networkBadge.classList.add('offline');
      el.networkText.textContent = 'Offline';
    }
  };

  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  updateStatus();
}

/* ==========================================================================
   SETTINGS & CLOCK
   ========================================================================== */

async function loadSavedSettings() {
  // Script URL
  const scriptUrl = await getSetting('scriptUrl', '');
  el.settingScriptUrl.value = scriptUrl;

  // Interviewer name default
  const defaultName = await getSetting('interviewerName', '');
  if (defaultName) {
    el.interviewerName.value = defaultName;
  }

  // Theme preference
  const savedTheme = await getSetting('theme', 'light');
  applyTheme(savedTheme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  el.themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
  setSetting('theme', theme);
}

function startLiveClock() {
  const updateClock = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('vi-VN', {
      weekday: 'long',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const timeStr = now.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    el.liveTimeDisplay.textContent = `${dateStr} • ${timeStr}`;
  };

  updateClock();
  setInterval(updateClock, 1000);
}

/* ==========================================================================
   GPS GEOLOCATION
   ========================================================================== */

async function fetchLocation() {
  el.gpsCoords.textContent = 'Đang dò tìm tọa độ GPS...';
  el.gpsAccuracy.textContent = 'Bật định vị điện thoại để có độ chính xác cao nhất';
  el.btnRefreshGps.disabled = true;

  try {
    const coords = await getCurrentCoordinates();
    currentGPS = coords;
    el.gpsCoords.textContent = `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`;
    el.gpsAccuracy.textContent = `Sai số: ±${coords.accuracy} mét • Cập nhật lúc ${new Date(coords.timestamp).toLocaleTimeString('vi-VN')}`;
    el.btnViewMap.href = coords.mapUrl;
    el.btnViewMap.style.display = 'inline-flex';
  } catch (err) {
    el.gpsCoords.textContent = 'Chưa lấy được tọa độ';
    el.gpsAccuracy.textContent = err.message;
    el.btnViewMap.style.display = 'none';
  } finally {
    el.btnRefreshGps.disabled = false;
  }
}

/* ==========================================================================
   CAMERA & PHOTO COMPRESSION
   ========================================================================== */

async function handlePhotoSelected(file) {
  if (!file) return;

  try {
    showToast('Đang nén & đóng dấu ảnh hiện trường...', 'info', 1800);
    const compressed = await compressImage(file);
    currentPhotoData = compressed;

    // Show preview
    el.photoPreviewImg.src = compressed.dataUrl;
    el.photoMetaSize.textContent = `Kích thước: ${formatBytes(compressed.size)} (${compressed.width}x${compressed.height}px)`;
    el.photoPreviewCard.classList.add('has-photo');
    showToast('Đã chụp và xử lý ảnh thành công!', 'success', 2200);
  } catch (err) {
    console.error('Error processing image:', err);
    showToast('Không thể xử lý file ảnh: ' + err.message, 'error');
  }
}

function clearCurrentPhoto() {
  currentPhotoData = null;
  el.photoPreviewImg.src = '';
  el.photoPreviewCard.classList.remove('has-photo');
  el.cameraCaptureInput.value = '';
  el.fileGalleryInput.value = '';
}

/* ==========================================================================
   SURVEY FORM SUBMIT
   ========================================================================== */

async function handleSurveySubmit(e) {
  e.preventDefault();

  const interviewer = el.interviewerName.value.trim();
  const content = el.surveyContent.value.trim();

  if (!interviewer) {
    showToast('Vui lòng nhập tên người phỏng vấn / điều tra viên.', 'warning');
    el.interviewerName.focus();
    return;
  }

  if (!content) {
    showToast('Vui lòng nhập nội dung phỏng vấn hoặc ghi nhận hiện trường.', 'warning');
    el.surveyContent.focus();
    return;
  }

  el.btnSaveSurvey.disabled = true;
  el.btnSaveSurvey.innerHTML = `<span>Đang lưu trữ...</span>`;

  try {
    const now = new Date();
    const surveyId = `SURVEY-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const newSurvey = {
      id: surveyId,
      interviewer,
      content,
      timestamp: now.toISOString(),
      timeFormatted: now.toLocaleString('vi-VN'),
      location: currentGPS ? {
        latitude: currentGPS.latitude,
        longitude: currentGPS.longitude,
        accuracy: currentGPS.accuracy,
        mapUrl: currentGPS.mapUrl
      } : null,
      photo: currentPhotoData ? {
        dataUrl: currentPhotoData.dataUrl,
        size: currentPhotoData.size,
        width: currentPhotoData.width,
        height: currentPhotoData.height
      } : null,
      syncStatus: 'pending',
      syncedAt: null,
      driveUrl: '',
      syncError: null
    };

    // Save to IndexedDB locally
    await saveSurvey(newSurvey);

    // Ask supported browsers to retry the IndexedDB queue even if the page closes.
    await registerBackgroundSync();

    // Persist interviewer name for future forms
    await setSetting('interviewerName', interviewer);

    // Form feedback
    showToast('Đã lưu phiên phỏng vấn vào bộ nhớ máy thành công!', 'success');
    sendSystemNotification('Ghi nhận thành công', {
      body: `Phiên điều tra của ${interviewer} đã được lưu an toàn.`
    });

    // Reset Form Fields (keep interviewer name)
    el.surveyContent.value = '';
    clearCurrentPhoto();
    fetchLocation(); // Fresh coordinates for next survey

    // Refresh history screen
    await refreshSurveysHistory();

    // If online and script URL is configured, trigger sync in background
    const scriptUrl = await getSetting('scriptUrl');
    if (isOnline() && scriptUrl) {
      setTimeout(() => {
        syncAllPending(true).then(() => refreshSurveysHistory());
      }, 1000);
    }

  } catch (err) {
    console.error('Error saving survey:', err);
    showToast('Lỗi khi lưu phiên điều tra: ' + err.message, 'error');
  } finally {
    el.btnSaveSurvey.disabled = false;
    el.btnSaveSurvey.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
        <polyline points="17 21 17 13 7 13 7 21"></polyline>
        <polyline points="7 3 7 8 15 8"></polyline>
      </svg>
      <span>LƯU PHIÊN ĐIỀU TRA (OFFLINE/ONLINE)</span>
    `;
  }
}

/* ==========================================================================
   HISTORY & SESSIONS MANAGEMENT
   ========================================================================== */

async function refreshSurveysHistory() {
  const allSurveys = await getAllSurveys();
  
  // Calculate statistics
  const total = allSurveys.length;
  const synced = allSurveys.filter(s => s.syncStatus === 'synced').length;
  const pending = allSurveys.filter(s => s.syncStatus === 'pending').length;

  el.statTotal.textContent = total;
  el.statSynced.textContent = synced;
  el.statPending.textContent = pending;

  // Bottom Nav badge
  if (pending > 0) {
    el.navPendingBadge.textContent = pending;
    el.navPendingBadge.style.display = 'block';
  } else {
    el.navPendingBadge.style.display = 'none';
  }

  // Update sync banner
  if (pending > 0) {
    el.syncBannerTitle.textContent = `Có ${pending} phiên đang chờ đồng bộ`;
    el.syncBannerSub.textContent = isOnline() 
      ? 'Nhấn nút bên dưới để gửi ngay lên Google Sheet & Drive'
      : 'Thiết bị đang Offline. Sẽ tự gửi khi có kết nối lại';
    el.btnSyncAll.disabled = false;
  } else {
    el.syncBannerTitle.textContent = 'Dữ liệu đã được đồng bộ hoàn toàn';
    el.syncBannerSub.textContent = 'Tất cả các bản ghi đã nằm trên Google Sheet';
    el.btnSyncAll.disabled = true;
  }

  // Filter list
  let filtered = allSurveys;
  if (activeFilter === 'pending') {
    filtered = allSurveys.filter(s => s.syncStatus === 'pending');
  } else if (activeFilter === 'synced') {
    filtered = allSurveys.filter(s => s.syncStatus === 'synced');
  }

  renderSurveysList(filtered);
}

function renderSurveysList(surveys) {
  if (!surveys || surveys.length === 0) {
    el.surveysList.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
        <div style="font-size: 2.5rem; margin-bottom: 8px;">📂</div>
        <p style="font-weight: 600; font-size: 0.95rem;">Chưa có phiên điều tra nào trong mục này</p>
        <p style="font-size: 0.8rem; margin-top: 4px;">Hãy chuyển sang tab "Khảo Sát" để bắt đầu ghi nhận hiện trường.</p>
      </div>
    `;
    return;
  }

  el.surveysList.innerHTML = surveys.map(s => {
    const isSynced = s.syncStatus === 'synced';
    const statusClass = isSynced ? 'synced' : 'pending';
    const statusText = isSynced ? '✓ Đã lên Sheet' : '⏳ Chờ đồng bộ';

    const locationStr = s.location 
      ? `${s.location.latitude.toFixed(5)}, ${s.location.longitude.toFixed(5)} (±${s.location.accuracy}m)`
      : 'Không có tọa độ';

    const mapLinkHtml = s.location && s.location.mapUrl 
      ? `<a href="${s.location.mapUrl}" target="_blank" class="btn-sm" style="padding: 4px 8px;">🗺️ Xem Maps</a>`
      : '';

    const driveLinkHtml = s.driveUrl
      ? `<a href="${s.driveUrl}" target="_blank" class="btn-sm" style="padding: 4px 8px; color: #38bdf8; border-color: #0284c7;">📁 Mở ảnh Drive</a>`
      : '';

    const errorMsgHtml = s.syncError
      ? `<div style="background: rgba(244,63,94,0.12); border: 1px solid rgba(244,63,94,0.3); border-radius: 6px; padding: 6px 10px; font-size: 0.76rem; color: #fb7185; margin-top: 6px;">
          ⚠️ <strong>Lỗi gửi:</strong> ${escapeHtml(s.syncError)}
          <br><span style="color: var(--text-secondary); font-size: 0.72rem;">👉 Vào tab <strong>Cài Đặt</strong> để kiểm tra lại URL Web App và quyền truy cập "Bất kỳ ai (Anyone)".</span>
        </div>`
      : '';

    const photoThumbnailHtml = s.photo && s.photo.dataUrl
      ? `<img src="${s.photo.dataUrl}" alt="Thumbnail" class="survey-thumbnail" data-photo-id="${s.id}">`
      : `<div class="survey-thumbnail" style="display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:0.75rem;">Không ảnh</div>`;

    return `
      <div class="survey-item" data-id="${s.id}">
        <div class="survey-item-header">
          <div>
            <div class="survey-item-title">
              <span>👤</span> ${escapeHtml(s.interviewer)}
            </div>
            <div class="survey-item-time">🕒 ${s.timeFormatted}</div>
          </div>
          <span class="sync-pill ${statusClass}">${statusText}</span>
        </div>

        <div class="survey-body">
          ${photoThumbnailHtml}
          <div class="survey-content-text">
            ${escapeHtml(s.content)}
            ${errorMsgHtml}
          </div>
        </div>

        <div class="survey-footer">
          <div style="display:flex; align-items:center; gap: 6px;">
            <span>📍 ${locationStr}</span>
            ${mapLinkHtml}
            ${driveLinkHtml}
          </div>

          <div class="survey-actions">
            ${!isSynced ? `<button class="btn-sm btn-single-sync" data-id="${s.id}" title="Đồng bộ bản ghi này">⬆ Gửi</button>` : ''}
            <button class="btn-sm btn-delete-survey" data-id="${s.id}" style="color: var(--accent-rose);" title="Xóa">🗑️</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Attach dynamic item listeners
  // 1. Thumbnail click to open lightbox
  el.surveysList.querySelectorAll('.survey-thumbnail').forEach(thumb => {
    thumb.addEventListener('click', () => {
      const src = thumb.getAttribute('src');
      if (src) {
        openImageModal(src);
      }
    });
  });

  // 2. Single Sync button
  el.surveysList.querySelectorAll('.btn-single-sync').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      const survey = surveys.find(item => item.id === id);
      if (survey) {
        const scriptUrl = await getSetting('scriptUrl');
        if (!scriptUrl) {
          showToast('Vui lòng nhập Google Apps Script URL trong tab Cài đặt trước.', 'warning');
          return;
        }
        btn.disabled = true;
        btn.textContent = 'Đang gửi...';
        try {
          await syncSingleSurvey(survey, scriptUrl);
          showToast('Đồng bộ thành công phiên ' + survey.id, 'success');
          await refreshSurveysHistory();
        } catch (err) {
          showToast('Lỗi đồng bộ: ' + err.message, 'error');
          btn.disabled = false;
          btn.textContent = 'Thử lại';
        }
      }
    });
  });

  // 3. Delete button
  el.surveysList.querySelectorAll('.btn-delete-survey').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.getAttribute('data-id');
      if (confirm('Bạn có chắc chắn muốn xóa bản ghi này khỏi bộ nhớ máy?')) {
        await deleteSurvey(id);
        showToast('Đã xóa bản ghi.', 'info');
        await refreshSurveysHistory();
      }
    });
  });
}

function handleSyncStateChange(state) {
  if (state.isSyncing) {
    el.btnSyncAll.disabled = true;
    el.btnSyncAll.innerHTML = `<span>Đang đồng bộ (${state.current}/${state.total})...</span>`;
  } else {
    el.btnSyncAll.disabled = false;
    el.btnSyncAll.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="23 4 23 10 17 10"></polyline>
        <polyline points="1 20 1 14 7 14"></polyline>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
      </svg>
      <span>Đồng Bộ Ngay</span>
    `;
    refreshSurveysHistory();
  }
}

/* ==========================================================================
   IMAGE LIGHTBOX MODAL
   ========================================================================== */

function openImageModal(src) {
  el.modalImage.src = src;
  el.imageModal.classList.add('active');
}

function closeImageModal() {
  el.imageModal.classList.remove('active');
  el.modalImage.src = '';
}

/* ==========================================================================
   EVENT LISTENERS
   ========================================================================== */

function setupEventListeners() {
  // Tab Switching
  el.tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      el.tabButtons.forEach(b => b.classList.remove('active'));
      el.tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(targetTab).classList.add('active');

      if (targetTab === 'tab-history') {
        refreshSurveysHistory();
      }
    });
  });

  // Theme Toggle
  el.btnThemeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
  });

  // Push Notification Permission Request
  el.btnRequestNotify.addEventListener('click', async () => {
    const status = await requestNotificationPermission();
    if (status === 'granted') {
      showToast('Đã bật quyền thông báo hệ thống!', 'success');
      sendSystemNotification('Đã kích hoạt thông báo', {
        body: 'Bạn sẽ nhận được thông báo khi đồng bộ dữ liệu điều tra thành công.'
      });
    } else if (status === 'denied') {
      showToast('Quyền thông báo bị chặn. Bạn cần mở cài đặt trình duyệt để cho phép.', 'warning');
    } else {
      showToast('Trình duyệt không hỗ trợ Web Notification API.', 'info');
    }
  });

  // GPS Refresh
  el.btnRefreshGps.addEventListener('click', fetchLocation);

  // Camera/Gallery: native Capacitor plugins on Android, file inputs on the web.
  el.btnCameraCapture.addEventListener('click', async () => {
    if (!isNativeApp()) {
      el.cameraCaptureInput.click();
      return;
    }
    try {
      await handlePhotoSelected(await selectNativePhoto('camera'));
    } catch (err) {
      if (!String(err.message).toLowerCase().includes('cancel')) {
        showToast('Không thể mở camera: ' + err.message, 'error');
      }
    }
  });

  el.btnGalleryPick.addEventListener('click', async () => {
    if (!isNativeApp()) {
      el.fileGalleryInput.click();
      return;
    }
    try {
      await handlePhotoSelected(await selectNativePhoto('gallery'));
    } catch (err) {
      if (!String(err.message).toLowerCase().includes('cancel')) {
        showToast('Không thể mở thư viện ảnh: ' + err.message, 'error');
      }
    }
  });

  el.cameraCaptureInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handlePhotoSelected(e.target.files[0]);
    }
  });

  el.fileGalleryInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handlePhotoSelected(e.target.files[0]);
    }
  });

  el.btnRemovePhoto.addEventListener('click', clearCurrentPhoto);

  // Survey Form Submit
  el.surveyForm.addEventListener('submit', handleSurveySubmit);

  // History Filter Chips
  el.filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      el.filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.getAttribute('data-filter');
      refreshSurveysHistory();
    });
  });

  // Sync All Button
  el.btnSyncAll.addEventListener('click', async () => {
    await syncAllPending(false);
    await refreshSurveysHistory();
  });

  // Settings Save
  el.btnSaveSettings.addEventListener('click', async () => {
    const url = el.settingScriptUrl.value.trim();
    if (url && !url.startsWith('https://script.google.com/')) {
      showToast('Cảnh báo: URL Google Apps Script thông thường bắt đầu bằng https://script.google.com/macros/s/...', 'warning');
    }
    await setSetting('scriptUrl', url);
    showToast('Đã lưu cấu hình kết nối Google Apps Script!', 'success');
  });

  // Test Apps Script URL
  el.btnTestScript.addEventListener('click', async () => {
    const url = el.settingScriptUrl.value.trim();
    if (!url) {
      showToast('Vui lòng nhập URL trước khi kiểm tra.', 'warning');
      return;
    }
    showToast('Đang gửi tín hiệu kiểm tra đến Google Apps Script...', 'info');
    try {
      const resp = await fetch(url, { method: 'GET' });
      const data = await resp.json();
      if (data.status === 'success') {
        showToast('Kết nối thành công! ' + data.message, 'success');
      } else {
        showToast('Nhận được phản hồi: ' + JSON.stringify(data), 'info');
      }
    } catch (err) {
      showToast('Không thể kết nối đến Web App: ' + err.message + '. Vui lòng kiểm tra quyền "Bất kỳ ai" (Anyone) trên Apps Script.', 'error');
    }
  });

  // Copy Apps Script Code Button
  el.btnCopyCode.addEventListener('click', () => {
    fetch('./google-apps-script-code.txt')
      .then(res => res.text())
      .then(code => {
        navigator.clipboard.writeText(code).then(() => {
          showToast('Đã sao chép mã nguồn Google Apps Script vào Clipboard!', 'success');
        });
      })
      .catch(() => {
        // Fallback copy
        const fallbackCode = `// Xem file google-apps-script/Code.gs trong mã nguồn`;
        navigator.clipboard.writeText(fallbackCode);
        showToast('Vui lòng mở file google-apps-script/Code.gs để copy mã nguồn.', 'info');
      });
  });

  // Export JSON Backup
  el.btnExportJson.addEventListener('click', async () => {
    const allSurveys = await getAllSurveys();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(allSurveys, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `field_surveys_backup_${Date.now()}.json`);
    dlAnchorElem.click();
    showToast('Đã xuất file sao lưu JSON thành công!', 'success');
  });

  // Clear Cache
  el.btnClearCache.addEventListener('click', async () => {
    if (confirm('CẢNH BÁO: Bạn có chắc muốn xóa sạch toàn bộ bản ghi điều tra trên trình duyệt này?')) {
      const allSurveys = await getAllSurveys();
      for (const s of allSurveys) {
        await deleteSurvey(s.id);
      }
      showToast('Đã làm trống bộ nhớ đệm thành công.', 'info');
      await refreshSurveysHistory();
    }
  });

  // Modal Lightbox Close
  el.modalClose.addEventListener('click', closeImageModal);
  el.imageModal.addEventListener('click', (e) => {
    if (e.target === el.imageModal) {
      closeImageModal();
    }
  });
}

async function registerBackgroundSync() {
  if (isNativeApp() || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    if ('sync' in registration) {
      await registration.sync.register('field-survey-sync');
    }
  } catch (error) {
    console.warn('[BackgroundSync] Registration unavailable:', error);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Kick off app
initApp();
