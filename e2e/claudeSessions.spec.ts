import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { expect, startClaude, test as base } from './fixtures'
import { git, sendCommand, sessionFilesText } from './helpers'

// Claude panel: favorites, rename, export, pinned prompt, turn summary, agents strip and
// "Sempre neste workspace". Uses the fake SDK (`WALPH_FAKE_CLAUDE`) and the fake session store
// (`WALPH_FAKE_CLAUDE_STORE`), which survives an app restart.

type Step = Record<string, unknown>

let tmpBase: string
let repo: string
let count = 0
let app: ElectronApplication

const tabs = (page: Page): Locator => page.locator('.claude-tab[role=tab]')
const tabOf = (page: Page, title: string): Locator => tabs(page).filter({ hasText: title })
const star = (page: Page): Locator => page.locator('button.claude-star')
const moreMenu = (page: Page): Locator => page.locator('[aria-label="Mais ações da sessão"]')

async function send(page: Page, text: string): Promise<void> {
  const input = page.locator('.claude-input:visible')
  await input.fill(text)
  await input.press('Enter')
}

async function openPanel(page: Page): Promise<void> {
  await sendCommand(app, page, 'claude.toggleSidebar')
  await expect(tabs(page)).toHaveCount(1)
}

async function menuAction(page: Page, action: string): Promise<void> {
  await moreMenu(page).click()
  await page.locator(`[role=menuitem][data-action=${action}]`).click()
}

async function newSession(page: Page, expectedTabs: number): Promise<void> {
  await page.getByRole('button', { name: 'Nova conversa' }).click()
  await expect(tabs(page)).toHaveCount(expectedTabs)
}

const test = base.extend<{ launchClaude: (turns: Step[][]) => Promise<Page> }>({
  launchClaude: async ({ launch, tmp }, use) => {
    tmpBase = tmp
    const n = ++count
    repo = join(tmpBase, `projeto-${n}`)
    mkdirSync(repo, { recursive: true })
    writeFileSync(join(repo, 'a.txt'), 'a\n')
    git(repo, 'init', '-q', '-b', 'main')
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', 'initial')
    await use(async (turns) => {
      const launched = await startClaude(launch, { folder: repo, script: { turns }, store: true })
      app = launched.app
      return launched.page
    })
  }
})

