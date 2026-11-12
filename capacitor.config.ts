import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.quang.stackflow',
  appName: 'StackFlow',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['alert', 'sound'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_stackflow',
      iconColor: '#6366F1',
    },
  },
};

export default config;
