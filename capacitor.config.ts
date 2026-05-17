import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'cn.huickathon.syt.leavesflow',
  appName: 'leavesflow',
  webDir: 'apps/web/dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
  },
}

export default config
