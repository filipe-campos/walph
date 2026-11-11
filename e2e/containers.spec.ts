import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { expect, test as base } from './fixtures'
import { makeRepo, sendCommand } from './helpers'

// Containers screen with a fake `docker` (e2e/fixtures/fake-docker.mjs, pointed to by `docker.path`, which is
// user-only and so goes in the settings.json of the isolated --user-data-dir). The fake's state is a JSON the test
// edits.

const FAKE = join(__dirname, 'fixtures', 'fake-docker.mjs')

interface FakeContainer {
  id: string
  name: string
  image: string
  state: string
  health: string | null
  ports: string
  labels: Record<string, string>
  logs: string[]
}

interface FakeState {
  mode: 'ok' | 'down' | 'downInfoOk'
  failActions?: boolean
  composeDelayMs?: number
  containers: FakeContainer[]
}

type Call = Record<string, unknown>

let tmpBase: string
let count = 0
let repo: string
let statePath: string
let app: ElectronApplication

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** `sh` wrapper that runs the fake with this runner's `node`: `docker.path` must be an executable. */
function makeFakeDocker(dir: string): string {
  const wrapper = join(dir, 'docker')
  writeFileSync(wrapper, `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" "$@"\n`)
  chmodSync(wrapper, 0o755)
  return wrapper
}

function containers(options: { unhealthyApi?: boolean | undefined } = {}): FakeContainer[] {
  const labels = (service: string): Record<string, string> => ({
    'com.docker.compose.project': 'shop',
    'com.docker.compose.service': service,
    'com.docker.compose.project.working_dir': repo,
    'com.docker.compose.project.config_files': join(repo, 'compose.yaml')
  })
  return [
    {
      id: 'aaaaaaaaaaaa',
      name: 'shop-web-1',
      image: 'nginx:1.27',
      state: 'running',
      health: 'healthy',
      ports: '0.0.0.0:8080->80/tcp, :::8080->80/tcp',
      labels: labels('web'),
      logs: ['INFO servidor iniciado', 'WARN cache frio', 'ERROR upstream indisponível']
    },
    {
      id: 'bbbbbbbbbbbb',
      name: 'shop-api-1',
      image: 'shop/api:dev',
      state: 'running',
      health: options.unhealthyApi ? 'unhealthy' : null,
      ports: '0.0.0.0:3000->3000/tcp',
      labels: labels('api'),
      logs: ['INFO api ouvindo na porta 3000', 'ERROR connection refused db:5432', 'DEBUG tentativa 3']
    },
    {
      id: 'cccccccccccc',
      name: 'shop-db-1',
      image: 'postgres:16',
      state: 'running',
      health: 'healthy',
      ports: '5432/tcp',
      labels: labels('db'),
      logs: ['INFO banco pronto']
    },
    {
      id: 'dddddddddddd',
      name: 'shop-worker-1',
      image: 'shop/worker:dev',
      state: 'exited',
      health: null,
      ports: '',
      labels: labels('worker'),
      logs: ['INFO worker parado']
    },
    {
      id: 'eeeeeeeeeeee',
      name: 'redis-solo',
      image: 'redis:7',
      state: 'running',
      health: null,
      ports: '0.0.0.0:6379->6379/tcp',
      labels: {},
      logs: ['INFO redis pronto']
    }
  ]
}

const readState = (): FakeState => JSON.parse(readFileSync(statePath, 'utf8')) as FakeState
const writeState = (state: FakeState): void => writeFileSync(statePath, JSON.stringify(state))
function patchState(fn: (s: FakeState) => void): void {
  const s = readState()
  fn(s)
  writeState(s)
}

/** Commands received by the fake docker (all of them, including `stats` and `logs`). */
const fakeCalls = (): string[][] => {
  try {
    return readFileSync(`${statePath}.calls.jsonl`, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => (JSON.parse(l) as { args: string[] }).args)
  } catch {
    return []
  }
}

const fakePids = (kind: string): number[] => {
  try {
    return readFileSync(`${statePath}.pids`, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { pid: number; kind: string })
      .filter((p) => p.kind === kind)
      .map((p) => p.pid)
  } catch {
    return []
  }
}

