import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { expect, startClaude, test as base } from './fixtures'
import { focusWindow, git, sendCommand } from './helpers'

// Claude questions (`AskUserQuestion`): question card, answers, "Outro", skip, interrupt and attention alert. Uses
// the fake SDK (`WALPH_FAKE_CLAUDE`): never talks to the real Claude. Test windows are hidden, but Playwright emulates
// focus in the renderer: each test blurs the window on open and, when needed, simulates focus
// (`document.hasFocus` + `focus`/`blur` events).

type Step = Record<string, unknown>

let tmpBase: string
let repo: string
let count = 0
let app: ElectronApplication

const tabs = (page: Page): Locator => page.locator('.claude-tab[role=tab]')
const tabOf = (page: Page, title: string): Locator => tabs(page).filter({ hasText: title })
const toastOf = (page: Page, tone: string): Locator => page.locator(`.toasts .toast[data-tone="${tone}"]`)

/** Types into the prompt box of the active session and sends. */
async function send(page: Page, text: string): Promise<void> {
  const input = page.locator('.claude-input:visible')
  await input.fill(text)
  await input.press('Enter')
}

const test = base.extend<{
  launchClaude: (turns: Step[][], settings?: Record<string, unknown>) => Promise<Page>
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
    await use(async (turns, settings) => {
      const launched = await startClaude(launch, { folder: repo, script: { turns }, settings })
      app = launched.app
      return launched.page
    })
  }
})

const q2 = {
  questions: [
    {
      question: 'Qual biblioteca?',
      header: 'Lib',
      options: [
        { label: 'React', description: '' },
        { label: 'Vue', description: '' }
      ],
      multiSelect: false
    },
    {
      question: 'Quais recursos?',
      header: 'Recursos',
      options: [
        { label: 'Rotas', description: '' },
        { label: 'Estado', description: '' },
        { label: 'Testes', description: '' }
      ],
      multiSelect: true
    }
  ]
}
const q1 = {
  questions: [
    {
      question: 'Qual?',
      header: 'Lib',
      options: [{ label: 'A', description: '' }],
      multiSelect: false
    }
  ]
}

const card = (page: Page): Locator => page.locator('.claude-question')

/** Opens the panel (which already starts a conversation). */
async function openPanel(page: Page): Promise<void> {
  await sendCommand(app, page, 'claude.toggleSidebar')
  await expect(tabs(page)).toHaveCount(1)
}

/** Opens the panel and sends the first prompt (which consumes the 1st turn of the script). */
async function openAndSend(page: Page, text = 'pergunte'): Promise<void> {
  await openPanel(page)
  await send(page, text)
}

