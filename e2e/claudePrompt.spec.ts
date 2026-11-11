import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { expect, startClaude, test as base } from './fixtures'
import { git, sendCommand as sendAppCommand, type WalphGlobals } from './helpers'

// Claude panel: attachments (paperclip through the stubbed dialog and drop), project/personal commands, modes
// (including the user-only Bypass) and model + effort. Uses the fake SDK (`WALPH_FAKE_CLAUDE`), which records the
// calls in `globalThis.__walphFakeClaudeCalls` (read with `electronApp.evaluate`).

// Valid 1x1 PNG.
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

type Step = Record<string, unknown>
type Call = Record<string, unknown>

let tmpBase: string
let repo: string
let home: string
let outside: string
let count = 0
let app: ElectronApplication

interface LaunchOptions {
  userSettings?: Record<string, unknown>
  models?: Array<Record<string, unknown>>
  commands?: Array<Record<string, unknown>>
}

const prompt = (page: Page): Locator => page.locator('[data-testid=claude-prompt]:visible')
const input = (page: Page): Locator => page.locator('[data-testid=claude-input]:visible')
const chips = (page: Page): Locator => page.locator('[data-testid=claude-attachments] [data-kind]')
const slashMenu = (page: Page): Locator => page.locator('[data-testid=claude-slash-menu]')
const modeChip = (page: Page): Locator => page.locator('[data-testid=claude-mode-chip]')
const modeMenu = (page: Page): Locator => page.locator('[data-testid=claude-mode-chip-menu]')
const modelChip = (page: Page): Locator => page.locator('[data-testid=claude-model-chip]')
const modelMenu = (page: Page): Locator => page.locator('[data-testid=claude-model-chip-menu]')

async function openPanel(page: Page): Promise<void> {
  await sendAppCommand(app, page, 'claude.toggleSidebar')
  await expect(input(page)).toBeVisible()
}

/** Session open and already started (`init` brings models and commands): sends a message and waits for the reply. */
async function startSession(page: Page, reply = 'Pronto.'): Promise<void> {
  await openPanel(page)
  await input(page).fill('oi')
  await input(page).press('Enter')
  await expect(page.getByText(reply, { exact: true })).toBeVisible()
}

const calls = (): Promise<Call[]> =>
  app.evaluate(
    () => (globalThis as unknown as { __walphFakeClaudeCalls?: Call[] }).__walphFakeClaudeCalls?.slice() ?? []
  )

async function callsOf(type: string): Promise<Call[]> {
  return (await calls()).filter((c) => c.type === type)
}

function stubOpenDialog(paths: string[]): Promise<void> {
  return app.evaluate(({ dialog }, filePaths) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths })
  }, paths)
}

/** Stubs the button chosen in the confirmation dialog (0 = Attach, 1 = Cancel) and counts how many times it opened. */
function stubMessageBox(response: number): Promise<void> {
  return app.evaluate(({ dialog }, r) => {
    const g = globalThis as unknown as { __boxCount: number }
    g.__boxCount = 0
    dialog.showMessageBox = () => {
      g.__boxCount++
      return Promise.resolve({ response: r, checkboxChecked: false })
    }
  }, response)
}

const boxCount = (): Promise<number> => app.evaluate(() => (globalThis as unknown as { __boxCount: number }).__boxCount)

const OPUS_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
const MODELS = [
  { value: 'opus', displayName: 'Opus', description: 'o mais capaz', supportedEffortLevels: OPUS_EFFORTS },
  { value: 'haiku', displayName: 'Haiku', description: 'rápido', supportedEffortLevels: [] }
]

const test = base.extend<{ launchClaude: (turns: Step[][], options?: LaunchOptions) => Promise<Page> }>({
  launchClaude: async ({ launch, tmp }, use) => {
    tmpBase = tmp
    const n = ++count
    repo = join(tmpBase, `projeto-${n}`)
    mkdirSync(join(repo, 'src'), { recursive: true })
    writeFileSync(join(repo, 'src', 'index.ts'), 'export const x = 1\n')
    writeFileSync(join(repo, 'README.md'), '# oi\n')
    writeFileSync(join(repo, 'foto.png'), Buffer.from(PNG_BASE64, 'base64'))
    git(repo, 'init', '-q', '-b', 'main')
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', 'initial')
    home = join(tmpBase, `home-${n}`)
    mkdirSync(home, { recursive: true })
    outside = join(tmpBase, `fora-${n}`)
    mkdirSync(outside, { recursive: true })
    writeFileSync(join(outside, 'segredo.txt'), 'conteúdo de fora\n')
    await use(async (turns, options = {}) => {
      const launched = await startClaude(launch, {
        folder: repo,
        script: { turns, models: options.models, commands: options.commands },
        settings: options.userSettings,
        store: true,
        env: { HOME: home, USERPROFILE: home }
      })
      app = launched.app
      return launched.page
    })
  }
})

