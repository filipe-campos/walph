import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClaudeApi, ClaudePermissionRequest, ClaudeQuestion } from '@shared/types'
import { installFakeApi } from '../../test/fakeApi'
import { act } from 'react'
import { click, getByRole, mount, press, queryAllByRole, settle, typeInto, unmountAll } from '../../test/dom'

const respond = vi.fn<ClaudeApi['respond']>()
installFakeApi({ claude: { respond } })

const { QuestionCard } = await import('./QuestionCard')
const { useStore } = await import('../../store')
const { resetStore } = await import('../../test/resetStore')
const { createConversation } = await import('../../lib/claudeConversation')

const ID = 'c1'
const REQUEST_ID = 'q1'

type QuestionRequest = Extract<ClaudePermissionRequest, { kind: 'question' }>

const lib: ClaudeQuestion = {
  id: 'lib',
  header: 'Library',
  question: 'Which library to use?',
  options: [
    { label: 'zustand', description: 'simple state' },
    { label: 'redux', description: '' }
  ],
  multiSelect: false
}
const tests: ClaudeQuestion = {
  id: 'tests',
  header: 'Tests',
  question: 'Which tests to write?',
  options: [
    { label: 'unit', description: '' },
    { label: 'e2e', description: '' },
    { label: 'visual', description: '' }
  ],
  multiSelect: true
}
const deploy: ClaudeQuestion = {
  id: 'deploy',
  header: 'Deploy',
  question: 'Where to publish?',
  options: [
    { label: 'staging', description: '' },
    { label: 'production', description: '' }
  ],
  multiSelect: false
}

function mountCard(...questions: ClaudeQuestion[]): HTMLElement {
  const request: QuestionRequest = { kind: 'question', requestId: REQUEST_ID, questions }
  const conv = createConversation({ id: ID, messages: [] } as never, { permissionMode: 'default', model: 'm' })
  useStore.setState((s) => ({
    claude: { ...s.claude, activeId: ID, conversations: [{ ...conv, permissions: [request] }] }
  }))
  mount(<QuestionCard conversationId={ID} request={request} />)
  return getByRole(document.body, 'group', 'Pergunta do Claude')
}

const radio = (name: string): HTMLElement => getByRole(document.body, 'radio', name)
const checkbox = (name: string): HTMLElement => getByRole(document.body, 'checkbox', new RegExp(`^${name}`))
const tab = (name: string | RegExp): HTMLElement => getByRole(document.body, 'tab', name)
const checked = (el: HTMLElement): boolean => el.getAttribute('aria-checked') === 'true'
const submitButton = (): HTMLButtonElement => getByRole(document.body, 'button', 'Responder') as HTMLButtonElement
const otherInput = (): HTMLInputElement =>
  getByRole(document.body, 'textbox', 'Outro: sua resposta') as HTMLInputElement
const pending = (): string[] => useStore.getState().claude.conversations[0].permissions.map((p) => p.requestId)

beforeEach(() => {
  respond.mockResolvedValue(true)
})

afterEach(() => {
  unmountAll()
  vi.useRealTimers()
  resetStore()
})

describe('QuestionCard: rendering', () => {
  it('a single question shows text, options as radios, "Other" and no tab', () => {
    mountCard(lib)
    expect(document.body.textContent).toContain('O Claude tem uma pergunta')
    expect(getByRole(document.body, 'group', 'Library')).toBeTruthy()
    expect(getByRole(document.body, 'radiogroup', 'Which library to use?')).toBeTruthy()
    expect(queryAllByRole(document.body, 'radio').map((r) => r.getAttribute('aria-label') ?? r.textContent)).toEqual([
      expect.stringContaining('zustand'),
      expect.stringContaining('redux'),
      'Outro'
    ])
    expect(document.body.textContent).toContain('simple state')
    expect(queryAllByRole(document.body, 'tablist')).toHaveLength(0)
    expect(document.body.textContent).toContain('Teclas 1–3')
  })

  it('a multiple question becomes checkboxes with the hint "Escolha uma ou mais"', () => {
    mountCard(tests)
    expect(queryAllByRole(document.body, 'checkbox')).toHaveLength(4)
    expect(queryAllByRole(document.body, 'radio')).toHaveLength(0)
    expect(document.body.textContent).toContain('Escolha uma ou mais')
  })

  it('several questions: one tab per question, counter and only the first selected', () => {
    mountCard(lib, tests, deploy)
    expect(queryAllByRole(document.body, 'tab').map((t) => t.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false'
    ])
    expect(getByRole(document.body, 'tablist', 'Perguntas')).toBeTruthy()
    expect(document.body.textContent).toContain('1 de 3')
    expect(getByRole(document.body, 'tabpanel', 'Library')).toBeTruthy()
    expect(tab('Tests').tabIndex).toBe(-1)
    expect(tab('Library').tabIndex).toBe(0)
  })
})