interface LaunchOptions {
  state?: Partial<FakeState>
  unhealthyApi?: boolean
  dockerPath?: string
  claudeTurns?: Array<Array<Record<string, unknown>>>
}

async function openContainers(page: Page): Promise<void> {
  await sendCommand(app, page, 'view.containers')
  await expect(page.getByTestId('containers-view')).toBeVisible()
}

const group = (page: Page, project: string): Locator =>
  page.locator(`[data-testid=container-group][data-project="${project}"]`)
const row = (page: Page, name: string): Locator =>
  page.locator(`[data-testid=container-row][data-container-name="${name}"]`)

/** The row buttons only show on hover. */
async function rowAction(page: Page, name: string, action: string): Promise<void> {
  const r = row(page, name)
  await r.hover()
  await r.locator(`[data-action=${action}]`).click()
}

const claudeCalls = (): Promise<Call[]> =>
  app.evaluate(
    () => (globalThis as unknown as { __walphFakeClaudeCalls?: Call[] }).__walphFakeClaudeCalls?.slice() ?? []
  )

const test = base.extend<{ launchContainers: (options?: LaunchOptions) => Promise<Page> }>({
  launchContainers: async ({ launch, tmp }, use) => {
    tmpBase = tmp
    const n = ++count
    repo = makeRepo(tmpBase, `projeto-${n}`, {
      'README.md': '# loja\n',
      'compose.yaml': 'services:\n  web:\n    image: nginx\n'
    })
    statePath = join(tmpBase, `docker-${n}.json`)
    await use(async (options = {}) => {
      writeState({ mode: 'ok', containers: containers({ unhealthyApi: options.unhealthyApi }), ...options.state })
      const wrapper = makeFakeDocker(tmpBase)
      const env: Record<string, string> = { WALPH_FAKE_DOCKER_STATE: statePath }
      let claudeScript: unknown
      if (options.claudeTurns) {
        claudeScript = { turns: options.claudeTurns }
        const home = join(tmpBase, `home-${n}`)
        mkdirSync(home, { recursive: true })
        env.HOME = home
        env.USERPROFILE = home
      }
      const launched = await launch({
        folders: [repo],
        env,
        settings: { 'terminal.gpuAcceleration': 'off', 'docker.path': options.dockerPath ?? wrapper },
        claudeScript,
        claudeStore: options.claudeTurns !== undefined
      })
      app = launched.app
      await expect(launched.page.locator('.tree .tree-row').first()).toBeVisible()
      return launched.page
    })
  }
})
test.skip(process.platform === 'win32', 'The fake docker uses an sh wrapper')