test.describe('Claude questions', () => {
  test('two questions (single and multiple): pills, answers sent and card hides', async ({ launchClaude }) => {
    const page = await launchClaude([[{ question: q2 }, { assistant: 'Fim.' }]])
    await openAndSend(page)
    await expect(card(page)).toBeVisible()
    await expect(card(page)).toHaveAttribute('role', 'group')
    await expect(card(page)).toHaveAttribute('aria-label', 'Pergunta do Claude')

    const pills = card(page).locator('.claude-question-tab')
    await expect(pills).toHaveCount(2)
    await expect(pills.nth(0)).toHaveAttribute('aria-selected', 'true')
    await expect(card(page).locator('.claude-question-count')).toHaveText('1 de 2')
    await expect(card(page).locator('.claude-question-text')).toHaveText('Qual biblioteca?')
    await expect(card(page).locator('.claude-question-hint')).toHaveCount(0)
    const submit = card(page).getByRole('button', { name: 'Responder' })
    // Answer only exists on the last question; Back only after the first one.
    await expect(submit).toHaveCount(0)
    await expect(card(page).getByRole('button', { name: 'Voltar' })).toHaveCount(0)
    await expect(card(page).getByRole('button', { name: 'Próxima' })).toBeVisible()

    // Single: checks and advances to the next one by itself.
    await card(page).locator('button.claude-question-option').nth(1).click()
    await expect(pills.nth(1)).toHaveAttribute('aria-selected', 'true')
    await expect(pills.nth(0)).toHaveClass(/answered/)
    await expect(card(page).locator('.claude-question-count')).toHaveText('2 de 2')
    await expect(card(page).locator('.claude-question-text')).toHaveText('Quais recursos?')
    await expect(card(page).locator('.claude-question-hint')).toHaveText('Escolha uma ou mais')
    await expect(submit).toBeDisabled()

    const options = card(page).locator('button.claude-question-option')
    await options.nth(0).click()
    await options.nth(2).click()
    await expect(options.nth(0)).toHaveAttribute('aria-checked', 'true')
    await expect(options.nth(0)).toHaveClass(/selected/)
    await expect(options.nth(1)).toHaveAttribute('aria-checked', 'false')
    await expect(pills.nth(1)).toHaveClass(/answered/)
    await expect(submit).toBeEnabled()

    // Back keeps the answer of the first one.
    await card(page).getByRole('button', { name: 'Voltar' }).click()
    await expect(card(page).locator('.claude-question-option.selected .claude-question-label')).toHaveText('Vue')
    await card(page).getByRole('button', { name: 'Próxima' }).click()

    await submit.click()
    await expect(page.getByText('Answers: {"Qual biblioteca?":"Vue","Quais recursos?":"Rotas, Testes"}')).toBeVisible()
    await expect(card(page)).toHaveCount(0)
    await expect(page.getByText('Fim.')).toBeVisible()
  })

  test('keyboard: numbers choose, arrows switch questions', async ({ launchClaude }) => {
    const page = await launchClaude([[{ question: q2 }, { assistant: 'Fim.' }]])
    await focusWindow(page)
    await openAndSend(page)
    await expect(card(page)).toBeVisible()
    // Focus enters the card (session seen).
    await expect(card(page)).toBeFocused()

    await page.keyboard.press('1')
    await expect(card(page).locator('.claude-question-text')).toHaveText('Quais recursos?')
    await page.keyboard.press('ArrowLeft')
    await expect(card(page).locator('.claude-question-text')).toHaveText('Qual biblioteca?')
    await expect(card(page).locator('.claude-question-option.selected .claude-question-label')).toHaveText('React')
    await page.keyboard.press('ArrowRight')
    await expect(card(page).locator('.claude-question-text')).toHaveText('Quais recursos?')

    await page.keyboard.press('2')
    await page.keyboard.press('3')
    await expect(card(page).locator('button.claude-question-option.selected')).toHaveCount(2)
    await card(page).getByRole('button', { name: 'Responder' }).click()
    await expect(
      page.getByText('Answers: {"Qual biblioteca?":"React","Quais recursos?":"Estado, Testes"}')
    ).toBeVisible()
    await expect(card(page)).toHaveCount(0)
  })

  test('"Outro" with text sends the typed text instead of the option', async ({ launchClaude }) => {
    const page = await launchClaude([[{ question: q1 }, { assistant: 'Fim.' }]])
    await openAndSend(page)
    await expect(card(page)).toBeVisible()
    // Single question: no pills and no counter.
    await expect(card(page).locator('.claude-question-tab')).toHaveCount(0)
    await expect(card(page).locator('.claude-question-count')).toHaveCount(0)

    const submit = card(page).getByRole('button', { name: 'Responder' })
    await card(page).locator('.claude-question-other-toggle').click()
    // Outro without text does not count as an answer.
    await expect(submit).toBeDisabled()
    await card(page).locator('.claude-question-other input').fill('Svelte')
    await expect(card(page).locator('.claude-question-other-toggle')).toHaveAttribute('aria-checked', 'true')
    await expect(card(page).locator('button.claude-question-option.selected')).toHaveCount(0)
    await expect(submit).toBeEnabled()
    await card(page).locator('.claude-question-other input').press('Enter')

    await expect(page.getByText('Answers: {"Qual?":"Svelte"}')).toBeVisible()
    await expect(card(page)).toHaveCount(0)
  })

  test('typing in "Outro" without clicking the toggle already selects it', async ({ launchClaude }) => {
    const page = await launchClaude([[{ question: q1 }, { assistant: 'Fim.' }]])
    await openAndSend(page)
    await card(page).locator('.claude-question-other input').fill('X')
    await expect(card(page).locator('.claude-question-other-toggle')).toHaveAttribute('aria-checked', 'true')
    await card(page).getByRole('button', { name: 'Responder' }).click()
    await expect(page.getByText('Answers: {"Qual?":"X"}')).toBeVisible()
  })

  test('skip (x): Claude continues without hanging and the turn ends', async ({ launchClaude }) => {
    const page = await launchClaude([[{ question: q1 }, { assistant: 'Depois.' }]])
    await openAndSend(page)
    await expect(card(page)).toBeVisible()
    await card(page).locator('button.claude-question-skip').click()
    await expect(card(page)).toHaveCount(0)
    await expect(page.getByText(/^Skipped: /)).toBeVisible()
    await expect(page.getByText('Depois.')).toBeVisible()
    // Turn over: no Interrupt button.
    await expect(page.getByRole('button', { name: 'Interromper' })).toHaveCount(0)
    await expect(tabs(page).first()).not.toHaveAttribute('data-status', 'attention')
  })

  test('interrupting the session with the question open closes the card', async ({ launchClaude }) => {
    const page = await launchClaude([[{ question: q1 }, { assistant: 'Nunca.' }]])
    await openAndSend(page)
    await expect(card(page)).toBeVisible()
    await page.getByRole('button', { name: 'Interromper' }).click()
    await expect(card(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Interromper' })).toHaveCount(0)
    await expect(page.getByText('Nunca.')).toHaveCount(0)
    await expect(page.getByText(/^Answers: |^Skipped: /)).toHaveCount(0)
  })

  test('inactive session with a pending question: attention and toast "Claude Code tem uma pergunta"', async ({
    launchClaude
  }) => {
    const page = await launchClaude([[{ question: q1 }, { assistant: 'Fim.' }]])
    await openPanel(page)
    await send(page, 'sessao A')
    await expect(tabOf(page, 'sessao A')).toBeVisible()
    await page.getByRole('button', { name: 'Nova conversa' }).click()
    await expect(tabs(page)).toHaveCount(2)

    const tabA = tabOf(page, 'sessao A')
    await expect(tabA).toHaveAttribute('data-status', 'attention')
    await expect(tabA.locator('.status-dot.attention')).toBeVisible()
    const toast = toastOf(page, 'attention')
    await expect(toast).toHaveCount(1)
    await expect(toast.locator('.toast-title')).toHaveText('Claude Code tem uma pergunta')

    // Answering in the session tab closes the toast and clears the attention.
    await tabA.click()
    await card(page).locator('button.claude-question-option').first().click()
    await card(page).getByRole('button', { name: 'Responder' }).click()
    await expect(toastOf(page, 'attention')).toHaveCount(0)
    await expect(tabA).not.toHaveAttribute('data-status', 'attention')
  })
})
