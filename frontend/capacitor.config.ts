import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.brittrade.app',
  appName: 'BritTrade',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    hostname: 'brittrade.pages.dev'
  }
};

export default config;
