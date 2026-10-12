import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'vn.edu.vku.fieldsurvey',
  appName: 'VKU Field Survey',
  webDir: 'dist',
  plugins: {
    Camera: {
      presentationStyle: 'fullscreen'
    },
    Geolocation: {
      enableHighAccuracy: true
    }
  }
};

export default config;
