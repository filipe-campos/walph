import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { expect, startClaude, test as base } from './fixtures'
import { makeRepo, sendCommand } from './helpers'

// MCP server manager of the Claude panel (`/mcp` and the ⋯ menu). Fake SDK with `mcpServers` in the script.

type Call = Record<string, unknown>

const SECRET_ENV = 'sk-SEGREDO-ENV-9f8e7d6c'
const SECRET_HEADER = 'Bearer SEGREDO-HEADER-1a2b3c4d'

const SERVERS = [
  {
    name: 'alfa',
    status: 'connected',
    scope: 'project',
    serverInfo: { name: 'alfa-server', version: '1.2.3' },
    config: { type: 'stdio', command: 'npx', args: ['-y', 'alfa-mcp'], env: { API_TOKEN: SECRET_ENV } },
    tools: [
      { name: 'read_file', description: 'Reads a file', annotations: { readOnly: true } },
      { name: 'delete_all', description: 'Deletes everything', annotations: { destructive: true } }
    ]
  },
  { name: 'beta', status: 'failed', scope: 'project', error: 'connection refused' },
  {
    name: 'gama',
    status: 'connected',
    scope: 'user',
    config: { type: 'http', url: 'https://gama.example.invalid/mcp', headers: { Authorization: SECRET_HEADER } }
  },
  {
    name: 'delta',
    status: 'needs-auth',
    scope: 'local',
    config: { type: 'http', url: 'https://delta.example.invalid/mcp' }
  }
]

let tmpBase: string
let repo: string
let home: string
let count = 0
let app: ElectronApplication

const input = (page: Page): Locator => page.locator('[data-testid=claude-input]:visible')
const modal = (page: Page): Locator => page.locator('[data-testid=claude-mcp-modal]')
const server = (page: Page, name: string): Locator => modal(page).locator(`[data-mcp-server=${name}]`)
const status = (page: Page, name: string): Locator => page.locator(`[data-testid=mcp-status-${name}]`)

async function openPanel(page: Page): Promise<void> {
  await sendCommand(app, page, 'claude.toggleSidebar')
  await expect(input(page)).toBeVisible()
}

async function openModalViaSlash(page: Page): Promise<void> {
  await openPanel(page)
  await input(page).fill('/mcp')
  await input(page).press('Enter')
  await expect(modal(page)).toBeVisible()
  await expect(server(page, 'alfa')).toBeVisible()
}

async function calls(): Promise<Call[]> {
  return app.evaluate(
    () => (globalThis as unknown as { __walphFakeClaudeCalls?: Call[] }).__walphFakeClaudeCalls?.slice() ?? []
  )
}

const callsOfType = async (type: string): Promise<Call[]> => (await calls()).filter((c) => c.type === type)

const test = base.extend<{ launchClaude: (mcpServers?: unknown[]) => Promise<Page> }>({
  launchClaude: async ({ launch, tmp }, use) => {
    tmpBase = tmp
    const n = ++count
    repo = makeRepo(tmpBase, `projeto-${n}`, { 'src/math.ts': 'export const x = 1\n' })
    home = join(tmpBase, `home-${n}`)
    mkdirSync(home, { recursive: true })
    await use(async (mcpServers = SERVERS) => {
      const launched = await startClaude(launch, {
        folder: repo,
        script: { turns: [[{ assistant: 'Oi.' }]], mcpServers },
        store: true,
        env: { HOME: home, USERPROFILE: home }
      })
      app = launched.app
      return launched.page
    })
  }
})

