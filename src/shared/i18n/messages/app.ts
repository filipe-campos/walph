import { defineMessages, plural } from '../define'

// Windows, workspaces, sessions, recents, update, the `walph` command and the app frame (bars, panel, welcome).
export const app = defineMessages({
  'pt-BR': {
    copyPath: 'Copiar caminho',
    closeWorkspace: 'Fechar workspace',
    openFolderAsWorkspace: 'Abrir pasta como workspace',
    recentFolders: 'Pastas recentes',
    noRecentFolders: 'Nenhuma pasta recente',
    branchTitle: (branch: string) => `Branch ${branch}`,
    revealInFinder: 'Revelar no Finder',
    revealInExplorer: 'Mostrar no Explorador',
    revealInFolder: 'Abrir na pasta',
    time: {
      now: 'agora',
      minutesAgo: (n: number) => `há ${n} min`,
      hoursAgo: (n: number) => `há ${n} h`,
      yesterday: 'ontem',
      daysAgo: (n: number) => `há ${n} dias`
    },
    errors: {
      invalidFolder: 'Pasta inválida: informe um caminho absoluto.',
      invalidFolderList: 'Lista de pastas inválida.',
      unknownWindow: 'Janela desconhecida.',
      workspaceNotFound: 'Workspace não encontrado.',
      emptyPrompt: 'Escreva o pedido para o Claude.',
      promptTooLong: 'O pedido é longo demais.',
      notAFolder: (folder: string) => `"${folder}" não é uma pasta.`,
      restoreFolder: (error: string) => `Não foi possível restaurar a pasta: ${error}`,
      recentFolders: (error: string) => `Pastas recentes: ${error}`,
      watchFailed: (folder: string) =>
        `Não foi possível observar "${folder}": a lista de arquivos não será atualizada sozinha.`
    },
    dialogs: {
      unsavedOne: (name: string) => `Deseja salvar as alterações feitas em "${name}"?`,
      unsavedMany: (n: number) => `Deseja salvar as alterações em ${n} arquivos?`,
      unsavedMore: (n: number) => `e mais ${n}…`,
      unsavedDetail: 'Suas alterações serão perdidas se você não salvá-las.',
      notResponding: 'O workspace não está respondendo.',
      notRespondingDetail: 'Se forçar o fechamento, as alterações não salvas serão perdidas.',
      forceClose: 'Forçar Fechamento',
      wait: 'Aguardar',
      pickProjectFolder: 'Escolha a pasta do projeto'
    },
    tabMenu: {
      closeOthers: 'Fechar Outras',
      closeRight: 'Fechar à Direita',
      closeSaved: 'Fechar Salvas',
      copyPath: 'Copiar Caminho',
      reveal: 'Revelar no Explorador'
    },
    workspaceMenu: {
      mute: 'Silenciar notificações',
      unmute: 'Reativar notificações'
    },
    cli: {
      adminFailed: 'Não foi possível concluir com permissão de administrador.',
      notInstalledApp: 'O comando "walph" só pode ser gerenciado pelo Walph instalado.',
      fileExists: (path: string) => `Já existe um arquivo "walph" em ${path}.`,
      fileExistsDetail: 'Ele não foi criado pelo Walph. Substituí-lo?',
      replace: 'Substituir',
      installFailed: (path: string) => `Não foi possível instalar o comando "walph" em ${path}.`,
      installed: (path: string) => `Comando "walph" instalado em ${path}.`,
      addToPath: (dir: string) => `Adicione ${dir} ao PATH para usá-lo no terminal.`,
      readFailed: (path: string) => `Não foi possível ler ${path}.`,
      notInstalled: 'O comando "walph" não está instalado.',
      notOurs: (path: string) => `O arquivo ${path} não foi criado pelo Walph e não será removido.`,
      removeFailed: (path: string) => `Não foi possível remover o comando "walph" de ${path}.`,
      removed: (path: string) => `Comando "walph" removido de ${path}.`,
      invalidExecutable: 'O caminho do executável do Walph contém caracteres inválidos.',
      launcherNotFound: (path: string) => `walph: o Walph não foi encontrado em ${path}`,
      noLocalAppData: 'Não foi possível localizar a pasta LOCALAPPDATA.',
      moveToApplications: "Mova o Walph para a pasta Aplicativos antes de instalar o comando 'walph'."
    },
    update: {
      checking: 'Verificando atualizações…',
      upToDate: 'O Walph já está atualizado.',
      downloading: (version: string) => `Baixando a versão ${version}…`,
      downloaded: (version: string) => `A versão ${version} está pronta para instalar.`,
      checkFailed: 'Não foi possível verificar atualizações.',
      offline: 'Não foi possível verificar atualizações: sem conexão com a internet.',
      unsigned: 'Não foi possível instalar a atualização: o aplicativo não está assinado.',
      disabled: 'As atualizações automáticas estão desligadas ("update.enabled").',
      restartDescription: 'O Walph reinicia e pede para salvar o que estiver pendente.',
      restartAndUpdate: 'Reiniciar e atualizar'
    },
    workspaceBar: {
      tablist: 'Workspaces',
      emptyName: 'Sem pasta',
      branchAria: (branch: string) => `branch ${branch}`,
      muted: 'notificações silenciadas',
      unread: (n: number) => plural(n, '1 não lida', `${n} não lidas`),
      status: {
        running: 'Claude Code trabalhando',
        done: 'Claude Code terminou',
        attention: 'Claude Code aguardando você',
        error: 'Claude Code falhou'
      },
      openWorkspace: 'Abrir workspace',
      nothingNewToOpen: 'Nenhuma pasta nova para abrir.'
    },
    activityBar: {
      views: 'Visões',
      explorer: 'Explorador',
      search: 'Pesquisar',
      git: 'Controle de Código',
      debug: 'Executar e Depurar',
      containers: 'Containers',
      containersProblems: (title: string, n: number) =>
        `${title} — ${n} ${plural(n, 'container com problema', 'containers com problema')}`
    },
    statusBar: {
      projectPath: (root: string) => `Caminho do projeto: ${root}`,
      commitAuthorWhen: (author: string, when: string) => `${author}, ${when}`,
      commitTitle: (shortHash: string, hash: string, author: string, date: string, detail: string) =>
        `${shortHash} (${hash})\n${author}, ${date}\n\n${detail}`,
      lastCommit: (hash: string, author: string, when: string, subject: string) =>
        `Último commit ${hash}, ${author}, ${when}: ${subject}`,
      indentSpaces: 'Indentar com Espaços',
      indentTabs: 'Indentar com Tabs',
      indentSize: (size: number) => `Tamanho do recuo: ${size}`,
      convertToSpaces: 'Converter indentação para Espaços',
      convertToTabs: 'Converter indentação para Tabs',
      indent: (text: string) => `Indentação: ${text}`,
      indentTitle: (text: string) => `Indentação: ${text} (clique para mudar)`,
      cursor: (line: number, column: number) => `Ln ${line}, Col ${column}`,
      cursorSelection: (line: number, column: number, selection: string) => `Ln ${line}, Col ${column} (${selection})`,
      goToLine: 'Ir para Linha…',
      changeBranch: 'Mudar de branch…',
      changeBranchDirty: 'Mudar de branch… (com alterações)',
      dirty: 'com alterações',
      detachedHead: 'HEAD destacado',
      syncTitle: (tooltip: string) => `${tooltip}\nClique para sincronizar`,
      syncAria: (upstream: string, tooltip: string) => `Sincronizar com ${upstream}: ${tooltip}`,
      publishBranchTitle: 'Publicar a branch em origin (push -u)',
      publishBranch: 'Publicar Branch',
      problems: 'Problemas',
      encodingTitle: 'Reabrir ou salvar com codificação…',
      encodingAria: (encoding: string) => `Codificação: ${encoding}. Reabrir ou salvar com codificação…`,
      eolTitle: (eol: string, other: string) => `Fim de linha: ${eol} (clique para ${other})`,
      eolAria: (eol: string, other: string) => `Fim de linha: ${eol}. Alternar para ${other}`,
      languageTitle: 'Alterar modo de linguagem…',
      languageAria: (language: string) => `Modo de linguagem: ${language}. Alterar…`,
      toggleTerminal: 'Alternar Terminal',
      server: {
        starting: 'iniciando…',
        ready: 'pronto',
        error: 'erro'
      },
      serverTitle: (name: string, state: string, message: string | null) =>
        `${name}: ${state}${message ? ` — ${message}` : ''} (clique para ver a Saída)`
    },
    welcome: {
      tagline: 'O editor, o terminal e o Claude Code numa janela só.',
      shortcuts: {
        commands: 'Comandos',
        openFile: 'Abrir arquivo',
        search: 'Pesquisar',
        terminal: 'Terminal'
      },
      openFolder: 'Abrir pasta',
      clone: 'Clonar repositório',
      terminal: 'Terminal',
      newWindow: 'Nova janela',
      continueTitle: 'Continuar de onde parou',
      recentTitle: 'Recentes',
      selectHint: (modifier: string) => `${modifier}-clique ou espaço seleciona vários; clique abre um só.`,
      clearSelection: 'Limpar seleção',
      openAll: 'Abrir todos',
      openCount: (n: number) => plural(n, 'Abrir 1 workspace', `Abrir ${n} workspaces`),
      claudeTitle: 'Comece com o Claude',
      claudePlaceholder: 'Peça algo ao Claude…',
      claudeAria: 'Pedido para o Claude',
      sendToClaude: 'Enviar ao Claude',
      targetIn: (name: string) => `Em ${name} · Shift+Enter quebra a linha`,
      targetPick: 'Você escolhe a pasta ao enviar · Shift+Enter quebra a linha'
    },
    recent: {
      openElsewhere: 'Aberto em outro workspace',
      select: (name: string) => `Selecionar ${name}`,
      selected: ', selecionado',
      removeTitle: 'Remover dos recentes',
      removeAria: (name: string) => `Remover ${name} dos recentes`,
      opened: {
        now: 'aberto agora',
        minutesAgo: (n: number) => `aberto há ${n} min`,
        hoursAgo: (n: number) => `aberto há ${n} h`,
        yesterday: 'aberto ontem',
        daysAgo: (n: number) => `aberto há ${n} dias`,
        on: (date: string) => `aberto em ${date}`
      }
    },
    addWorkspace: {
      browse: 'Abrir Pasta…',
      filter: 'Filtrar pastas recentes',
      noMatch: 'Nenhuma pasta corresponde ao filtro'
    },
    panel: {
      tablist: 'Painel',
      problems: 'Problemas',
      output: 'Saída',
      references: 'Referências',
      hierarchy: 'Hierarquia',
      debugConsole: 'Console de Depuração',
      terminal: 'Terminal',
      terminals: 'Terminais',
      terminalName: 'Nome do terminal',
      splitTab: (label: string) => `${label} (dividido)`,
      newTerminal: 'Novo Terminal',
      newTerminalWithProfile: 'Novo terminal com perfil…',
      splitTerminal: 'Dividir terminal',
      killTerminal: 'Encerrar terminal',
      moveRight: 'Mover painel para a direita',
      moveDown: 'Mover painel para baixo',
      restoreSize: 'Restaurar tamanho do painel',
      maximize: 'Maximizar painel',
      moreActions: 'Mais ações do painel',
      hide: 'Esconder Painel',
      moveRightTitle: 'Mover Painel para a Direita',
      moveDownTitle: 'Mover Painel para Baixo',
      restoreSizeTitle: 'Restaurar Tamanho do Painel',
      maximizeTitle: 'Maximizar Painel',
      clearResults: 'Limpar Resultados'
    },
    toasts: {
      region: 'Notificações',
      dismiss: 'Fechar aviso',
      progress: 'Progresso'
    }
  },
  en: {
    copyPath: 'Copy path',
    closeWorkspace: 'Close workspace',
    openFolderAsWorkspace: 'Open folder as workspace',
    recentFolders: 'Recent folders',
    noRecentFolders: 'No recent folders',
    branchTitle: (branch: string) => `Branch ${branch}`,
    revealInFinder: 'Reveal in Finder',
    revealInExplorer: 'Reveal in File Explorer',
    revealInFolder: 'Open Containing Folder',
    time: {
      now: 'now',
      minutesAgo: (n: number) => `${n} min ago`,
      hoursAgo: (n: number) => `${n} h ago`,
      yesterday: 'yesterday',
      daysAgo: (n: number) => `${n} days ago`
    },
    errors: {
      invalidFolder: 'Invalid folder: provide an absolute path.',
      invalidFolderList: 'Invalid folder list.',
      unknownWindow: 'Unknown window.',
      workspaceNotFound: 'Workspace not found.',
      emptyPrompt: 'Write your request for Claude.',
      promptTooLong: 'The request is too long.',
      notAFolder: (folder: string) => `"${folder}" is not a folder.`,
      restoreFolder: (error: string) => `Couldn't restore the folder: ${error}`,
      recentFolders: (error: string) => `Recent folders: ${error}`,
      watchFailed: (folder: string) => `Could not watch "${folder}": the file list will not update on its own.`
    },
    dialogs: {
      unsavedOne: (name: string) => `Do you want to save the changes you made to "${name}"?`,
      unsavedMany: (n: number) => `Do you want to save the changes to ${n} files?`,
      unsavedMore: (n: number) => `and ${n} more…`,
      unsavedDetail: "Your changes will be lost if you don't save them.",
      notResponding: 'The workspace is not responding.',
      notRespondingDetail: 'If you force it to close, unsaved changes will be lost.',
      forceClose: 'Force Close',
      wait: 'Wait',
      pickProjectFolder: 'Choose the project folder'
    },
    tabMenu: {
      closeOthers: 'Close Others',
      closeRight: 'Close to the Right',
      closeSaved: 'Close Saved',
      copyPath: 'Copy Path',
      reveal: 'Reveal in Explorer View'
    },
    workspaceMenu: {
      mute: 'Mute notifications',
      unmute: 'Unmute notifications'
    },
    cli: {
      adminFailed: "Couldn't complete with administrator privileges.",
      notInstalledApp: 'The "walph" command can only be managed by the installed Walph.',
      fileExists: (path: string) => `A "walph" file already exists at ${path}.`,
      fileExistsDetail: 'It was not created by Walph. Replace it?',
      replace: 'Replace',
      installFailed: (path: string) => `Couldn't install the "walph" command at ${path}.`,
      installed: (path: string) => `"walph" command installed at ${path}.`,
      addToPath: (dir: string) => `Add ${dir} to your PATH to use it in the terminal.`,
      readFailed: (path: string) => `Couldn't read ${path}.`,
      notInstalled: 'The "walph" command is not installed.',
      notOurs: (path: string) => `The file ${path} was not created by Walph and won't be removed.`,
      removeFailed: (path: string) => `Couldn't remove the "walph" command from ${path}.`,
      removed: (path: string) => `"walph" command removed from ${path}.`,
      invalidExecutable: 'The path to the Walph executable contains invalid characters.',
      launcherNotFound: (path: string) => `walph: Walph was not found at ${path}`,
      noLocalAppData: "Couldn't find the LOCALAPPDATA folder.",
      moveToApplications: "Move Walph to the Applications folder before installing the 'walph' command."
    },
    update: {
      checking: 'Checking for updates…',
      upToDate: 'Walph is up to date.',
      downloading: (version: string) => `Downloading version ${version}…`,
      downloaded: (version: string) => `Version ${version} is ready to install.`,
      checkFailed: "Couldn't check for updates.",
      offline: "Couldn't check for updates: no internet connection.",
      unsigned: "Couldn't install the update: the app is not signed.",
      disabled: 'Automatic updates are turned off ("update.enabled").',
      restartDescription: 'Walph restarts and asks you to save anything pending.',
      restartAndUpdate: 'Restart and Update'
    },
    workspaceBar: {
      tablist: 'Workspaces',
      emptyName: 'No folder',
      branchAria: (branch: string) => `branch ${branch}`,
      muted: 'notifications muted',
      unread: (n: number) => plural(n, '1 unread', `${n} unread`),
      status: {
        running: 'Claude Code working',
        done: 'Claude Code finished',
        attention: 'Claude Code waiting for you',
        error: 'Claude Code failed'
      },
      openWorkspace: 'Open Workspace',
      nothingNewToOpen: 'No new folders to open.'
    },
    activityBar: {
      views: 'Views',
      explorer: 'Explorer',
      search: 'Search',
      git: 'Source Control',
      debug: 'Run and Debug',
      containers: 'Containers',
      containersProblems: (title: string, n: number) =>
        `${title}: ${n} ${plural(n, 'container with problems', 'containers with problems')}`
    },
    statusBar: {
      projectPath: (root: string) => `Project path: ${root}`,
      commitAuthorWhen: (author: string, when: string) => `${author}, ${when}`,
      commitTitle: (shortHash: string, hash: string, author: string, date: string, detail: string) =>
        `${shortHash} (${hash})\n${author}, ${date}\n\n${detail}`,
      lastCommit: (hash: string, author: string, when: string, subject: string) =>
        `Last commit ${hash}, ${author}, ${when}: ${subject}`,
      indentSpaces: 'Indent Using Spaces',
      indentTabs: 'Indent Using Tabs',
      indentSize: (size: number) => `Indent size: ${size}`,
      convertToSpaces: 'Convert Indentation to Spaces',
      convertToTabs: 'Convert Indentation to Tabs',
      indent: (text: string) => `Indentation: ${text}`,
      indentTitle: (text: string) => `Indentation: ${text} (click to change)`,
      cursor: (line: number, column: number) => `Ln ${line}, Col ${column}`,
      cursorSelection: (line: number, column: number, selection: string) => `Ln ${line}, Col ${column} (${selection})`,
      goToLine: 'Go to Line…',
      changeBranch: 'Switch branch…',
      changeBranchDirty: 'Switch branch… (with changes)',
      dirty: 'with changes',
      detachedHead: 'Detached HEAD',
      syncTitle: (tooltip: string) => `${tooltip}\nClick to sync`,
      syncAria: (upstream: string, tooltip: string) => `Sync with ${upstream}: ${tooltip}`,
      publishBranchTitle: 'Publish the branch to origin (push -u)',
      publishBranch: 'Publish Branch',
      problems: 'Problems',
      encodingTitle: 'Reopen or save with encoding…',
      encodingAria: (encoding: string) => `Encoding: ${encoding}. Reopen or save with encoding…`,
      eolTitle: (eol: string, other: string) => `End of line: ${eol} (click for ${other})`,
      eolAria: (eol: string, other: string) => `End of line: ${eol}. Switch to ${other}`,
      languageTitle: 'Change language mode…',
      languageAria: (language: string) => `Language mode: ${language}. Change…`,
      toggleTerminal: 'Toggle Terminal',
      server: {
        starting: 'starting…',
        ready: 'ready',
        error: 'error'
      },
      serverTitle: (name: string, state: string, message: string | null) =>
        `${name}: ${state}${message ? ` (${message})` : ''}. Click to view Output`
    },
    welcome: {
      tagline: 'The editor, the terminal and Claude Code in a single window.',
      shortcuts: {
        commands: 'Commands',
        openFile: 'Open file',
        search: 'Search',
        terminal: 'Terminal'
      },
      openFolder: 'Open Folder',
      clone: 'Clone Repository',
      terminal: 'Terminal',
      newWindow: 'New Window',
      continueTitle: 'Pick up where you left off',
      recentTitle: 'Recent',
      selectHint: (modifier: string) => `${modifier}-click or Space selects several; click opens just one.`,
      clearSelection: 'Clear Selection',
      openAll: 'Open All',
      openCount: (n: number) => plural(n, 'Open 1 Workspace', `Open ${n} Workspaces`),
      claudeTitle: 'Start with Claude',
      claudePlaceholder: 'Ask Claude for something…',
      claudeAria: 'Request for Claude',
      sendToClaude: 'Send to Claude',
      targetIn: (name: string) => `In ${name} · Shift+Enter adds a new line`,
      targetPick: 'You choose the folder when sending · Shift+Enter adds a new line'
    },
    recent: {
      openElsewhere: 'Open in another workspace',
      select: (name: string) => `Select ${name}`,
      selected: ', selected',
      removeTitle: 'Remove from recent',
      removeAria: (name: string) => `Remove ${name} from recent`,
      opened: {
        now: 'opened just now',
        minutesAgo: (n: number) => `opened ${n} min ago`,
        hoursAgo: (n: number) => `opened ${n} h ago`,
        yesterday: 'opened yesterday',
        daysAgo: (n: number) => `opened ${n} days ago`,
        on: (date: string) => `opened on ${date}`
      }
    },
    addWorkspace: {
      browse: 'Open Folder…',
      filter: 'Filter recent folders',
      noMatch: 'No folders match the filter'
    },
    panel: {
      tablist: 'Panel',
      problems: 'Problems',
      output: 'Output',
      references: 'References',
      hierarchy: 'Hierarchy',
      debugConsole: 'Debug Console',
      terminal: 'Terminal',
      terminals: 'Terminals',
      terminalName: 'Terminal name',
      splitTab: (label: string) => `${label} (split)`,
      newTerminal: 'New Terminal',
      newTerminalWithProfile: 'New Terminal with Profile…',
      splitTerminal: 'Split Terminal',
      killTerminal: 'Kill Terminal',
      moveRight: 'Move Panel Right',
      moveDown: 'Move Panel Down',
      restoreSize: 'Restore Panel Size',
      maximize: 'Maximize Panel',
      moreActions: 'More panel actions',
      hide: 'Hide Panel',
      moveRightTitle: 'Move Panel Right',
      moveDownTitle: 'Move Panel Down',
      restoreSizeTitle: 'Restore Panel Size',
      maximizeTitle: 'Maximize Panel',
      clearResults: 'Clear Results'
    },
    toasts: {
      region: 'Notifications',
      dismiss: 'Dismiss notification',
      progress: 'Progress'
    }
  },
  es: {
    copyPath: 'Copiar ruta',
    closeWorkspace: 'Cerrar espacio de trabajo',
    openFolderAsWorkspace: 'Abrir carpeta como espacio de trabajo',
    recentFolders: 'Carpetas recientes',
    noRecentFolders: 'No hay carpetas recientes',
    branchTitle: (branch: string) => `Rama ${branch}`,
    revealInFinder: 'Mostrar en Finder',
    revealInExplorer: 'Mostrar en el Explorador de archivos',
    revealInFolder: 'Abrir la carpeta contenedora',
    time: {
      now: 'ahora',
      minutesAgo: (n: number) => `hace ${n} min`,
      hoursAgo: (n: number) => `hace ${n} h`,
      yesterday: 'ayer',
      daysAgo: (n: number) => `hace ${n} días`
    },
    errors: {
      invalidFolder: 'Carpeta no válida: indique una ruta absoluta.',
      invalidFolderList: 'Lista de carpetas no válida.',
      unknownWindow: 'Ventana desconocida.',
      workspaceNotFound: 'No se encontró el espacio de trabajo.',
      emptyPrompt: 'Escriba la solicitud para Claude.',
      promptTooLong: 'La solicitud es demasiado larga.',
      notAFolder: (folder: string) => `"${folder}" no es una carpeta.`,
      restoreFolder: (error: string) => `No se pudo restaurar la carpeta: ${error}`,
      recentFolders: (error: string) => `Carpetas recientes: ${error}`,
      watchFailed: (folder: string) => `No se pudo observar "${folder}": la lista de archivos no se actualizará sola.`
    },
    dialogs: {
      unsavedOne: (name: string) => `¿Quiere guardar los cambios realizados en "${name}"?`,
      unsavedMany: (n: number) => `¿Quiere guardar los cambios en ${n} archivos?`,
      unsavedMore: (n: number) => `y ${n} más…`,
      unsavedDetail: 'Los cambios se perderán si no los guarda.',
      notResponding: 'El espacio de trabajo no responde.',
      notRespondingDetail: 'Si fuerza el cierre, se perderán los cambios no guardados.',
      forceClose: 'Forzar cierre',
      wait: 'Esperar',
      pickProjectFolder: 'Elija la carpeta del proyecto'
    },
    tabMenu: {
      closeOthers: 'Cerrar otras',
      closeRight: 'Cerrar a la derecha',
      closeSaved: 'Cerrar guardadas',
      copyPath: 'Copiar ruta',
      reveal: 'Mostrar en el Explorador'
    },
    workspaceMenu: {
      mute: 'Silenciar notificaciones',
      unmute: 'Reactivar notificaciones'
    },
    cli: {
      adminFailed: 'No se pudo completar con permisos de administrador.',
      notInstalledApp: 'El comando "walph" solo se puede administrar desde el Walph instalado.',
      fileExists: (path: string) => `Ya existe un archivo "walph" en ${path}.`,
      fileExistsDetail: 'No fue creado por Walph. ¿Reemplazarlo?',
      replace: 'Reemplazar',
      installFailed: (path: string) => `No se pudo instalar el comando "walph" en ${path}.`,
      installed: (path: string) => `Comando "walph" instalado en ${path}.`,
      addToPath: (dir: string) => `Agregue ${dir} al PATH para usarlo en la terminal.`,
      readFailed: (path: string) => `No se pudo leer ${path}.`,
      notInstalled: 'El comando "walph" no está instalado.',
      notOurs: (path: string) => `El archivo ${path} no fue creado por Walph y no se eliminará.`,
      removeFailed: (path: string) => `No se pudo eliminar el comando "walph" de ${path}.`,
      removed: (path: string) => `Comando "walph" eliminado de ${path}.`,
      invalidExecutable: 'La ruta del ejecutable de Walph contiene caracteres no válidos.',
      launcherNotFound: (path: string) => `walph: no se encontró Walph en ${path}`,
      noLocalAppData: 'No se pudo encontrar la carpeta LOCALAPPDATA.',
      moveToApplications: "Mueva Walph a la carpeta Aplicaciones antes de instalar el comando 'walph'."
    },
    update: {
      checking: 'Buscando actualizaciones…',
      upToDate: 'Walph ya está actualizado.',
      downloading: (version: string) => `Descargando la versión ${version}…`,
      downloaded: (version: string) => `La versión ${version} está lista para instalarse.`,
      checkFailed: 'No se pudieron buscar actualizaciones.',
      offline: 'No se pudieron buscar actualizaciones: sin conexión a internet.',
      unsigned: 'No se pudo instalar la actualización: la aplicación no está firmada.',
      disabled: 'Las actualizaciones automáticas están desactivadas ("update.enabled").',
      restartDescription: 'Walph se reinicia y le pide guardar lo que esté pendiente.',
      restartAndUpdate: 'Reiniciar y actualizar'
    },
    workspaceBar: {
      tablist: 'Espacios de trabajo',
      emptyName: 'Sin carpeta',
      branchAria: (branch: string) => `rama ${branch}`,
      muted: 'notificaciones silenciadas',
      unread: (n: number) => plural(n, '1 sin leer', `${n} sin leer`),
      status: {
        running: 'Claude Code trabajando',
        done: 'Claude Code terminó',
        attention: 'Claude Code le está esperando',
        error: 'Claude Code falló'
      },
      openWorkspace: 'Abrir espacio de trabajo',
      nothingNewToOpen: 'No hay carpetas nuevas para abrir.'
    },
    activityBar: {
      views: 'Vistas',
      explorer: 'Explorador',
      search: 'Buscar',
      git: 'Control de código fuente',
      debug: 'Ejecutar y depurar',
      containers: 'Contenedores',
      containersProblems: (title: string, n: number) =>
        `${title}: ${n} ${plural(n, 'contenedor con problemas', 'contenedores con problemas')}`
    },
    statusBar: {
      projectPath: (root: string) => `Ruta del proyecto: ${root}`,
      commitAuthorWhen: (author: string, when: string) => `${author}, ${when}`,
      commitTitle: (shortHash: string, hash: string, author: string, date: string, detail: string) =>
        `${shortHash} (${hash})\n${author}, ${date}\n\n${detail}`,
      lastCommit: (hash: string, author: string, when: string, subject: string) =>
        `Último commit ${hash}, ${author}, ${when}: ${subject}`,
      indentSpaces: 'Aplicar sangría con espacios',
      indentTabs: 'Aplicar sangría con tabulaciones',
      indentSize: (size: number) => `Tamaño de sangría: ${size}`,
      convertToSpaces: 'Convertir sangría en espacios',
      convertToTabs: 'Convertir sangría en tabulaciones',
      indent: (text: string) => `Sangría: ${text}`,
      indentTitle: (text: string) => `Sangría: ${text} (haga clic para cambiar)`,
      cursor: (line: number, column: number) => `Lín. ${line}, col. ${column}`,
      cursorSelection: (line: number, column: number, selection: string) =>
        `Lín. ${line}, col. ${column} (${selection})`,
      goToLine: 'Ir a la línea…',
      changeBranch: 'Cambiar de rama…',
      changeBranchDirty: 'Cambiar de rama… (con cambios)',
      dirty: 'con cambios',
      detachedHead: 'HEAD desasociado',
      syncTitle: (tooltip: string) => `${tooltip}\nHaga clic para sincronizar`,
      syncAria: (upstream: string, tooltip: string) => `Sincronizar con ${upstream}: ${tooltip}`,
      publishBranchTitle: 'Publicar la rama en origin (push -u)',
      publishBranch: 'Publicar rama',
      problems: 'Problemas',
      encodingTitle: 'Volver a abrir o guardar con codificación…',
      encodingAria: (encoding: string) => `Codificación: ${encoding}. Volver a abrir o guardar con codificación…`,
      eolTitle: (eol: string, other: string) => `Fin de línea: ${eol} (haga clic para ${other})`,
      eolAria: (eol: string, other: string) => `Fin de línea: ${eol}. Cambiar a ${other}`,
      languageTitle: 'Cambiar el modo de lenguaje…',
      languageAria: (language: string) => `Modo de lenguaje: ${language}. Cambiar…`,
      toggleTerminal: 'Alternar terminal',
      server: {
        starting: 'iniciando…',
        ready: 'listo',
        error: 'error'
      },
      serverTitle: (name: string, state: string, message: string | null) =>
        `${name}: ${state}${message ? ` (${message})` : ''}. Haga clic para ver la Salida`
    },
    welcome: {
      tagline: 'El editor, la terminal y Claude Code en una sola ventana.',
      shortcuts: {
        commands: 'Comandos',
        openFile: 'Abrir archivo',
        search: 'Buscar',
        terminal: 'Terminal'
      },
      openFolder: 'Abrir carpeta',
      clone: 'Clonar repositorio',
      terminal: 'Terminal',
      newWindow: 'Nueva ventana',
      continueTitle: 'Continuar donde lo dejó',
      recentTitle: 'Recientes',
      selectHint: (modifier: string) => `${modifier}+clic o Espacio selecciona varias; un clic abre solo una.`,
      clearSelection: 'Borrar selección',
      openAll: 'Abrir todas',
      openCount: (n: number) => plural(n, 'Abrir 1 espacio de trabajo', `Abrir ${n} espacios de trabajo`),
      claudeTitle: 'Empiece con Claude',
      claudePlaceholder: 'Pídale algo a Claude…',
      claudeAria: 'Solicitud para Claude',
      sendToClaude: 'Enviar a Claude',
      targetIn: (name: string) => `En ${name} · Mayús+Entrar inserta un salto de línea`,
      targetPick: 'La carpeta se elige al enviar · Mayús+Entrar inserta un salto de línea'
    },
    recent: {
      openElsewhere: 'Abierta en otro espacio de trabajo',
      select: (name: string) => `Seleccionar ${name}`,
      selected: ', seleccionada',
      removeTitle: 'Quitar de recientes',
      removeAria: (name: string) => `Quitar ${name} de recientes`,
      opened: {
        now: 'abierta ahora',
        minutesAgo: (n: number) => `abierta hace ${n} min`,
        hoursAgo: (n: number) => `abierta hace ${n} h`,
        yesterday: 'abierta ayer',
        daysAgo: (n: number) => `abierta hace ${n} días`,
        on: (date: string) => `abierta el ${date}`
      }
    },
    addWorkspace: {
      browse: 'Abrir carpeta…',
      filter: 'Filtrar carpetas recientes',
      noMatch: 'Ninguna carpeta coincide con el filtro'
    },
    panel: {
      tablist: 'Panel',
      problems: 'Problemas',
      output: 'Salida',
      references: 'Referencias',
      hierarchy: 'Jerarquía',
      debugConsole: 'Consola de depuración',
      terminal: 'Terminal',
      terminals: 'Terminales',
      terminalName: 'Nombre de la terminal',
      splitTab: (label: string) => `${label} (dividida)`,
      newTerminal: 'Nueva terminal',
      newTerminalWithProfile: 'Nueva terminal con perfil…',
      splitTerminal: 'Dividir terminal',
      killTerminal: 'Terminar terminal',
      moveRight: 'Mover panel a la derecha',
      moveDown: 'Mover panel abajo',
      restoreSize: 'Restaurar tamaño del panel',
      maximize: 'Maximizar panel',
      moreActions: 'Más acciones del panel',
      hide: 'Ocultar panel',
      moveRightTitle: 'Mover panel a la derecha',
      moveDownTitle: 'Mover panel abajo',
      restoreSizeTitle: 'Restaurar tamaño del panel',
      maximizeTitle: 'Maximizar panel',
      clearResults: 'Borrar resultados'
    },
    toasts: {
      region: 'Notificaciones',
      dismiss: 'Descartar notificación',
      progress: 'Progreso'
    }
  }
})
