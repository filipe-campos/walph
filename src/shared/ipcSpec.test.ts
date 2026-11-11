import { describe, expect, it } from 'vitest'
import { IPC_CHANNELS } from './ipc'
import { ipcSpec, listChannels } from './ipcSpec'

describe('ipcSpec', () => {
  const channels = listChannels(ipcSpec)
  const all = [...channels.invoke, ...channels.send, ...channels.event]

  it('no channel is declared twice', () => {
    expect(all.filter((c, i) => all.indexOf(c) !== i)).toEqual([])
  })

  it('every channel follows domain:action', () => {
    expect(all.filter((c) => !/^[a-z]+:[A-Za-z]+$/.test(c))).toEqual([])
  })

  it('IPC_CHANNELS comes from the spec', () => {
    expect(IPC_CHANNELS).toEqual(channels)
  })

  it('preserves the irregular channel names', () => {
    expect(ipcSpec.window.run.channel).toBe('window:action')
    expect(ipcSpec.tabs.showContextMenu.channel).toBe('tabs:contextMenu')
    expect(ipcSpec.settings.onChange.channel).toBe('settings:changed')
  })
})
