import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { expect, startClaude, test as base } from './fixtures'
import { focusWindow, git, sendCommand, settle } from './helpers'

// Claude Code alerts: tab status, unread counter, toasts and system notification. Uses the fake SDK
// (`WALPH_FAKE_CLAUDE`): never talks to the real Claude. Test windows are hidden, but Playwright emulates focus in
// the renderer: each test blurs the window on open and, when needed, simulates focus
// (`document.hasFocus` + `focus`/`blur` events).

type Step = Record<string, unknown>

let tmpBase: string
let repo: string
let count = 0
let app: ElectronApplication

/** Records the `Notification.show` calls in main (without actually showing anything). */
async function spyNotifications(): Promise<void> {
  await app.evaluate(({ Notification }) => {
    const g = globalThis as unknown as { __shown: { title: string; body: string }[] }
    g.__shown = []
    // On Linux without libnotify (Xvfb/CI) `isSupported()` is false and the app does not even try to show: the test
    // covers what the app decides to show, not the OS daemon, so the capability is simulated too.
    Notification.isSupported = () => true
    Notification.prototype.show = function (this: { title: string; body: string }) {
      g.__shown.push({ title: this.title, body: this.body })
    }
  })
}

const shownNotifications = (): Promise<{ title: string; body: string }[]> =>
  app.evaluate(() => (globalThis as unknown as { __shown: { title: string; body: string }[] }).__shown)

const tabs = (page: Page): Locator => page.locator('.claude-tab[role=tab]')
const tabOf = (page: Page, title: string): Locator => tabs(page).filter({ hasText: title })
const toasts = (page: Page): Locator => page.locator('.toasts[role=region] .toast')
const toastOf = (page: Page, tone: string): Locator => page.locator(`.toasts .toast[data-tone="${tone}"]`)

/** Types into the prompt box of the active session and sends. */
async function send(page: Page, text: string): Promise<void> {
  const input = page.locator('.claude-input:visible')
  await input.fill(text)
  await input.press('Enter')
}

/**
 * Opens the panel (starts session "A"), sends `A` (which consumes the 1st turn) and opens session "B", leaving "A"
 * running in the background. Returns with "B" active.
 */
