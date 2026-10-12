/**
 * notify.js - Web Notifications & In-App Toast Notifications with Sound/Vibration
 */

// Initialize Web Audio synthesizer for pleasant status chimes
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

export function playChime(type = 'success') {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      // Ascending pleasant chord
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1); // E5
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.2); // G5

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

      osc.start(now);
      osc.stop(now + 0.4);
    } else if (type === 'error') {
      // Low dual beep
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.setValueAtTime(180, now + 0.15);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

      osc.start(now);
      osc.stop(now + 0.35);
    }
  } catch (e) {
    // Audio may be blocked before first user gesture
  }
}

export function triggerVibrate(pattern = [100, 50, 100]) {
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {
      // Ignore vibration errors
    }
  }
}

/**
 * Request system notification permission
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission;
  }
  return Notification.permission;
}

/**
 * Send browser system notification
 */
export function sendSystemNotification(title, options = {}) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const defaultOptions = {
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: 'field-survey-notification',
        renotify: true,
        ...options
      };
      new Notification(title, defaultOptions);
    } catch (e) {
      console.warn('Notification error:', e);
    }
  }
}

/**
 * In-App Toast notification (UI Banner)
 */
export function showToast(message, type = 'info', duration = 3800) {
  // Play sound & vibration
  if (type === 'success') {
    playChime('success');
    triggerVibrate([80, 40, 80]);
  } else if (type === 'error') {
    playChime('error');
    triggerVibrate([150, 80, 150]);
  }

  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconMap = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };

  toast.innerHTML = `
    <div class="toast-icon">${iconMap[type] || '•'}</div>
    <div class="toast-content">${message}</div>
    <button class="toast-close" aria-label="Đóng">&times;</button>
  `;

  toastContainer.appendChild(toast);

  const removeToast = () => {
    toast.classList.add('toast-hiding');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  };

  toast.querySelector('.toast-close').addEventListener('click', removeToast);

  setTimeout(removeToast, duration);
}