describe('QuestionCard: answers', () => {
  it('Answer stays disabled until the question is answered', () => {
    mountCard(lib)
    expect(submitButton().disabled).toBe(true)
    click(getByRole(document.body, 'radio', /^zustand/))
    expect(submitButton().disabled).toBe(false)
  })

  it('picking an option and Answer sends the answer to main', async () => {
    mountCard(lib)
    click(getByRole(document.body, 'radio', /^zustand/))
    expect(checked(getByRole(document.body, 'radio', /^zustand/))).toBe(true)
    click(submitButton())
    await settle()
    expect(respond).toHaveBeenCalledWith(ID, REQUEST_ID, { behavior: 'answer', answers: { lib: ['zustand'] } })
    expect(pending()).toEqual([])
  })

  it('changing the option of a single question unchecks the previous one', () => {
    mountCard(lib)
    click(getByRole(document.body, 'radio', /^zustand/))
    click(getByRole(document.body, 'radio', /^redux/))
    expect(checked(getByRole(document.body, 'radio', /^zustand/))).toBe(false)
    expect(checked(getByRole(document.body, 'radio', /^redux/))).toBe(true)
  })

  it('the number keys pick the matching option', () => {
    const card = mountCard(lib)
    expect(press(card, '2')).toBe(true)
    expect(checked(getByRole(document.body, 'radio', /^redux/))).toBe(true)
    expect(press(card, '9')).toBe(false)
  })

  it('multiple choice accumulates options and sends them all', async () => {
    mountCard(tests)
    click(checkbox('unit'))
    click(checkbox('visual'))
    click(checkbox('unit'))
    click(checkbox('e2e'))
    click(submitButton())
    await settle()
    expect(respond).toHaveBeenCalledWith(ID, REQUEST_ID, { behavior: 'answer', answers: { tests: ['e2e', 'visual'] } })
  })

  it('"Other" sends the free text in place of the option', async () => {
    mountCard(lib)
    click(radio('Outro'))
    expect(document.activeElement).toBe(otherInput())
    typeInto(otherInput(), 'jotai')
    expect(submitButton().disabled).toBe(false)
    click(submitButton())
    await settle()
    expect(respond).toHaveBeenCalledWith(ID, REQUEST_ID, { behavior: 'answer', answers: { lib: ['jotai'] } })
  })

  it('"Other" checked and empty does not count as answered', () => {
    mountCard(lib)
    click(radio('Outro'))
    expect(submitButton().disabled).toBe(true)
  })

  it('Enter in a filled "Other" field sends on the last question', async () => {
    mountCard(lib)
    click(radio('Outro'))
    typeInto(otherInput(), 'jotai')
    expect(press(otherInput(), 'Enter')).toBe(true)
    await settle()
    expect(respond).toHaveBeenCalledWith(ID, REQUEST_ID, { behavior: 'answer', answers: { lib: ['jotai'] } })
  })

  it('Enter during IME composition in the "Other" field does not send', async () => {
    mountCard(lib)
    click(radio('Outro'))
    typeInto(otherInput(), 'ji')
    press(otherInput(), 'Enter', { isComposing: true })
    await settle()
    expect(respond).not.toHaveBeenCalled()
  })

  it('the "x" skips the question', async () => {
    mountCard(lib)
    click(getByRole(document.body, 'button', 'Pular — o Claude decide sozinho'))
    await settle()
    expect(respond).toHaveBeenCalledWith(ID, REQUEST_ID, { behavior: 'skip' })
  })

  it('an answer rejected by main keeps the card, the choices and unlocks again', async () => {
    respond.mockResolvedValueOnce(false)
    mountCard(lib)
    click(getByRole(document.body, 'radio', /^zustand/))
    click(submitButton())
    await settle()
    expect(pending()).toEqual([REQUEST_ID])
    expect(checked(getByRole(document.body, 'radio', /^zustand/))).toBe(true)
    expect(useStore.getState().toasts).toHaveLength(1)
    click(submitButton())
    await settle()
    expect(respond).toHaveBeenCalledTimes(2)
    expect(pending()).toEqual([])
  })

  it('a double click on Answer sends only once', async () => {
    let ack!: (ok: boolean) => void
    respond.mockReturnValue(new Promise((resolve) => (ack = resolve)))
    mountCard(lib)
    click(getByRole(document.body, 'radio', /^zustand/))
    click(submitButton())
    click(submitButton())
    await settle()
    expect(respond).toHaveBeenCalledTimes(1)
    ack(true)
    await settle()
  })
})