async function startBackgroundSession(page: Page): Promise<void> {
  await sendCommand(app, page, 'claude.toggleSidebar')
  await expect(tabs(page)).toHaveCount(1)
  await send(page, 'sessao A')
  await expect(tabOf(page, 'sessao A')).toBeVisible()
  await page.getByRole('button', { name: 'Nova conversa' }).click()
  await expect(tabs(page)).toHaveCount(2)
  await expect(tabs(page).nth(1)).toHaveAttribute('aria-selected', 'true')
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

test.describe('Claude Code alerts', () => {
  test.describe.configure({ mode: 'serial' })

  test('background session that finishes: dot, counter and toast that hides by itself and pauses on hover', async ({
    launchClaude
  }) => {
    test.setTimeout(60_000)
    const page = await launchClaude([
      [{ delay: 800 }, { assistant: 'Pronto.' }, { result: { isError: false, text: 'ok' } }]
    ])
    await page.clock.install()
    await startBackgroundSession(page)

    const tabA = tabOf(page, 'sessao A')
    await expect(tabA).toHaveAttribute('data-status', 'done')
    await expect(tabA.locator('.status-dot.done')).toBeVisible()
    await expect(tabA.locator('.claude-tab-unread')).toHaveAttribute('aria-label', '1 não lida')

    const toast = toastOf(page, 'done')
    await expect(toast).toHaveCount(1)
    await expect(toast.locator('.toast-title')).toHaveText('Claude Code terminou')
    await expect(toast.locator('.toast-description')).toContainText('sessao A')
    await expect(toast).toHaveAttribute('data-key', /^claude:.+:done$/)
    await expect(toast.locator('button.toast-action')).toHaveText('Abrir sessão')
    await expect(toast.locator('.toast-time')).toHaveCount(1)

    // With the mouse over it the timer pauses: the toast outlives its duration (8 s).
    await toast.hover()
    await expect(toast.locator('.toast-time')).toHaveClass(/paused/)
    await page.clock.fastForward(9000)
    await expect(toast).toHaveCount(1)

    // Moving the mouse away resumes the timer and the toast hides by itself.
    await page.mouse.move(5, 5)
    await expect(toast.locator('.toast-time')).not.toHaveClass(/paused/)
    await page.clock.fastForward(9000)
    await expect(toast).toHaveCount(0)
    // The counter belongs to the tab, not the toast.
    await expect(tabA.locator('.claude-tab-unread')).toBeVisible()
  })

  test('permission request in an inactive session: tab needs attention and toast only hides on answer', async ({
    launchClaude
  }) => {
    test.setTimeout(60_000)
    const page = await launchClaude([
      [{ permission: { toolName: 'Bash', input: { command: 'ls' } } }, { assistant: 'Feito.' }]
    ])
    await page.clock.install()
    await startBackgroundSession(page)

    const tabA = tabOf(page, 'sessao A')
    await expect(tabA).toHaveAttribute('data-status', 'attention')
    await expect(tabA.locator('.status-dot.attention')).toBeVisible()
    await expect(tabA.locator('.claude-tab-unread')).toBeVisible()

    const toast = toastOf(page, 'attention')
    await expect(toast).toHaveCount(1)
    await expect(toast.locator('.toast-title')).toHaveText('Claude Code precisa de você')
    await expect(toast).toHaveAttribute('data-key', /^claude:.+:permission:.+$/)
    await expect(toast.locator('button.toast-action')).toHaveText(['Abrir sessão', 'Revisar'])
    // No duration: no timer bar and the alert stays.
    await expect(toast.locator('.toast-time')).toHaveCount(0)
    await page.clock.fastForward(9000)
    await expect(toast).toHaveCount(1)
    await expect(tabA).toHaveAttribute('data-status', 'attention')

    // Answering the request (in the session tab) closes the toast.
    await tabA.click()
    await page.getByRole('button', { name: 'Permitir', exact: true }).click()
    await expect(toastOf(page, 'attention')).toHaveCount(0)
    await expect(tabA).not.toHaveAttribute('data-status', 'attention')
  })

  test('the permission toast can be dismissed with the X without answering the request', async ({ launchClaude }) => {
    const page = await launchClaude([[{ permission: { toolName: 'Bash', input: { command: 'ls' } } }]])
    await startBackgroundSession(page)
    const toast = toastOf(page, 'attention')
    await expect(toast).toHaveCount(1)
    await toast.locator('.toast-close').click()
    await expect(toast).toHaveCount(0)
    // The request stays pending.
    await expect(tabOf(page, 'sessao A')).toHaveAttribute('data-status', 'attention')
  })

  test('opening the session with the window focused resets the counter and done goes back to idle', async ({
    launchClaude
  }) => {
    const page = await launchClaude([[{ delay: 500 }, { result: { isError: false, text: 'ok' } }]])
    await startBackgroundSession(page)
    const tabA = tabOf(page, 'sessao A')
    await expect(tabA).toHaveAttribute('data-status', 'done')
    await expect(tabA.locator('.claude-tab-unread')).toBeVisible()

    await focusWindow(page)
    await tabA.click()
    await expect(tabA).toHaveAttribute('aria-selected', 'true')
    await expect(tabA).toHaveAttribute('data-status', 'idle')
    await expect(tabA.locator('.claude-tab-unread')).toHaveCount(0)
    // The finish toast of the session that is now seen also hides.
    await expect(toastOf(page, 'done')).toHaveCount(0)
  })

  test('"Abrir sessão" in the toast activates the session and, with focus, resets the counter', async ({
    launchClaude
  }) => {
    const page = await launchClaude([[{ delay: 500 }, { result: { isError: false, text: 'ok' } }]])
    await startBackgroundSession(page)
    const tabA = tabOf(page, 'sessao A')
    await expect(tabA).toHaveAttribute('data-status', 'done')

    await focusWindow(page)
    await toastOf(page, 'done').locator('button.toast-action', { hasText: 'Abrir sessão' }).click()
    await expect(tabA).toHaveAttribute('aria-selected', 'true')
    await expect(tabA).toHaveAttribute('data-status', 'idle')
    await expect(tabA.locator('.claude-tab-unread')).toHaveCount(0)
    await expect(toasts(page)).toHaveCount(0)
  })

  test('without focus, the counter accumulates across turns', async ({ launchClaude }) => {
    const page = await launchClaude([
      [{ result: { isError: false, text: 'ok' } }],
      [{ result: { isError: false, text: 'ok' } }]
    ])
    await sendCommand(app, page, 'claude.toggleSidebar')
    await expect(tabs(page)).toHaveCount(1)
    await send(page, 'sessao A')
    await expect(tabs(page).first()).toHaveAttribute('data-status', 'done')
    await send(page, 'segunda')
    await page.getByRole('button', { name: 'Nova conversa' }).click()
    await expect(tabs(page)).toHaveCount(2)
    await expect(tabs(page).first().locator('.claude-tab-unread')).toHaveAttribute('aria-label', '2 não lidas')
  })

  test('failed turn: error toast that does not hide by itself', async ({ launchClaude }) => {
    test.setTimeout(60_000)
    const page = await launchClaude([[{ delay: 500 }, { result: { isError: true, text: 'falhou' } }]])
    await page.clock.install()
    await startBackgroundSession(page)

    const tabA = tabOf(page, 'sessao A')
    await expect(tabA).toHaveAttribute('data-status', 'error')
    const toast = toastOf(page, 'error')
    await expect(toast).toHaveCount(1)
    await expect(toast.locator('.toast-title')).toHaveText('Claude Code falhou')
    await expect(toast).toHaveAttribute('data-key', /^claude:.+:error$/)
    await page.clock.fastForward(9000)
    await expect(toast).toHaveCount(1)
  })

  test('claude.notifications.toast = attention does not show the finish toast, but keeps the dot', async ({
    launchClaude
  }) => {
    const page = await launchClaude([[{ delay: 500 }, { result: { isError: false, text: 'ok' } }]], {
      'claude.notifications.toast': 'attention'
    })
    await startBackgroundSession(page)
    await expect(tabOf(page, 'sessao A')).toHaveAttribute('data-status', 'done')
    await expect(toasts(page)).toHaveCount(0)
  })

  test('claude.notifications.toast = off shows no toast', async ({ launchClaude }) => {
    const page = await launchClaude([[{ permission: { toolName: 'Bash', input: { command: 'ls' } } }]], {
      'claude.notifications.toast': 'off'
    })
    await startBackgroundSession(page)
    await expect(tabOf(page, 'sessao A')).toHaveAttribute('data-status', 'attention')
    await settle(page)
    await expect(toasts(page)).toHaveCount(0)
  })

  test('unfocused window: system notification with a fixed title and the session name', async ({ launchClaude }) => {
    const page = await launchClaude([[{ delay: 500 }, { result: { isError: false, text: 'ok' } }]])
    await spyNotifications()
    await startBackgroundSession(page)
    await expect(tabOf(page, 'sessao A')).toHaveAttribute('data-status', 'done')
    await expect.poll(shownNotifications).toEqual([{ title: 'Claude Code terminou', body: 'sessao A' }])
  })

  test('claude.notifications.system = false shows no system notification', async ({ launchClaude }) => {
    const page = await launchClaude([[{ delay: 500 }, { result: { isError: false, text: 'ok' } }]], {
      'claude.notifications.system': false
    })
    await spyNotifications()
    await startBackgroundSession(page)
    await expect(tabOf(page, 'sessao A')).toHaveAttribute('data-status', 'done')
    // The toast (another channel) still shows; only the system stays quiet.
    await expect(toastOf(page, 'done')).toHaveCount(1)
    await settle(page)
    expect(await shownNotifications()).toEqual([])
  })
})
