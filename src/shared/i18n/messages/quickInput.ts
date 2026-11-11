import { defineMessages } from '../define'

export const quickInput = defineMessages({
  'pt-BR': {
    modes: {
      unified: {
        label: 'Paleta unificada',
        placeholder: 'Buscar workspaces, comandos e arquivos (> comandos, : linha, @ símbolos, # símbolos do workspace)'
      },
      recent: { label: 'Abrir pasta recente', placeholder: 'Digite o nome ou o caminho de uma pasta' },
      branch: { label: 'Mudar de branch', placeholder: 'Selecione uma branch para mudar' },
      createBranch: { label: 'Criar nova branch', placeholder: 'Nome da nova branch (criada a partir da atual)' },
      cloneUrl: { label: 'Clonar repositório', placeholder: 'URL do repositório (https://… ou git@…)' },
      compareFile: { label: 'Comparar com…', placeholder: 'Selecione o arquivo a comparar com o arquivo ativo' },
      debugConfig: { label: 'Configuração de depuração', placeholder: 'Selecione a configuração a iniciar' },
      stashMessage: { label: 'Guardar alterações', placeholder: 'Mensagem do stash (opcional); Enter para guardar' },
      stashPick: { label: 'Selecionar stash', placeholder: 'Selecione um stash' },
      terminalProfile: {
        label: 'Novo terminal com perfil',
        placeholder: 'Selecione o perfil de shell do novo terminal'
      },
      language: { label: 'Modo de linguagem', placeholder: 'Selecione o modo de linguagem do arquivo' },
      encoding: { label: 'Codificação', placeholder: 'Selecione a codificação para reabrir ou salvar o arquivo' },
      insertSnippet: { label: 'Inserir snippet', placeholder: 'Selecione um snippet' },
      configureSnippets: {
        label: 'Configurar snippets',
        placeholder: 'Selecione um arquivo de snippets ou crie um novo'
      },
      snippetFileGlobal: { label: 'Novo arquivo de snippets global', placeholder: 'Nome do arquivo (sem extensão)' },
      snippetFileWorkspace: {
        label: 'Novo arquivo de snippets do workspace',
        placeholder: 'Nome do arquivo (sem extensão)'
      },
      emmetWrap: { label: 'Envolver com abreviação', placeholder: 'Abreviação do Emmet (ex.: div.card>p)' },
      theme: { label: 'Selecionar tema', placeholder: 'Selecione um tema (as setas pré-visualizam)' },
      files: {
        label: 'Ir para arquivo',
        placeholder: 'Digite o nome de um arquivo (> comandos, : linha, @ símbolos, # símbolos do workspace)'
      },
      symbols: { label: 'Ir para símbolo no arquivo', placeholder: 'Digite o nome de um símbolo do arquivo' },
      workspaceSymbols: {
        label: 'Ir para símbolo no workspace',
        placeholder: 'Digite o nome de um símbolo do projeto'
      },
      commands: { label: 'Paleta de comandos', placeholder: 'Digite o nome de um comando' },
      line: { label: 'Ir para linha', placeholder: 'Digite linha[:coluna], por exemplo 30 ou 30:5' }
    },
    footer: { navigate: 'navegar', select: 'selecionar', close: 'fechar' },
    current: 'atual',
    commands: { recentlyUsed: 'usado recentemente', none: 'Nenhum comando encontrado' },
    files: {
      openFolder: 'Abra uma pasta para buscar arquivos',
      loading: 'Carregando arquivos…',
      line: (line: number) => `linha ${line}`,
      lineColumn: (line: number, column: number) => `linha ${line}, coluna ${column}`,
      truncated: 'Lista parcial: o projeto tem arquivos demais para listar todos.',
      none: 'Nenhum arquivo encontrado',
      empty: 'Nenhum arquivo no projeto',
      open: 'aberto',
      recentlyOpened: 'aberto recentemente'
    },
    themes: { dark: 'escuro', light: 'claro', none: 'Nenhum tema encontrado' },
    profiles: {
      default: 'Padrão',
      profile: (name: string) => `perfil: ${name}`,
      systemShell: 'shell do sistema',
      isDefault: 'padrão',
      none: 'Nenhum perfil encontrado'
    },
    language: {
      openFile: 'Abra um arquivo para mudar o modo de linguagem',
      detect: (language: string) => `Detectar pela extensão (${language})`,
      none: 'Nenhum modo de linguagem encontrado'
    },
    encoding: {
      openFile: 'Abra um arquivo para mudar a codificação',
      reopen: 'Reabrir com codificação',
      save: 'Salvar com codificação',
      discardsChanges: 'descarta alterações',
      none: 'Nenhuma codificação encontrada'
    },
    recent: { none: 'Nenhuma pasta encontrada', empty: 'Nenhuma pasta recente' },
    line: {
      openFile: 'Abra um arquivo para ir para uma linha',
      prompt: 'Digite linha[:coluna]',
      promptAt: (line: number, column: number) => `Linha atual: ${line}, Coluna: ${column}. Digite linha[:coluna]`,
      invalid: 'Entrada inválida. Use linha[:coluna], por exemplo 30 ou 30:5',
      goTo: (line: number) => `Ir para a linha ${line}`,
      goToColumn: (line: number, column: number) => `Ir para a linha ${line}, coluna ${column}`
    },
    symbols: {
      openFile: 'Abra um arquivo para ver os símbolos',
      noServer: 'O arquivo não tem um servidor de linguagem ativo',
      loading: 'Carregando símbolos…',
      emptyFile: 'Nenhum símbolo neste arquivo',
      none: 'Nenhum símbolo encontrado',
      openFolder: 'Abra uma pasta para buscar símbolos',
      noServers: 'Nenhum servidor de linguagem ativo',
      typeName: 'Digite o nome de um símbolo',
      searching: 'Buscando símbolos…'
    },
    git: {
      createBranchItem: 'Criar nova branch…',
      loadingBranches: 'Carregando branches…',
      currentBranch: (hash: string) => `atual · ${hash}`,
      noBranches: 'Nenhuma branch encontrada',
      typeBranchName: 'Digite o nome da nova branch e pressione Enter',
      createBranch: (name: string) => `Criar branch "${name}"`,
      fromBranch: (branch: string) => `a partir de ${branch}`,
      typeCloneUrl: 'Digite a URL do repositório e pressione Enter',
      checkingUrl: 'Verificando a URL…',
      cloneInto: (name: string) => `Clonar em "${name}"…`,
      chooseDestination: 'escolher a pasta de destino',
      stashWithMessage: (message: string) => `Guardar com a mensagem "${message}"`,
      stashChanges: 'Guardar alterações (stash)',
      optionalMessage: 'mensagem opcional',
      stashHint: {
        apply: 'Aplicar o stash selecionado',
        pop: 'Aplicar e remover o stash selecionado',
        drop: 'Remover o stash selecionado'
      },
      noStashMatch: 'Nenhum stash encontrado',
      noStashes: 'Não há stashes'
    },
    unified: {
      workspaces: 'Workspaces',
      commands: 'Comandos',
      files: 'Arquivos',
      askClaude: (query: string) => `Perguntar ao Claude: “${query}”`,
      openFolder: 'Abra uma pasta',
      empty: 'Digite para buscar workspaces, comandos e arquivos'
    }
  },
  en: {
    modes: {
      unified: {
        label: 'Unified palette',
        placeholder: 'Search workspaces, commands and files (> commands, : line, @ symbols, # workspace symbols)'
      },
      recent: { label: 'Open recent folder', placeholder: 'Type the name or path of a folder' },
      branch: { label: 'Switch branch', placeholder: 'Select a branch to switch to' },
      createBranch: {
        label: 'Create new branch',
        placeholder: 'Name of the new branch (created from the current one)'
      },
      cloneUrl: { label: 'Clone repository', placeholder: 'Repository URL (https://… or git@…)' },
      compareFile: { label: 'Compare with…', placeholder: 'Select the file to compare with the active file' },
      debugConfig: { label: 'Debug configuration', placeholder: 'Select the configuration to start' },
      stashMessage: { label: 'Stash changes', placeholder: 'Stash message (optional); Enter to stash' },
      stashPick: { label: 'Select stash', placeholder: 'Select a stash' },
      terminalProfile: {
        label: 'New terminal with profile',
        placeholder: 'Select the shell profile for the new terminal'
      },
      language: { label: 'Language mode', placeholder: 'Select the language mode of the file' },
      encoding: { label: 'Encoding', placeholder: 'Select the encoding to reopen or save the file with' },
      insertSnippet: { label: 'Insert snippet', placeholder: 'Select a snippet' },
      configureSnippets: { label: 'Configure snippets', placeholder: 'Select a snippets file or create a new one' },
      snippetFileGlobal: { label: 'New global snippets file', placeholder: 'File name (without extension)' },
      snippetFileWorkspace: { label: 'New workspace snippets file', placeholder: 'File name (without extension)' },
      emmetWrap: { label: 'Wrap with abbreviation', placeholder: 'Emmet abbreviation (e.g. div.card>p)' },
      theme: { label: 'Select theme', placeholder: 'Select a theme (the arrow keys preview it)' },
      files: {
        label: 'Go to file',
        placeholder: 'Type the name of a file (> commands, : line, @ symbols, # workspace symbols)'
      },
      symbols: { label: 'Go to symbol in file', placeholder: 'Type the name of a symbol in the file' },
      workspaceSymbols: {
        label: 'Go to symbol in workspace',
        placeholder: 'Type the name of a symbol in the project'
      },
      commands: { label: 'Command palette', placeholder: 'Type the name of a command' },
      line: { label: 'Go to line', placeholder: 'Type line[:column], for example 30 or 30:5' }
    },
    footer: { navigate: 'navigate', select: 'select', close: 'close' },
    current: 'current',
    commands: { recentlyUsed: 'recently used', none: 'No commands found' },
    files: {
      openFolder: 'Open a folder to search files',
      loading: 'Loading files…',
      line: (line: number) => `line ${line}`,
      lineColumn: (line: number, column: number) => `line ${line}, column ${column}`,
      truncated: 'Partial list: the project has too many files to list them all.',
      none: 'No files found',
      empty: 'No files in the project',
      open: 'open',
      recentlyOpened: 'recently opened'
    },
    themes: { dark: 'dark', light: 'light', none: 'No themes found' },
    profiles: {
      default: 'Default',
      profile: (name: string) => `profile: ${name}`,
      systemShell: 'system shell',
      isDefault: 'default',
      none: 'No profiles found'
    },
    language: {
      openFile: 'Open a file to change the language mode',
      detect: (language: string) => `Auto Detect from Extension (${language})`,
      none: 'No language modes found'
    },
    encoding: {
      openFile: 'Open a file to change the encoding',
      reopen: 'Reopen with encoding',
      save: 'Save with encoding',
      discardsChanges: 'discards changes',
      none: 'No encodings found'
    },
    recent: { none: 'No folders found', empty: 'No recent folders' },
    line: {
      openFile: 'Open a file to go to a line',
      prompt: 'Type line[:column]',
      promptAt: (line: number, column: number) => `Current line: ${line}, Column: ${column}. Type line[:column]`,
      invalid: 'Invalid input. Use line[:column], for example 30 or 30:5',
      goTo: (line: number) => `Go to line ${line}`,
      goToColumn: (line: number, column: number) => `Go to line ${line}, column ${column}`
    },
    symbols: {
      openFile: 'Open a file to see its symbols',
      noServer: 'The file has no active language server',
      loading: 'Loading symbols…',
      emptyFile: 'No symbols in this file',
      none: 'No symbols found',
      openFolder: 'Open a folder to search symbols',
      noServers: 'No active language server',
      typeName: 'Type the name of a symbol',
      searching: 'Searching symbols…'
    },
    git: {
      createBranchItem: 'Create new branch…',
      loadingBranches: 'Loading branches…',
      currentBranch: (hash: string) => `current · ${hash}`,
      noBranches: 'No branches found',
      typeBranchName: 'Type the name of the new branch and press Enter',
      createBranch: (name: string) => `Create branch "${name}"`,
      fromBranch: (branch: string) => `from ${branch}`,
      typeCloneUrl: 'Type the repository URL and press Enter',
      checkingUrl: 'Checking the URL…',
      cloneInto: (name: string) => `Clone into "${name}"…`,
      chooseDestination: 'choose the destination folder',
      stashWithMessage: (message: string) => `Stash with the message "${message}"`,
      stashChanges: 'Stash changes',
      optionalMessage: 'optional message',
      stashHint: {
        apply: 'Apply the selected stash',
        pop: 'Pop the selected stash',
        drop: 'Drop the selected stash'
      },
      noStashMatch: 'No stashes found',
      noStashes: 'There are no stashes'
    },
    unified: {
      workspaces: 'Workspaces',
      commands: 'Commands',
      files: 'Files',
      askClaude: (query: string) => `Ask Claude: “${query}”`,
      openFolder: 'Open a folder',
      empty: 'Type to search workspaces, commands and files'
    }
  },
  es: {
    modes: {
      unified: {
        label: 'Paleta unificada',
        placeholder:
          'Buscar espacios de trabajo, comandos y archivos (> comandos, : línea, @ símbolos, # símbolos del espacio de trabajo)'
      },
      recent: { label: 'Abrir carpeta reciente', placeholder: 'Escribe el nombre o la ruta de una carpeta' },
      branch: { label: 'Cambiar de rama', placeholder: 'Selecciona una rama a la que cambiar' },
      createBranch: {
        label: 'Crear rama nueva',
        placeholder: 'Nombre de la rama nueva (creada a partir de la actual)'
      },
      cloneUrl: { label: 'Clonar repositorio', placeholder: 'URL del repositorio (https://… o git@…)' },
      compareFile: { label: 'Comparar con…', placeholder: 'Selecciona el archivo a comparar con el archivo activo' },
      debugConfig: { label: 'Configuración de depuración', placeholder: 'Seleccione la configuración a iniciar' },
      stashMessage: { label: 'Guardar cambios', placeholder: 'Mensaje del stash (opcional); Enter para guardar' },
      stashPick: { label: 'Seleccionar stash', placeholder: 'Selecciona un stash' },
      terminalProfile: {
        label: 'Nueva terminal con perfil',
        placeholder: 'Selecciona el perfil de shell de la nueva terminal'
      },
      language: { label: 'Modo de lenguaje', placeholder: 'Selecciona el modo de lenguaje del archivo' },
      encoding: {
        label: 'Codificación',
        placeholder: 'Selecciona la codificación para volver a abrir o guardar el archivo'
      },
      insertSnippet: { label: 'Insertar fragmento', placeholder: 'Selecciona un fragmento' },
      configureSnippets: {
        label: 'Configurar fragmentos',
        placeholder: 'Selecciona un archivo de fragmentos o crea uno nuevo'
      },
      snippetFileGlobal: {
        label: 'Nuevo archivo de fragmentos global',
        placeholder: 'Nombre del archivo (sin extensión)'
      },
      snippetFileWorkspace: {
        label: 'Nuevo archivo de fragmentos del espacio de trabajo',
        placeholder: 'Nombre del archivo (sin extensión)'
      },
      emmetWrap: { label: 'Encapsular con abreviatura', placeholder: 'Abreviatura de Emmet (p. ej., div.card>p)' },
      theme: { label: 'Seleccionar tema', placeholder: 'Selecciona un tema (las flechas muestran una vista previa)' },
      files: {
        label: 'Ir al archivo',
        placeholder:
          'Escribe el nombre de un archivo (> comandos, : línea, @ símbolos, # símbolos del espacio de trabajo)'
      },
      symbols: { label: 'Ir al símbolo en el archivo', placeholder: 'Escribe el nombre de un símbolo del archivo' },
      workspaceSymbols: {
        label: 'Ir al símbolo en el espacio de trabajo',
        placeholder: 'Escribe el nombre de un símbolo del proyecto'
      },
      commands: { label: 'Paleta de comandos', placeholder: 'Escribe el nombre de un comando' },
      line: { label: 'Ir a la línea', placeholder: 'Escribe línea[:columna], por ejemplo 30 o 30:5' }
    },
    footer: { navigate: 'navegar', select: 'seleccionar', close: 'cerrar' },
    current: 'actual',
    commands: { recentlyUsed: 'usado recientemente', none: 'No se encontraron comandos' },
    files: {
      openFolder: 'Abre una carpeta para buscar archivos',
      loading: 'Cargando archivos…',
      line: (line: number) => `línea ${line}`,
      lineColumn: (line: number, column: number) => `línea ${line}, columna ${column}`,
      truncated: 'Lista parcial: el proyecto tiene demasiados archivos para listarlos todos.',
      none: 'No se encontraron archivos',
      empty: 'No hay archivos en el proyecto',
      open: 'abierto',
      recentlyOpened: 'abierto recientemente'
    },
    themes: { dark: 'oscuro', light: 'claro', none: 'No se encontraron temas' },
    profiles: {
      default: 'Predeterminado',
      profile: (name: string) => `perfil: ${name}`,
      systemShell: 'shell del sistema',
      isDefault: 'predeterminado',
      none: 'No se encontraron perfiles'
    },
    language: {
      openFile: 'Abre un archivo para cambiar el modo de lenguaje',
      detect: (language: string) => `Detectar por la extensión (${language})`,
      none: 'No se encontraron modos de lenguaje'
    },
    encoding: {
      openFile: 'Abre un archivo para cambiar la codificación',
      reopen: 'Volver a abrir con codificación',
      save: 'Guardar con codificación',
      discardsChanges: 'descarta los cambios',
      none: 'No se encontraron codificaciones'
    },
    recent: { none: 'No se encontraron carpetas', empty: 'No hay carpetas recientes' },
    line: {
      openFile: 'Abre un archivo para ir a una línea',
      prompt: 'Escribe línea[:columna]',
      promptAt: (line: number, column: number) => `Línea actual: ${line}, Columna: ${column}. Escribe línea[:columna]`,
      invalid: 'Entrada no válida. Usa línea[:columna], por ejemplo 30 o 30:5',
      goTo: (line: number) => `Ir a la línea ${line}`,
      goToColumn: (line: number, column: number) => `Ir a la línea ${line}, columna ${column}`
    },
    symbols: {
      openFile: 'Abre un archivo para ver los símbolos',
      noServer: 'El archivo no tiene un servidor de lenguaje activo',
      loading: 'Cargando símbolos…',
      emptyFile: 'No hay símbolos en este archivo',
      none: 'No se encontraron símbolos',
      openFolder: 'Abre una carpeta para buscar símbolos',
      noServers: 'No hay ningún servidor de lenguaje activo',
      typeName: 'Escribe el nombre de un símbolo',
      searching: 'Buscando símbolos…'
    },
    git: {
      createBranchItem: 'Crear rama nueva…',
      loadingBranches: 'Cargando ramas…',
      currentBranch: (hash: string) => `actual · ${hash}`,
      noBranches: 'No se encontraron ramas',
      typeBranchName: 'Escribe el nombre de la rama nueva y presiona Enter',
      createBranch: (name: string) => `Crear la rama "${name}"`,
      fromBranch: (branch: string) => `a partir de ${branch}`,
      typeCloneUrl: 'Escribe la URL del repositorio y presiona Enter',
      checkingUrl: 'Verificando la URL…',
      cloneInto: (name: string) => `Clonar en "${name}"…`,
      chooseDestination: 'elegir la carpeta de destino',
      stashWithMessage: (message: string) => `Guardar con el mensaje "${message}"`,
      stashChanges: 'Guardar cambios (stash)',
      optionalMessage: 'mensaje opcional',
      stashHint: {
        apply: 'Aplicar el stash seleccionado',
        pop: 'Aplicar y quitar el stash seleccionado',
        drop: 'Quitar el stash seleccionado'
      },
      noStashMatch: 'No se encontraron stashes',
      noStashes: 'No hay stashes'
    },
    unified: {
      workspaces: 'Espacios de trabajo',
      commands: 'Comandos',
      files: 'Archivos',
      askClaude: (query: string) => `Preguntar a Claude: “${query}”`,
      openFolder: 'Abre una carpeta',
      empty: 'Escribe para buscar espacios de trabajo, comandos y archivos'
    }
  }
})
