import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClaudeApi, ClaudeElicitationField, ClaudePermissionRequest } from '@shared/types'
import { installFakeApi } from '../../test/fakeApi'
import { click, getByRole, mount, press, queryAllByRole, settle, typeInto, unmountAll } from '../../test/dom'

const respond = vi.fn<ClaudeApi['respond']>()
installFakeApi({ claude: { respond } })

const { ElicitationCard } = await import('./ElicitationCard')
const { useStore } = await import('../../store')
const { resetStore } = await import('../../test/resetStore')
const { createConversation } = await import('../../lib/claudeConversation')

const ID = 'c1'
const REQUEST_ID = 'e1'

type ElicitationRequest = Extract<ClaudePermissionRequest, { kind: 'elicitation' }>

const nome: ClaudeElicitationField = {
  key: 'nome',
  label: 'Name',
  description: 'How it appears in the report',
  required: true,
  type: 'string'
}
const idade: ClaudeElicitationField = {
  key: 'idade',
  label: 'Age',
  description: '',
  required: false,
  type: 'number',
  integer: true,
  minimum: 0,
  maximum: 150
}
const email: ClaudeElicitationField = {
  key: 'email',
  label: 'E-mail',
  description: '',
  required: false,
  type: 'string',
  format: 'email'
}
const newsletter: ClaudeElicitationField = {
  key: 'newsletter',
  label: 'Get news',
  description: '',
  required: false,
  type: 'boolean'
}
const cor: ClaudeElicitationField = {
  key: 'cor',
  label: 'Color',
  description: '',
  required: true,
  type: 'enum',
  multiple: false,
  options: [
    { value: 'red', label: 'Red' },
    { value: 'blue', label: 'Blue' }
  ]
}
const tags: ClaudeElicitationField = {
  key: 'tags',
  label: 'Tags',
  description: '',
  required: false,
  type: 'enum',
  multiple: true,
  options: [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
    { value: 'c', label: 'Gamma' }
  ]
}
const pais: ClaudeElicitationField = {
  key: 'pais',
  label: 'Country',
  description: '',
  required: true,
  type: 'enum',
  multiple: false,
  options: ['br', 'pt', 'es', 'ar', 'cl'].map((value) => ({ value, label: value.toUpperCase() }))
}

function mountCard(fields: ClaudeElicitationField[], extra: Partial<ElicitationRequest> = {}): HTMLElement {
  const request: ElicitationRequest = {
    kind: 'elicitation',
    requestId: REQUEST_ID,
    serverName: 'reports',
    message: 'I need some data',
    mode: 'form',
    fields,
    ...extra
  }
  const conv = createConversation({ id: ID, messages: [] } as never, { permissionMode: 'default', model: 'm' })
  useStore.setState((s) => ({
    claude: { ...s.claude, activeId: ID, conversations: [{ ...conv, permissions: [request] }] }
  }))
  mount(<ElicitationCard conversationId={ID} request={request} />)
  return getByRole(document.body, 'group', 'Pedido do servidor MCP reports')
}

const field = (name: string | RegExp, role = 'textbox'): HTMLInputElement =>
  getByRole(document.body, role, name) as HTMLInputElement
const sendButton = (): HTMLElement => getByRole(document.body, 'button', 'Enviar')
const alerts = (): string[] => queryAllByRole(document.body, 'alert').map((a) => a.textContent)
const pending = (): string[] => useStore.getState().claude.conversations[0].permissions.map((p) => p.requestId)

beforeEach(() => {
  respond.mockResolvedValue(true)
})

afterEach(() => {
  unmountAll()
  resetStore()
})

