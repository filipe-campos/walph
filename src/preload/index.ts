import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { ipcSpec } from '@shared/ipcSpec'
import type { WalphApi } from '@shared/types'
import { buildApi } from './buildApi'

const bridged = buildApi(ipcSpec, ipcRenderer)

// What is not a channel: values coming from `process`/argv and `webUtils`, which only exist in the preload.
const api: WalphApi = {
  ...bridged,
  platform: process.platform,
  isPackaged: process.argv.includes('--walph-packaged'),
  homeDir: process.argv.find((a) => a.startsWith('--walph-home='))?.slice('--walph-home='.length) ?? '',
  locale: process.argv.find((a) => a.startsWith('--walph-locale='))?.slice('--walph-locale='.length) ?? '',
  files: {
    ...bridged.files,
    pathForFile: (file) => {
      try {
        return webUtils.getPathForFile(file)
      } catch {
        return ''
      }
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