test.describe('Claude panel attachments', () => {
  test('dropping a png creates the image chip and the paperclip attaches the .ts; sending sends both', async ({
    launchClaude
  }) => {
    const page = await launchClaude([[{ assistant: 'Recebi.' }]])
    await openPanel(page)

    // Drop: the dashed outline shows while dragging and goes away on drop.
    const dt = await page.evaluateHandle(
      ({ b64 }) => {
        const g = globalThis as unknown as {
          DataTransfer: new () => { items: { add(f: unknown): void } }
          File: new (parts: unknown[], name: string, opts: { type: string }) => unknown
          atob(s: string): string
        }
        const bytes = Uint8Array.from(g.atob(b64), (c) => c.charCodeAt(0))
        const data = new g.DataTransfer()
        data.items.add(new g.File([bytes], 'foto.png', { type: 'image/png' }))
        return data
      },
      { b64: PNG_BASE64 }
    )
    await prompt(page).dispatchEvent('dragenter', { dataTransfer: dt })
    await expect(prompt(page)).toHaveAttribute('data-dragging', 'true')
    await prompt(page).dispatchEvent('drop', { dataTransfer: dt })
    await expect(prompt(page)).not.toHaveAttribute('data-dragging', 'true')
    await expect(page.locator('[data-testid=claude-attachments] [data-kind=image][data-name="foto.png"]')).toHaveCount(
      1
    )

    // Paperclip with the stubbed native dialog: a file inside the folder.
    await stubOpenDialog([join(repo, 'src', 'index.ts')])
    await page.locator('button[aria-label="Anexar arquivos"]').click()
    const fileChip = page.locator('[data-testid=claude-attachments] [data-kind=file][data-name="index.ts"]')
    await expect(fileChip).toHaveCount(1)
    await expect(chips(page)).toHaveCount(2)

    await input(page).fill('veja isto')
    await input(page).press('Enter')
    await expect(page.getByText('Recebi.', { exact: true })).toBeVisible()
    await expect(chips(page)).toHaveCount(0)

    const [sent] = await callsOf('user')
    const blocks = sent.content as Array<Record<string, unknown>>
    const json = JSON.stringify(blocks)
    expect(blocks.some((b) => b.type === 'image')).toBe(true)
    expect(json).toContain(PNG_BASE64)
    expect(json).toContain('index.ts')
    expect(json).toContain('export const x = 1')
    expect(json).toContain('veja isto')
  })

  test('removing the chip drops the attachment from the message', async ({ launchClaude }) => {
    const page = await launchClaude([[{ assistant: 'Recebi.' }]])
    await openPanel(page)
    await stubOpenDialog([join(repo, 'README.md'), join(repo, 'src', 'index.ts')])
    await page.locator('button[aria-label="Anexar arquivos"]').click()
    await expect(chips(page)).toHaveCount(2)
    await page.locator('button[aria-label="Remover README.md"]').click()
    await expect(chips(page)).toHaveCount(1)
    await input(page).fill('so um')
    await input(page).press('Enter')
    await expect(page.getByText('Recebi.', { exact: true })).toBeVisible()
    const json = JSON.stringify((await callsOf('user'))[0].content)
    expect(json).toContain('index.ts')
    expect(json).not.toContain('README.md')
  })

  test('a file outside the folder asks for confirmation: refusing does not attach, accepting attaches', async ({
    launchClaude
  }) => {
    const page = await launchClaude([[{ assistant: 'Recebi.' }]])
    await openPanel(page)
    const target = join(outside, 'segredo.txt')
    const authorize = (): Promise<{ files: Array<{ name: string }>; rejected: unknown[] }> =>
      page.evaluate((p) => (globalThis as unknown as WalphGlobals).api.claude.authorizeAttachments([p]), target)

    await stubMessageBox(1)
    const refused = await authorize()
    expect(await boxCount()).toBe(1)
    expect(refused.files).toEqual([])

    await stubMessageBox(0)
    const accepted = await authorize()
    expect(await boxCount()).toBe(1)
    expect(accepted.files.map((f) => f.name)).toEqual(['segredo.txt'])

    // Inside the folder it asks nothing.
    await stubMessageBox(1)
    const inside = await page.evaluate(
      (p) => (globalThis as unknown as WalphGlobals).api.claude.authorizeAttachments([p]),
      join(repo, 'README.md')
    )
    expect(inside.files).toHaveLength(1)
    expect(await boxCount()).toBe(0)
  })

  test('what the paperclip dialog picks outside the folder needs no new confirmation and reaches Claude', async ({
    launchClaude
  }) => {
    const page = await launchClaude([[{ assistant: 'Recebi.' }]])
    await openPanel(page)
    await stubMessageBox(1)
    await stubOpenDialog([join(outside, 'segredo.txt')])
    await page.locator('button[aria-label="Anexar arquivos"]').click()
    await expect(page.locator('[data-testid=claude-attachments] [data-name="segredo.txt"]')).toHaveCount(1)
    expect(await boxCount()).toBe(0)
    await input(page).fill('lê')
    await input(page).press('Enter')
    await expect(page.getByText('Recebi.', { exact: true })).toBeVisible()
    expect(JSON.stringify((await callsOf('user'))[0].content)).toContain('conteúdo de fora')
  })
})

