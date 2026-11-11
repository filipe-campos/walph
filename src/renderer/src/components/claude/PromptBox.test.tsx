import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClaudeApi } from '@shared/types'
import type { ClaudeSlashCommand } from '@shared/types'
import { installFakeApi } from '../../test/fakeApi'
import { click, getByRole, mount, press, queryAllByRole, settle, typeInto, unmountAll } from '../../test/dom'

const send = vi.fn<ClaudeApi['send']>()
const interrupt = vi.fn<ClaudeApi['interrupt']>()
const commandsOf = vi.fn<ClaudeApi['commands']>()
installFakeApi({
  claude: { send, interrupt, commands: commandsOf },
  files: { list: () => Promise.resolve({ files: [], truncated: false }) }
})

const { PromptBox } = await import('./PromptBox')
const { useStore } = await import('../../store')
const { resetStore } = await import('../../test/resetStore')
const { createConversation } = await import('../../lib/claudeConversation')
const { forgetDrafts, setSentHistory } = await import('../../claudeDrafts')

const ID = 'c1'
const command = (name: string, scope: ClaudeSlashCommand['scope'] = 'builtin'): ClaudeSlashCommand => ({
  name,
  description: `description of ${name}`,
  argumentHint: '',
  scope
})
const COMMANDS = [command('review'), command('release'), command('deploy', 'project')]

function seedConversation(): void {
  const conv = {
    ...createConversation({ id: ID, messages: [] } as never, { permissionMode: 'default', model: 'm' }),
    ready: true,
    mcpReady: true
  }
  useStore.setState((s) => ({ root: '/r', claude: { ...s.claude, activeId: ID, conversations: [conv] } }))
}

interface Props {
  working?: boolean
  loading?: boolean
  suggestion?: string | null
}

function mountBox({ working = false, loading = false, suggestion = null }: Props = {}): HTMLTextAreaElement {
  const host = mount(
    <PromptBox conversationId={ID} commands={COMMANDS} suggestion={suggestion} working={working} loading={loading} />
  )
  return getByRole(host, 'combobox', 'Mensagem para o Claude') as HTMLTextAreaElement
}

const sendButton = (): HTMLButtonElement =>
  getByRole(document.body, 'button', /^(Enviar|Enfileirar)$/) as HTMLButtonElement
const options = (): HTMLElement[] => queryAllByRole(document.body, 'option')
const marked = (): string | undefined =>
  options()
    .find((o) => o.getAttribute('aria-selected') === 'true')
    ?.getAttribute('data-command') ?? undefined

beforeEach(() => {
  send.mockResolvedValue('uuid-1')
  commandsOf.mockResolvedValue(COMMANDS)
  seedConversation()
})

afterEach(() => {
  unmountAll()
  forgetDrafts()
  resetStore()
})

