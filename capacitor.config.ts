import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cathanger.game',
  appName: 'Cat Hanger',
  webDir: 'dist',
  android: {
    backgroundColor: '#140c1c',
  },
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
};

export default config;
