import { t } from '@shared/i18n'
import type { TabAction, TabMenuOptions } from '@shared/types'
import { popupChoice } from '../window/nativeUi'
import { bool, record } from '../validate/args'
import { handle } from './typed'

// The renderer is untrusted: anything that is not `true` counts as `false`.
function parseOptions(value: unknown): TabMenuOptions {
  const o = record(value)
  return {
    hasOthers: bool(o.hasOthers),
    hasRight: bool(o.hasRight),
    hasSaved: bool(o.hasSaved),
    isFile: bool(o.isFile),
    canCompare: bool(o.canCompare)
  }
}

export function registerTabsHandlers(): void {
  handle('tabs:contextMenu', (e, raw: unknown) => {
    const options = parseOptions(raw)
    const { common, app, commands } = t()
    const compare = options.isFile
      ? ([
          { type: 'separator' },
          { label: commands.titles['editor.selectForCompare'], value: 'selectForCompare' },
          {
            label: commands.titles['editor.compareWithSelected'],
            enabled: options.canCompare,
            value: 'compareWithSelected'
          }
        ] as const)
      : []
    return popupChoice<TabAction>(e.sender, [
      { label: common.close, value: 'close' },
      { label: app.tabMenu.closeOthers, enabled: options.hasOthers, value: 'closeOthers' },
      { label: app.tabMenu.closeRight, enabled: options.hasRight, value: 'closeRight' },
      { label: app.tabMenu.closeSaved, enabled: options.hasSaved, value: 'closeSaved' },
      { type: 'separator' },
      { label: app.tabMenu.copyPath, value: 'copyPath' },
      { label: app.tabMenu.reveal, value: 'reveal' },
      ...compare
    ])
  })
}
