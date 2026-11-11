import { useEffect, useId, useRef, useState } from 'react'
import type { ClaudeMcpScope, ClaudeMcpServer, ClaudeMcpTransport } from '@shared/types'
import { addMcpServer } from '../../../claudeMcpActions'
import { buildServerInput, type McpFormField, type McpFormValues } from '../../../lib/claudeMcp'
import { useT } from '../../../i18n'
import { Segmented } from '../../common/Segmented'
import { Button } from '../../common/Button'

const TRANSPORTS: readonly { id: ClaudeMcpTransport; label: string }[] = [
  { id: 'stdio', label: 'stdio' },
  { id: 'http', label: 'http' },
  { id: 'sse', label: 'sse' }
]

const SCOPES: readonly ClaudeMcpScope[] = ['local', 'project', 'user']

/** "Add server" form. Light validation here; main's error (pt-BR) shows inline. */
export function McpServerForm({
  conversationId,
  onCancel,
  onAdded
}: {
  conversationId: string
  onCancel: () => void
  onAdded: (servers: ClaudeMcpServer[]) => void
}) {
  const t = useT()
  const m = t.claude.mcpForm
  const scopes = SCOPES.map((id) => ({ id, label: m.scopes[id], hint: m.scopeHints[id] }))
  const uid = useId()
  const [values, setValues] = useState<McpFormValues>({
    name: '',
    transport: 'stdio',
    commandLine: '',
    url: '',
    env: '',
    headers: '',
    scope: 'local'
  })
  const [errors, setErrors] = useState<Partial<Record<McpFormField, string | undefined>>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const stdio = values.transport === 'stdio'
  const nameRef = useRef<HTMLInputElement>(null)
  // The Modal only reads `data-autofocus` on its own mount: the form that enters later asks for focus by itself.
  useEffect(() => nameRef.current?.focus(), [])

  const set = <K extends keyof McpFormValues>(key: K, value: McpFormValues[K]): void => {
    setValues((v) => ({ ...v, [key]: value }))
    const field: McpFormField | null =
      key === 'env' || key === 'headers' ? 'pairs' : key === 'scope' || key === 'transport' ? null : key
    if (field) setErrors((e) => (field in e ? { ...e, [field]: undefined } : e))
  }

  const submit = async (): Promise<void> => {
    if (busy) return
    const built = buildServerInput(values)
    if (!built.ok) {
      setErrors(built.errors)
      return
    }
    setBusy(true)
    setServerError(null)
    const result = await addMcpServer(conversationId, built.input)
    // The form may have been closed (modal/tab) during the wait: `onAdded`/`setState` are up to the parent.
    if ('error' in result) {
      setBusy(false)
      setServerError(result.error)
    } else {
      onAdded(result.servers)
    }
  }

  const field = (key: McpFormField, label: string, control: (props: Record<string, unknown>) => React.ReactNode) => {
    const id = `${uid}-${key}`
    const err = errors[key]
    return (
      <div className="mcp-field">
        <label className="setting-label" htmlFor={id}>
          {label}
        </label>
        {control({
          id,
          'aria-invalid': err ? true : undefined,
          'aria-describedby': err ? `${id}-error` : undefined
        })}
        {err && (
          <div id={`${id}-error`} className="setting-error" role="alert">
            {err}
          </div>
        )}
      </div>
    )
  }

  return (
    <form
      className="mcp-form"
      data-testid="mcp-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <h3 className="mcp-form-title">{t.claude.mcpModal.addServer}</h3>
      {field('name', m.name, (p) => (
        <input
          {...p}
          className="mcp-input"
          data-testid="mcp-form-name"
          ref={nameRef}
          autoComplete="off"
          spellCheck={false}
          placeholder={m.namePlaceholder}
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
        />
      ))}
      <div className="mcp-field">
        <span className="setting-label">{t.claude.mcpModal.transport}</span>
        <Segmented
          label={t.claude.mcpModal.transport}
          value={values.transport}
          options={TRANSPORTS}
          onChange={(transport) => {
            setValues((v) => ({ ...v, transport }))
            setErrors((e) => ({ ...e, pairs: undefined, commandLine: undefined, url: undefined }))
          }}
          testPrefix="mcp-form-transport"
        />
      </div>
      {stdio
        ? field('commandLine', m.commandLine, (p) => (
            <input
              {...p}
              className="mcp-input mono"
              data-testid="mcp-form-command"
              autoComplete="off"
              spellCheck={false}
              placeholder={m.commandPlaceholder}
              value={values.commandLine}
              onChange={(e) => set('commandLine', e.target.value)}
            />
          ))
        : field('url', m.url, (p) => (
            <input
              {...p}
              className="mcp-input mono"
              data-testid="mcp-form-url"
              autoComplete="off"
              spellCheck={false}
              placeholder={m.urlPlaceholder}
              value={values.url}
              onChange={(e) => set('url', e.target.value)}
            />
          ))}
      {field('pairs', stdio ? m.envLabel : m.headersLabel, (p) => (
        <textarea
          {...p}
          className="mcp-input mono"
          data-testid="mcp-form-pairs"
          rows={3}
          spellCheck={false}
          placeholder={stdio ? m.envPlaceholder : 'Authorization=Bearer …'}
          value={stdio ? values.env : values.headers}
          onChange={(e) => set(stdio ? 'env' : 'headers', e.target.value)}
        />
      ))}
      <div className="setting-description">{m.pairsHint}</div>
      <div className="mcp-field">
        <span className="setting-label">{m.scope}</span>
        <Segmented
          label={m.scope}
          value={values.scope}
          options={scopes}
          onChange={(s) => set('scope', s)}
          testPrefix="mcp-form-scope"
        />
        <div className="setting-description" data-testid="mcp-form-scope-hint">
          {m.scopeHints[values.scope]}
        </div>
      </div>
      {serverError && (
        <div className="setting-error" role="alert" data-testid="mcp-form-error">
          {serverError}
        </div>
      )}
      <div className="mcp-form-actions">
        <Button type="button" data-testid="mcp-form-cancel" disabled={busy} onClick={onCancel}>
          {t.common.cancel}
        </Button>
        <Button variant="primary" type="submit" data-testid="mcp-form-submit" disabled={busy}>
          {busy ? m.adding : m.add}
        </Button>
      </div>
    </form>
  )
}