test.describe('Claude panel sessions', () => {
  test('a favorite survives the restart and shows first in the history', async ({ launchClaude }) => {
    let page = await launchClaude([[{ assistant: 'Um.' }], [{ assistant: 'Dois.' }]])
    await openPanel(page)
    await send(page, 'primeira conversa')
    await expect(page.getByText('Um.')).toBeVisible()
    await newSession(page, 2)
    await send(page, 'segunda conversa')
    await expect(page.getByText('Dois.')).toBeVisible()

    // Favorites the OLDEST one: without the favorite it would be last.
    await tabOf(page, 'primeira conversa').click()
    await expect(star(page)).toBeEnabled()
    await expect(star(page)).toHaveAttribute('aria-pressed', 'false')
    await star(page).click()
    await expect(star(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(tabOf(page, 'primeira conversa')).toHaveAttribute('data-favorite', 'true')
    await expect(tabOf(page, 'segunda conversa')).toHaveAttribute('data-favorite', 'false')

    await app.close()
    page = await launchClaude([])
    if (!(await page.locator('.claude-panel').isVisible())) await sendCommand(app, page, 'claude.toggleSidebar')
    await expect(page.locator('.claude-panel')).toBeVisible()
    await page.getByRole('button', { name: /^Mais ações da sessão/ }).click()
    await page.getByRole('menuitem', { name: 'Conversas anteriores' }).click()
    const items = page.locator('.claude-history-item')
    await expect(items).toHaveCount(2)
    await expect(items.first()).toHaveAttribute('data-favorite', 'true')
    await expect(items.first()).toContainText('primeira conversa')
    await expect(items.first().locator('.claude-history-star')).toBeVisible()
    await expect(items.nth(1)).toHaveAttribute('data-favorite', 'false')
    await expect(items.nth(1).locator('.claude-history-star')).toHaveCount(0)
  })

  test('tabs and draft survive the restart (lazy restore)', async ({ launchClaude, userDataDir }) => {
    let page = await launchClaude([[{ assistant: 'resposta da primeira' }]])
    await openPanel(page)
    await send(page, 'primeira conversa')
    await expect(page.getByText('resposta da primeira')).toBeVisible()
    await newSession(page, 2)
    await page.locator('.claude-input:visible').fill('rascunho pendente')
    await expect.poll(() => sessionFilesText(userDataDir)).toContain('rascunho pendente')

    await app.close()
    page = await launchClaude([])
    await expect(tabs(page)).toHaveCount(2)
    await expect(tabOf(page, 'primeira conversa')).toHaveCount(1)
    // The active tab (the second) comes back with the draft; the first is only resumed when shown.
    await expect(page.locator('.claude-input:visible')).toHaveValue('rascunho pendente')
    await tabOf(page, 'primeira conversa').click()
    await expect(page.getByText('resposta da primeira')).toBeVisible()
  })

  test('renaming from the menu and with F2 changes the tab, the history and the toast description', async ({
    launchClaude
  }) => {
    const page = await launchClaude([[{ assistant: 'Um.' }], [{ delay: 1500 }, { assistant: 'Dois.' }]])
    await openPanel(page)
    await send(page, 'consertar o bug')
    await expect(page.getByText('Um.')).toBeVisible()

    await menuAction(page, 'rename')
    const input = page.locator('[data-rename-input]')
    await expect(input).toBeFocused()
    await input.fill('Pix no checkout')
    await input.press('Enter')
    await expect(page.locator('[data-rename-input]')).toHaveCount(0)
    await expect(tabs(page).first()).toContainText('Pix no checkout')
    // Closing the field returns focus to the prompt; opening it before that would make it lose focus and close again.
    await expect(page.locator('.claude-input:visible')).toBeFocused()

    // F2 (menu command/shortcut): field open again; Esc cancels and keeps the title.
    await sendCommand(app, page, 'claude.renameSession')
    await expect(page.locator('[data-rename-input]')).toBeVisible()
    await page.locator('[data-rename-input]').fill('descartado')
    await page.locator('[data-rename-input]').press('Escape')
    await expect(page.locator('[data-rename-input]')).toHaveCount(0)
    await expect(tabs(page).first()).toContainText('Pix no checkout')

    await page.getByRole('button', { name: /^Mais ações da sessão/ }).click()
    await page.getByRole('menuitem', { name: 'Conversas anteriores' }).click()
    await expect(page.locator('.claude-history-item').first()).toContainText('Pix no checkout')
    await page.getByRole('button', { name: 'Fechar histórico' }).click()

    // A turn ends with the session out of view: the toast uses the new title.
    await send(page, 'continue')
    await newSession(page, 2)
    const toast = page.locator('.toasts .toast[data-tone="done"]')
    await expect(toast).toHaveCount(1, { timeout: 10_000 })
    await expect(toast.locator('.toast-description')).toContainText('Pix no checkout')
  })

  test('exports the conversation as .md with messages, tool summary and no injected context', async ({
    launchClaude
  }) => {
    const out = join(tmpBase, `exportada-${count}.md`)
    const page = await launchClaude([
      [
        { assistant: 'Vou editar.' },
        { toolUse: { name: 'Bash', input: { command: 'npm test' } } },
        { assistant: 'Tudo certo agora.' }
      ]
    ])
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath })
    }, out)
    await openPanel(page)
    await send(page, 'rode os testes')
    await expect(page.getByText('Tudo certo agora.')).toBeVisible()

    await menuAction(page, 'export')
    await expect(page.locator('.toasts .toast', { hasText: 'Conversa exportada' })).toBeVisible()
    expect(existsSync(out)).toBe(true)
    const md = readFileSync(out, 'utf8')
    expect(md).toContain('rode os testes')
    expect(md).toContain('Vou editar.')
    expect(md).toContain('Tudo certo agora.')
    expect(md).toContain('npm test')
    expect(md).not.toContain('<ide_')
  })

  test('the last user message stays pinned at the top during a long reply', async ({ launchClaude }) => {
    const long = Array.from({ length: 60 }, (_, i) => `Parágrafo ${i + 1} da resposta longa.`).join('\n\n')
    const page = await launchClaude([[{ assistant: long }]])
    await openPanel(page)
    await send(page, 'explique tudo em detalhes')
    await expect(page.getByText('Parágrafo 60 da resposta longa.')).toBeVisible()

    const pinned = page.locator('.claude-pinned-prompt')
    const overlay = page.getByTestId('claude-pinned-overlay')
    await expect(pinned).toContainText('explique tudo em detalhes')
    // Scrolled to the end (stuck to the bottom): the message left the top and the compact copy is pinned.
    await expect(pinned).toHaveAttribute('data-stuck', 'true')
    await expect(overlay).toContainText('explique tudo em detalhes')
    const box = await overlay.boundingBox()
    const area = await page.locator('.claude-timeline:visible').boundingBox()
    // Pinned at the top of the scroll area (the timeline `padding`, 16px, sits above it).
    expect(box && area && box.y >= area.y && box.y - area.y <= 24).toBe(true)

    // Back at the top: unpinned.
    await page.locator('.claude-timeline:visible').evaluate((el) => {
      el.scrollTop = 0
    })
    await expect(pinned).toHaveAttribute('data-stuck', 'false')
    await expect(overlay).toHaveCount(0)
  })

  test('a long message pinned at the top does not flicker with a short reply', async ({ launchClaude }) => {
    const prompt = Array.from({ length: 80 }, (_, i) => `Linha ${i + 1} do pedido longo.`).join('\n')
    const page = await launchClaude([[{ assistant: 'Feito.' }]])
    await openPanel(page)
    await send(page, prompt)
    await expect(page.getByText('Feito.')).toBeVisible()

    const pinned = page.locator('.claude-pinned-prompt')
    await expect(pinned).toHaveAttribute('data-stuck', 'true')
    // Samples the state every frame, in a single call: pinned or not, but never toggling on its own.
    const states = await pinned.evaluate(
      (el) =>
        new Promise<Array<string | null>>((resolve) => {
          const raf = el.ownerDocument.defaultView!.requestAnimationFrame.bind(el.ownerDocument.defaultView)
          const samples: Array<string | null> = []
          const tick = (): void => {
            samples.push(el.getAttribute('data-stuck'))
            if (samples.length < 60) raf(tick)
            else resolve(samples)
          }
          raf(tick)
        })
    )
    expect(states).toHaveLength(60)
    const flips = new Set(states).size - 1
    expect(flips).toBe(0)
  })

  test('the turn summary lists the 3 edited files with the +N −N lines', async ({ launchClaude }) => {
    const edit = (name: string, oldText: string, newText: string): Step => ({
      toolUse: { name: 'Edit', input: { file_path: join(repo, name), old_string: oldText, new_string: newText } }
    })
    const page = await launchClaude([
      [
        edit('um.ts', 'a\nb', 'a\nB\nc\nd'),
        edit('dois.ts', 'one\ntwo', 'uno'),
        edit('tres.ts', '', 'n1\nn2'),
        { assistant: 'Editei três arquivos.' }
      ]
    ])
    await openPanel(page)
    await send(page, 'edite')
    const summary = page.locator('[data-turn-summary]')
    await expect(summary).toBeVisible()
    const rows = summary.locator('li.claude-summary-row')
    await expect(rows).toHaveCount(3)
    const expectRow = async (i: number, name: string, added: string, removed: string): Promise<void> => {
      await expect(rows.nth(i)).toHaveAttribute('data-path', join(repo, name))
      await expect(rows.nth(i)).toHaveAttribute('data-added', added)
      await expect(rows.nth(i)).toHaveAttribute('data-removed', removed)
    }
    await expectRow(0, 'um.ts', '3', '1')
    await expectRow(1, 'dois.ts', '1', '2')
    await expectRow(2, 'tres.ts', '2', '0')
  })

  test('the agents strip shows both subagents running and then done', async ({ launchClaude }) => {
    const agent = (id: string, description: string): Step => ({
      toolCall: { id, name: 'Agent', input: { description, subagent_type: 'Explore' } }
    })
    const page = await launchClaude([
      [
        agent('t1', 'Pesquisar rotas'),
        agent('t2', 'Pesquisar testes'),
        { subagentMessage: { parentToolUseId: 't1', text: 'achei 3 arquivos' } },
        { delay: 2500 },
        { toolResult: { id: 't1', content: 'feito', isError: false } },
        { toolResult: { id: 't2', content: 'feito', isError: false } },
        { delay: 2500 },
        { assistant: 'Terminei.' }
      ]
    ])
    await openPanel(page)
    await send(page, 'pesquise')
    const strip = page.locator('[data-agents]')
    const rows = strip.locator('li.claude-agent')
    await strip.locator('.claude-agents-head').click()
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toHaveAttribute('data-agent-status', 'running')
    await expect(rows.nth(1)).toHaveAttribute('data-agent-status', 'running')
    await expect(rows.nth(0)).toContainText('Pesquisar rotas')
    await expect(rows.nth(1)).toContainText('Pesquisar testes')
    await expect(rows.nth(0).locator('.claude-agent-time')).toBeVisible()
    await expect(rows.nth(0)).toHaveAttribute('data-agent-status', 'done', { timeout: 10_000 })
    await expect(rows.nth(1)).toHaveAttribute('data-agent-status', 'done')
    await expect(rows.nth(0).locator('.claude-agent-time')).toBeVisible()
    await expect(rows.nth(1).locator('.claude-agent-time')).toBeVisible()
  })

  test('"Sempre neste workspace" saves the rule and a new session does not ask again', async ({ launchClaude }) => {
    const permission: Step = {
      permission: {
        toolName: 'Bash',
        input: { command: 'npm test' },
        suggestions: [
          {
            type: 'addRules',
            rules: [{ toolName: 'Bash', ruleContent: 'npm test' }],
            behavior: 'allow',
            destination: 'localSettings'
          }
        ]
      }
    }
    const page = await launchClaude([
      [permission, { assistant: 'Rodou na primeira.' }],
      [permission, { assistant: 'Rodou na segunda.' }]
    ])
    await openPanel(page)
    await send(page, 'rode os testes')
    const always = page.locator('button[data-always="workspace"]')
    await expect(always).toBeVisible()
    await always.click()
    await expect(page.getByText('Rodou na primeira.')).toBeVisible()

    const settings = JSON.parse(readFileSync(join(repo, '.claude', 'settings.local.json'), 'utf8')) as {
      permissions: { allow: string[] }
    }
    expect(settings.permissions.allow).toContain('Bash(npm test)')

    await newSession(page, 2)
    await send(page, 'rode de novo')
    await expect(page.getByText('Rodou na segunda.')).toBeVisible()
    await expect(page.locator('button[data-always="workspace"]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Permitir', exact: true })).toHaveCount(0)
  })
})
