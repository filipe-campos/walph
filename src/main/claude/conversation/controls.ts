import { t } from '@shared/i18n'
import { currentModelOption } from '@shared/claudeModel'
import { CLAUDE_EFFORTS, isClaudeEffort, isClaudePermissionMode } from '@shared/claudeModes'
import type {
  ClaudeEffort,
  ClaudeError,
  ClaudeEvent,
  ClaudeModelOption,
  ClaudePermissionMode,
  ClaudeStartOptions,
  Settings
} from '@shared/types'
import type { Run, RunManager } from './run'
import { UserError } from '../../errors'

interface ControlsHost {
  readonly id: string
  emit(event: ClaudeEvent): void
  getSettings(): Settings
  isClosed(): boolean
  /** Unrecoverable failure: the conversation closes. */
  fail(error: ClaudeError): void
}

/**
 * Permission mode, bypass, model and effort of a conversation. The values apply to the current process and are reread
 * on relaunch; `overrides` keeps the user's choice that the CLI `init` must not overwrite.
 */
export class Controls {
  permissionMode: ClaudePermissionMode
  model: string
  effort: ClaudeEffort | undefined
  /** The current process started with `allowDangerouslySkipPermissions` (otherwise the CLI refuses bypass). */
  bypassCapable = false
  /** User choices in this run: the CLI `init` does not overwrite them (dropped on relaunch or on the next `result`). */
  overrides: { model?: string; permissionMode?: ClaudePermissionMode } = {}
  /** Notice to show as soon as `init` arrives (e.g. the initial mode asked for bypass without the setting on). */
  readonly startNotice: string | null = null

  constructor(
    private readonly host: ControlsHost,
    private readonly runs: Pick<RunManager, 'current' | 'open' | 'live' | 'settle'>,
    options: ClaudeStartOptions
  ) {
    const settings = host.getSettings()
    const requested = options.permissionMode ?? settings['claude.initialPermissionMode']
    // Bypass never comes from the initial mode/the screen alone: it requires the user setting.
    if (requested === 'bypassPermissions' && settings['claude.allowBypassPermissions'] !== true) {
      this.permissionMode = 'default'
      this.startNotice = t().claudeHost.conversation.bypassDisabledAtStart
    } else this.permissionMode = requested
    // The default effort setting only applies to a new conversation: a resume keeps what was saved.
    this.effort = options.effort ?? (options.resume ? undefined : settings['claude.effort'] || undefined)
    this.model = options.model ?? settings['claude.model']
  }

  /**
   * Before starting a process: clears the choices, and a relaunch (rewind/fork) with bypass already turned off does not
   * keep the mode.
   */
  prepareLaunch(allowBypass: boolean): void {
    this.overrides = {}
    if (this.permissionMode === 'bypassPermissions' && !allowBypass) this.permissionMode = 'default'
    this.bypassCapable = allowBypass
  }

  /** The CLI `init`: the user's choice wins over what the CLI reports. */
  adoptInit(model: string, permissionMode: ClaudePermissionMode | null): void {
    this.model = this.overrides.model ?? model
    if (this.overrides.permissionMode) this.permissionMode = this.overrides.permissionMode
    else if (permissionMode) this.permissionMode = permissionMode
  }

  /** The CLI switched models on its own (refusal): the next `init` must not undo the switch. */
  adoptModel(model: string): void {
    this.model = model
    this.overrides.model = model
  }

  /** The approved plan chose the run's mode. */
  adoptPermissionMode(mode: ClaudePermissionMode): void {
    this.permissionMode = mode
    this.overrides.permissionMode = mode
    this.host.emit({ type: 'permissionMode', id: this.host.id, mode })
  }

  /** End of turn: the CLI `init` applies again. */
  clearOverrides(): void {
    this.overrides = {}
  }