test.describe('Containers screen', () => {
  test('groups the compose project with "3/4 rodando" and the CPU and memory change between frames', async ({
    launchContainers
  }) => {
    const page = await launchContainers()
    await openContainers(page)

    await expect(page.getByTestId('containers-context')).toHaveText(/fake-context · Docker 27\.0\.1-fake/)
    const shop = group(page, 'shop')
    await expect(shop).toBeVisible()
    await expect(shop.getByTestId('container-group-count')).toHaveText('3/4 rodando')
    await expect(shop.getByTestId('container-row')).toHaveCount(4)
    // The standalone container stays out of the project, in another group.
    await expect(
      page.locator('[data-testid=container-group][data-standalone=true]').getByTestId('container-row')
    ).toHaveCount(1)
    await expect(row(page, 'shop-worker-1')).toHaveAttribute('data-state', 'exited')
    await expect(row(page, 'shop-api-1')).toHaveAttribute('data-health', '')
    await expect(row(page, 'shop-web-1')).toHaveAttribute('data-health', 'healthy')
    await expect(page.getByTestId('summary-running')).toContainText('4')

    // Ports: the IPv6 mirror does not become a second chip.
    await expect(row(page, 'shop-web-1').getByTestId('container-port')).toHaveCount(1)
    await expect(row(page, 'shop-web-1').getByTestId('container-port')).toContainText('8080')

    const cpu = row(page, 'shop-web-1').getByTestId('container-cpu')
    const mem = row(page, 'shop-web-1').getByTestId('container-mem')
    await expect(cpu).toContainText('%')
    await expect(mem).toContainText('MB')
    const firstCpu = (await cpu.textContent()) ?? ''
    const firstMem = (await mem.textContent()) ?? ''
    await expect.poll(async () => cpu.textContent(), { timeout: 8000 }).not.toBe(firstCpu)
    await expect.poll(async () => mem.textContent(), { timeout: 8000 }).not.toBe(firstMem)
    // A stopped container has no measurement.
    await expect(row(page, 'shop-worker-1').getByTestId('container-cpu')).toHaveText('—')
  })

  test('search and filters narrow the list', async ({ launchContainers }) => {
    const page = await launchContainers()
    await openContainers(page)
    await expect(page.getByTestId('container-row')).toHaveCount(5)

    await page.getByTestId('containers-filter-stopped').click()
    await expect(page.getByTestId('container-row')).toHaveCount(1)
    await expect(row(page, 'shop-worker-1')).toBeVisible()
    await page.getByTestId('containers-filter-running').click()
    await expect(page.getByTestId('container-row')).toHaveCount(4)
    await page.getByTestId('containers-filter-all').click()

    await page.getByTestId('containers-search').fill('postgres')
    await expect(page.getByTestId('container-row')).toHaveCount(1)
    await expect(row(page, 'shop-db-1')).toBeVisible()
    await page.getByTestId('containers-search').fill('6379')
    await expect(row(page, 'redis-solo')).toBeVisible()
    await expect(page.getByTestId('container-row')).toHaveCount(1)
    await page.getByTestId('containers-search').fill('nada-assim')
    await expect(page.getByTestId('containers-none')).toBeVisible()
  })

  test('stopping, starting and restarting a container show in the list and reach docker with the id', async ({
    launchContainers
  }) => {
    const page = await launchContainers()
    await openContainers(page)
    const shop = group(page, 'shop')
    await expect(shop.getByTestId('container-group-count')).toHaveText('3/4 rodando')

    await rowAction(page, 'shop-web-1', 'stop')
    await expect(row(page, 'shop-web-1')).toHaveAttribute('data-state', 'exited')
    await expect(shop.getByTestId('container-group-count')).toHaveText('2/4 rodando')
    expect(fakeCalls()).toContainEqual(['stop', '--', 'aaaaaaaaaaaa'])

    await rowAction(page, 'shop-web-1', 'start')
    await expect(row(page, 'shop-web-1')).toHaveAttribute('data-state', 'running')
    await expect(shop.getByTestId('container-group-count')).toHaveText('3/4 rodando')
    expect(fakeCalls()).toContainEqual(['start', '--', 'aaaaaaaaaaaa'])

    // The fake marks the restart with "Up Less than a second": the uptime changes.
    await rowAction(page, 'shop-api-1', 'restart')
    await expect(row(page, 'shop-api-1')).toContainText('menos de 1 segundo')
    expect(fakeCalls()).toContainEqual(['restart', '--', 'bbbbbbbbbbbb'])
  })

  test('the group actions run compose with the folder, file and project taken from the labels', async ({
    launchContainers
  }) => {
    const page = await launchContainers()
    await openContainers(page)
    const shop = group(page, 'shop')
    const compose = join(repo, 'compose.yaml')

    await shop.locator('[data-action=group-up]').click()
    await expect(row(page, 'shop-worker-1')).toHaveAttribute('data-state', 'running')
    await expect(shop.getByTestId('container-group-count')).toHaveText('4/4 rodando')
    expect(fakeCalls()).toContainEqual([
      'compose',
      '--project-directory',
      repo,
      '-f',
      compose,
      '-p',
      'shop',
      'up',
      '-d'
    ])

    await shop.locator('[data-action=group-stop]').click()
    await expect(shop.getByTestId('container-group-count')).toHaveText('0/4 rodando')
    expect(fakeCalls()).toContainEqual(['compose', '--project-directory', repo, '-f', compose, '-p', 'shop', 'stop'])
    // The standalone container is not part of the project.
    await expect(row(page, 'redis-solo')).toHaveAttribute('data-state', 'running')

    await shop.locator('[data-action=group-restart]').click()
    await expect(shop.getByTestId('container-group-count')).toHaveText('4/4 rodando')
    expect(fakeCalls()).toContainEqual(['compose', '--project-directory', repo, '-f', compose, '-p', 'shop', 'restart'])
  })

  test('the header "Compose up" uses the compose file of the workspace folder', async ({ launchContainers }) => {
    const page = await launchContainers()
    await openContainers(page)
    await expect(group(page, 'shop').getByTestId('container-group-count')).toHaveText('3/4 rodando')

    await page.getByTestId('containers-compose-up').click()
    await expect(group(page, 'shop').getByTestId('container-group-count')).toHaveText('4/4 rodando')
    expect(fakeCalls()).toContainEqual(['compose', '-f', join(repo, 'compose.yaml'), 'up', '-d'])
  })

  test('reloading the view kills the running compose up (no orphan docker)', async ({ launchContainers }) => {
    const page = await launchContainers({ state: { composeDelayMs: 60_000 } })
    await openContainers(page)
    await page.getByTestId('containers-compose-up').click()
    await expect.poll(() => fakePids('compose').length).toBe(1)
    const pid = fakePids('compose')[0]
    expect(isAlive(pid)).toBe(true)

    await page.reload()
    await expect.poll(() => isAlive(pid)).toBe(false)
  })

  test('without compose in the folder the header button is disabled and the group warns when the file is gone', async ({
    launchContainers
  }) => {
    const page = await launchContainers()
    rmSync(join(repo, 'compose.yaml'))
    await openContainers(page)
    await expect(page.getByTestId('containers-compose-up')).toBeDisabled()
    // The project's compose comes from the labels and the file is gone: error in pt-BR, nothing runs.
    await group(page, 'shop').locator('[data-action=group-up]').click()
    await expect(page.locator('.toasts .toast-error')).toBeVisible()
    await expect(page.locator('.toasts .toast-error')).toContainText('Arquivo do compose não encontrado')
    expect(fakeCalls().some((a) => a[0] === 'compose')).toBe(false)
  })

  test('a failing action shows the error in pt-BR even with the containers screen open', async ({
    launchContainers
  }) => {
    const page = await launchContainers({ state: { failActions: true } })
    await openContainers(page)
    await rowAction(page, 'shop-web-1', 'stop')
    await expect(page.locator('.toasts .toast-error')).toBeVisible()
    await expect(page.locator('.toasts .toast-error')).toContainText('falha simulada')
    await expect(row(page, 'shop-web-1')).toHaveAttribute('data-state', 'running')
  })

  test('logs follow in real time and stop when the detail closes, with no orphan docker logs -f', async ({
    launchContainers
  }) => {
    const page = await launchContainers()
    await openContainers(page)

    await rowAction(page, 'shop-web-1', 'logs')
    await expect(page.getByTestId('container-detail')).toBeVisible()
    const lines = page.getByTestId('container-log-line')
    await expect(lines.filter({ hasText: 'servidor iniciado' })).toHaveCount(1)
    await expect(lines.filter({ hasText: 'upstream indisponível' })).toHaveAttribute('data-level', 'error')
    await expect(lines.filter({ hasText: 'cache frio' })).toHaveAttribute('data-level', 'warn')

    // New lines arrive on their own (the fake emits a tick every 400 ms; on a slow machine the first ones may already
    // have arrived when the count is read, so it waits for growth from it instead of waiting for a specific tick).
    const before = await lines.count()
    await expect.poll(() => lines.count()).toBeGreaterThan(before)
    await expect(lines.filter({ hasText: 'tick 2' })).toHaveCount(1)
    await expect(page.getByTestId('container-logs-status')).toContainText('Seguindo')

    await expect.poll(() => fakePids('logs-follow').length).toBe(1)
    const [pid] = fakePids('logs-follow')
    expect(isAlive(pid)).toBe(true)
    expect(fakeCalls()).toContainEqual(['logs', '-f', '--timestamps', '--tail', '500', '--', 'aaaaaaaaaaaa'])

    await page.getByTestId('container-detail-close').click()
    await expect(page.getByTestId('container-detail')).toHaveCount(0)
    await expect.poll(() => isAlive(pid)).toBe(false)

    // Switching containers kills the previous follow; leaving the screen kills the last one.
    await rowAction(page, 'shop-api-1', 'logs')
    await expect(page.getByTestId('container-log-line').filter({ hasText: 'api ouvindo' })).toHaveCount(1)
    await expect.poll(() => fakePids('logs-follow').length).toBe(2)
    const second = fakePids('logs-follow')[1]
    expect(isAlive(second)).toBe(true)
    await rowAction(page, 'shop-db-1', 'logs')
    await expect(page.getByTestId('container-log-line').filter({ hasText: 'banco pronto' })).toHaveCount(1)
    await expect.poll(() => isAlive(second)).toBe(false)
    await expect.poll(() => fakePids('logs-follow').length).toBe(3)
    const third = fakePids('logs-follow')[2]
    expect(isAlive(third)).toBe(true)

    await sendCommand(app, page, 'view.explorer')
    await expect(page.getByTestId('containers-view')).toHaveCount(0)
    await expect.poll(() => isAlive(third)).toBe(false)
  })

  test('the Details tab shows the inspect without the environment variable values', async ({ launchContainers }) => {
    const page = await launchContainers({ unhealthyApi: true })
    await openContainers(page)
    await row(page, 'shop-api-1').getByRole('button', { name: 'shop-api-1', exact: true }).click()
    await page.getByTestId('container-tab-details').click()
    const details = page.getByTestId('container-details')
    await expect(details).toContainText('shop/api:dev')
    await expect(details).toContainText('serve --port 80')
    await expect(page.getByTestId('container-detail-health')).toContainText('unhealthy')
    await expect(page.getByTestId('container-detail-health')).toContainText('3 falhas seguidas')
    await expect(details).toContainText('2 (valores não são exibidos)')
    await expect(details).not.toContainText('nao-mostrar')
  })

  test('an unhealthy container shows the card and "Investigar com o Claude" opens a session with the logs', async ({
    launchContainers
  }) => {
    const page = await launchContainers({ unhealthyApi: true, claudeTurns: [[{ assistant: 'Vou olhar os logs.' }]] })
    await openContainers(page)

    const card = page.getByTestId('container-problem-card')
    await expect(card).toHaveCount(1)
    await expect(card).toContainText('shop-api-1')
    await expect(page.getByTestId('summary-problems')).toContainText('1')
    await expect(row(page, 'shop-api-1')).toHaveAttribute('data-health', 'unhealthy')

    await card.getByTestId('container-investigate').click()
    // Claude is a panel of the normal layout: the containers screen gives way.
    await expect(page.getByTestId('containers-view')).toHaveCount(0)
    await expect(page.getByText('Vou olhar os logs.', { exact: true })).toBeVisible()

    await expect
      .poll(async () => {
        const users = (await claudeCalls()).filter((c) => c.type === 'user')
        return JSON.stringify(users)
      })
      .toContain('connection refused db:5432')
    const sent = JSON.stringify((await claudeCalls()).filter((c) => c.type === 'user'))
    expect(sent).toContain('shop-api-1')
    expect(sent).toContain('unhealthy')
    // Delimited and untrusted context; environment variables are only counted.
    expect(sent).toContain('<docker-logs untrusted=')
    expect(sent).not.toContain('nao-mostrar')
    expect(fakeCalls()).toContainEqual(['logs', '--tail', '100', '--timestamps', '--', 'bbbbbbbbbbbb'])
  })

  test('a stopped daemon is explained in pt-BR and "Tentar de novo" shows the list when it comes back', async ({
    launchContainers
  }) => {
    // `downInfoOk` = real Docker 27: `info` exits 0 with JSON whose ServerVersion is empty (the text only on stderr).
    const page = await launchContainers({ state: { mode: 'downInfoOk' } })
    await openContainers(page)

    const error = page.getByTestId('containers-error')
    await expect(error.locator('p')).toHaveText(
      'Não foi possível conectar ao Docker. Abra o Docker Desktop (ou inicie o daemon) e tente de novo.'
    )
    await expect(error).not.toContainText('Cannot connect')
    await expect(page.getByTestId('container-row')).toHaveCount(0)
    await expect(page.getByTestId('containers-compose-up')).toBeDisabled()

    // Retrying with the daemon still stopped keeps explaining.
    const infoCalls = (): number => fakeCalls().filter((a) => a[0] === 'info').length
    const before = infoCalls()
    await page.getByTestId('containers-retry').click()
    await expect.poll(infoCalls).toBeGreaterThan(before)
    await expect(error).toBeVisible()

    // Waits for the attempt to finish (the button is disabled while loading) before the daemon comes back.
    await expect(page.getByTestId('containers-retry')).toBeEnabled()
    patchState((s) => {
      s.mode = 'ok'
    })
    await page.getByTestId('containers-retry').click()
    await expect(page.getByTestId('containers-error')).toHaveCount(0)
    await expect(group(page, 'shop').getByTestId('container-group-count')).toHaveText('3/4 rodando')
    // Stats come back on their own after the daemon: the CPU shows without reopening the screen.
    await expect(row(page, 'shop-web-1').getByTestId('container-cpu')).toContainText('%', { timeout: 15_000 })
  })

  test('without the Docker executable the screen says it was not found', async ({ launchContainers }) => {
    const page = await launchContainers({ dockerPath: join(tmpBase, 'nao-existe', 'docker') })
    await openContainers(page)
    await expect(page.getByTestId('containers-error')).toContainText('Docker não encontrado')
    await expect(page.getByTestId('containers-retry')).toBeVisible()
  })

  test('⇧⌘D toggles the screen that takes over the layout and the badge counts the problem containers', async ({
    launchContainers
  }) => {
    const page = await launchContainers({ unhealthyApi: true })
    const activity = page.getByTestId('activity-containers')

    await expect(page.locator('.tree').first()).toBeVisible()
    await expect(page.locator('.editor-slot')).toBeVisible()
    await expect(page.getByTestId('containers-view')).toHaveCount(0)
    await expect(activity).toHaveAttribute('aria-pressed', 'false')

    await sendCommand(app, page, 'view.containers')
    await expect(page.getByTestId('containers-view')).toBeVisible()
    await expect(activity).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.tree').first()).toBeHidden()
    await expect(page.locator('.editor-slot')).toBeHidden()
    await expect(page.locator('.claude-sidebar')).toBeHidden()
    await expect(page.getByTestId('containers-search')).toBeFocused()

    await expect(page.getByTestId('activity-containers-badge')).toHaveText('1')
    await expect(activity).toHaveAttribute('aria-label', /1 container com problema/)

    // The same command goes back to the layout; so does the explorer.
    await sendCommand(app, page, 'view.containers')
    await expect(page.getByTestId('containers-view')).toHaveCount(0)
    await expect(page.locator('.tree').first()).toBeVisible()
    await expect(page.locator('.editor-slot')).toBeVisible()
    await expect(page.getByTestId('activity-containers-badge')).toHaveText('1')

    await sendCommand(app, page, 'view.containers')
    await expect(page.getByTestId('containers-view')).toBeVisible()
    await sendCommand(app, page, 'view.explorer')
    await expect(page.getByTestId('containers-view')).toHaveCount(0)
    await expect(page.locator('.tree').first()).toBeVisible()

    // The activity bar icon does the same as the shortcut.
    await activity.click()
    await expect(page.getByTestId('containers-view')).toBeVisible()
    await activity.click()
    await expect(page.getByTestId('containers-view')).toHaveCount(0)
  })

  test('with no problem containers there is no badge; leaving the screen stops docker stats', async ({
    launchContainers
  }) => {
    const page = await launchContainers()
    await openContainers(page)
    await expect(group(page, 'shop')).toBeVisible()
    await expect(page.getByTestId('activity-containers-badge')).toHaveCount(0)
    await expect(page.getByTestId('container-problem-card')).toHaveCount(0)

    await expect.poll(() => fakePids('stats').length).toBe(1)
    const [pid] = fakePids('stats')
    expect(isAlive(pid)).toBe(true)
    await sendCommand(app, page, 'view.containers')
    await expect.poll(() => isAlive(pid)).toBe(false)
  })

  test('the container terminal opens a pty with docker exec -it', async ({ launchContainers }) => {
    const page = await launchContainers()
    await openContainers(page)
    await rowAction(page, 'shop-db-1', 'terminal')
    await expect.poll(() => fakeCalls().some((a) => a[0] === 'exec')).toBe(true)
    expect(fakeCalls()).toContainEqual(['exec', '-it', '--', 'cccccccccccc', 'sh'])
    // The terminal lives in the normal layout: goes back to it to see the pty output.
    await sendCommand(app, page, 'view.explorer')
    await expect(page.locator('.xterm-rows')).toContainText('fake-docker exec shop-db-1')
  })
})
