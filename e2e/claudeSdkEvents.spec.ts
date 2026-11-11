import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { expect, startClaude, test as base } from './fixtures'
import { git, sendCommand as sendAppCommand, setWindowFocus } from './helpers'

// New SDK events in the Claude panel: elicitation (MCP), usage limit, API retry, denied call, subagent/tool
// progress, prompt suggestion, model fallback, `commands_changed` and `fallbackModel`.
// Uses the fake SDK (`WALPH_FAKE_CLAUDE`): never talks to the real Claude.

type Step = Record<string, unknown>
interface Call {
  type: string
  [key: string]: unknown
}

let tmpBase: string
let repo: string
let count = 0
let app: ElectronApplication

interface LaunchOptions {
  userSettings?: Record<string, unknown>
  models?: Array<Record<string, unknown>>
}

const input = (page: Page): Locator => page.locator('[data-testid=claude-input]:visible')
const modelChip = (page: Page): Locator => page.locator('[data-testid=claude-model-chip]')
const card = (page: Page): Locator => page.locator('.claude-card[data-elicitation-mode]')

async function openPanel(page: Page): Promise<void> {
  await sendAppCommand(app, page, 'claude.toggleSidebar')
  await expect(input(page)).toBeVisible()
}

async function send(page: Page, text = 'oi'): Promise<void> {
  await input(page).fill(text)
  await input(page).press('Enter')
}

const calls = (): Promise<Call[]> =>
  app.evaluate(
    () => (globalThis as unknown as { __walphFakeClaudeCalls?: Call[] }).__walphFakeClaudeCalls?.slice() ?? []
  )
const callsOf = async (type: string): Promise<Call[]> => (await calls()).filter((c) => c.type === type)

const test = base.extend<{
  launchClaude: (turns: Step[][], options?: LaunchOptions) => Promise<Page>
}>({
  launchClaude: async ({ launch, tmp }, use) => {
    tmpBase = tmp
    const n = ++count
    repo = join(tmpBase, `projeto-${n}`)
    mkdirSync(repo, { recursive: true })
    writeFileSync(join(repo, 'a.txt'), 'a\n')
    git(repo, 'init', '-q', '-b', 'main')
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', 'initial')
    await use(async (turns, options = {}) => {
      const launched = await startClaude(launch, {
        folder: repo,
        script: { turns, models: options.models },
        settings: options.userSettings,
        store: true
      })
      app = launched.app
      return launched.page
    })
  }
})

const formSchema = {
  type: 'object',
  properties: {
    nome: { type: 'string', title: 'Nome' },
    idade: { type: 'integer', title: 'Idade', minimum: 18, maximum: 99 },
    ativo: { type: 'boolean', title: 'Ativo' },
    cor: { type: 'string', title: 'Cor', enum: ['red', 'blue'], enumNames: ['Vermelho', 'Azul'] }
  },
  required: ['nome', 'idade', 'cor']
}