describe('PromptBox: sending', () => {
  it('Enter sends the box text to main and clears the field', async () => {
    const input = mountBox()
    typeInto(input, '  hello, world  ')
    expect(press(input, 'Enter')).toBe(true)
    await settle()
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toBe(ID)
    expect(send.mock.calls[0][1]).toMatchObject({ text: 'hello, world', images: [], attachments: [] })
    expect(input.value).toBe('')
  })

  it('Shift+Enter does not send and lets the browser break the line', async () => {
    const input = mountBox()
    typeInto(input, 'line')
    expect(press(input, 'Enter', { shiftKey: true })).toBe(false)
    await settle()
    expect(send).not.toHaveBeenCalled()
    expect(input.value).toBe('line')
  })

  it('Enter during IME composition does not send', async () => {
    const input = mountBox()
    typeInto(input, 'ni')
    press(input, 'Enter', { isComposing: true })
    await settle()
    expect(send).not.toHaveBeenCalled()
    expect(input.value).toBe('ni')
  })

  it('empty or whitespace-only box: Enter does not send and the button is disabled', async () => {
    const input = mountBox()
    expect(sendButton().disabled).toBe(true)
    press(input, 'Enter')
    typeInto(input, '   \n ')
    press(input, 'Enter')
    await settle()
    expect(sendButton().disabled).toBe(true)
    expect(send).not.toHaveBeenCalled()
  })

  it('the Send button sends the typed text', async () => {
    const input = mountBox()
    typeInto(input, 'via the button')
    expect(sendButton().disabled).toBe(false)
    click(sendButton())
    await settle()
    expect(send.mock.calls[0][1]).toMatchObject({ text: 'via the button' })
    expect(input.value).toBe('')
  })

  it('session loading: the field accepts text and the message goes out when it is ready', async () => {
    useStore.setState((s) => ({
      claude: {
        ...s.claude,
        conversations: s.claude.conversations.map((c) => ({ ...c, ready: false, mcpReady: false }))
      }
    }))
    const input = mountBox({ loading: true })
    expect(input.readOnly).toBe(false)
    expect(input.placeholder).toBe('A sessão está iniciando… você já pode escrever')
    typeInto(input, 'early')
    press(input, 'Enter')
    await settle()
    expect(send).not.toHaveBeenCalled()
    expect(input.value).toBe('')
    expect(useStore.getState().claude.conversations[0]?.queued.map((q) => q.text)).toEqual(['early'])
    useStore.setState((s) => ({
      claude: { ...s.claude, conversations: s.claude.conversations.map((c) => ({ ...c, ready: true, mcpReady: true })) }
    }))
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(send.mock.calls[0]?.[1]).toMatchObject({ text: 'early' })
  })

  it('several messages before the session is ready go out in the order they were given', async () => {
    useStore.setState((s) => ({
      claude: {
        ...s.claude,
        conversations: s.claude.conversations.map((c) => ({ ...c, ready: false, mcpReady: false }))
      }
    }))
    const input = mountBox({ loading: true })
    for (const text of ['one', 'two', 'three']) {
      typeInto(input, text)
      press(input, 'Enter')
      await settle()
    }
    expect(useStore.getState().claude.conversations[0]?.queued).toHaveLength(3)
    useStore.setState((s) => ({
      claude: { ...s.claude, conversations: s.claude.conversations.map((c) => ({ ...c, ready: true, mcpReady: true })) }
    }))
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(3))
    expect(send.mock.calls.map((c) => c[1].text)).toEqual(['one', 'two', 'three'])
  })

  it('repeated Enter while the send has not finished sends only once', async () => {
    let finish!: (uuid: string) => void
    send.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const input = mountBox()
    typeInto(input, 'once')
    press(input, 'Enter')
    press(input, 'Enter')
    await settle()
    expect(send).toHaveBeenCalledTimes(1)
    finish('uuid-1')
    await settle()
    expect(input.value).toBe('')
  })

  it('a send rejected by main keeps the text in the box', async () => {
    send.mockRejectedValue(new Error('session ended'))
    const input = mountBox()
    typeInto(input, 'do not lose')
    press(input, 'Enter')
    await settle()
    expect(send).toHaveBeenCalledTimes(1)
    expect(input.value).toBe('do not lose')
  })

  it('what was typed during the send is not erased when it finishes', async () => {
    let finish!: (uuid: string) => void
    send.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const input = mountBox()
    typeInto(input, 'first')
    press(input, 'Enter')
    await settle()
    typeInto(input, 'next')
    finish('uuid-1')
    await settle()
    expect(input.value).toBe('next')
  })

  it('working: the button becomes Queue and the message is still sent', async () => {
    const input = mountBox({ working: true })
    expect(input.placeholder).toBe('Escreva para enfileirar… (Esc interrompe)')
    typeInto(input, 'later')
    expect(sendButton().getAttribute('aria-label')).toBe('Enfileirar')
    press(input, 'Enter')
    await settle()
    expect(send.mock.calls[0][1]).toMatchObject({ text: 'later' })
  })

  it('Esc with Claude working interrupts the turn', async () => {
    const input = mountBox({ working: true })
    expect(press(input, 'Escape')).toBe(true)
    expect(interrupt).toHaveBeenCalledWith(ID)
  })
})

describe('PromptBox: history', () => {
  async function submit(input: HTMLTextAreaElement, text: string): Promise<void> {
    typeInto(input, text)
    press(input, 'Enter')
    await settle()
  }

  it('↑ recalls the sent messages, newest to oldest, and ↓ goes back to the draft', async () => {
    const input = mountBox()
    await submit(input, 'first')
    await submit(input, 'second')
    typeInto(input, 'draft')
    input.setSelectionRange(0, 0)
    expect(press(input, 'ArrowUp')).toBe(true)
    expect(input.value).toBe('second')
    input.setSelectionRange(0, 0)
    press(input, 'ArrowUp')
    expect(input.value).toBe('first')
    press(input, 'ArrowUp')
    expect(input.value).toBe('first')
    press(input, 'ArrowDown')
    expect(input.value).toBe('second')
    press(input, 'ArrowDown')
    expect(input.value).toBe('draft')
    expect(press(input, 'ArrowDown')).toBe(false)
  })

  it('without history the arrow is not consumed', () => {
    setSentHistory([])
    const input = mountBox()
    expect(press(input, 'ArrowUp')).toBe(false)
    expect(input.value).toBe('')
  })

  it('in the middle of a multi-line text ↑ moves the cursor instead of recalling the history', () => {
    setSentHistory(['old'])
    const input = mountBox()
    typeInto(input, 'a\nb')
    expect(press(input, 'ArrowUp')).toBe(false)
    expect(input.value).toBe('a\nb')
  })

  it('repeating the same message in a row does not duplicate the history entry', async () => {
    const input = mountBox()
    await submit(input, 'same')
    await submit(input, 'same')
    press(input, 'ArrowUp')
    expect(input.value).toBe('same')
    press(input, 'ArrowUp')
    expect(input.value).toBe('same')
    press(input, 'ArrowDown')
    expect(input.value).toBe('')
  })
})

