// Contract between the main process and the renderer. The preload exposes `WalphApi` on `window.api`.
// The types live in one file per domain (`types/<domain>.ts`); this index re-exports them (imports from
// `@shared/types` do not change) and composes `WalphApi` with each domain's interface.

import type { CommandId } from '../commands'
import type { ClaudeApi } from './claude'
import type { CliApi } from './cli'
import type { DebugApi } from './debug'
import type { DockerApi } from './docker'
import type { FsApi, FilesApi } from './fs'
import type { GitApi } from './git'
import type { LspApi } from './lsp'
import type { SearchApi } from './search'
import type { SessionApi } from './session'
import type { SettingsApi } from './settings'
import type { SnippetsApi } from './snippets'
import type { TerminalApi } from './terminal'
import type { UpdateApi } from './update'
import type { WindowApi, DialogApi, TabsApi } from './window'
import type { WorkspaceApi, RecentApi } from './workspace'
import type { WorkspacesApi, NotificationsApi } from './workspaces'

export type { CommandId, ContextKey, WindowAction } from '../commands'
export type {
  ClaudePermissionMode,
  SettingKey,
  Settings,
  SettingsFileKind,
  SettingsLayer,
  SettingsSnapshot
} from '../settings'
export type {
  ClaudeConversationId,
  ClaudeEffort,
  ClaudeStartOptions,
  ClaudeStarted,
  ClaudeSessionMetaPatch,
  ClaudeAttachment,
  ClaudeImage,
  ClaudeSelection,
  ClaudePromptInput,
  ClaudeEditorContext,
  ClaudeBlock,
  ClaudeMessage,
  ClaudeMessageContext,
  ClaudeAccount,
  ClaudeAuthStatus,
  ClaudeUsageModel,
  ClaudeUsageLimit,
  ClaudeUsageReport,
  ClaudeTaskNotification,
  ClaudeAttachmentFile,
  ClaudeAttachmentResult,
  ClaudeSlashCommand,
  ClaudeMcpStatus,
  ClaudeMcpScope,
  ClaudeMcpTransport,
  ClaudeMcpTool,
  ClaudeMcpServer,
  ClaudeMcpServerInput,
  ClaudeMcpAuthResult,
  ClaudeModelOption,
  ClaudeBackgroundTask,
  ClaudeContextUsage,
  ClaudePermissionRequest,
  ClaudeElicitationField,
  ClaudeElicitationValue,
  ClaudeQuestion,
  ClaudeQuestionOption,
  ClaudePermissionResponse,
  ClaudeRateLimit,
  ClaudeTaskProgress,
  ClaudeSessionSummary,
  ClaudeConversationStatus,
  ClaudeAgentStatus,
  ClaudeStartRequest,
  ClaudeError,
  ClaudeEvent,
  ClaudeApi
} from './claude'
export type { CliApi } from './cli'
export type {
  DebugConfigSummary,
  DebugConfigList,
  DebugSourceBreakpoint,
  DebugBreakpointStatus,
  DebugSessionState,
  DebugCapabilities,
  DebugSessionInfo,
  DebugThread,
  DebugStackFrame,
  DebugScope,
  DebugVariable,
  DebugEvaluateResult,
  DebugOutputCategory,
  DebugOutputEntry,
  DebugControl,
  DebugEvaluateContext,
  DebugStartOptions,
  DebugEvent,
  DebugApi
} from './debug'
export type {
  DockerContainerState,
  DockerHealth,
  DockerPort,
  DockerContainer,
  DockerList,
  DockerInfoOk,
  DockerInfoError,
  DockerInfo,
  DockerStatsSample,
  DockerLogLevel,
  DockerLogLine,
  DockerLogsBatch,
  DockerLogsEnd,
  DockerMount,
  DockerHealthDetail,
  DockerInspect,
  DockerContainerAction,
  DockerComposeAction,
  DockerApi
} from './docker'
export type { DirEntry, FileList, TextEncoding, TextFile, FsApi, FilesApi } from './fs'
export type {
  GitFileStatus,
  GitStatus,
  GitRef,
  GitBranch,
  GitCommit,
  GitLogPage,
  GitCommitFile,
  GitCommitDiff,
  GitStash,
  GitCommitOptions,
  GitPushOptions,
  GitNetworkOp,
  CloneUrlCheck,
  GitCloneProgress,
  GitRepoOperation,
  GitBlame,
  GitBlameCommit,
  GitApi
} from './git'
export type {
  LspPosition,
  LspRange,
  LspTextChange,
  DiagnosticSeverity,
  Diagnostic,
  FileDiagnostics,
  LspServerState,
  LspServerStatus,
  LspLogLevel,
  LspLogEntry,
  LspTextEdit,
  LspMarkup,
  LspCompletionItem,
  LspCompletionList,
  LspHover,
  LspParameterInformation,
  LspSignatureInformation,
  LspSignatureHelp,
  LspLocation,
  LspWorkspaceEdit,
  LspCommand,
  LspCodeAction,
  LspSymbol,
  LspDocumentSymbol,
  LspApplyEditRequest,
  LspInlayHintPart,
  LspInlayHint,
  LspDocumentHighlightKind,
  LspDocumentHighlight,
  LspSemanticTokens,
  LspRefresh,
  LspCodeLensCommand,
  LspCodeLens,
  LspCodeLensList,
  LspRefreshKind,
  LspHierarchyKind,
  LspHierarchyDirection,
  LspHierarchyItem,
  LspHierarchyEdge,
  LspApi
} from './lsp'
export type {
  SearchOptions,
  SearchMatch,
  SearchFileResult,
  SearchResult,
  ReplaceFileRequest,
  ReplaceRequest,
  ReplaceFileOutcome,
  ReplaceResult,
  SearchApi
} from './search'
export type {
  SessionPosition,
  SessionFileTab,
  SessionDiffTab,
  SessionMarkdownPreviewTab,
  SessionImageTab,
  SessionTab,
  SessionEditorGroup,
  SessionClaudeTab,
  SessionClosedTab,
  SessionBreakpoint,
  SessionBreakpointFile,
  WorkspaceSession,
  SessionApi
} from './session'
export type { SettingsApi } from './settings'
export type { SnippetSource, UserSnippet, SnippetFileKind, SnippetFile, SnippetSnapshot, SnippetsApi } from './snippets'
export type { TerminalCreateOptions, TerminalCreated, TerminalApi } from './terminal'
export type { UpdateNotice, UpdateApi } from './update'
export type {
  ExplorerAction,
  UnsavedChoice,
  TabAction,
  TabMenuOptions,
  ConfirmOptions,
  SidebarView,
  PanelPosition,
  WindowApi,
  DialogApi,
  TabsApi
} from './window'
export type { FileChange, WorkspaceChange, RecentFolder, WorkspaceApi, RecentApi } from './workspace'
export type {
  WorkspaceId,
  WorkspaceInfo,
  WorkspaceTabAction,
  WorkspacesState,
  WorkspaceNotice,
  WorkspacesApi,
  NotificationsApi
} from './workspaces'
export interface WalphApi {
  /** Value of `process.platform` ('darwin', 'win32', 'linux'…) */
  platform: string
  /** `true` in the packaged app (no reload or developer tools). */
  isPackaged: boolean
  /** User home folder (`os.homedir()` in main), to show `~` in the project path. */
  homeDir: string
  /**
   * Language resolved by main when the view was created (`Locale`; empty if absent). Changes arrive in the settings
   * snapshot.
   */
  locale: string
  /** Commands fired by the native menu (`app:command`), already with the registry id. */
  onCommand(cb: (id: CommandId) => void): () => void
  window: WindowApi
  dialog: DialogApi
  settings: SettingsApi
  snippets: SnippetsApi
  tabs: TabsApi
  workspace: WorkspaceApi
  recent: RecentApi
  session: SessionApi
  fs: FsApi
  files: FilesApi
  search: SearchApi
  git: GitApi
  lsp: LspApi
  debug: DebugApi
  claude: ClaudeApi
  workspaces: WorkspacesApi
  notifications: NotificationsApi
  docker: DockerApi
  terminal: TerminalApi
  update: UpdateApi
  cli: CliApi
}
