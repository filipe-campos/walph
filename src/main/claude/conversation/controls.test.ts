import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Settings } from '@shared/types'

vi.mock('../../env/loginShell', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loginShellPath: () => Promise.resolve(null)
}))

import { flush, of, promptInput, setup, useTempRoot } from '../testing/fakeQuery'

const dir = useTempRoot()

describe('ClaudeConversation - controls', () => {
  it('setPermissionMode validates, forwards to the query and emits permissionMode', async () => {
    const h = setup()
    await h.conv.start()
    await h.conv.setPermissionMode('acceptEdits')
    expect(h.queries[0].setPermissionMode).toHaveBeenCalledWith('acceptEdits')
    expect(of(h, 'permissionMode')).toEqual([{ type: 'permissionMode', id: 'c1', mode: 'acceptEdits' }])
    await expect(h.conv.setPermissionMode('dontAsk' as never)).rejects.toThrow('inválido')
    await h.conv.setPermissionMode('auto')
    expect(h.queries[0].setPermissionMode).toHaveBeenLastCalledWith('auto')
    await h.conv.close()
  })

  it('setModel with "default" clears the model; setEffort forwards', async () => {
    const h = setup()
    await h.conv.start()
    await h.conv.setModel('opus')
    await h.conv.setModel('default')
    expect(h.queries[0].setModel.mock.calls).toEqual([['opus'], [undefined]])
    await h.conv.setEffort('high')
    expect(h.queries[0].applyFlagSettings).toHaveBeenCalledWith({ effortLevel: 'high' })
    await h.conv.close()
  })

  it('setEffort(null) goes back to the model default and validates the value', async () => {
    const h = setup({ effort: 'max' })
    await h.conv.start()
    await h.conv.setEffort(null)
    expect(h.queries[0].applyFlagSettings).toHaveBeenCalledWith({ effortLevel: null })
    await expect(h.conv.setEffort('ultra' as never)).rejects.toThrow('Esforço inválido')
    // relaunching (rewind/fork) no longer sends the old effort
    await h.conv.close()
  })

  it('controls after closing throw', async () => {
    const h = setup()
    await h.conv.start()
    await h.conv.close()
    await expect(h.conv.setModel('opus')).rejects.toThrow('encerrada')
    await expect(h.conv.send(promptInput('hi'))).rejects.toThrow('encerrada')
  })
})

describe('ClaudeConversation - checkpoints', () => {
  it('code rewind calls rewindFiles and returns the files', async () => {
    const h = setup()
    await h.conv.start()
    await flush()
    const uuid = await h.conv.send(promptInput('hi'))
    h.queries[0].push({ type: 'system', subtype: 'session_state_changed', state: 'idle' })
    await flush()
    const result = await h.conv.rewind(uuid, { code: true, conversation: false })
    expect(h.queries[0].rewindFiles).toHaveBeenCalledWith(uuid)
    expect(result).toEqual({ filesChanged: ['a.ts'] })
    expect(h.queries).toHaveLength(1)
    await h.conv.close()
  })

  it('rewind refuses a message without checkpoint and a turn in progress', async () => {
    const h = setup()
    await h.conv.start()
    await expect(h.conv.rewind('does-not-exist', { code: true, conversation: false })).rejects.toThrow('checkpoint')
    const uuid = await h.conv.send(promptInput('hi'))
    await expect(h.conv.rewind(uuid, { code: true, conversation: false })).rejects.toThrow('Interrompa')
    await h.conv.close()
  })

  it('two simultaneous rewinds: the second is refused and only one CLI stays alive', async () => {
    const h = setup()
    await h.conv.start()
    await flush()
    const u1 = await h.conv.send(promptInput('first'))
    h.queries[0].push({ type: 'system', subtype: 'session_state_changed', state: 'idle' })
    await flush()
    const u2 = await h.conv.send(promptInput('second'))
    h.queries[0].push({ type: 'system', subtype: 'session_state_changed', state: 'idle' })
    await flush()

    const both = { code: true, conversation: true }
    const results = await Promise.allSettled([h.conv.rewind(u2, both), h.conv.rewind(u1, both)])
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected'])
    expect((results[1] as PromiseRejectedResult).reason.message).toContain('restauração')
    // 1 original process (closed) + 1 relaunched; no orphan.
    expect(h.queries).toHaveLength(2)
    expect(h.queries.filter((q) => q.close.mock.calls.length === 0)).toHaveLength(1)
    await h.conv.close()
  })

  it('send during a rewind is refused (and allowed afterwards)', async () => {
    const h = setup()
    await h.conv.start()
    await flush()
    const u1 = await h.conv.send(promptInput('first'))
    h.queries[0].push({ type: 'system', subtype: 'session_state_changed', state: 'idle' })
    await flush()
    const pending = h.conv.rewind(u1, { code: true, conversation: true })
    await expect(h.conv.send(promptInput('midway'))).rejects.toThrow('restauração')
    await pending
    await expect(h.conv.send(promptInput('later'))).resolves.toEqual(expect.any(String))
    await h.conv.close()
  })

  it('conversation rewind restarts the query with resume and resumeSessionAt at the previous message', async () => {
    const h = setup()
    await h.conv.start()
    await flush()
    const u1 = await h.conv.send(promptInput('first'))
    h.queries[0].push({
      type: 'assistant',
      uuid: 'a1',
      parent_tool_use_id: null,
      message: { role: 'assistant', content: [{ type: 'text', text: 'resp' }] }
    })
    h.queries[0].push({ type: 'system', subtype: 'session_state_changed', state: 'idle' })
    await flush()
    const u2 = await h.conv.send(promptInput('second'))
    h.queries[0].push({ type: 'system', subtype: 'session_state_changed', state: 'idle' })
    await flush()

    const result = await h.conv.rewind(u2, { code: false, conversation: true })
    expect(result.messages?.map((m) => m.uuid)).toEqual([u1, 'a1'])
    expect(h.queries).toHaveLength(2)
    expect(h.queries[0].close).toHaveBeenCalled()
    expect(h.queries[1].params.options).toMatchObject({ resumeSessionAt: 'a1' })
    expect(h.queries[1].params.options).toHaveProperty('resume')
    // The old run must not produce an error nor close the conversation.
    await flush()
    expect(of(h, 'error')).toHaveLength(0)

    // Going back to the first message starts from scratch (no resume).
    const back = await h.conv.rewind(u1, { code: false, conversation: true })
    expect(back.messages).toEqual([])
    expect(h.queries[2].params.options).not.toHaveProperty('resume')
    await h.conv.close()
  })
})