test.describe('command menu', () => {
  test('project command under Project with its hint, personal one under Personal; picking writes /name', async ({
    launchClaude
  }) => {
    mkdirSync(join(repo, '.claude', 'commands'), { recursive: true })
    writeFileSync(
      join(repo, '.claude', 'commands', 'review.md'),
      '---\ndescription: Revisa um arquivo\nargument-hint: [arquivo]\n---\nRevise $ARGUMENTS\n'
    )
    mkdirSync(join(home, '.claude', 'commands'), { recursive: true })
    writeFileSync(join(home, '.claude', 'commands', 'dica.md'), '---\ndescription: Dica pessoal\n---\nDê uma dica\n')
    const page = await launchClaude([[{ assistant: 'Pronto.' }]])
    await startSession(page)

    await page.locator('[data-testid=claude-slash-button]').click()
    await expect(slashMenu(page)).toBeVisible()
    const project = slashMenu(page).locator('[data-scope=project]')
    await expect(project.locator('[data-command=review]')).toContainText('[arquivo]')
    await expect(project.locator('[data-command=review]')).toContainText('Revisa um arquivo')
    await expect(slashMenu(page).locator('[data-scope=user] [data-command=dica]')).toBeVisible()
    await expect(slashMenu(page).locator('[data-scope=builtin] [data-command=compact]')).toBeVisible()
    await expect(project.locator('[data-command=dica]')).toHaveCount(0)

    await project.locator('[data-command=review]').dispatchEvent('mousedown')
    await expect(input(page)).toHaveValue('/review ')
  })

  test('a slash in the 2nd position also opens the list and picking replaces only the token under the cursor', async ({
    launchClaude
  }) => {
    mkdirSync(join(repo, '.claude', 'commands'), { recursive: true })
    writeFileSync(join(repo, '.claude', 'commands', 'review.md'), '---\ndescription: Revisa\n---\nRevise\n')
    const page = await launchClaude([[{ assistant: 'Pronto.' }]])
    await startSession(page)

    await input(page).fill('/loop 15m /')
    await expect(slashMenu(page)).toBeVisible()
    await input(page).pressSequentially('rev')
    await slashMenu(page).locator('[data-command=review]').dispatchEvent('mousedown')
    await expect(input(page)).toHaveValue('/loop 15m /review ')

    // In the input box, the layer behind the textarea highlights both commands (the textarea is transparent).
    const mirror = page.locator('.claude-input-mirror')
    await expect(mirror.locator('.claude-seg-command')).toHaveText(['/loop', '/review'])
    await expect(input(page)).toHaveCSS('color', 'rgba(0, 0, 0, 0)')

    // Long text with line breaks: the layer wraps the lines like the textarea (same content height).
    await input(page).fill(`/loop ${'palavra '.repeat(60)}\n\n/review fim\n`)
    const inputHeight = await input(page).evaluate((el) => el.scrollHeight)
    expect(await mirror.evaluate((el) => el.scrollHeight)).toBe(inputHeight)
    await input(page).fill('/loop 15m /review ')

    // Once sent, the message highlights the command (color + italic) and leaves the arguments as text.
    await input(page).press('Enter')
    const command = page.locator('.claude-user .claude-seg-command').first()
    await expect(command).toHaveText('/loop')
    await expect(command).toHaveCSS('font-style', 'italic')
  })

  test('/clear replaces the tab session with a new one, without messages', async ({ launchClaude }) => {
    const page = await launchClaude([[{ assistant: 'Resposta antiga.' }], [{ assistant: 'Outra.' }]])
    await startSession(page, 'Resposta antiga.')

    await input(page).fill('/clear')
    await input(page).press('Enter')
    await expect(page.locator('.claude-markdown')).toHaveCount(0)
    await expect(page.locator('.claude-tab[role=tab]')).toHaveCount(1)
    await expect(input(page)).toHaveValue('')
  })

  test('with no project or personal commands, the hint on creating one stays visible even with a long list', async ({
    launchClaude
  }) => {
    const builtins = Array.from({ length: 20 }, (_, i) => ({
      name: `nativo${i}`,
      description: `Comando nativo ${i}`,
      argumentHint: ''
    }))
    const page = await launchClaude([[{ assistant: 'Pronto.' }]], { commands: builtins })
    await startSession(page)
    await page.locator('[data-testid=claude-slash-button]').click()
    await expect(slashMenu(page).locator('[data-command=nativo19]')).toBeAttached()
    const hint = page.locator('[data-testid=claude-slash-empty]')
    await expect(hint).toContainText('.claude/commands')
    await expect(hint).toBeInViewport()
    await expect(input(page)).toHaveAttribute('aria-describedby', (await hint.getAttribute('id')) ?? '')
  })

  test('with a project command, the hint on how to create one does not show', async ({ launchClaude }) => {
    mkdirSync(join(repo, '.claude', 'commands'), { recursive: true })
    writeFileSync(join(repo, '.claude', 'commands', 'review.md'), '---\ndescription: Revisa\n---\nRevise\n')
    const page = await launchClaude([[{ assistant: 'Pronto.' }]])
    await startSession(page)
    await page.locator('[data-testid=claude-slash-button]').click()
    await expect(slashMenu(page).locator('[data-command=review]')).toBeVisible()
    await expect(page.locator('[data-testid=claude-slash-empty]')).toHaveCount(0)
  })
})

