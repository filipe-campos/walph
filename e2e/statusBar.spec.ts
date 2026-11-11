import { execFileSync } from 'node:child_process'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import { expect, test, type Launch, type MakeRepo } from './fixtures'
import { flushWatcher, git, sendCommand, waitActivePage, waitForIdle } from './helpers'

// Full status bar (encoding, end of line, last commit, degradation by width).

let app: ElectronApplication
let page: Page

const BOM8 = Buffer.from([0xef, 0xbb, 0xbf])
const BOM16LE = Buffer.from([0xff, 0xfe])

const status = (name: string): Locator => page.locator(`.status-bar [data-status="${name}"]`)
const treeRow = (name: string): Locator =>
  page.locator('.tree .tree-row', { has: page.locator('.tree-label', { hasText: new RegExp(`^${name}$`) }) })
const editor = (): Locator => page.locator('.cm-editor .cm-content')
const tab = (name: string): Locator =>
  page.locator('.tab-bar .tab', { has: page.locator('.tab-label', { hasText: new RegExp(`^${name}$`) }) })

/** Repository with a commit containing `files` (Buffers allow exact bytes: BOM, UTF-16, CRLF). */
function repoWith(makeRepo: MakeRepo, files: Record<string, Buffer | string>): string {
  const dir = makeRepo({ 'readme.txt': 'hi\n' })
  for (const [rel, content] of Object.entries(files)) writeFileSync(join(dir, rel), content)
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'add files')
  return dir
}

async function open(launch: Launch, repo: string, settings?: Record<string, unknown>): Promise<void> {
  const launched = await launch({ folders: [repo], settings })
  app = launched.app
  page = await waitActivePage(app)
  await expect(page.locator('.tree .tree-row').first()).toBeVisible()
}

async function openFile(name: string): Promise<void> {
  await treeRow(name).dblclick()
  await expect(tab(name)).toBeVisible()
  await expect(status('encoding')).toBeVisible()
}

/** Option `label` of the `group` section of the encoding picker (both sections repeat the labels). */
const pickerOption = (group: string, label: string): Locator =>
  page
    .locator('[role="group"]', { has: page.locator(`[data-group="${group}"]`) })
    .locator('.palette-item', { has: page.locator('.palette-label', { hasText: new RegExp(`^${label}$`) }) })

async function replaceAll(text: string): Promise<void> {
  await editor().click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(text)
}