  /**
   * The CLI silently downgrades an effort the model does not support; here the effective value (chip and session)
   * follows: it goes to the highest supported level below it, or back to the model default.
   */
  async clampEffort(run: Run, models: ClaudeModelOption[]): Promise<void> {
    const effort = this.effort
    if (!effort) return
    const option = currentModelOption(this.model || 'default', models)
    if (!option || option.efforts.includes(effort)) return
    const at = CLAUDE_EFFORTS.indexOf(effort)
    const next = CLAUDE_EFFORTS.slice(0, at)
      .reverse()
      .find((e) => option.efforts.includes(e))
    try {
      await run.query.applyFlagSettings({ effortLevel: next ?? null })
    } catch {
      // Without confirmation from the CLI the local value stays as is.
      return
    }
    if (run === this.runs.current && this.effort === effort) this.effort = next
  }

  async setPermissionMode(mode: ClaudePermissionMode): Promise<void> {
    if (!isClaudePermissionMode(mode)) throw new UserError(t().claudeHost.conversation.invalidPermissionMode)
    await this.runs.settle()
    const run = this.runs.live()
    if (mode === 'bypassPermissions') {
      if (this.host.getSettings()['claude.allowBypassPermissions'] !== true) {
        throw new UserError(t().claudeHost.conversation.bypassDisabled)
      }
      // The CLI only accepts the mode if the process started with the flag: we warn before it refuses.
      if (run && !this.bypassCapable) {
        throw new UserError(t().claudeHost.conversation.bypassNotCapable)
      }
    }
    // While dormant, the mode goes with the relaunch (`launch` reads `permissionMode` and the bypass setting).
    if (run) await run.query.setPermissionMode(mode)
    // The setting may have been turned off while the CLI switched modes: bypass must not stay in effect.
    if (mode === 'bypassPermissions' && this.host.getSettings()['claude.allowBypassPermissions'] !== true) {
      if (run) await this.leaveBypass(run)
      throw new UserError(t().claudeHost.conversation.bypassTurnedOff)
    }
    this.permissionMode = mode
    this.overrides.permissionMode = mode
    this.host.emit({ type: 'permissionMode', id: this.host.id, mode })
  }

  /**
   * Takes the CLI out of bypass. Only announces `default` if the CLI confirmed; if it did not, the process (launched
   * with `allowDangerouslySkipPermissions`) could keep going without asking: the conversation is closed for safety.
   */
  private async leaveBypass(run: Run): Promise<void> {
    if (this.host.isClosed() || run !== this.runs.current) return
    try {
      await run.query.setPermissionMode('default')
    } catch {
      this.host.fail({ code: 'process', message: t().claudeHost.conversation.leaveBypassFailed })
      return
    }
    this.permissionMode = 'default'
    this.overrides.permissionMode = 'default'
    this.host.emit({ type: 'permissionMode', id: this.host.id, mode: 'default' })
  }

  async setModel(model: string): Promise<void> {
    await this.runs.settle()
    await this.runs.live()?.query.setModel(model === 'default' ? undefined : model)
    this.model = model
    this.overrides.model = model
  }

  /** `null` = "auto": back to the model's default effort. */
  async setEffort(effort: ClaudeEffort | null): Promise<void> {
    if (effort !== null && !isClaudeEffort(effort)) throw new UserError(t().claudeHost.conversation.invalidEffort)
    await this.runs.settle()
    await this.runs.live()?.query.applyFlagSettings({ effortLevel: effort })
    this.effort = effort ?? undefined
  }

  /** Settings changed: with bypass turned off and the conversation in that mode, it leaves bypass (`leaveBypass`). */
  async onSettingsChanged(): Promise<void> {
    if (!this.runs.open) return
    if (this.permissionMode !== 'bypassPermissions') return
    if (this.host.getSettings()['claude.allowBypassPermissions'] === true) return
    const run = this.runs.current
    if (run) await this.leaveBypass(run)
    else {
      // While dormant there is no CLI to confirm: the relaunch already starts without bypass.
      this.permissionMode = 'default'
      this.host.emit({ type: 'permissionMode', id: this.host.id, mode: 'default' })
    }
  }
}
