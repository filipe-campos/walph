import { memo, useId, useMemo, useState } from 'react'
import type { ClaudeEffort, ClaudeModelOption } from '@shared/types'
import { setConversationEffort, setConversationMode, setConversationModel } from '../../claudeConversationSettings'
import { EFFORT_LEVELS, effortBars, stepEffort } from '../../lib/claudeEffort'
import { PERMISSION_MODES, modeInfo } from '../../lib/claudeModes'
import { currentModelOption, modelChipName } from '../../lib/claudeModelName'
import { useT } from '../../i18n'
import { useStore } from '../../store'
import { useConversationField } from './useConversation'
import { Icon } from '../common/Icon'
import { MenuList } from '../common/MenuList'
import { ChipMenu } from './ChipMenu'

const SHORTCUT = window.api.platform === 'darwin' ? '⇧⇥' : 'Shift+Tab'

/**
 * Execution mode chip: icon + name, as in the design system; the menu describes each mode. "Bypass permissions" paints
 * in `danger` and, without `claude.allowBypassPermissions`, shows disabled explaining how to enable it (main refuses).
 */
export const ModeChip = memo(function ModeChip({
  conversationId,
  returnFocus
}: {
  conversationId: string
  returnFocus: () => void
}) {
  const t = useT()
  const m = t.claude.promptChips
  const mode = useConversationField(conversationId, (c) => c.permissionMode, 'default')
  const allowBypass = useStore((s) => s.settings['claude.allowBypassPermissions'])
  const info = modeInfo(mode)
  return (
    <ChipMenu
      label={mode === 'bypassPermissions' ? m.modeLabelBypass(info.label, SHORTCUT) : m.modeLabel(info.label, SHORTCUT)}
      testId="claude-mode-chip"
      className={`tone-${info.tone}${mode === 'bypassPermissions' ? ' danger' : ''}`}
      menuClassName="claude-mode-menu"
      returnFocus={returnFocus}
      trigger={
        <>
          {/* Auto uses the gradient bolt (AI icon); the others paint with the tone color. */}
          <Icon name={info.icon} plain={info.tone !== 'auto'} />
          <span className="claude-chip-label">{info.short}</span>
        </>
      }
    >
      {(close) => (
        <>
          <div className="claude-menu-head">{m.modeHead(SHORTCUT)}</div>
          <MenuList
            variant="option"
            idAttr="data-mode"
            close={close}
            items={PERMISSION_MODES.map((p) => {
              const locked = p.mode === 'bypassPermissions' && !allowBypass
              return {
                id: p.mode,
                label: p.label,
                icon: <Icon name={p.icon} plain={p.tone !== 'auto'} />,
                className: `tone-${p.tone}`,
                danger: p.tone === 'danger',
                checked: p.mode === mode,
                disabled: locked,
                description: locked ? (
                  <>
                    {m.bypassLocked.before}
                    <code>claude.allowBypassPermissions</code>
                    {m.bypassLocked.after}
                  </>
                ) : (
                  p.description
                ),
                onSelect: () => setConversationMode(conversationId, p.mode)
              }
            })}
          />
        </>
      )}
    </ChipMenu>
  )
})

function EffortBars({ effort }: { effort: ClaudeEffort | null }) {
  return (
    <span className="claude-bars" aria-hidden="true">
      {effortBars(effort).map((b, i) => (
        <i key={i} className={b.on ? 'on' : undefined} />
      ))}
    </span>
  )
}

/**
 * Body of the model menu: search fixed at the top, scrollable list and the effort card always visible at the bottom.
 */