test.describe('encoding', () => {
  test('UTF-16 LE with BOM opens readable, shows the encoding and keeps BOM and encoding on save', async ({
    launch,
    makeRepo
  }) => {
    const repo = repoWith(makeRepo, {
      'u16.txt': Buffer.concat([BOM16LE, Buffer.from('olá mundo\r\nsegunda\r\n', 'utf16le')])
    })
    await open(launch, repo)
    await openFile('u16.txt')

    await expect(status('encoding')).toHaveText('UTF-16 LE')
    await expect(editor()).toContainText('olá mundo')
    // `toContainText` normalizes whitespace (and the BOM counts as whitespace): checks the raw text.
    expect(await editor().evaluate((el) => el.textContent)).not.toContain('\ufeff')
    await expect(status('eol')).toHaveText('CRLF')

    await replaceAll('ação nova')
    await expect(tab('u16.txt')).toHaveClass(/\bdirty\b/)
    await sendCommand(app!, page, 'editor.save')
    await expect(tab('u16.txt')).not.toHaveClass(/\bdirty\b/)

    const bytes = readFileSync(join(repo, 'u16.txt'))
    expect([...bytes.subarray(0, 2)]).toEqual([0xff, 0xfe])
    expect(bytes.subarray(2).toString('utf16le')).toBe('ação nova')
    await expect(status('encoding')).toHaveText('UTF-16 LE')
  })

  test('UTF-8 with BOM: the BOM does not show in the editor and is not duplicated on save', async ({
    launch,
    makeRepo
  }) => {
    const repo = repoWith(makeRepo, { 'bom.txt': Buffer.concat([BOM8, Buffer.from('café\n', 'utf8')]) })
    await open(launch, repo)
    await openFile('bom.txt')

    await expect(status('encoding')).toHaveText('UTF-8 com BOM')
    await expect(editor()).toContainText('café')
    expect(await editor().evaluate((el) => el.textContent)).not.toContain('﻿')

    await replaceAll('olá')
    await sendCommand(app!, page, 'editor.save')
    await expect(tab('bom.txt')).not.toHaveClass(/\bdirty\b/)

    const bytes = readFileSync(join(repo, 'bom.txt'))
    expect([...bytes.subarray(0, 3)]).toEqual([...BOM8])
    expect([...bytes.subarray(3, 6)]).not.toEqual([...BOM8])
    expect(bytes.subarray(3).toString('utf8')).toBe('olá')
  })

  test('reopens with Windows-1252 through the picker and saves in that encoding', async ({ launch, makeRepo }) => {
    // A lone 0xE9 byte is not valid UTF-8: "é" in Windows-1252.
    const repo = repoWith(makeRepo, { 'legacy.txt': Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]) })
    await open(launch, repo)
    await openFile('legacy.txt')

    await sendCommand(app!, page, 'editor.changeEncoding')
    await pickerOption('Reabrir com codificação', 'Windows-1252').click()
    await expect(status('encoding')).toHaveText('Windows-1252')
    await expect(editor()).toContainText('café')
    await expect(tab('legacy.txt')).not.toHaveClass(/\bdirty\b/)

    await replaceAll('pão')
    await sendCommand(app!, page, 'editor.save')
    await expect(tab('legacy.txt')).not.toHaveClass(/\bdirty\b/)
    expect([...readFileSync(join(repo, 'legacy.txt'))]).toEqual([0x70, 0xe3, 0x6f])
  })

  test('"Salvar com codificação" converts the file to UTF-16 LE with BOM', async ({ launch, makeRepo }) => {
    const repo = repoWith(makeRepo, { 'conv.txt': 'ola\n' })
    await open(launch, repo)
    await openFile('conv.txt')
    await expect(status('encoding')).toHaveText('UTF-8')

    await sendCommand(app!, page, 'editor.changeEncoding')
    await pickerOption('Salvar com codificação', 'UTF-16 LE').click()
    await expect(status('encoding')).toHaveText('UTF-16 LE')
    await expect.poll(() => readFileSync(join(repo, 'conv.txt')).subarray(0, 2).toString('hex')).toBe('fffe')
    expect(readFileSync(join(repo, 'conv.txt')).subarray(2).toString('utf16le')).toBe('ola\n')
  })

  test('reopening with Windows-1252 a tab dirty only by the EOL discards and keeps the new read', async ({
    launch,
    makeRepo
  }) => {
    // Latin-1 without BOM: opens as UTF-8 (U+FFFD); clicking the EOL dirties the tab only by the end of line.
    const repo = repoWith(makeRepo, { 'lat.txt': Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]) })
    await open(launch, repo)
    await openFile('lat.txt')
    await expect(editor()).toContainText('\ufffd')
    await status('eol').click()
    await expect(status('eol')).toHaveText('CRLF')
    await expect(tab('lat.txt')).toHaveClass(/\bdirty\b/)

    // Native "discard" dialog: button 0 = confirm.
    await app!.evaluate(({ dialog }) => {
      dialog.showMessageBox = () =>
        Promise.resolve({
          response: 0,
          checkboxChecked: false
        })
    })
    await sendCommand(app!, page, 'editor.changeEncoding')
    await pickerOption('Reabrir com codificação', 'Windows-1252').click()

    // Waits for the whole chain (dialog, reread, resyncs and baseline): a nested resync once undid the reread.
    await waitForIdle(page)
    await expect(editor()).toContainText('café')
    expect(await editor().evaluate((el) => el.textContent)).not.toContain('\ufffd')
    await expect(status('encoding')).toHaveText('Windows-1252')
    await expect(tab('lat.txt')).not.toHaveClass(/\bdirty\b/)
  })
})