test.describe('elicitation (MCP server)', () => {
  test('form: validates, sends with the right types, hides and returns focus to the prompt', async ({
    launchClaude
  }) => {
    const page = await launchClaude([
      [
        { elicitation: { serverName: 'docs', message: 'Preciso de dados', requestedSchema: formSchema } },
        { assistant: 'Fim.' }
      ]
    ])
    await setWindowFocus(page, true)
    await openPanel(page)
    await send(page)
    await expect(card(page)).toBeVisible()
    await expect(card(page)).toHaveAttribute('data-elicitation-mode', 'form')
    await expect(card(page).locator('[data-elicitation-server]')).toContainText('docs')
    await expect(card(page).locator('[data-elicitation-message]')).toHaveText('Preciso de dados')

    // Empty: errors on the required fields and nothing sent to the server.
    await card(page).locator('[data-action=accept]').click()
    await expect(card(page).locator('.claude-elicit-error[role=alert]').first()).toBeVisible()
    expect(await callsOf('elicitation')).toHaveLength(0)
    await expect(card(page)).toBeVisible()

    // Out of range stays invalid.
    await card(page).locator('[data-field=nome] input').fill('Ana')
    const azul = card(page).locator('[data-field=cor]').getByLabel('Azul')
    await azul.click()
    await expect(azul).toBeChecked()
    await card(page).locator('[data-field=idade] input').fill('5')
    await card(page).locator('[data-action=accept]').click()
    await expect(card(page).locator('[data-field=idade] .claude-elicit-error')).toBeVisible()
    expect(await callsOf('elicitation')).toHaveLength(0)

    await card(page).locator('[data-field=idade] input').fill('30')
    await card(page).locator('[data-field=ativo] [role=switch]').click()
    await card(page).locator('[data-action=accept]').click()

    await expect(card(page)).toHaveCount(0)
    await expect(page.getByText('Fim.', { exact: true })).toBeVisible()
    const logged = await callsOf('elicitation')
    expect(logged).toHaveLength(1)
    expect(logged[0].result).toEqual({
      action: 'accept',
      content: { nome: 'Ana', idade: 30, ativo: true, cor: 'blue' }
    })
    await expect(input(page)).toBeFocused()
  })

  // Regression: an error shown on blur pushed the layout and the click on the control right below was lost (errors
  // now only show after the first submit attempt).
  test('clicking a control right after leaving an invalid field selects the control', async ({ launchClaude }) => {
    const page = await launchClaude([
      [{ elicitation: { serverName: 'docs', message: 'Dados', requestedSchema: formSchema } }, { assistant: 'Fim.' }]
    ])
    await openPanel(page)
    await send(page)
    await expect(card(page)).toBeVisible()
    await card(page).locator('[data-field=idade] input').fill('5')
    const azul = card(page).locator('[data-field=cor]').getByLabel('Azul')
    await azul.click()
    await expect(azul).toBeChecked({ timeout: 2000 })
  })

  test('declining records decline; url mode shows the host and accepting records accept', async ({ launchClaude }) => {
    const page = await launchClaude([
      [{ elicitation: { serverName: 'docs', message: 'Posso?', requestedSchema: formSchema } }, { assistant: 'Um.' }],
      [
        {
          elicitation: { serverName: 'auth', message: 'Entre', mode: 'url', url: 'https://example.com/auth' }
        },
        { assistant: 'Dois.' }
      ]
    ])
    await openPanel(page)
    await send(page, 'um')
    await expect(card(page)).toBeVisible()
    await card(page).locator('[data-action=decline]').click()
    await expect(page.getByText('Um.', { exact: true })).toBeVisible()
    await expect(card(page)).toHaveCount(0)
    expect((await callsOf('elicitation'))[0].result).toEqual({ action: 'decline' })

    await send(page, 'dois')
    await expect(card(page)).toHaveAttribute('data-elicitation-mode', 'url')
    await expect(card(page).locator('[data-elicitation-host]')).toHaveText('example.com')
    await expect(card(page).locator('[data-elicitation-url]')).toHaveText('https://example.com/auth')
    await card(page).getByRole('button', { name: 'Abrir no navegador' }).click()
    await expect(page.getByText('Dois.', { exact: true })).toBeVisible()
    // With the fake SDK main opens no browser at all (`shell.openExternal` is not even called).
    expect((await callsOf('elicitation'))[1].result).toEqual({ action: 'accept' })
  })

  test('a url that is not http(s) never becomes a card: declined with a warning', async ({ launchClaude }) => {
    const page = await launchClaude([
      [
        { elicitation: { serverName: 'mau', message: 'Clique', mode: 'url', url: 'javascript:alert(1)' } },
        { assistant: 'Seguiu.' }
      ]
    ])
    await openPanel(page)
    await send(page)
    await expect(page.getByText('Seguiu.', { exact: true })).toBeVisible()
    await expect(card(page)).toHaveCount(0)
    await expect(page.locator('.toasts .toast', { hasText: 'não é http(s)' })).toBeVisible()
    const logged = await callsOf('elicitation')
    expect(logged).toHaveLength(1)
    expect(logged[0].result).toEqual({ action: 'decline' })
  })
})