test.describe('permission modes', () => {
  test('without allowBypassPermissions, Bypass shows disabled in the menu and stays out of the ⇧⇥ cycle', async ({
    launchClaude
  }) => {
    const page = await launchClaude([[{ assistant: 'Pronto.' }]])
    await startSession(page)
    expect((await callsOf('query'))[0].options).not.toMatchObject({ allowDangerouslySkipPermissions: true })
    await modeChip(page).click()
    await expect(modeMenu(page)).toBeVisible()
    await expect(modeMenu(page).locator('[role=menuitemradio][data-mode=plan]')).toBeVisible()
    await expect(modeMenu(page).locator('[role=menuitemradio][data-mode=bypassPermissions]')).toBeDisabled()
    const listed = await modeMenu(page)
      .locator('[role=menuitemradio]:not(:disabled)')
      .evaluateAll((els) => els.map((e) => (e as unknown as { dataset: { mode: string } }).dataset.mode))
    await page.keyboard.press('Escape')
    await expect(modeMenu(page)).toHaveCount(0)

    // The cycle goes through every enabled mode and back to the first, never landing on Bypass.
    await input(page).focus()
    const seen = [await prompt(page).getAttribute('data-mode')]
    for (let i = 0; i < listed.length; i++) {
      await input(page).press('Shift+Tab')
      await expect(prompt(page)).not.toHaveAttribute('data-mode', seen[seen.length - 1]!)
      seen.push(await prompt(page).getAttribute('data-mode'))
    }
    expect(seen[seen.length - 1]).toBe(seen[0])
    expect(new Set(seen.slice(0, -1))).toEqual(new Set(listed))
    expect(seen).not.toContain('bypassPermissions')
  })

  test('the ⇧⇥ cycle changes the session mode in the SDK and Plan shows the note', async ({ launchClaude }) => {
    const page = await launchClaude([[{ assistant: 'Pronto.' }]])
    await startSession(page)
    await input(page).focus()
    await input(page).press('Shift+Tab')
    const first = await prompt(page).getAttribute('data-mode')
    await expect.poll(async () => (await callsOf('setPermissionMode')).map((c) => c.mode)).toEqual([first])

    await modeChip(page).click()
    await modeMenu(page).locator('[role=menuitemradio][data-mode=plan]').click()
    await expect(prompt(page)).toHaveAttribute('data-mode', 'plan')
    await expect(page.locator('.claude-mode-note')).toContainText('só lê e propõe')
    await expect.poll(async () => (await callsOf('setPermissionMode')).map((c) => c.mode).pop()).toBe('plan')
  })

  test('with allowBypassPermissions in user settings, Bypass shows, joins the cycle and turns the field red', async ({
    launchClaude
  }) => {
    const page = await launchClaude([[{ assistant: 'Pronto.' }]], {
      userSettings: { 'claude.allowBypassPermissions': true }
    })
    await startSession(page)
    await modeChip(page).click()
    await modeMenu(page).locator('[role=menuitemradio][data-mode=bypassPermissions]').click()
    await expect(prompt(page)).toHaveAttribute('data-mode', 'bypassPermissions')
    await expect(modeChip(page)).toHaveClass(/danger/)
    await expect(page.locator('.claude-mode-note')).toHaveCount(0)
    await expect
      .poll(async () => (await callsOf('setPermissionMode')).map((c) => c.mode).pop())
      .toBe('bypassPermissions')
    // The SDK only accepts Bypass if the `query()` was created with the flag; without the setting it must not be sent.
    expect((await callsOf('query'))[0].options).toMatchObject({ allowDangerouslySkipPermissions: true })

    // And it joins the ⇧⇥ cycle (some turn goes through it).
    await input(page).focus()
    const seen = new Set<string | null>()
    for (let i = 0; i < 8; i++) {
      await input(page).press('Shift+Tab')
      seen.add(await prompt(page).getAttribute('data-mode'))
    }
    expect(seen.has('bypassPermissions')).toBe(true)
  })

  test('the key in the workspace .walph/settings.json is ignored with a warning', async ({ launchClaude }) => {
    mkdirSync(join(repo, '.walph'), { recursive: true })
    writeFileSync(join(repo, '.walph', 'settings.json'), JSON.stringify({ 'claude.allowBypassPermissions': true }))
    const page = await launchClaude([[{ assistant: 'Pronto.' }]])
    await openPanel(page)
    await expect(page.locator('.toast').filter({ hasText: 'claude.allowBypassPermissions' }).first()).toBeVisible()
    await modeChip(page).click()
    await expect(modeMenu(page)).toBeVisible()
    await expect(modeMenu(page).locator('[data-mode=bypassPermissions]')).toBeDisabled()
  })
})