describe('PromptBox: command menu', () => {
  it('typing / opens the command list with the first one marked', async () => {
    const input = mountBox()
    expect(queryAllByRole(document.body, 'listbox')).toHaveLength(0)
    typeInto(input, '/')
    await settle()
    expect(input.getAttribute('aria-expanded')).toBe('true')
    const names = options().map((o) => o.getAttribute('data-command'))
    expect(names.slice(0, 1)).toEqual(['deploy'])
    expect(names).toEqual(expect.arrayContaining(['review', 'release', 'usage']))
    expect(marked()).toBe(names[0])
  })

  it('the text filters the list', async () => {
    const input = mountBox()
    typeInto(input, '/rev')
    await settle()
    expect(options().map((o) => o.getAttribute('data-command'))).toEqual(['review'])
  })

  it('arrows move the mark, wrapping at the ends, and consume the key', async () => {
    const input = mountBox()
    typeInto(input, '/re')
    await settle()
    const names = options().map((o) => o.getAttribute('data-command')!)
    expect(names.length).toBeGreaterThanOrEqual(2)
    expect(marked()).toBe(names[0])
    expect(press(input, 'ArrowDown')).toBe(true)
    expect(marked()).toBe(names[1])
    press(input, 'ArrowUp')
    press(input, 'ArrowUp')
    expect(marked()).toBe(names[names.length - 1])
    press(input, 'ArrowDown')
    expect(marked()).toBe(names[0])
    expect(input.getAttribute('aria-activedescendant')).toBe(options()[0].id)
    expect(input.value).toBe('/re')
  })

  it('Enter accepts the marked command without sending', async () => {
    const input = mountBox()
    typeInto(input, '/re')
    await settle()
    press(input, 'ArrowDown')
    const chosen = marked()!
    press(input, 'Enter')
    await settle()
    expect(send).not.toHaveBeenCalled()
    expect(input.value).toBe(`/${chosen} `)
    expect(queryAllByRole(document.body, 'listbox')).toHaveLength(0)
  })

  it('Tab accepts the marked command', async () => {
    const input = mountBox()
    typeInto(input, '/rev')
    await settle()
    expect(press(input, 'Tab')).toBe(true)
    expect(input.value).toBe('/review ')
  })

  it('clicking an option accepts the command', async () => {
    const input = mountBox()
    typeInto(input, '/dep')
    await settle()
    const option = options()[0]
    option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    await settle()
    expect(input.value).toBe('/deploy ')
  })

  it('Esc closes the menu without erasing the text or interrupting, and typing again reopens it', async () => {
    const input = mountBox({ working: true })
    typeInto(input, '/rev')
    await settle()
    expect(press(input, 'Escape')).toBe(true)
    expect(queryAllByRole(document.body, 'listbox')).toHaveLength(0)
    expect(input.value).toBe('/rev')
    expect(interrupt).not.toHaveBeenCalled()
    typeInto(input, '/revi')
    await settle()
    expect(options()).toHaveLength(1)
  })

  it('fully typed command: Enter sends instead of completing', async () => {
    const input = mountBox()
    typeInto(input, '/review')
    await settle()
    press(input, 'Enter')
    await settle()
    expect(send.mock.calls[0][1]).toMatchObject({ text: '/review' })
  })

  it('the commands button inserts the slash and opens the menu; again clears the field', async () => {
    const input = mountBox()
    const toggle = getByRole(document.body, 'button', 'Comandos')
    click(toggle)
    await settle()
    expect(input.value).toBe('/')
    expect(options().length).toBeGreaterThan(0)
    click(toggle)
    await settle()
    expect(input.value).toBe('')
  })

  it('a slash in the middle of a path (/tmp) does not open the menu and Enter sends', async () => {
    const input = mountBox()
    typeInto(input, 'see /zzz')
    await settle()
    expect(queryAllByRole(document.body, 'listbox')).toHaveLength(0)
    press(input, 'Enter')
    await settle()
    expect(send.mock.calls[0][1]).toMatchObject({ text: 'see /zzz' })
  })
})