test.describe('turn notices', () => {
  test('usage limit: notice with % and window, hides with allowed and comes back as rejected', async ({
    launchClaude
  }) => {
    const resetsAt = Math.floor(Date.now() / 1000) + 3600
    const page = await launchClaude([
      [
        {
          rateLimit: {
            status: 'allowed_warning',
            rateLimitType: 'five_hour',
            utilization: 0.8,
            resetsAt,
            isUsingOverage: false
          }
        },
        { assistant: 'A.' }
      ],
      [
        { rateLimit: { status: 'allowed', rateLimitType: 'five_hour', resetsAt, isUsingOverage: false } },
        { assistant: 'B.' }
      ],
      [
        { rateLimit: { status: 'rejected', rateLimitType: 'five_hour', resetsAt, isUsingOverage: false } },
        { assistant: 'C.' }
      ]
    ])
    await openPanel(page)
    const banner = page.locator('.claude-ratelimit')
    await send(page, 'a')
    await expect(banner).toHaveAttribute('data-rate-limit', 'warning')
    await expect(banner).toHaveAttribute('data-rate-window', 'five_hour')
    await expect(banner.locator('.claude-ratelimit-text')).toContainText('80%')
    await expect(banner.locator('.claude-ratelimit-text')).toContainText('5 horas')

    await send(page, 'b')
    await expect(page.getByText('B.', { exact: true })).toBeVisible()
    await expect(banner).toHaveCount(0)

    await send(page, 'c')
    await expect(banner).toHaveAttribute('data-rate-limit', 'rejected')
    await expect(banner.locator('.claude-ratelimit-text')).toContainText('atingido')
  })

  test('API retry shows with the cause and hides when the text arrives', async ({ launchClaude }) => {
    const page = await launchClaude([
      [
        { apiRetry: { attempt: 2, maxRetries: 10, delayMs: 5000, errorStatus: 529 } },
        { delay: 2500 },
        { assistant: 'Voltou.' }
      ]
    ])
    await openPanel(page)
    await send(page)
    const retry = page.locator('.claude-retry')
    await expect(retry).toHaveAttribute('data-retry-attempt', '2')
    await expect(retry).toContainText('Servidor sobrecarregado')
    await expect(retry).toContainText('(2/10)')
    await expect(page.getByText('Voltou.', { exact: true })).toBeVisible()
    await expect(retry).toHaveCount(0)
  })

  test('denied call shows the tool and the reason', async ({ launchClaude }) => {
    const page = await launchClaude([
      [
        { permissionDenied: { toolName: 'Bash', toolUseId: 'tn1', reason: 'bloqueado pelo classificador' } },
        { assistant: 'Ok.' }
      ]
    ])
    await openPanel(page)
    await send(page)
    const note = page.locator('.claude-denied[data-denied-tool="tn1"]')
    await expect(note).toBeVisible()
    await expect(note).toContainText('Bash')
    await expect(note).toContainText('bloqueado pelo classificador')
  })

  test('progress: subagent summary in the agents strip and time on the running tool', async ({ launchClaude }) => {
    const page = await launchClaude([
      [
        { toolCall: { id: 'ag1', name: 'Agent', input: { description: 'Investigar', subagent_type: 'Explore' } } },
        { toolCall: { id: 'sh1', name: 'Bash', input: { command: 'sleep 9' } } },
        { taskProgress: { taskId: 'task1', toolUseId: 'ag1', summary: 'Lendo arquivos de configuração', toolUses: 3 } },
        { toolProgress: { toolUseId: 'sh1', toolName: 'Bash', elapsedSeconds: 7 } },
        { delay: 3000 },
        { toolResult: { id: 'sh1', content: 'ok' } },
        { toolResult: { id: 'ag1', content: 'feito' } },
        { assistant: 'Acabou.' }
      ]
    ])
    await openPanel(page)
    await send(page)
    await page.locator('.claude-agents-head').click()
    await expect(page.locator('.claude-agent-task[data-agent-summary]')).toHaveText('Lendo arquivos de configuração')
    const elapsed = page.locator('.claude-tool-elapsed[data-tool-elapsed]')
    await expect(elapsed).toHaveAttribute('data-tool-elapsed', '7')
    await expect(page.getByText('Acabou.', { exact: true })).toBeVisible()
    await expect(elapsed).toHaveCount(0)
  })
})