describe('ClaudeConversation - modes and bypass', () => {
  const allow = { 'claude.allowBypassPermissions': true } as Partial<Settings>

  it('without the setting the process starts without the flag and main refuses bypass', async () => {
    const h = setup()
    await h.conv.start()
    expect(h.queries[0].params.options).not.toHaveProperty('allowDangerouslySkipPermissions')
    await expect(h.conv.setPermissionMode('bypassPermissions')).rejects.toThrow('desativado')
    expect(h.queries[0].setPermissionMode).not.toHaveBeenCalled()
    await h.conv.close()
  })

  it('with the setting it starts with the flag and accepts bypass', async () => {
    const h = setup({}, allow)
    await h.conv.start()
    expect(h.queries[0].params.options).toMatchObject({ allowDangerouslySkipPermissions: true })
    await h.conv.setPermissionMode('bypassPermissions')
    expect(h.queries[0].setPermissionMode).toHaveBeenCalledWith('bypassPermissions')
    expect(of(h, 'permissionMode').at(-1)).toMatchObject({ mode: 'bypassPermissions' })
    await h.conv.close()
  })

  it('setting turned on after the start: asks for a new conversation', async () => {
    const settings: Partial<Settings> = {}
    const h = setup({}, settings)
    await h.conv.start()
    settings['claude.allowBypassPermissions'] = true
    await expect(h.conv.setPermissionMode('bypassPermissions')).rejects.toThrow('nova conversa')
    await h.conv.close()
  })

  it('initial bypass without the setting falls back to default with a notice; with it, starts in bypass', async () => {
    const blocked = setup({ permissionMode: 'bypassPermissions' })
    await blocked.conv.start()
    expect(blocked.queries[0].params.options).toMatchObject({ permissionMode: 'default' })
    await flush()
    expect(of(blocked, 'notice')[0].message).toContain('Bypass permissions')
    await blocked.conv.close()

    const settingsOnly = setup({}, { 'claude.initialPermissionMode': 'bypassPermissions' })
    await settingsOnly.conv.start()
    expect(settingsOnly.queries[0].params.options).toMatchObject({ permissionMode: 'default' })
    await settingsOnly.conv.close()

    const allowed = setup({ permissionMode: 'bypassPermissions' }, allow)
    await allowed.conv.start()
    expect(allowed.queries[0].params.options).toMatchObject({
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true
    })
    await flush()
    expect(of(allowed, 'notice')).toEqual([])
    await allowed.conv.close()
  })

  it('turning the setting off with the conversation in bypass goes back to default', async () => {
    const settings: Partial<Settings> = { ...allow }
    const h = setup({ permissionMode: 'bypassPermissions' }, settings)
    await h.conv.start()
    await h.conv.onSettingsChanged()
    expect(h.queries[0].setPermissionMode).not.toHaveBeenCalled()
    settings['claude.allowBypassPermissions'] = false
    await h.conv.onSettingsChanged()
    expect(h.queries[0].setPermissionMode).toHaveBeenCalledWith('default')
    expect(of(h, 'permissionMode').at(-1)).toMatchObject({ mode: 'default' })
    await h.conv.close()
  })

  it('if the CLI does not confirm leaving bypass, the conversation is ended without announcing default', async () => {
    const settings: Partial<Settings> = { ...allow }
    const h = setup({ permissionMode: 'bypassPermissions' }, settings)
    await h.conv.start()
    h.queries[0].setPermissionMode.mockRejectedValueOnce(new Error('failed'))
    settings['claude.allowBypassPermissions'] = false
    await h.conv.onSettingsChanged()
    await flush()
    expect(of(h, 'permissionMode')).toEqual([])
    expect(of(h, 'error')[0].error.message).toContain('encerrada por segurança')
    expect(of(h, 'status').at(-1)).toMatchObject({ status: 'closed' })
  })

  it('setting turned off during the switch to bypass: reverts and refuses', async () => {
    const settings: Partial<Settings> = { ...allow }
    const h = setup({}, settings)
    await h.conv.start()
    h.queries[0].setPermissionMode.mockImplementationOnce(() => {
      settings['claude.allowBypassPermissions'] = false
      return Promise.resolve()
    })
    await expect(h.conv.setPermissionMode('bypassPermissions')).rejects.toThrow('desativado')
    expect(h.queries[0].setPermissionMode.mock.calls).toEqual([['bypassPermissions'], ['default']])
    expect(of(h, 'permissionMode').map((e) => e.mode)).toEqual(['default'])
    await h.conv.close()
  })

  it('the CLI init with auto/bypass updates the mode', async () => {
    const h = setup({}, allow)
    await h.conv.start()
    h.queries[0].push({
      type: 'system',
      subtype: 'init',
      session_id: 's1',
      model: 'opus',
      permissionMode: 'auto'
    })
    await flush()
    expect(of(h, 'init').at(-1)).toMatchObject({ permissionMode: 'auto' })
    await h.conv.close()
  })
})

