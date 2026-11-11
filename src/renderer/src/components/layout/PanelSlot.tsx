import { memo } from 'react'
import { useStore } from '../../store'
import { resizePanel, resizePanelWidth } from '../../layoutActions'
import { BottomPanel } from '../BottomPanel'
import { Resizer } from '../Resizer'
import { useFocusRegion } from '../common/useFocusRegion'

const Panel = memo(BottomPanel)

/** Container of the bottom panel and its handle: height and width are subscribed here, not in `App`. */
export function PanelSlot() {
  const panelContainerRef = useFocusRegion<HTMLDivElement>('panelContainer')
  const terminalVisible = useStore((s) => s.terminalVisible)
  const panelHeight = useStore((s) => s.panelHeight)
  const panelWidth = useStore((s) => s.panelWidth)
  const panelRight = useStore((s) => s.panelPosition === 'right')
  // Maximized only applies with the panel open; the editor stays mounted (hidden).
  const maximized = useStore((s) => s.panelMaximized && s.terminalVisible)
  return (
    <div
      ref={panelContainerRef}
      className={`panel-container${maximized ? ' maximized' : ''}`}
      hidden={!terminalVisible}
      style={{
        ...(maximized ? {} : panelRight ? { width: panelWidth } : { height: panelHeight })
      }}
    >
      {!maximized &&
        (panelRight ? <Resizer axis="x" onDrag={resizePanelWidth} /> : <Resizer axis="y" onDrag={resizePanel} />)}
      <Panel />
    </div>
  )
}