test.describe('end of line, selection and cursor', () => {
  test('clicking CRLF switches to LF, dirties the tab and save writes only LF', async ({ launch, makeRepo }) => {
    const repo = repoWith(makeRepo, { 'win.txt': 'a\r\nb\r\nc\r\n' })
    await open(launch, repo)
    await openFile('win.txt')

    await expect(status('eol')).toHaveText('CRLF')
    await expect(tab('win.txt')).not.toHaveClass(/\bdirty\b/)
    await status('eol').click()
    await expect(status('eol')).toHaveText('LF')
    await expect(tab('win.txt')).toHaveClass(/\bdirty\b/)

    await sendCommand(app!, page, 'editor.save')
    await expect(tab('win.txt')).not.toHaveClass(/\bdirty\b/)
    const text = readFileSync(join(repo, 'win.txt'), 'utf8')
    expect(text).toBe('a\nb\nc\n')
    expect(text).not.toContain('\r')

    // And back: LF -> CRLF writes CRLF on every line.
    await status('eol').click()
    await expect(status('eol')).toHaveText('CRLF')
    await sendCommand(app!, page, 'editor.save')
    await expect.poll(() => readFileSync(join(repo, 'win.txt'), 'utf8')).toBe('a\r\nb\r\nc\r\n')
  })

  test('the cursor shows the count of selected characters', async ({ launch, makeRepo }) => {
    const repo = repoWith(makeRepo, { 'sel.txt': 'abcde\n' })
    await open(launch, repo)
    await openFile('sel.txt')

    await editor().click()
    await expect(status('cursor')).toContainText(/Ln \d+, Col \d+$/)
    await page.keyboard.press('ControlOrMeta+a')
    await expect(status('cursor')).toContainText('(6 selecionados)')
  })
})

test.describe('git baseline with forced encoding', () => {
  const gutterMarks = (): Locator => page.locator('.cm-git-gutter .cm-gutterElement[class*="cm-git-"]')

  test('Windows-1252 forced reopen does not mark the gutter and an edit marks only the edited line', async ({
    launch,
    makeRepo
  }) => {
    // "café\nação\n" in Windows-1252 (lone E9 and E3: not valid UTF-8).
    const bytes = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a, 0x61, 0xe7, 0xe3, 0x6f, 0x0a])
    const repo = repoWith(makeRepo, { 'cp.txt': bytes })
    await open(launch, repo)
    await openFile('cp.txt')

    await sendCommand(app!, page, 'editor.changeEncoding')
    await pickerOption('Reabrir com codificação', 'Windows-1252').click()
    await expect(status('encoding')).toHaveText('Windows-1252')
    await expect(editor()).toContainText('café')
    await expect(editor()).toContainText('ação')
    await expect(page.locator('.cm-git-gutter')).toHaveCount(1)
    // With a wrongly decoded baseline, marks would appear.
    await waitForIdle(page)
    await expect(gutterMarks()).toHaveCount(0)

    // Edits only the second line.
    await editor().click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type('X')
    await expect(page.locator('.cm-git-gutter .cm-gutterElement.cm-git-modified')).toHaveCount(1)
    await expect(gutterMarks()).toHaveCount(1)
  })
})

test.describe('last commit', () => {
  test('shows author and subject and changes after a commit through the Git view', async ({ launch, makeRepo }) => {
    const repo = repoWith(makeRepo, { 'a.txt': 'a\n' })
    await open(launch, repo)

    await expect(status('commit')).toContainText('Walph Test')
    await expect(status('commit')).toContainText('add files')
    const before = await status('commit').getAttribute('title')

    writeFileSync(join(repo, 'a.txt'), 'a2\n')
    await sendCommand(app!, page, 'view.git')
    const file = page.locator('.git-file', { has: page.locator('.tree-label', { hasText: /^a\.txt$/ }) })
    await expect(file).toBeVisible()
    await page.locator('.commit-box textarea').fill('second status bar commit')
    await file.hover()
    await file.getByRole('button', { name: 'Adicionar ao stage' }).click()
    await page.getByTestId('commit-submit').click()

    await expect(status('commit')).toContainText('second status bar commit')
    expect(await status('commit').getAttribute('title')).not.toBe(before)
    const hash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim()
    await expect(status('commit')).toHaveAttribute('title', new RegExp(hash))
  })
})

