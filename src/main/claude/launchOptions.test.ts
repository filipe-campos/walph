import { describe, expect, it } from 'vitest'
import { IDE_ALLOWED_TOOLS } from './ideServer'
import { buildLaunchOptions, explicitModel, fallbackModels, IDE_PROMPT, type LaunchParams } from './launchOptions'

const canUseTool: LaunchParams['canUseTool'] = () => Promise.resolve({ behavior: 'allow', updatedInput: {} })
const onElicitation: LaunchParams['onElicitation'] = () => Promise.resolve({ action: 'decline' })
const spawnClaudeCodeProcess: LaunchParams['spawnClaudeCodeProcess'] = () => {
  throw new Error('must not run')
}

function params(over: Partial<LaunchParams> = {}): LaunchParams {
  return {
    root: '/proj',
    env: { PATH: '/bin' },
    permissionMode: 'default',
    allowBypass: false,
    model: '',
    effort: undefined,
    fallbackModel: '',
    executable: undefined,
    sessionId: 'sess-1',
    resume: false,
    resumeAt: undefined,
    canUseTool,
    onElicitation,
    mcpServers: {},
    hooks: {},
    spawnClaudeCodeProcess,
    ...over
  }
}

describe('explicitModel', () => {
  it('empty and "default" are not passed to the CLI', () => {
    expect(explicitModel('')).toBe('')
    expect(explicitModel('default')).toBe('')
    expect(explicitModel('opus')).toBe('opus')
  })
})

describe('fallbackModels', () => {
  it('trims, drops empties and the main model itself', () => {
    expect(fallbackModels(' sonnet , ,opus,haiku ', 'opus')).toBe('sonnet,haiku')
  })

  it('with the default model nothing but the empties is removed', () => {
    expect(fallbackModels('sonnet, default', 'default')).toBe('sonnet,default')
    expect(fallbackModels('', 'opus')).toBe('')
  })
})

describe('buildLaunchOptions', () => {
  it('fixed security and panel options', () => {
    const o = buildLaunchOptions(params())
    expect(o).toMatchObject({
      cwd: '/proj',
      env: { PATH: '/bin' },
      permissionMode: 'default',
      settingSources: ['user', 'project', 'local'],
      systemPrompt: { type: 'preset', preset: 'claude_code', append: IDE_PROMPT },
      includePartialMessages: true,
      enableFileCheckpointing: true,
      allowedTools: IDE_ALLOWED_TOOLS,
      perTaskStopAffordance: true,
      agentProgressSummaries: false,
      promptSuggestions: true,
      sessionId: 'sess-1'
    })
    expect(o.canUseTool).toBe(canUseTool)
    expect(o.onElicitation).toBe(onElicitation)
    expect(o.spawnClaudeCodeProcess).toBe(spawnClaudeCodeProcess)
  })

  it('optional fields only appear when there is a value', () => {
    const o = buildLaunchOptions(params())
    for (const key of [
      'allowDangerouslySkipPermissions',
      'pathToClaudeCodeExecutable',
      'model',
      'effort',
      'fallbackModel',
      'resume',
      'resumeSessionAt'
    ]) {
      expect(o).not.toHaveProperty(key)
    }
  })

  it('bypass allowed, executable, model and effort', () => {
    const o = buildLaunchOptions(
      params({ allowBypass: true, executable: '/usr/bin/claude', model: 'opus', effort: 'high' })
    )
    expect(o).toMatchObject({
      allowDangerouslySkipPermissions: true,
      pathToClaudeCodeExecutable: '/usr/bin/claude',
      model: 'opus',
      effort: 'high'
    })
  })

  it('model "default" does not go to the CLI', () => {
    expect(buildLaunchOptions(params({ model: 'default' }))).not.toHaveProperty('model')
  })

  it('fallbackModel removes the main model and disappears when the list becomes empty', () => {
    expect(buildLaunchOptions(params({ model: 'opus', fallbackModel: 'opus, sonnet' }))).toMatchObject({
      fallbackModel: 'sonnet'
    })
    expect(buildLaunchOptions(params({ model: 'opus', fallbackModel: 'opus' }))).not.toHaveProperty('fallbackModel')
  })

  it('resuming uses `resume` and not `sessionId`; `resumeAt` becomes resumeSessionAt', () => {
    const o = buildLaunchOptions(params({ resume: true, resumeAt: 'uuid-9' }))
    expect(o).toMatchObject({ resume: 'sess-1', resumeSessionAt: 'uuid-9' })
    expect(o).not.toHaveProperty('sessionId')
    const plain = buildLaunchOptions(params({ resume: true }))
    expect(plain).toMatchObject({ resume: 'sess-1' })
    expect(plain).not.toHaveProperty('resumeSessionAt')
  })

  it('the permission mode is always explicit', () => {
    expect(buildLaunchOptions(params({ permissionMode: 'plan' }))).toMatchObject({ permissionMode: 'plan' })
  })
})