describe('ClaudeConversation - send and relaunch during rewind', () => {
  it('a rewind whose relaunch fails closes the conversation (no zombie) and rethrows the error', async () => {
    const h = setup()
    await h.conv.start()
    const u1 = await h.conv.send(promptInput('one'))
    h.queries[0].push({
      type: 'assistant',
      uuid: 'a1',
      parent_tool_use_id: null,
      message: { content: [{ type: 'text', text: 'r' }] }
    })
    await flush()
    h.queries[0].push({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: '',
      total_cost_usd: 0,
      duration_ms: 1
    })
    await flush()
    const u2 = await h.conv.send(promptInput('two'))
    h.queries[0].push({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: '',
      total_cost_usd: 0,
      duration_ms: 1
    })
    await flush()
    expect(u1).not.toBe(u2)
    h.sdk.query.mockImplementationOnce(() => {
      throw new Error('failed to start')
    })
    await expect(h.conv.rewind(u2, { code: false, conversation: true })).rejects.toThrow('failed to start')
    expect(of(h, 'status').at(-1)!.status).toBe('closed')
    expect(of(h, 'error').length).toBeGreaterThan(0)
  })

  it('a send already waiting for attachments when the rewind started is refused, without a turn', async () => {
    const h = setup()
    await h.conv.start()
    await flush()
    const u1 = await h.conv.send(promptInput('first'))
    h.queries[0].push({ type: 'system', subtype: 'session_state_changed', state: 'idle' })
    await flush()
    await writeFile(join(dir.root, 'a.txt'), 'x')
    const sentBefore = h.sent.length
    const sending = h.conv.send({ ...promptInput('hi'), attachments: [{ path: join(dir.root, 'a.txt') }] })
    sending.catch(() => undefined)
    // Slow rewindFiles: the rewind is still in progress when the attachments finish loading.
    let finish!: () => void
    h.queries[0].rewindFiles.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = () => resolve({ canRewind: true, filesChanged: [] })
      })
    )
    const rewinding = h.conv.rewind(u1, { code: true, conversation: false })
    await expect(sending).rejects.toThrow('restauração')
    finish()
    await rewinding
    expect(h.sent).toHaveLength(sentBefore)
    await h.conv.close()
  })

  it('send while loading attachments of a conversation that closed throws a pt-BR error', async () => {
    const h = setup()
    await h.conv.start()
    await writeFile(join(dir.root, 'a.txt'), 'x')
    const sending = h.conv.send({ ...promptInput('hi'), attachments: [{ path: join(dir.root, 'a.txt') }] })
    await h.conv.close()
    await expect(sending).rejects.toThrow('encerrada')
    expect(h.sent).toHaveLength(0)
  })
})