test.describe('model and effort', () => {
  test('effort low and then auto shows in the chip and in the session', async ({ launchClaude }) => {
    const page = await launchClaude([[{ assistant: 'Pronto.' }]], {
      models: MODELS,
      userSettings: { 'claude.model': 'opus' }
    })
    await startSession(page)
    await expect(modelChip(page)).toContainText('Opus')
    await expect(modelChip(page)).toContainText('auto')

    await modelChip(page).click()
    await expect(modelMenu(page)).toBeVisible()
    await modelMenu(page).locator('[data-effort=low]').click()
    await expect(modelChip(page)).toContainText('low')
    await expect
      .poll(async () => (await callsOf('applyFlagSettings')).map((c) => (c.settings as Call).effortLevel))
      .toEqual(['low'])

    await modelMenu(page).locator('[data-effort=auto]').click()
    await expect(modelChip(page)).toContainText('auto')
    await expect
      .poll(async () => (await callsOf('applyFlagSettings')).map((c) => (c.settings as Call).effortLevel))
      .toEqual(['low', null])
  })

  test('← → move the effort level and Esc closes the menu, returning focus to the field', async ({ launchClaude }) => {
    const page = await launchClaude([[{ assistant: 'Pronto.' }]], {
      models: MODELS,
      userSettings: { 'claude.model': 'opus' }
    })
    await startSession(page)
    await modelChip(page).click()
    await expect(modelMenu(page)).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await expect(modelChip(page)).toContainText('low')
    await page.keyboard.press('ArrowRight')
    await expect(modelChip(page)).toContainText('medium')
    await page.keyboard.press('ArrowLeft')
    await expect(modelChip(page)).toContainText('low')
    await page.keyboard.press('Escape')
    await expect(modelMenu(page)).toHaveCount(0)
    await expect(input(page)).toBeFocused()
  })

  test('switching to a model without effort hides the slider and unsupported levels are disabled', async ({
    launchClaude
  }) => {
    const models = [
      { value: 'opus', displayName: 'Opus', description: '', supportedEffortLevels: ['low', 'high'] },
      MODELS[1]
    ]
    const page = await launchClaude([[{ assistant: 'Pronto.' }]], { models, userSettings: { 'claude.model': 'opus' } })
    await startSession(page)
    await modelChip(page).click()
    await expect(modelMenu(page).locator('[data-effort=max]')).toBeDisabled()
    await expect(modelMenu(page).locator('[data-effort=high]')).toBeEnabled()
    await modelMenu(page).locator('[data-model=haiku]').click()
    await expect(modelChip(page)).toContainText('Haiku')
    await expect.poll(async () => (await callsOf('setModel')).map((c) => c.model)).toEqual(['haiku'])
    await modelChip(page).click()
    await expect(modelMenu(page).locator('[data-effort]')).toHaveCount(0)
  })
})