describe('ElicitationCard: form', () => {
  it('shows server, message, labels, hints and the required mark', () => {
    mountCard([nome, idade])
    expect(document.body.textContent).toContain('Servidor MCP · reports')
    expect(document.body.textContent).toContain('I need some data')
    expect(field(/^Name/).getAttribute('aria-required')).toBe('true')
    expect(field(/^Age/).getAttribute('aria-required')).toBeNull()
    expect(field(/^Name/).getAttribute('aria-describedby')).toBeTruthy()
    expect(document.getElementById(field(/^Name/).getAttribute('aria-describedby')!)?.textContent).toBe(
      'How it appears in the report'
    )
    expect(document.body.textContent).toContain('* obrigatório')
  })

  it('each field type becomes the right control', () => {
    mountCard([nome, idade, email, newsletter, cor, tags, pais])
    expect(field(/^Name/).type).toBe('text')
    expect(field(/^Age/).type).toBe('number')
    expect(field(/^E-mail/).type).toBe('email')
    expect(getByRole(document.body, 'switch', 'Get news').getAttribute('aria-checked')).toBe('false')
    expect(getByRole(document.body, 'radiogroup', /^Color/)).toBeTruthy()
    expect(queryAllByRole(document.body, 'radio')).toHaveLength(2)
    expect(getByRole(document.body, 'radio', 'Red')).toBeTruthy()
    expect(getByRole(document.body, 'radio', 'Blue')).toBeTruthy()
    expect(getByRole(document.body, 'group', 'Tags')).toBeTruthy()
    expect(['Alpha', 'Beta', 'Gamma'].map((name) => getByRole(document.body, 'checkbox', name))).toHaveLength(3)
    expect(getByRole(document.body, 'combobox', 'Country')).toBeTruthy()
  })

  it('schema default values come prefilled', async () => {
    mountCard([
      { ...nome, default: 'Ana' },
      { ...newsletter, default: true }
    ])
    expect(field(/^Name/).value).toBe('Ana')
    expect(getByRole(document.body, 'switch', 'Get news').getAttribute('aria-checked')).toBe('true')
    click(sendButton())
    await settle()
    expect(respond).toHaveBeenCalledWith(ID, REQUEST_ID, {
      behavior: 'elicitation',
      action: 'accept',
      content: { nome: 'Ana', newsletter: true }
    })
  })

  it('filling every type and submitting sends the normalized content', async () => {
    mountCard([nome, idade, email, newsletter, cor, tags])
    typeInto(field(/^Name/), 'Maria')
    typeInto(field(/^Age/), '42')
    typeInto(field(/^E-mail/), ' maria@example.com ')
    click(getByRole(document.body, 'switch', 'Get news'))
    click(getByRole(document.body, 'radio', 'Blue'))
    click(getByRole(document.body, 'checkbox', 'Alpha'))
    click(getByRole(document.body, 'checkbox', 'Gamma'))
    click(sendButton())
    await settle()
    expect(respond).toHaveBeenCalledTimes(1)
    expect(respond).toHaveBeenCalledWith(ID, REQUEST_ID, {
      behavior: 'elicitation',
      action: 'accept',
      content: {
        nome: 'Maria',
        idade: 42,
        email: 'maria@example.com',
        newsletter: true,
        cor: 'blue',
        tags: ['a', 'c']
      }
    })
    expect(pending()).toEqual([])
  })

  it('Enter in a field submits the form', async () => {
    mountCard([nome])
    typeInto(field(/^Name/), 'Maria')
    const form = document.querySelector('form')!
    form.requestSubmit()
    await settle()
    expect(respond).toHaveBeenCalledWith(ID, REQUEST_ID, {
      behavior: 'elicitation',
      action: 'accept',
      content: { nome: 'Maria' }
    })
  })
})

