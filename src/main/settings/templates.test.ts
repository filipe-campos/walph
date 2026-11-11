import { describe, expect, it } from 'vitest'
import { userSettingsTemplate, workspaceSettingsTemplate } from './templates'

describe('settings templates', () => {
  it('the workspace template does not offer user-only keys', () => {
    expect(workspaceSettingsTemplate()).not.toContain('terminal.shell')
    expect(userSettingsTemplate()).toContain('terminal.shell')
  })
})