test.describe('prompt and model', () => {
  test('prompt suggestion: shows after the turn, Tab accepts and typing discards', async ({ launchClaude }) => {
    const page = await launchClaude([
      [{ assistant: 'Um.' }, { promptSuggestion: 'rode os testes' }],
      [{ assistant: 'Dois.' }, { promptSuggestion: 'faça o commit' }]
    ])
    await openPanel(page)
    await send(page, 'um')
    const ghost = page.locator('[data-testid=claude-suggestion]')
    await expect(ghost).toContainText('rode os testes')
    expect((await callsOf('query'))[0]).toMatchObject({ options: { promptSuggestions: true } })

    await input(page).focus()
    await input(page).press('Tab')
    await expect(input(page)).toHaveValue('rode os testes')
    await expect(ghost).toHaveCount(0)

    // Sends, another suggestion comes; typing a letter discards it.
    await input(page).press('Enter')
    await expect(ghost).toContainText('faça o commit')
    await input(page).pressSequentially('x')
    await expect(ghost).toHaveCount(0)
    await expect(input(page)).toHaveValue('x')
  })

  test('model fallback (session scope): notice and the chip switches to the new model', async ({ launchClaude }) => {
    const models = [
      { value: 'opus', displayName: 'Opus', description: '' },
      { value: 'sonnet', displayName: 'Sonnet', description: '' }
    ]
    const page = await launchClaude(
      [[{ assistant: 'Pronto.' }, { modelRefusalFallback: { from: 'opus', to: 'sonnet', scope: 'session' } }]],
      { models, userSettings: { 'claude.model': 'opus' } }
    )
    await openPanel(page)
    await expect(modelChip(page)).toContainText('Opus')
    await send(page)
    await expect(page.locator('.toasts .toast', { hasText: 'a sessão passou a usar sonnet' })).toBeVisible()
    await expect(modelChip(page)).toContainText('Sonnet')
  })

  test('commands_changed: the / menu lists the new command', async ({ launchClaude }) => {
    const page = await launchClaude([
      [
        { commandsChanged: [{ name: 'novocmd', description: 'Comando recém-chegado', argumentHint: '' }] },
        { assistant: 'Pronto.' }
      ]
    ])
    await openPanel(page)
    await send(page)
    await expect(page.getByText('Pronto.', { exact: true })).toBeVisible()
    await page.locator('[data-testid=claude-slash-button]').click()
    await expect(page.locator('[data-testid=claude-slash-menu] [data-command=novocmd]')).toBeVisible()
  })
})

test.describe('claude.fallbackModel', () => {
  test('is passed to query when it differs from the model', async ({ launchClaude }) => {
    const page = await launchClaude([[{ assistant: 'Pronto.' }]], {
      userSettings: { 'claude.model': 'opus', 'claude.fallbackModel': 'sonnet' }
    })
    await openPanel(page)
    await send(page)
    await expect(page.getByText('Pronto.', { exact: true })).toBeVisible()
    const query = (await callsOf('query'))[0]
    expect(query.options).toMatchObject({ model: 'opus', fallbackModel: 'sonnet', onElicitation: true })
  })

  test('is not passed when equal to the model', async ({ launchClaude }) => {
    const page = await launchClaude([[{ assistant: 'Pronto.' }]], {
      userSettings: { 'claude.model': 'opus', 'claude.fallbackModel': 'opus' }
    })
    await openPanel(page)
    await send(page)
    await expect(page.getByText('Pronto.', { exact: true })).toBeVisible()
    const query = (await callsOf('query'))[0]
    expect((query.options as Record<string, unknown>).fallbackModel ?? null).toBeNull()
  })
})