test.describe('narrow width', () => {
  async function setWidth(width: number): Promise<void> {
    await app!.evaluate(({ BaseWindow }, w) => {
      const win = BaseWindow.getAllWindows()[0]
      win.setMinimumSize(300, 300) // the app minimum of 800 would prevent testing the smaller widths
      win.setContentSize(w, 700)
    }, width)
    await expect.poll(async () => Math.round((await page.locator('.status-bar').boundingBox())?.width ?? 0)).toBe(width)
  }

  test('the path and indentation menus open upwards, inside the window', async ({ launch, makeRepo }) => {
    const repo = repoWith(makeRepo, { 'a.txt': 'content\n' })
    await open(launch, repo)
    await openFile('a.txt')
    await expect(status('indent')).toBeVisible()
    for (const name of ['path', 'indent']) {
      await status(name).click()
      const menu = page.locator('.status-bar [role="menu"]')
      await expect(menu, `${name} menu`).toBeVisible()
      const box = (await menu.boundingBox())!
      const bar = (await page.locator('.status-bar').boundingBox())!
      const viewport =
        page.viewportSize() ??
        (await page.evaluate<{ width: number; height: number }>(
          '({ width: window.innerWidth, height: window.innerHeight })'
        ))
      expect(box.height, `${name}: menu with real height`).toBeGreaterThan(40)
      expect(box.y + box.height, `${name}: above the bar`).toBeLessThanOrEqual(bar.y + 1)
      expect(box.y, `${name}: inside the window`).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width, `${name}: inside the window`).toBeLessThanOrEqual(viewport.width + 1)
      await page.keyboard.press('Escape')
      await expect(menu).toBeHidden()
    }
  })

  test('the items disappear in order as the bar shrinks, without wrapping', async ({ launch, makeRepo }) => {
    const repo = repoWith(makeRepo, { 'a.txt': 'content\n' })
    await open(launch, repo)
    await openFile('a.txt')
    await editor().click()
    await expect(status('cursor')).toBeVisible()

    const part = (cls: string): Locator => page.locator(`.status-bar .${cls}`)
    // [width, hidden items (classes), visible items]
    const steps: [number, string[], string[]][] = [
      [1400, [], ['s-commit-message', 's-indent', 's-encoding', 's-commit-author', 's-path', 's-eol', 's-commit']],
      [1200, ['s-commit-message'], ['s-indent', 's-encoding', 's-commit-author', 's-path', 's-eol', 's-commit']],
      [1000, ['s-commit-message', 's-indent', 's-encoding'], ['s-commit-author', 's-path', 's-eol', 's-commit']],
      [850, ['s-commit-message', 's-indent', 's-encoding', 's-commit-author'], ['s-path', 's-eol', 's-commit']],
      [700, ['s-commit-message', 's-indent', 's-encoding', 's-commit-author', 's-path'], ['s-eol', 's-commit']],
      [600, ['s-commit-message', 's-indent', 's-encoding', 's-commit-author', 's-path', 's-eol'], ['s-commit']],
      [500, ['s-commit-message', 's-indent', 's-encoding', 's-commit-author', 's-path', 's-eol', 's-commit'], []]
    ]
    for (const [width, hidden, visible] of steps) {
      await setWidth(width)
      for (const cls of hidden) await expect(part(cls), `${cls} hidden at ${width}px`).toBeHidden()
      for (const cls of visible) await expect(part(cls).first(), `${cls} visible at ${width}px`).toBeVisible()
      // Always present.
      for (const name of ['branch', 'sync', 'cursor']) {
        await expect(status(name), `${name} visible at ${width}px`).toBeVisible()
      }
      // No wrapping: fixed height and nothing overflows the bar.
      const bar = (await page.locator('.status-bar').boundingBox())!
      expect(bar.height).toBe(28)
      const cursor = (await status('cursor').boundingBox())!
      expect(cursor.x + cursor.width, `cursor inside the bar at ${width}px`).toBeLessThanOrEqual(
        bar.x + bar.width + 0.5
      )
      const branch = (await status('branch').boundingBox())!
      expect(branch.height, `branch on one line at ${width}px`).toBeLessThanOrEqual(28)
    }
  })

  test('a long branch does not overlap the cursor or the right side (1000 and 1300 px)', async ({
    launch,
    makeRepo
  }) => {
    const repo = repoWith(makeRepo, { 'a.txt': 'content\n' })
    git(repo, 'checkout', '-q', '-b', 'feature/a-really-long-branch-name-for-status-bar-overflow-testing')
    await open(launch, repo)
    await openFile('a.txt')
    await editor().click()
    await expect(status('commit')).toBeVisible()

    for (const width of [1000, 1300]) {
      await setWidth(width)
      const left = (await page.locator('.status-bar .status-left').boundingBox())!
      const right = (await page.locator('.status-bar .status-right').boundingBox())!
      expect(left.x + left.width, `left before right at ${width}px`).toBeLessThanOrEqual(right.x + 0.5)

      const cursor = (await status('cursor').boundingBox())!
      const commit = (await status('commit').boundingBox())!
      expect(commit.x + commit.width, `commit before the cursor at ${width}px`).toBeLessThanOrEqual(cursor.x + 0.5)

      // Every visible child of the left side ends before the cursor.
      const rights = await page
        .locator('.status-bar .status-left > *')
        .evaluateAll((els) =>
          els.filter((el) => el.getClientRects().length > 0).map((el) => el.getBoundingClientRect().right)
        )
      for (const r of rights) expect(r, `status-left child at ${width}px`).toBeLessThanOrEqual(cursor.x + 0.5)

      const fit = await status('commit').evaluate((el) => ({
        overflowing: el.scrollWidth > el.clientWidth + 1,
        overflow: el.ownerDocument.defaultView!.getComputedStyle(el).overflowX
      }))
      expect(!fit.overflowing || fit.overflow === 'hidden', `commit contained at ${width}px`).toBe(true)

      const name = page.locator('.status-bar .status-branch-name')
      await expect(name).toContainText('feature/a-really-long')
      expect(await name.evaluate((el) => el.scrollWidth > el.clientWidth), `ellipsis on the branch at ${width}px`).toBe(
        true
      )
    }
  })
})

