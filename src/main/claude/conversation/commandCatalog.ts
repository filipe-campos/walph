import type { ClaudeSlashCommand } from '@shared/types'
import { mergeCommands, type CommandFile } from '../commandFiles'
import type { InitCommand } from './messageRouter'

/** The `/` menu list: the CLI `init` commands merged with the `.claude/commands` files. */
export class CommandCatalog {
  /** Commands as the CLI `init` returned them (without scope). */
  private init: InitCommand[] = []
  /** Last files read: `commands_changed` (skills only) does not lose them. */
  private files: CommandFile[] = []
  private merged: ClaudeSlashCommand[] = []

  constructor(
    private readonly source: {
      getRoot(): string | null
      readCommandFiles?(root: string): Promise<CommandFile[]>
    }
  ) {}

  get commands(): ClaudeSlashCommand[] {
    return this.merged
  }

  /** The CLI replaced the base (skills discovered mid-session): merges with the files already read, no reread. */
  setInit(commands: InitCommand[]): void {
    this.init = commands
    this.merged = mergeCommands(this.init, this.files)
  }

  /** New `init` base and files reread. */
  async load(commands: InitCommand[]): Promise<void> {
    this.init = commands
    this.merged = mergeCommands(this.init, await this.readFiles())
  }

  /** The `/` menu list: `init` merged with the files, reread on every call. Before `init`, only the files. */
  async list(): Promise<ClaudeSlashCommand[]> {
    this.merged = mergeCommands(this.init, await this.readFiles())
    return this.merged
  }

  private async readFiles(): Promise<CommandFile[]> {
    const root = this.source.getRoot()
    if (!root || !this.source.readCommandFiles) return []
    try {
      this.files = await this.source.readCommandFiles(root)
      return this.files
    } catch {
      return []
    }
  }
}
