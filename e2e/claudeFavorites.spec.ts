import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { expect, startClaude, test as base } from './fixtures'
import { git, sendCommand as sendAppCommand } from './helpers'

// Claude panel in the updated design system: favorite commands (strip above the field, stored in the app per
// folder, one click runs) and Claude actions (icon + verb per tool, expandable row with the diff). Fake SDK.

type Step = Record<string, unknown>
type Call = Record<string, unknown>

let tmpBase: string
let userDataDir: string
let repo: string
let home: string
let count = 0
let app: ElectronApplication

const input = (page: Page): Locator => page.locator('[data-testid=claude-input]:visible')
const strip = (page: Page): Locator => page.locator('[data-testid=claude-favorite-commands]:visible')
const dialog = (page: Page): Locator => page.locator('[data-testid=claude-favorite-add-dialog]')

async function openPanel(page: Page): Promise<void> {
  await sendAppCommand(app, page, 'claude.toggleSidebar')
  await expect(input(page)).toBeVisible()
}

async function userTexts(): Promise<string[]> {
  const calls = await app.evaluate(
    () => (globalThis as unknown as { __walphFakeClaudeCalls?: Call[] }).__walphFakeClaudeCalls?.slice() ?? []
  )
  return calls.filter((c) => c.type === 'user').map((c) => JSON.stringify(c.content))
}

function favoritesOnDisk(): unknown {
  const dir = join(userDataDir, 'claude', 'favorite-commands')
  const [file] = readdirSync(dir)
  return JSON.parse(readFileSync(join(dir, file), 'utf8'))
}

const test = base.extend<{ launchClaude: (turns: Step[][]) => Promise<Page> }>({
  launchClaude: async ({ launch, tmp, userDataDir: ud }, use) => {
    tmpBase = tmp
    userDataDir = ud
    const n = ++count
    repo = join(tmpBase, `projeto-${n}`)
    mkdirSync(join(repo, 'src'), { recursive: true })
    mkdirSync(join(repo, '.claude', 'commands'), { recursive: true })
    writeFileSync(join(repo, 'src', 'math.ts'), 'export function add(a, b) {\n  return a + b\n}\n')
    writeFileSync(
      join(repo, '.claude', 'commands', 'review.md'),
      '---\ndescription: Revisa o diff atual\n---\nRevise.\n'
    )
    writeFileSync(join(repo, '.claude', 'commands', 'deploy.md'), '---\ndescription: Faz o deploy\n---\nDeploy.\n')
    git(repo, 'init', '-q', '-b', 'main')
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', 'initial')
    home = join(tmpBase, `home-${n}`)
    mkdirSync(home, { recursive: true })
    await use(async (turns) => {
      const launched = await startClaude(launch, {
        folder: repo,
        script: { turns },
        store: true,
        env: { HOME: home, USERPROFILE: home }
      })
      app = launched.app
      return launched.page
    })
  }
})

test.describe('favorite commands', () => {
  test('pin through "+", run with one click, survive a restart and unpin through "x"', async ({ launchClaude }) => {
    let page = await launchClaude([[{ assistant: 'Revisado.' }]])
    await openPanel(page)
    await expect(strip(page)).toContainText('Fixe commands aqui')

    await strip(page).locator('[data-testid=claude-favorite-add]').click()
    await expect(dialog(page)).toBeVisible()
    // Lists the project commands that are not favorites yet.
    await expect(dialog(page).locator('[data-command=review]')).toBeVisible()
    await dialog(page).locator('[data-command=review]').click()
    await dialog(page).locator('[data-icon=rocket]').click()
    await expect(dialog(page).locator('[data-icon=rocket]')).toHaveAttribute('aria-checked', 'true')
    await dialog(page).getByRole('button', { name: 'Adicionar' }).click()
    await expect(dialog(page)).toHaveCount(0)
    await expect(strip(page).locator('[data-favorite-command=review]')).toBeVisible()
    await expect(strip(page)).not.toContainText('Fixe commands aqui')
    // Stored in the app (userData), per folder, nothing in the repository.
    await expect.poll(favoritesOnDisk).toEqual({ version: 1, commands: [{ name: 'review', icon: 'rocket' }] })

    // Already a favorite: gone from the "+" list; Esc closes.
    await strip(page).locator('[data-testid=claude-favorite-add]').click()
    await expect(dialog(page).locator('[data-command=deploy]')).toBeVisible()
    await expect(dialog(page).locator('[data-command=review]')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)

    // One click runs the command directly in the conversation.
    await strip(page).getByRole('button', { name: 'Executar /review' }).click()
    await expect(page.getByText('Revisado.', { exact: true })).toBeVisible()
    expect((await userTexts()).some((t) => t.includes('/review'))).toBe(true)

    // Restart with the same folder: the favorite comes back.
    await app.close()
    page = await launchClaude([])
    // The folder session reopens the panel already visible.
    await expect(input(page)).toBeVisible()
    await expect(strip(page).locator('[data-favorite-command=review]')).toBeVisible()

    await strip(page).locator('[data-favorite-command=review]').hover()
    await strip(page).getByRole('button', { name: 'Remover /review dos favoritos' }).click()
    await expect(strip(page).locator('[data-favorite-command]')).toHaveCount(0)
    await expect.poll(favoritesOnDisk).toEqual({ version: 1, commands: [] })
  })
})

test.describe('Claude actions', () => {
  test('each tool has an icon and a verb; the edit shows +N −N and expands the diff', async ({ launchClaude }) => {
    const math = join(repo, 'src', 'math.ts')
    const page = await launchClaude([
      [
        { toolUse: { name: 'Read', input: { file_path: math } } },
        {
          toolUse: {
            name: 'Edit',
            input: {
              file_path: math,
              old_string: 'export function add(a, b) {',
              new_string: 'export function add(a: number, b: number) {'
            }
          }
        },
        { toolUse: { name: 'Bash', input: { command: 'npm test' } } },
        { assistant: 'Feito.' }
      ]
    ])
    await openPanel(page)
    await input(page).fill('tipa a soma')
    await input(page).press('Enter')
    await expect(page.getByText('Feito.', { exact: true })).toBeVisible()

    const read = page.locator('.claude-tool[data-tool=Read]')
    await expect(read.locator('.claude-tool-name')).toHaveText('Leu')
    await expect(read).toHaveAttribute('data-tool-state', 'done')
    await expect(read.locator('.claude-tool-target')).toHaveText('src/math.ts')
    await expect(page.locator('.claude-tool[data-tool=Bash] .claude-tool-name')).toHaveText('Bash')

    const edit = page.locator('.claude-tool[data-tool=Edit]')
    await expect(edit.locator('.claude-tool-name')).toHaveText('Editou')
    await expect(edit.locator('.claude-tool-stat')).toHaveText('+1 −1')
    await edit.locator('.claude-tool-toggle').click()
    await expect(edit.locator('.claude-tool-toggle')).toHaveAttribute('aria-expanded', 'true')
    await expect(edit.locator('.claude-dl.del')).toContainText('export function add(a, b) {')
    await expect(edit.locator('.claude-dl.add')).toContainText('add(a: number, b: number)')
  })
})