test.describe('MCP servers of the Claude panel', () => {
  test('"/mcp" opens the manager, clears the field and sends nothing to the CLI', async ({ launchClaude }) => {
    const page = await launchClaude()
    await openModalViaSlash(page)
    await page.keyboard.press('Escape')
    await expect(modal(page)).toHaveCount(0)
    await expect(input(page)).toHaveValue('')

    expect((await calls()).filter((c) => c.type === 'user')).toEqual([])
    await expect(page.locator('.claude-user')).toHaveCount(0)
    expect((await callsOfType('mcpServerStatus')).length).toBeGreaterThan(0)
  })

  test('lists the servers grouped with their status and expands tools and config without secrets', async ({
    launchClaude
  }) => {
    const page = await launchClaude()
    await openModalViaSlash(page)

    // Fixed group order: Project, Local, User.
    await expect(modal(page).locator('[data-mcp-group]')).toHaveCount(3)
    expect(
      await modal(page)
        .locator('[data-mcp-group]')
        .evaluateAll((els) => els.map((e) => e.getAttribute('data-mcp-group')))
    ).toEqual(['project', 'local', 'user'])
    await expect(modal(page).locator('[data-mcp-group=project] [data-mcp-server]')).toHaveCount(2)
    await expect(server(page, 'alfa')).toHaveAttribute('data-status', 'connected')
    await expect(status(page, 'alfa')).toHaveText('Conectado')
    await expect(status(page, 'beta')).toHaveText('Falhou')
    await expect(status(page, 'delta')).toHaveText('Requer autenticação')
    await expect(server(page, 'alfa')).toContainText('2 ferramentas')

    await page.locator('[data-testid=mcp-expand-alfa]').click()
    const detail = page.locator('[data-testid=mcp-detail-alfa]')
    await expect(detail).toBeVisible()
    await expect(detail.locator('[data-mcp-tool=read_file]')).toContainText('somente leitura')
    await expect(detail.locator('[data-mcp-tool=delete_all]')).toContainText('destrutiva')
    await expect(detail).toContainText('npx -y alfa-mcp')
    await expect(detail).toContainText('API_TOKEN')
    await expect(detail).toContainText('alfa-server')

    await page.locator('[data-testid=mcp-expand-gama]').click()
    await expect(page.locator('[data-testid=mcp-detail-gama]')).toContainText('Authorization')
    await page.locator('[data-testid=mcp-expand-beta]').click()
    await expect(page.locator('[data-testid=mcp-error-beta]')).toHaveText('connection refused')

    // The secret values never reach the page DOM.
    const html = await page.evaluate(
      () =>
        (globalThis as unknown as { document: { documentElement: { outerHTML: string } } }).document.documentElement
          .outerHTML
    )
    expect(html).not.toContain(SECRET_ENV)
    expect(html).not.toContain(SECRET_HEADER)
  })

  test('shows the empty state when there are no servers', async ({ launchClaude }) => {
    const page = await launchClaude([])
    await openPanel(page)
    await input(page).fill('/mcp')
    await input(page).press('Enter')
    await expect(page.locator('[data-testid=mcp-empty]')).toBeVisible()
  })

  test('toggles, reconnects, authenticates (with the pasted URL) and logs out, reflected in the row', async ({
    launchClaude
  }) => {
    const page = await launchClaude()
    await openModalViaSlash(page)

    // Disable and re-enable.
    await page.locator('[data-testid=mcp-toggle-alfa]').click()
    await expect(server(page, 'alfa')).toHaveAttribute('data-status', 'disabled')
    await expect(status(page, 'alfa')).toHaveText('Desativado')
    await expect
      .poll(() => callsOfType('toggleMcpServer'))
      .toEqual([expect.objectContaining({ name: 'alfa', enabled: false })])
    await page.locator('[data-testid=mcp-toggle-alfa]').click()
    await expect(server(page, 'alfa')).toHaveAttribute('data-status', 'connected')
    expect((await callsOfType('toggleMcpServer')).at(-1)).toMatchObject({ name: 'alfa', enabled: true })

    // Reconnect a server that failed.
    await page.locator('[data-testid=mcp-reconnect-beta]').click()
    await expect(server(page, 'beta')).toHaveAttribute('data-status', 'connected')
    await expect(page.locator('[data-testid=mcp-reconnect-beta]')).toHaveCount(0)
    expect(await callsOfType('reconnectMcpServer')).toEqual([expect.objectContaining({ name: 'beta' })])

    // Authenticate: shows the URL and waits for the pasted callback URL.
    await page.locator('[data-testid=mcp-authenticate-delta]').click()
    await expect(page.locator('[data-testid=mcp-auth-url-delta]')).toHaveValue('https://example.invalid/oauth')
    expect(await callsOfType('mcpAuthenticate')).toEqual([
      expect.objectContaining({ name: 'delta', authUrl: 'https://example.invalid/oauth' })
    ])
    const callback = 'http://localhost:4567/callback?code=abc&state=xyz'
    await page.locator('[data-testid=mcp-callback-input-delta]').fill(callback)
    await page.locator('[data-testid=mcp-callback-submit-delta]').click()
    await expect(server(page, 'delta')).toHaveAttribute('data-status', 'connected')
    await expect(page.locator('[data-testid=mcp-auth-delta]')).toHaveCount(0)
    expect(await callsOfType('mcpSubmitOAuthCallbackUrl')).toEqual([
      expect.objectContaining({ name: 'delta', callbackUrl: callback })
    ])

    // Logout (connected http/sse only): asks for authentication again.
    await expect(page.locator('[data-testid=mcp-logout-alfa]')).toHaveCount(0)
    await page.locator('[data-testid=mcp-logout-gama]').click()
    await expect(server(page, 'gama')).toHaveAttribute('data-status', 'needs-auth')
    await expect(page.locator('[data-testid=mcp-authenticate-gama]')).toBeVisible()
    expect(await callsOfType('mcpClearAuth')).toEqual([expect.objectContaining({ name: 'gama' })])
  })

  test('adds a stdio server through the form; invalid and duplicate names show an error', async ({ launchClaude }) => {
    const page = await launchClaude()
    await openModalViaSlash(page)
    await page.locator('[data-testid=mcp-add]').click()
    const form = page.locator('[data-testid=mcp-form]')
    await expect(form).toBeVisible()

    // Invalid name: the form validation blocks it before the CLI.
    await page.locator('[data-testid=mcp-form-name]').fill('nome inválido!')
    await page.locator('[data-testid=mcp-form-command]').fill('node server.js')
    await page.locator('[data-testid=mcp-form-submit]').click()
    await expect(form.getByRole('alert')).toContainText('Use letras, números')
    expect(await callsOfType('mcpCli')).toEqual([])

    // Repeated name in the same scope: the CLI error shows inline.
    await page.locator('[data-testid=mcp-form-name]').fill('alfa')
    await page.locator('[data-testid=mcp-form-scope-project]').click()
    await page.locator('[data-testid=mcp-form-submit]').click()
    await expect(page.locator('[data-testid=mcp-form-error]')).toBeVisible()
    await expect(form).toBeVisible()

    // New server, user scope, with an environment variable.
    await page.locator('[data-testid=mcp-form-name]').fill('novo_srv')
    await page.locator('[data-testid=mcp-form-command]').fill('node "meu server.js" --porta 80')
    await page.locator('[data-testid=mcp-form-pairs]').fill('CHAVE=valor-secreto-123')
    await page.locator('[data-testid=mcp-form-scope-user]').click()
    await page.locator('[data-testid=mcp-form-submit]').click()
    await expect(form).toHaveCount(0)
    await expect(server(page, 'novo_srv')).toBeVisible()
    await expect(modal(page).locator('[data-mcp-group=user] [data-mcp-server=novo_srv]')).toHaveAttribute(
      'data-status',
      'connected'
    )

    const cli = (await callsOfType('mcpCli')).filter(
      (c) => (c.args as string[])[1] === 'add-json' && (c.args as string[]).includes('novo_srv')
    )
    expect(cli).toHaveLength(1)
    const args = cli[0].args as string[]
    expect(args.slice(0, 4)).toEqual(['mcp', 'add-json', '-s', 'user'])
    expect(args.slice(4, 6)).toEqual(['--', 'novo_srv'])
    expect(JSON.parse(args[6])).toEqual({
      type: 'stdio',
      command: 'node',
      args: ['meu server.js', '--porta', '80'],
      env: { CHAVE: 'valor-secreto-123' }
    })
    expect(cli[0].cwd).toBe(repo)

    // The variable value does not show in the UI (only the key).
    await page.locator('[data-testid=mcp-expand-novo_srv]').click()
    await expect(page.locator('[data-testid=mcp-detail-novo_srv]')).toContainText('CHAVE')
    await expect(modal(page)).not.toContainText('valor-secreto-123')
  })

  test('removes a server only after confirmation', async ({ launchClaude }) => {
    const page = await launchClaude()
    await openModalViaSlash(page)

    await page.getByRole('button', { name: 'Remover alfa' }).click()
    await page.locator('[data-testid=mcp-remove-cancel-alfa]').click()
    await expect(server(page, 'alfa')).toBeVisible()
    expect(await callsOfType('mcpCli')).toEqual([])

    await page.getByRole('button', { name: 'Remover alfa' }).click()
    await page.locator('[data-testid=mcp-remove-confirm-alfa]').click()
    await expect(server(page, 'alfa')).toHaveCount(0)
    await expect(server(page, 'beta')).toBeVisible()
    expect(await callsOfType('mcpCli')).toEqual([
      expect.objectContaining({ args: ['mcp', 'remove', '-s', 'project', '--', 'alfa'] })
    ])
  })

  test('the "Servidores MCP" item of the ⋯ menu opens the manager and Esc closes it', async ({ launchClaude }) => {
    const page = await launchClaude()
    await openPanel(page)
    await page.getByRole('button', { name: 'Mais ações da sessão' }).click()
    await page.getByRole('menuitem', { name: 'Servidores MCP' }).click()
    await expect(modal(page)).toBeVisible()
    await expect(server(page, 'alfa')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(modal(page)).toHaveCount(0)
  })
})
