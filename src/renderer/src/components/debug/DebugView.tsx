import { useEffect } from 'react'
import { useStore } from '../../store'
import { useT } from '../../i18n'
import {
  loadDebugConfigurations,
  openLaunchJson,
  selectDebugConfig,
  startDebugging,
  stopDebugging
} from '../../debugActions'
import { Button } from '../common/Button'
import { IconButton } from '../common/IconButton'
import { Select } from '../common/Select'
import { useShortcutLabel } from '../common/useShortcutLabel'
import { BreakpointsSection, CallStackSection, VariablesSection, WatchSection } from './DebugSections'

/** "Run and Debug" view: configuration + start/stop at the top, and the sections of the focused session. */
export function DebugView() {
  const t = useT()
  const m = t.debugUi.view
  const root = useStore((s) => s.root)
  const configs = useStore((s) => s.debugConfigs)
  const selected = useStore((s) => s.debugSelectedConfig)
  const running = useStore((s) => s.debugSessions.length > 0)
  const startKeys = useShortcutLabel('debug.start')
  const stopKeys = useShortcutLabel('debug.stop')

  useEffect(() => {
    void loadDebugConfigurations()
  }, [root])

  const list = configs?.configurations ?? []
  const value = list.find((c) => c.name === selected)?.name ?? list[0]?.name ?? ''
  const options = list.map((c) => ({ value: c.name, label: c.builtin ? m.builtinOption(c.name) : c.name }))

  return (
    <div className="sidebar-view debug-view">
      <div className="sidebar-title">
        <span>{m.title}</span>
        <div className="actions">
          <IconButton
            icon="codicon-gear"
            label={m.openLaunchJson}
            disabled={!root}
            onClick={() => void openLaunchJson()}
          />
        </div>
      </div>
      <div className="debug-launch">
        {running ? (
          <IconButton
            icon="codicon-debug-stop"
            className="debug-launch-stop"
            label={m.stop}
            shortcut={stopKeys}
            onClick={() => void stopDebugging()}
          />
        ) : (
          <IconButton
            icon="codicon-debug-start"
            className="debug-launch-start"
            label={m.start}
            shortcut={startKeys}
            disabled={!root || list.length === 0}
            onClick={() => void startDebugging()}
          />
        )}
        <div className="debug-launch-select">
          {list.length > 0 ? (
            <Select value={value} options={options} label={m.configuration} onChange={selectDebugConfig} />
          ) : (
            <Button size="sm" disabled={!root} onClick={() => void openLaunchJson()}>
              {m.createLaunchJson}
            </Button>
          )}
        </div>
      </div>
      {configs?.error && <div className="debug-config-error">{m.launchJsonError(configs.error)}</div>}
      <div className="debug-sections">
        {!running && <div className="debug-empty debug-hint">{m.notRunning}</div>}
        <VariablesSection />
        <WatchSection />
        <CallStackSection />
        <BreakpointsSection />
      </div>
    </div>
  )
}
