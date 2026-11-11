import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.quang.stackflow',
  appName: 'StackFlow',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