describe('ElicitationCard: validation', () => {
  it('shows no error before the first submit', () => {
    mountCard([nome])
    expect(alerts()).toEqual([])
    expect(field(/^Name/).getAttribute('aria-invalid')).toBeNull()
  })

  it('submitting with an empty required field does not call main, shows the error and focuses the field', async () => {
    mountCard([idade, nome])
    click(sendButton())
    await settle()
    expect(respond).not.toHaveBeenCalled()
    expect(alerts()).toEqual(['Campo obrigatório.'])
    expect(field(/^Name/).getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(field(/^Name/))
    expect(
      document.getElementById(field(/^Name/).getAttribute('aria-describedby')!.split(' ').at(-1)!)?.textContent
    ).toBe('Campo obrigatório.')
  })

  it('after the first submit the errors follow the typing', () => {
    mountCard([nome])
    click(sendButton())
    expect(alerts()).toEqual(['Campo obrigatório.'])
    typeInto(field(/^Name/), 'Ana')
    expect(alerts()).toEqual([])
  })

  it('a number out of range and a non-integer are rejected with the field message', async () => {
    mountCard([idade])
    typeInto(field(/^Age/), '200')
    click(sendButton())
    expect(alerts()).toEqual(['O valor máximo é 150.'])
    typeInto(field(/^Age/), '3.5')
    expect(alerts()).toEqual(['Digite um número inteiro.'])
    await settle()
    expect(respond).not.toHaveBeenCalled()
  })

  it('an invalid e-mail is rejected', () => {
    mountCard([email])
    typeInto(field(/^E-mail/), 'no-at-sign')
    click(sendButton())
    expect(alerts()).toEqual(['E-mail inválido.'])
    expect(respond).not.toHaveBeenCalled()
  })

  it('a required choice with no option checked asks for one and focuses the first radio', () => {
    mountCard([cor])
    click(sendButton())
    expect(alerts()).toEqual(['Escolha uma opção.'])
    expect(document.activeElement).toBe(getByRole(document.body, 'radio', 'Red'))
  })
})

describe('ElicitationCard: responses', () => {
  it('Decline sends decline', async () => {
    mountCard([nome])
    click(getByRole(document.body, 'button', 'Recusar'))
    await settle()
    expect(respond).toHaveBeenCalledWith(ID, REQUEST_ID, { behavior: 'elicitation', action: 'decline' })
    expect(pending()).toEqual([])
  })

  it('the "x" closes without answering (cancel), even with the form filled', async () => {
    mountCard([nome])
    typeInto(field(/^Name/), 'Ana')
    click(getByRole(document.body, 'button', 'Fechar sem responder'))
    await settle()
    expect(respond).toHaveBeenCalledWith(ID, REQUEST_ID, { behavior: 'elicitation', action: 'cancel' })
  })

  it('Esc on an untouched form cancels', async () => {
    const card = mountCard([nome])
    expect(press(card, 'Escape')).toBe(true)
    await settle()
    expect(respond).toHaveBeenCalledWith(ID, REQUEST_ID, { behavior: 'elicitation', action: 'cancel' })
  })

  it('Esc on an already edited form does not discard what was typed', async () => {
    const card = mountCard([nome])
    typeInto(field(/^Name/), 'Ana')
    expect(press(card, 'Escape')).toBe(false)
    await settle()
    expect(respond).not.toHaveBeenCalled()
    expect(field(/^Name/).value).toBe('Ana')
  })

  it('Esc during IME composition does not cancel', async () => {
    const card = mountCard([nome])
    press(card, 'Escape', { isComposing: true })
    await settle()
    expect(respond).not.toHaveBeenCalled()
  })

  it('a response rejected by main keeps the card and what was typed, and unlocks again', async () => {
    respond.mockResolvedValueOnce(false)
    mountCard([nome])
    typeInto(field(/^Name/), 'Ana')
    click(sendButton())
    await settle()
    expect(pending()).toEqual([REQUEST_ID])
    expect(field(/^Name/).value).toBe('Ana')
    expect(useStore.getState().toasts).toHaveLength(1)
    click(sendButton())
    await settle()
    expect(respond).toHaveBeenCalledTimes(2)
    expect(pending()).toEqual([])
  })

  it('a double click on Submit sends only once', async () => {
    let ack!: (ok: boolean) => void
    respond.mockReturnValue(new Promise((resolve) => (ack = resolve)))
    mountCard([nome])
    typeInto(field(/^Name/), 'Ana')
    click(sendButton())
    click(sendButton())
    click(getByRole(document.body, 'button', 'Recusar'))
    await settle()
    expect(respond).toHaveBeenCalledTimes(1)
    ack(true)
    await settle()
  })
})

describe('ElicitationCard: url mode', () => {
  const urlRequest: Partial<ElicitationRequest> & { url: string } = {
    mode: 'url',
    url: 'https://auth.example.com:8443/login?x=1',
    fields: []
  }

  it('shows the host highlighted and the full address, without a form', () => {
    mountCard([], urlRequest)
    expect(document.querySelector('[data-elicitation-host]')?.textContent).toBe('auth.example.com:8443')
    expect(document.querySelector('[data-elicitation-url]')?.textContent).toBe(urlRequest.url)
    expect(document.querySelector('form')).toBeNull()
    expect(document.body.textContent).toContain('Esc fecha sem responder')
  })

  it('Open in browser accepts without content and Esc cancels', async () => {
    const card = mountCard([], urlRequest)
    click(getByRole(document.body, 'button', 'Abrir no navegador'))
    await settle()
    expect(respond).toHaveBeenCalledWith(ID, REQUEST_ID, { behavior: 'elicitation', action: 'accept' })
    press(card, 'Escape')
    await settle()
  })

  it('Esc cancels the url request', async () => {
    const card = mountCard([], urlRequest)
    press(card, 'Escape')
    await settle()
    expect(respond).toHaveBeenCalledWith(ID, REQUEST_ID, { behavior: 'elicitation', action: 'cancel' })
  })

  it('the server message is plain text, never markdown', () => {
    mountCard([], { ...urlRequest, message: '[click](https://evil.example) <b>x</b>' })
    expect(document.querySelector('[data-elicitation-message]')?.textContent).toBe(
      '[click](https://evil.example) <b>x</b>'
    )
    expect(document.querySelector('[data-elicitation-message] a, [data-elicitation-message] b')).toBeNull()
  })
})