describe('QuestionCard: several questions', () => {
  it('picking in a single question advances by itself after a pause', () => {
    vi.useFakeTimers()
    mountCard(lib, deploy)
    click(getByRole(document.body, 'radio', /^zustand/))
    expect(tab('Library (respondida)').getAttribute('aria-selected')).toBe('true')
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(tab('Deploy').getAttribute('aria-selected')).toBe('true')
    expect(document.body.textContent).toContain('Where to publish?')
    expect(document.body.textContent).toContain('2 de 2')
  })

  it('only enables Answer on the last question when all have been answered', async () => {
    mountCard(lib, deploy)
    click(getByRole(document.body, 'button', 'Próxima'))
    expect(submitButton().disabled).toBe(true)
    click(getByRole(document.body, 'radio', /^staging/))
    expect(submitButton().disabled).toBe(true)
    click(getByRole(document.body, 'button', 'Voltar'))
    click(getByRole(document.body, 'radio', /^redux/))
    click(getByRole(document.body, 'button', 'Próxima'))
    expect(submitButton().disabled).toBe(false)
    click(submitButton())
    await settle()
    expect(respond).toHaveBeenCalledWith(ID, REQUEST_ID, {
      behavior: 'answer',
      answers: { lib: ['redux'], deploy: ['staging'] }
    })
  })

  it('Enter in a filled "Other" field advances to the next question', () => {
    mountCard(lib, deploy)
    click(radio('Outro'))
    typeInto(otherInput(), 'jotai')
    press(otherInput(), 'Enter')
    expect(tab('Deploy').getAttribute('aria-selected')).toBe('true')
  })

  it('ArrowRight on a tab moves focus and selection; on the last one it wraps to the first', () => {
    mountCard(lib, tests, deploy)
    const first = tab('Library')
    first.focus()
    expect(press(first, 'ArrowRight')).toBe(true)
    expect(tab('Tests').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('Tests'))
    press(tab('Tests'), 'ArrowRight')
    expect(tab('Deploy').getAttribute('aria-selected')).toBe('true')
    press(tab('Deploy'), 'ArrowRight')
    expect(tab('Library').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('Library'))
  })

  it('ArrowLeft on the first tab wraps to the last', () => {
    mountCard(lib, tests, deploy)
    const first = tab('Library')
    first.focus()
    press(first, 'ArrowLeft')
    expect(tab('Deploy').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tab('Deploy'))
  })

  it('arrows outside the tabs navigate between questions without wrapping', () => {
    const card = mountCard(lib, tests)
    press(card, 'ArrowLeft')
    expect(tab('Library').getAttribute('aria-selected')).toBe('true')
    press(card, 'ArrowRight')
    expect(tab('Tests').getAttribute('aria-selected')).toBe('true')
    press(card, 'ArrowRight')
    expect(tab('Tests').getAttribute('aria-selected')).toBe('true')
  })

  it('Home and End on the tabs go to the first and the last', () => {
    mountCard(lib, tests, deploy)
    const first = tab('Library')
    first.focus()
    press(first, 'End')
    expect(tab('Deploy').getAttribute('aria-selected')).toBe('true')
    press(tab('Deploy'), 'Home')
    expect(tab('Library').getAttribute('aria-selected')).toBe('true')
  })

  it('clicking a tab shows its question', () => {
    mountCard(lib, tests)
    click(tab('Tests'))
    expect(document.body.textContent).toContain('Which tests to write?')
    expect(queryAllByRole(document.body, 'checkbox').length).toBe(4)
  })
})