function ModelMenuBody({
  conversationId,
  models,
  currentValue,
  effort,
  accepted,
  close
}: {
  conversationId: string
  models: ClaudeModelOption[]
  currentValue: string | undefined
  effort: ClaudeEffort | null
  accepted: readonly ClaudeEffort[]
  close: () => void
}) {
  const t = useT()
  const m = t.claude.promptChips
  const noteId = useId()
  const [query, setQuery] = useState('')
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return models
    // The CLI passes the model catalog through without validating: `description` may be missing.
    return models.filter((o) => {
      const fields: (string | undefined)[] = [o.displayName, o.value, o.description]
      return fields.some((v) => v?.toLowerCase().includes(q))
    })
  }, [models, query])
  const listId = useId()
  const pick = (value: string): void => {
    close()
    setConversationModel(conversationId, value)
  }

  return (
    <>
      <input
        data-autofocus
        role="searchbox"
        aria-controls={listId}
        className="claude-model-search"
        value={query}
        placeholder={m.searchModel}
        aria-label={m.searchModel}
        spellCheck={false}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing && shown[0]) {
            e.preventDefault()
            pick(shown[0].value)
          }
        }}
      />
      <div id={listId} role="group" aria-label={m.model} className="claude-model-list">
        {shown.length === 0 && <div className="empty-line muted">{m.noModels}</div>}
        <MenuList
          variant="option"
          idAttr="data-model"
          close={close}
          items={shown.map((o) => ({
            id: o.value,
            label: o.displayName,
            description: o.description,
            checked: o.value === currentValue,
            onSelect: () => setConversationModel(conversationId, o.value)
          }))}
        />
      </div>
      {accepted.length > 0 && (
        <div role="group" aria-label={m.effortGroup} aria-describedby={noteId} className="claude-effort">
          <div className="claude-effort-title">
            <span>{m.effort}</span>
            <span className="claude-menu-dim">{m.effortKeys}</span>
          </div>
          <div className="claude-effort-track">
            {[null, ...EFFORT_LEVELS].map((level) => {
              const ok = level === null || accepted.includes(level)
              return (
                <button
                  key={level ?? 'auto'}
                  type="button"
                  role="menuitemradio"
                  aria-checked={level === effort}
                  data-nav
                  data-effort={level ?? 'auto'}
                  tabIndex={-1}
                  disabled={!ok}
                  title={ok ? undefined : m.effortUnsupported}
                  className="claude-effort-level"
                  onClick={() => setConversationEffort(conversationId, level)}
                >
                  {level ?? 'auto'}
                </button>
              )
            })}
          </div>
          <p id={noteId} className="claude-effort-note">
            {m.effortNote.before}
            <code>max</code>
            {m.effortNote.after}
          </p>
        </div>
      )}
    </>
  )
}

/** "Opus ▁▃▅▇█ high" chip: menu with the models and the effort slider (auto = model default). */
export const ModelChip = memo(function ModelChip({
  conversationId,
  returnFocus
}: {
  conversationId: string
  returnFocus: () => void
}) {
  const t = useT()
  const model = useConversationField(conversationId, (c) => c.model, '')
  const models = useConversationField(conversationId, (c) => c.models, undefined)
  const effort = useConversationField(conversationId, (c) => c.effort, null)
  if (!models || models.length === 0) return null
  // The `init` model may come as a full id while the options use an alias; the chip shows only the family ("Opus").
  const current = currentModelOption(model, models)
  const accepted = current?.efforts ?? []
  const hasEffort = accepted.length > 0
  const name = modelChipName(model, current)
  const effortLabel = hasEffort ? (effort ?? 'auto') : null

  return (
    <ChipMenu
      label={
        effortLabel ? t.claude.promptChips.modelEffortLabel(name, effortLabel) : t.claude.promptChips.modelLabel(name)
      }
      testId="claude-model-chip"
      menuClassName="claude-model-menu"
      returnFocus={returnFocus}
      onArrow={(dir) => {
        if (!hasEffort) return
        const next = stepEffort(effort, accepted, dir)
        if (next === effort) return
        setConversationEffort(conversationId, next)
        // Focus follows the marked level (that is what the screen reader announces).
        requestAnimationFrame(() =>
          document
            .querySelector<HTMLElement>(`[data-testid="claude-model-chip-menu"] [data-effort="${next ?? 'auto'}"]`)
            ?.focus()
        )
      }}
      trigger={
        <>
          <span className="claude-chip-name">{name}</span>
          {hasEffort && (
            <>
              <EffortBars effort={effort} />
              <span className="claude-effort-name">{effortLabel}</span>
            </>
          )}
        </>
      }
    >
      {(close) => (
        <ModelMenuBody
          conversationId={conversationId}
          models={models}
          currentValue={current?.value}
          effort={effort}
          accepted={accepted}
          close={close}
        />
      )}
    </ChipMenu>
  )
})