test.describe('end of line: tab dirtiness', () => {
  test('toggling the EOL twice on a clean file leaves the tab clean; with an edit in between it stays dirty', async ({
    launch,
    makeRepo
  }) => {
    const repo = repoWith(makeRepo, { 'eol.txt': 'a\nb\n' })
    await open(launch, repo)
    await openFile('eol.txt')
    await expect(status('eol')).toHaveText('LF')

    await status('eol').click()
    await expect(status('eol')).toHaveText('CRLF')
    await expect(tab('eol.txt')).toHaveClass(/\bdirty\b/)
    await status('eol').click()
    await expect(status('eol')).toHaveText('LF')
    await expect(tab('eol.txt')).not.toHaveClass(/\bdirty\b/)

    // With a text edit in between, reverting the EOL does not clean it.
    await status('eol').click()
    await expect(status('eol')).toHaveText('CRLF')
    await editor().click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type('z')
    await status('eol').click()
    await expect(status('eol')).toHaveText('LF')
    await expect(tab('eol.txt')).toHaveClass(/\bdirty\b/)
    expect(readFileSync(join(repo, 'eol.txt'), 'utf8')).toBe('a\nb\n')
  })

  test('toggling the EOL and back writes nothing, even with autosave on', async ({ launch, makeRepo }) => {
    const repo = repoWith(makeRepo, { 'quiet.txt': 'a\r\nb\r\n' })
    await open(launch, repo, { 'files.autoSave': 'afterDelay', 'files.autoSaveDelay': 200 })
    await openFile('quiet.txt')
    await expect(status('eol')).toHaveText('CRLF')
    const before = statSync(join(repo, 'quiet.txt')).mtimeMs
    await page.clock.install()

    await status('eol').click()
    await status('eol').click()
    await expect(status('eol')).toHaveText('CRLF')
    await expect(tab('quiet.txt')).not.toHaveClass(/\bdirty\b/)
    await page.clock.fastForward(5000)
    await flushWatcher(page, repo)
    expect(readFileSync(join(repo, 'quiet.txt'))).toEqual(Buffer.from('a\r\nb\r\n'))
    expect(statSync(join(repo, 'quiet.txt')).mtimeMs).toBe(before)
  })
})
