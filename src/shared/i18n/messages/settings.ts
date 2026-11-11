import { defineMessages, plural } from '../define'
import type { SettingKey } from '../../settings'

type Items = Record<SettingKey, { label: string; description: string }>

export const settings = defineMessages({
  'pt-BR': {
    sections: {
      editor: 'Editor',
      files: 'Arquivos',
      terminal: 'Terminal',
      claude: 'Claude Code',
      appearance: 'Aparência',
      shortcuts: 'Atalhos'
    },
    items: {
      'editor.fontSize': { label: 'Tamanho da fonte', description: 'Tamanho da fonte do editor, em pixels.' },
      'editor.fontFamily': {
        label: 'Família da fonte',
        description: 'Lista de fontes do editor, no formato do CSS (a primeira instalada vence).'
      },
      'editor.tabSize': {
        label: 'Largura do tab',
        description: 'Colunas por nível de recuo quando o arquivo não tem indentação detectável.'
      },
      'editor.insertSpaces': {
        label: 'Recuar com espaços',
        description: 'Usa espaços em vez de tabs quando o arquivo não tem indentação detectável.'
      },
      'editor.wordWrap': { label: 'Quebra de linha', description: 'Quebra linhas longas na largura do editor.' },
      'editor.lineNumbers': { label: 'Números de linha', description: 'Mostra a numeração na margem do editor.' },
      'editor.minimap': {
        label: 'Minimapa',
        description: 'Mostra o mapa do código à direita do editor, com as alterações git e os problemas.'
      },
      'editor.stickyScroll.enabled': {
        label: 'Sticky scroll',
        description:
          'Mantém no topo do editor as linhas de cabeçalho das classes, funções e blocos que envolvem a tela.'
      },
      'editor.stickyScroll.maxLineCount': {
        label: 'Linhas do sticky scroll',
        description: 'Máximo de linhas de cabeçalho presas no topo do editor.'
      },
      'breadcrumbs.enabled': {
        label: 'Breadcrumbs',
        description: 'Mostra acima do editor o caminho do arquivo e o símbolo onde está o cursor.'
      },
      'editor.codeLens': {
        label: 'Code lens',
        description:
          'Mostra acima das declarações as informações do servidor de linguagem, como a contagem de referências.'
      },
      'editor.formatOnSave': {
        label: 'Formatar ao salvar',
        description:
          'Formata o documento pelo servidor de linguagem ao salvar manualmente (não no salvamento automático).'
      },
      'editor.inlayHints.enabled': {
        label: 'Inlay hints',
        description: 'Mostra no código as dicas do servidor de linguagem, como tipos inferidos e nomes de parâmetro.'
      },
      'editor.semanticHighlighting.enabled': {
        label: 'Realce semântico',
        description: 'Colore o código com os tokens semânticos do servidor de linguagem, por cima do realce de sintaxe.'
      },
      'editor.rulers': {
        label: 'Réguas',
        description:
          'Colunas onde o editor desenha linhas verticais (ex.: [80, 120]). O max_line_length do .editorconfig soma uma régua.'
      },
      'editor.renderWhitespace': {
        label: 'Mostrar espaços em branco',
        description: 'Quais espaços e tabs o editor desenha como pontos e traços.'
      },
      'files.trimTrailingWhitespace': {
        label: 'Remover espaços no fim das linhas',
        description: 'Ao salvar, tira espaços e tabs do fim das linhas. O .editorconfig do arquivo vence.'
      },
      'files.insertFinalNewline': {
        label: 'Inserir quebra de linha final',
        description: 'Ao salvar, termina o arquivo com uma quebra de linha. O .editorconfig do arquivo vence.'
      },
      'files.trimFinalNewlines': {
        label: 'Remover quebras de linha finais',
        description: 'Ao salvar, deixa uma só quebra de linha depois da última linha com conteúdo.'
      },
      'editor.snippetSuggestions': {
        label: 'Sugestões de snippets',
        description: 'Onde os snippets aparecem na lista de sugestões: no topo, no fim, misturados ou em nenhum lugar.'
      },
      'emmet.enabled': {
        label: 'Emmet',
        description: 'Sugere e expande abreviações do Emmet em HTML, JSX/TSX, Vue e CSS/SCSS/Less.'
      },
      'emmet.triggerExpansionOnTab': {
        label: 'Emmet: expandir com Tab',
        description:
          'Tab expande a abreviação antes do cursor quando não há sugestão aberta nem campo de snippet ativo.'
      },
      'emmet.includeLanguages': {
        label: 'Emmet: linguagens extras',
        description: 'Liga o Emmet em outras linguagens, mapeando cada uma para uma com suporte (ex.: "php": "html").'
      },
      'git.blame.inline': {
        label: 'Blame na linha',
        description: 'Mostra no fim da linha do cursor o autor, a data e a mensagem do último commit que a alterou.'
      },
      'git.blame.statusBar': {
        label: 'Blame na barra de status',
        description: 'Mostra na barra de status o autor e a data do último commit da linha do cursor.'
      },
      'lsp.servers': {
        label: 'Servidores de linguagem',
        description: 'Servidores de linguagem além do TypeScript embutido. Só nas configurações do usuário.'
      },
      'debug.adapters': {
        label: 'Adaptadores de depuração',
        description:
          'Adaptadores de depuração (Debug Adapter Protocol) por "type" do launch.json, além do Python (debugpy). Só nas configurações do usuário.'
      },
      'files.autoSave': {
        label: 'Salvar automaticamente',
        description: 'Quando salvar os arquivos alterados sem precisar de ⌘S.'
      },
      'files.autoSaveDelay': {
        label: 'Atraso do salvamento',
        description: 'Tempo parado, em milissegundos, até salvar no modo "Após um atraso".'
      },
      'files.exclude': {
        label: 'Arquivos escondidos',
        description: 'Padrões (globs) escondidos do explorador e da abertura rápida.'
      },
      'search.exclude': {
        label: 'Excluídos da busca',
        description: 'Padrões (globs) ignorados só na busca global, somados aos arquivos escondidos.'
      },
      'files.watcherExclude': {
        label: 'Fora da observação de arquivos',
        description:
          'Padrões (globs) que o app não observa em busca de mudanças. Mudanças nessas pastas não aparecem sozinhas no explorador. Para pastas pesadas (ex.: **/target/**, **/.venv/**) acrescente aqui.'
      },
      'terminal.fontSize': { label: 'Tamanho da fonte', description: 'Tamanho da fonte do terminal, em pixels.' },
      'terminal.scrollback': {
        label: 'Histórico (linhas)',
        description: 'Quantas linhas cada terminal guarda para rolar para cima. Valores altos usam mais memória.'
      },
      'terminal.shell': {
        label: 'Shell',
        description: 'Executável do shell: caminho absoluto ou nome resolvido pelo PATH. Vazio usa o padrão do sistema.'
      },
      'terminal.profiles': { label: 'Perfis de shell', description: 'Perfis oferecidos no botão "+" do terminal.' },
      'terminal.defaultProfile': {
        label: 'Perfil padrão',
        description: 'Perfil usado por "Novo Terminal". Sem perfil, vale o shell acima.'
      },
      'terminal.copyOnSelection': {
        label: 'Copiar ao selecionar',
        description: 'Copia o texto para a área de transferência assim que for selecionado no terminal.'
      },
      'terminal.colorPrompt': {
        label: 'Prompt colorido',
        description:
          'Dá ao prompt padrão do zsh e do bash as cores do tema. Prompts personalizados não mudam. Vale para terminais novos.'
      },
      'terminal.gpuAcceleration': {
        label: 'Aceleração por GPU',
        description: 'Renderiza o terminal com WebGL; "Desligada" usa sempre o DOM.'
      },
      'claude.model': {
        label: 'Modelo',
        description:
          'Modelo das conversas novas: um apelido (opus, sonnet…) ou o id completo. Vazio usa o padrão do Claude Code.'
      },
      'claude.fallbackModel': {
        label: 'Modelo reserva',
        description:
          'Usado quando o modelo principal está sobrecarregado ou indisponível. Vários: separe por vírgula, na ordem. Vazio desliga.'
      },
      'claude.initialPermissionMode': {
        label: 'Modo de permissão inicial',
        description: 'Modo com que cada conversa nova começa.'
      },
      'claude.effort': {
        label: 'Esforço padrão',
        description: 'Esforço com que cada conversa nova começa. Automático usa o padrão do modelo.'
      },
      'claude.allowBypassPermissions': {
        label: 'Permitir "Bypass permissions"',
        description: 'Libera o modo em que comandos rodam sem perguntar. Use só em pastas de confiança.'
      },
      'claude.autoContext': {
        label: 'Anexar contexto do editor',
        description: 'Anexa o arquivo ativo e a seleção do editor a cada mensagem.'
      },
      'claude.executable': {
        label: 'Executável do Claude Code',
        description: 'Caminho ou nome do executável. Vazio usa o binário que acompanha o app.'
      },
      'claude.env': {
        label: 'Variáveis de ambiente',
        description: 'Variáveis somadas ao ambiente do processo do Claude Code.'
      },
      'claude.notifications.toast': {
        label: 'Avisos na janela',
        description: 'Quais eventos das conversas viram aviso (toast) no canto da janela.'
      },
      'claude.notifications.system': {
        label: 'Notificações do sistema',
        description: 'Avisa pelo sistema quando uma conversa termina, pede algo ou falha com a janela sem foco.'
      },
      'claude.notifications.sound': {
        label: 'Som dos avisos',
        description: 'Toca um som quando aparece um aviso de conversa (na janela ou do sistema).'
      },
      'claude.idleSleepMinutes': {
        label: 'Suspender conversa parada',
        description:
          'Minutos sem uso até o processo do Claude de uma conversa ser encerrado para liberar memória; ele volta sozinho no próximo envio, reconectando os servidores MCP. 0 = nunca.'
      },
      'workbench.language': {
        label: 'Idioma',
        description: 'Idioma da interface. "Sistema" segue o idioma do sistema operacional.'
      },
      'workbench.theme': { label: 'Tema de cores', description: 'Tema da interface, do editor e do terminal.' },
      'workbench.fontFamily': {
        label: 'Fonte da interface',
        description:
          'Lista de fontes da interface, no formato do CSS (a primeira instalada vence). Não afeta editor e terminal.'
      },
      'workbench.fontSize': {
        label: 'Tamanho da fonte da interface',
        description: 'Tamanho base do texto da interface, em pixels. Editor e terminal têm tamanhos próprios.'
      },
      'docker.path': {
        label: 'Executável do Docker',
        description: 'Caminho ou nome do executável usado pela tela de Containers. Vazio usa o "docker" do PATH.'
      },
      'workspaces.maxLiveViews': {
        label: 'Workspaces carregados',
        description:
          'Quantos workspaces ficam carregados na memória; os menos usados hibernam. 0 = sem limite. Nunca hibernam workspaces com algo em andamento: processo no terminal (no Windows, qualquer terminal aberto), Claude trabalhando ou arquivos não salvos.'
      },
      'workspaces.hibernateAfterMinutes': {
        label: 'Hibernar workspace inativo',
        description:
          'Minutos sem uso até um workspace em segundo plano ser descarregado. 0 = nunca. Nunca hibernam workspaces com algo em andamento: processo no terminal (no Windows, qualquer terminal aberto), Claude trabalhando ou arquivos não salvos.'
      },
      'update.enabled': {
        label: 'Atualizar automaticamente',
        description:
          'Verifica atualizações do Walph ao abrir e a cada 4 horas, baixa em segundo plano e instala ao sair. Só no app instalado.'
      },
      'update.channel': {
        label: 'Canal de atualização',
        description: 'Estável recebe só as versões finais; Beta também recebe pré-lançamentos.'
      }
    } satisfies Items,
    options: {
      renderWhitespace: {
        none: 'Nenhum',
        boundary: 'Bordas (menos espaço simples entre palavras)',
        selection: 'Só na seleção',
        trailing: 'Só no fim das linhas',
        all: 'Todos'
      },
      wordWrap: { off: 'Desligada', on: 'Ligada' },
      lineNumbers: { on: 'Mostrar', off: 'Ocultar' },
      inlayHints: { on: 'Mostrar', off: 'Ocultar' },
      autoSave: { off: 'Desligado', afterDelay: 'Após um atraso', onFocusChange: 'Ao sair do editor' },
      gpuAcceleration: { auto: 'Automática', off: 'Desligada' },
      snippetSuggestions: { top: 'No topo', bottom: 'No fim', inline: 'Misturados', none: 'Nenhuma' },
      effortAuto: 'Automático',
      toast: { all: 'Todos (terminou, pediu, falhou)', attention: 'Só pedidos e falhas', off: 'Nenhum' },
      languageSystem: 'Sistema',
      updateChannel: { stable: 'Estável', beta: 'Beta' }
    },
    placeholders: {
      shell: 'Padrão do sistema',
      model: 'Padrão do Claude Code',
      fallbackModel: 'Sem reserva',
      executable: 'Binário embutido'
    },
    autoSaveDelayNote: 'Vale só com "Salvar automaticamente" em "Após um atraso".',
    emmetDisabledNote: 'Vale só com o Emmet ligado.',
    summary: {
      patterns: (n: number) => (n === 0 ? 'Nenhum padrão ativo' : plural(n, '1 padrão ativo', `${n} padrões ativos`)),
      profiles: (n: number) => (n === 0 ? 'Nenhum perfil' : plural(n, '1 perfil', `${n} perfis`)),
      servers: (n: number) =>
        n === 0 ? 'Nenhum servidor além do embutido' : plural(n, '1 servidor', `${n} servidores`),
      columns: (n: number) => (n === 0 ? 'Nenhuma régua' : plural(n, '1 régua', `${n} réguas`)),
      adapters: (n: number) =>
        n === 0 ? 'Só o padrão (Python)' : plural(n, '1 adaptador configurado', `${n} adaptadores configurados`),
      env: (n: number) => (n === 0 ? 'Nenhuma variável' : plural(n, '1 variável', `${n} variáveis`))
    },
    modal: {
      sectionsAria: 'Seções',
      scopeAria: 'Escopo das configurações',
      userHint: 'Valem para todos os workspaces.',
      workspaceHint: 'Valem só nesta pasta (.walph/settings.json).',
      workspaceNeedsFolder: 'Abra uma pasta para configurar o workspace.',
      userOnlyExecutable: 'Só nas configurações do usuário: um repositório não pode escolher executáveis.',
      userOnlyPermissions: 'Só nas configurações do usuário: um repositório não pode relaxar as permissões do Claude.',
      definedInWorkspace: 'definido no workspace',
      restore: 'Restaurar',
      workspaceOverrides: 'O workspace atual sobrescreve este valor.',
      restoreDefault: 'Restaurar padrão',
      defaultShell: 'Shell padrão',
      defaultValue: 'Padrão',
      editJson: 'Editar no settings.json',
      shortcutsIntro: 'Atalhos em vigor: os padrões com as mudanças do seu keybindings.json.',
      editKeybindings: 'Editar keybindings.json'
    },
    expected: {
      intBetween: (min: number, max: number) => `um inteiro entre ${min} e ${max}`,
      intBetweenNever: (min: number, max: number) => `um inteiro entre ${min} e ${max} (0 = nunca)`,
      intBetweenNoLimit: (min: number, max: number) => `um inteiro entre ${min} e ${max} (0 = sem limite)`,
      boolean: 'true ou false',
      text: 'um texto',
      textUpTo: (max: number) => `um texto de até ${max} caracteres`,
      globMap: 'um objeto { "glob": true | false }',
      executable:
        'vazio, um caminho absoluto ou um nome de executável sem "/" nem "\\" (caminho relativo não é aceito)',
      profiles:
        'um objeto { "nome": { "path": "/bin/zsh", "args": ["-l"], "env": { "VAR": "valor" } } } (nomes de variável sem "=")',
      defaultProfile: 'o nome de um perfil de "terminal.profiles" (ou vazio)',
      language: (locales: string) => `"system" ou um destes idiomas: ${locales}`,
      themeName: 'o nome de um tema',
      lspServers:
        'um objeto { "id": { "command", "args", "extensions": [".ext"], "languageId", "enabled" } } (servidor próprio exige "command" e "extensions"; "useWorkspaceTypeScript" só no id "typescript")',
      debugAdapters:
        'um objeto { "type": { "command", "args", "transport": "stdio" | "tcp", "env" } } ("tcp" exige "${port}" em "args")',
      model: 'o nome de um modelo, sem espaços (ou vazio)',
      fallbackModels: 'nomes de modelos separados por vírgula, sem espaços (ou vazio)',
      rulers: (max: number, column: number) => `uma lista de até ${max} colunas (inteiros de 1 a ${column})`,
      envMap: 'um objeto { "VAR": "valor" | null } (nomes sem "=")',
      languageMap: 'um objeto { "languageId": "languageId" } (ex.: { "php": "html" })'
    },
    warnings: {
      notObject: 'o conteúdo precisa ser um objeto JSON ({ ... })',
      userOnly: (key: string) => `"${key}" só pode ser definido nas configurações do usuário`,
      unknown: (key: string) => `configuração desconhecida "${key}"`,
      invalid: (key: string, expected: string) => `"${key}" deve ser ${expected}`
    },
    jsonc: {
      codes: {
        InvalidSymbol: 'símbolo inválido',
        InvalidNumberFormat: 'número inválido',
        PropertyNameExpected: 'nome da propriedade esperado',
        ValueExpected: 'valor esperado',
        ColonExpected: '":" esperado',
        CommaExpected: '"," esperada',
        CloseBraceExpected: '"}" esperada',
        CloseBracketExpected: '"]" esperado',
        EndOfFileExpected: 'fim do arquivo esperado',
        InvalidCommentToken: 'comentário inválido',
        UnexpectedEndOfComment: 'comentário não terminado',
        UnexpectedEndOfString: 'texto (string) não terminado',
        UnexpectedEndOfNumber: 'número incompleto',
        InvalidUnicode: 'sequência unicode inválida',
        InvalidEscapeCharacter: 'caractere de escape inválido',
        InvalidCharacter: 'caractere inválido'
      },
      at: (message: string, position: string) => `${message} (linha:coluna ${position})`
    },
    files: {
      user: 'settings.json (usuário)',
      workspace: '.walph/settings.json (workspace)',
      readFailed: (label: string, code: string) => `${label}: não foi possível ler o arquivo (${code})`,
      applyFailed: (label: string, message: string) => `${label}: erro ao aplicar as configurações (${message})`,
      fixBeforeEditing: (label: string, error: string) =>
        `Corrija o ${label} antes de alterar configurações pela interface: ${error}.`,
      pointsOutside: (label: string) => `${label} aponta para fora da pasta do workspace; não é seguro gravá-lo.`,
      writeFailed: (label: string, detail: string) => `Não foi possível gravar o ${label} (${detail}).`,
      createFailed: (label: string, message: string) => `Não foi possível criar ${label}: ${message}`
    },
    errors: {
      invalidWorkspaceFolder: 'Pasta do workspace inválida: informe um caminho absoluto.',
      folderMismatch: 'Pasta do workspace diferente da pasta aberta nesta janela.',
      invalidFileKind: 'Tipo de arquivo de configuração inválido.',
      openFolderToEdit: 'Abra uma pasta para editar as configurações do workspace.',
      openFolderToChange: 'Abra uma pasta para alterar as configurações do workspace.',
      invalidLayer: 'Camada de configuração inválida.',
      unknownSetting: (key: string) => `Configuração desconhecida: "${key}".`,
      userOnly: (key: string) => `"${key}" só pode ser alterado nas configurações do usuário.`,
      invalidValue: (warnings: string) => `Valor inválido: ${warnings}.`
    },
    templates: {
      user: [
        'Configurações do usuário do Walph (JSON com comentários).',
        'Descomente e altere o que quiser; as configurações do workspace (.walph/settings.json) sobrescrevem estas.',
        'Salvar este arquivo aplica as mudanças na hora. Valores atuais (padrões):'
      ].join('\n'),
      workspace: [
        'Configurações deste workspace (JSON com comentários). Sobrescrevem as do usuário apenas neste projeto.',
        'Salvar este arquivo aplica as mudanças na hora. Chaves disponíveis (com os padrões):'
      ].join('\n'),
      keybindings: [
        'Atalhos de teclado do Walph (JSON com comentários). Sobrescrevem os atalhos padrão.',
        'Formato: { "key": "ctrl+shift+p", "command": "<id do comando>" }; acordes separados por espaço ("ctrl+k ctrl+s").',
        'A 1ª entrada de um comando substitui os atalhos padrão dele; as seguintes somam (o 1º é o mostrado no menu).',
        '"-<id>" com "key" remove só aquele atalho; com "key" vazia remove todos. Se a tecla já era de outro comando, o seu',
        'vence, a menos que os "when" dos dois sejam disjuntos (ex.: "terminalFocus" e "!terminalFocus"; os focos terminalFocus,',
        'editorFocus, claudeFocus, markdownPreviewFocus e explorerFocus também são exclusivos entre si).',
        'Ids: veja os comandos na paleta (ex.: workbench.quickOpen, editor.save, terminal.toggle, workbench.selectTheme).'
      ].join('\n')
    },
    themeNotFound: (theme: string, fallback: string) => `Tema "${theme}" não encontrado; usando "${fallback}".`,
    loadFailed: (message: string) => `Configurações: ${message}`,
    themeSavedInWorkspace: 'Tema gravado nas configurações do workspace.',
    themeSaveFailed: (message: string) => `Não foi possível salvar o tema: ${message}`
  },
  en: {
    sections: {
      editor: 'Editor',
      files: 'Files',
      terminal: 'Terminal',
      claude: 'Claude Code',
      appearance: 'Appearance',
      shortcuts: 'Shortcuts'
    },
    items: {
      'editor.fontSize': { label: 'Font size', description: 'Editor font size, in pixels.' },
      'editor.fontFamily': {
        label: 'Font family',
        description: 'Editor font list, in CSS format (the first installed one wins).'
      },
      'editor.tabSize': {
        label: 'Tab size',
        description: 'Columns per indentation level when the file has no detectable indentation.'
      },
      'editor.insertSpaces': {
        label: 'Indent with spaces',
        description: 'Uses spaces instead of tabs when the file has no detectable indentation.'
      },
      'editor.wordWrap': { label: 'Word wrap', description: 'Wraps long lines at the editor width.' },
      'editor.lineNumbers': { label: 'Line numbers', description: 'Shows line numbers in the editor gutter.' },
      'editor.minimap': {
        label: 'Minimap',
        description: 'Shows the code map on the right side of the editor, with git changes and problems.'
      },
      'editor.stickyScroll.enabled': {
        label: 'Sticky Scroll',
        description:
          'Keeps the header lines of the classes, functions and blocks around the screen pinned at the top of the editor.'
      },
      'editor.stickyScroll.maxLineCount': {
        label: 'Sticky Scroll Lines',
        description: 'Maximum number of header lines pinned at the top of the editor.'
      },
      'breadcrumbs.enabled': {
        label: 'Breadcrumbs',
        description: 'Shows the file path and the symbol at the cursor above the editor.'
      },
      'editor.codeLens': {
        label: 'Code lens',
        description: 'Shows language server information above declarations, such as reference counts.'
      },
      'editor.formatOnSave': {
        label: 'Format on save',
        description: 'Formats the document with the language server when saving manually (not on auto save).'
      },
      'editor.inlayHints.enabled': {
        label: 'Inlay hints',
        description: 'Shows the language server hints in the code, such as inferred types and parameter names.'
      },
      'editor.semanticHighlighting.enabled': {
        label: 'Semantic highlighting',
        description: 'Colors the code with the language server semantic tokens, on top of syntax highlighting.'
      },
      'editor.rulers': {
        label: 'Rulers',
        description:
          'Columns where the editor draws vertical lines (e.g. [80, 120]). The .editorconfig max_line_length adds one.'
      },
      'editor.renderWhitespace': {
        label: 'Render whitespace',
        description: 'Which spaces and tabs the editor draws as dots and dashes.'
      },
      'files.trimTrailingWhitespace': {
        label: 'Trim trailing whitespace',
        description: 'On save, removes spaces and tabs at the end of lines. The file .editorconfig wins.'
      },
      'files.insertFinalNewline': {
        label: 'Insert final newline',
        description: 'On save, ends the file with a line break. The file .editorconfig wins.'
      },
      'files.trimFinalNewlines': {
        label: 'Trim final newlines',
        description: 'On save, keeps a single line break after the last line with content.'
      },
      'editor.snippetSuggestions': {
        label: 'Snippet suggestions',
        description: 'Where snippets appear in the suggestion list: at the top, at the bottom, mixed in or nowhere.'
      },
      'emmet.enabled': {
        label: 'Emmet',
        description: 'Suggests and expands Emmet abbreviations in HTML, JSX/TSX, Vue and CSS/SCSS/Less.'
      },
      'emmet.triggerExpansionOnTab': {
        label: 'Emmet: expand on Tab',
        description:
          'Tab expands the abbreviation before the cursor when no suggestion list is open and no snippet field is active.'
      },
      'emmet.includeLanguages': {
        label: 'Emmet: extra languages',
        description: 'Enables Emmet in other languages, mapping each one to a supported one (e.g. "php": "html").'
      },
      'git.blame.inline': {
        label: 'Inline blame',
        description: 'Shows the author, date and message of the last commit that changed the cursor line at its end.'
      },
      'git.blame.statusBar': {
        label: 'Blame in the status bar',
        description: 'Shows the author and date of the last commit of the cursor line in the status bar.'
      },
      'lsp.servers': {
        label: 'Language servers',
        description: 'Language servers besides the built-in TypeScript one. User settings only.'
      },
      'debug.adapters': {
        label: 'Debug adapters',
        description:
          'Debug adapters (Debug Adapter Protocol) by launch.json "type", besides Python (debugpy). User settings only.'
      },
      'files.autoSave': {
        label: 'Auto save',
        description: 'When to save changed files without pressing ⌘S.'
      },
      'files.autoSaveDelay': {
        label: 'Auto save delay',
        description: 'Idle time, in milliseconds, before saving in "After a delay" mode.'
      },
      'files.exclude': {
        label: 'Hidden files',
        description: 'Patterns (globs) hidden from the explorer and quick open.'
      },
      'search.exclude': {
        label: 'Excluded from search',
        description: 'Patterns (globs) ignored only by the global search, on top of the hidden files.'
      },
      'files.watcherExclude': {
        label: 'Excluded from file watching',
        description:
          'Patterns (globs) the app does not watch for changes. Changes in these folders do not show up in the explorer on their own. Add heavy folders here (e.g. **/target/**, **/.venv/**).'
      },
      'terminal.fontSize': { label: 'Font size', description: 'Terminal font size, in pixels.' },
      'terminal.scrollback': {
        label: 'Scrollback (lines)',
        description: 'How many lines each terminal keeps for scrolling up. Higher values use more memory.'
      },
      'terminal.shell': {
        label: 'Shell',
        description:
          'Shell executable: an absolute path or a name resolved through the PATH. Empty uses the system default.'
      },
      'terminal.profiles': { label: 'Shell profiles', description: 'Profiles offered by the terminal "+" button.' },
      'terminal.defaultProfile': {
        label: 'Default profile',
        description: 'Profile used by "New Terminal". Without a profile, the shell above applies.'
      },
      'terminal.copyOnSelection': {
        label: 'Copy on selection',
        description: 'Copies text to the clipboard as soon as it is selected in the terminal.'
      },
      'terminal.colorPrompt': {
        label: 'Colored prompt',
        description:
          'Gives the default zsh and bash prompt the theme colors. Custom prompts are left unchanged. Applies to new terminals.'
      },
      'terminal.gpuAcceleration': {
        label: 'GPU acceleration',
        description: 'Renders the terminal with WebGL; "Off" always uses the DOM.'
      },
      'claude.model': {
        label: 'Model',
        description:
          'Model for new conversations: an alias (opus, sonnet…) or the full id. Empty uses the Claude Code default.'
      },
      'claude.fallbackModel': {
        label: 'Fallback model',
        description:
          'Used when the main model is overloaded or unavailable. Several: separate them with commas, in order. Empty turns it off.'
      },
      'claude.initialPermissionMode': {
        label: 'Initial permission mode',
        description: 'Mode each new conversation starts in.'
      },
      'claude.effort': {
        label: 'Default effort',
        description: 'Effort each new conversation starts with. Automatic uses the model default.'
      },
      'claude.allowBypassPermissions': {
        label: 'Allow "Bypass permissions"',
        description: 'Unlocks the mode where commands run without asking. Use it only in trusted folders.'
      },
      'claude.autoContext': {
        label: 'Attach editor context',
        description: 'Attaches the active file and the editor selection to every message.'
      },
      'claude.executable': {
        label: 'Claude Code executable',
        description: 'Path or name of the executable. Empty uses the binary bundled with the app.'
      },
      'claude.env': {
        label: 'Environment variables',
        description: 'Variables added to the environment of the Claude Code process.'
      },
      'claude.notifications.toast': {
        label: 'In-window alerts',
        description: 'Which conversation events become an alert (toast) in the corner of the window.'
      },
      'claude.notifications.system': {
        label: 'System notifications',
        description:
          'Notifies through the system when a conversation finishes, asks for something or fails while the window is not focused.'
      },
      'claude.notifications.sound': {
        label: 'Alert sound',
        description: 'Plays a sound when a conversation alert shows up (in the window or from the system).'
      },
      'claude.idleSleepMinutes': {
        label: 'Suspend idle conversation',
        description:
          "Minutes without use before a conversation's Claude process is stopped to free memory; it comes back on its own on the next message, reconnecting the MCP servers. 0 = never."
      },
      'workbench.language': {
        label: 'Language',
        description: 'Interface language. "System" follows the operating system language.'
      },
      'workbench.theme': { label: 'Color theme', description: 'Theme for the interface, the editor and the terminal.' },
      'workbench.fontFamily': {
        label: 'Interface font',
        description:
          'Interface font list, in CSS format (the first installed one wins). Does not affect the editor and the terminal.'
      },
      'workbench.fontSize': {
        label: 'Interface font size',
        description: 'Base size of the interface text, in pixels. The editor and the terminal have their own sizes.'
      },
      'docker.path': {
        label: 'Docker executable',
        description: 'Path or name of the executable used by the Containers screen. Empty uses "docker" from the PATH.'
      },
      'workspaces.maxLiveViews': {
        label: 'Loaded workspaces',
        description:
          'How many workspaces stay loaded in memory; the least used ones hibernate. 0 = no limit. Workspaces with something in progress never hibernate: a process in the terminal (on Windows, any open terminal), Claude working or unsaved files.'
      },
      'workspaces.hibernateAfterMinutes': {
        label: 'Hibernate idle workspace',
        description:
          'Minutes without use before a background workspace is unloaded. 0 = never. Workspaces with something in progress never hibernate: a process in the terminal (on Windows, any open terminal), Claude working or unsaved files.'
      },
      'update.enabled': {
        label: 'Update automatically',
        description:
          'Checks for Walph updates on startup and every 4 hours, downloads in the background and installs on exit. Installed app only.'
      },
      'update.channel': {
        label: 'Update channel',
        description: 'Stable gets only final releases; Beta also gets pre-releases.'
      }
    },
    options: {
      renderWhitespace: {
        none: 'None',
        boundary: 'Boundary (all but single spaces between words)',
        selection: 'Selection only',
        trailing: 'Trailing only',
        all: 'All'
      },
      wordWrap: { off: 'Off', on: 'On' },
      lineNumbers: { on: 'Show', off: 'Hide' },
      inlayHints: { on: 'Show', off: 'Hide' },
      autoSave: { off: 'Off', afterDelay: 'After a delay', onFocusChange: 'On leaving the editor' },
      gpuAcceleration: { auto: 'Automatic', off: 'Off' },
      snippetSuggestions: { top: 'Top', bottom: 'Bottom', inline: 'Inline', none: 'None' },
      effortAuto: 'Automatic',
      toast: { all: 'All (finished, asked, failed)', attention: 'Only requests and failures', off: 'None' },
      languageSystem: 'System',
      updateChannel: { stable: 'Stable', beta: 'Beta' }
    },
    placeholders: {
      shell: 'System default',
      model: 'Claude Code default',
      fallbackModel: 'No fallback',
      executable: 'Bundled binary'
    },
    autoSaveDelayNote: 'Only applies with "Auto save" set to "After a delay".',
    emmetDisabledNote: 'Only applies with Emmet enabled.',
    summary: {
      patterns: (n: number) => (n === 0 ? 'No active patterns' : plural(n, '1 active pattern', `${n} active patterns`)),
      profiles: (n: number) => (n === 0 ? 'No profiles' : plural(n, '1 profile', `${n} profiles`)),
      servers: (n: number) => (n === 0 ? 'No servers besides the built-in one' : plural(n, '1 server', `${n} servers`)),
      columns: (n: number) => (n === 0 ? 'No rulers' : plural(n, '1 ruler', `${n} rulers`)),
      adapters: (n: number) =>
        n === 0 ? 'Only the default (Python)' : plural(n, '1 configured adapter', `${n} configured adapters`),
      env: (n: number) => (n === 0 ? 'No variables' : plural(n, '1 variable', `${n} variables`))
    },
    modal: {
      sectionsAria: 'Sections',
      scopeAria: 'Settings scope',
      userHint: 'Apply to all workspaces.',
      workspaceHint: 'Apply only to this folder (.walph/settings.json).',
      workspaceNeedsFolder: 'Open a folder to configure the workspace.',
      userOnlyExecutable: 'User settings only: a repository cannot choose executables.',
      userOnlyPermissions: "User settings only: a repository cannot relax Claude's permissions.",
      definedInWorkspace: 'set in the workspace',
      restore: 'Restore',
      workspaceOverrides: 'The current workspace overrides this value.',
      restoreDefault: 'Restore default',
      defaultShell: 'Default shell',
      defaultValue: 'Default',
      editJson: 'Edit in settings.json',
      shortcutsIntro: 'Shortcuts in effect: the defaults with the changes from your keybindings.json.',
      editKeybindings: 'Edit keybindings.json'
    },
    expected: {
      intBetween: (min: number, max: number) => `an integer between ${min} and ${max}`,
      intBetweenNever: (min: number, max: number) => `an integer between ${min} and ${max} (0 = never)`,
      intBetweenNoLimit: (min: number, max: number) => `an integer between ${min} and ${max} (0 = no limit)`,
      boolean: 'true or false',
      text: 'a text',
      textUpTo: (max: number) => `a text of up to ${max} characters`,
      globMap: 'an object { "glob": true | false }',
      executable: 'empty, an absolute path or an executable name without "/" or "\\" (relative paths are not accepted)',
      profiles:
        'an object { "name": { "path": "/bin/zsh", "args": ["-l"], "env": { "VAR": "value" } } } (variable names without "=")',
      defaultProfile: 'the name of a profile from "terminal.profiles" (or empty)',
      language: (locales: string) => `"system" or one of these languages: ${locales}`,
      themeName: 'the name of a theme',
      lspServers:
        'an object { "id": { "command", "args", "extensions": [".ext"], "languageId", "enabled" } } (a custom server requires "command" and "extensions"; "useWorkspaceTypeScript" only on the "typescript" id)',
      debugAdapters:
        'an object { "type": { "command", "args", "transport": "stdio" | "tcp", "env" } } ("tcp" requires "${port}" in "args")',
      model: 'the name of a model, without spaces (or empty)',
      fallbackModels: 'model names separated by commas, without spaces (or empty)',
      rulers: (max: number, column: number) => `a list of up to ${max} columns (integers from 1 to ${column})`,
      envMap: 'an object { "VAR": "value" | null } (names without "=")',
      languageMap: 'an object { "languageId": "languageId" } (e.g. { "php": "html" })'
    },
    warnings: {
      notObject: 'the content must be a JSON object ({ ... })',
      userOnly: (key: string) => `"${key}" can only be set in the user settings`,
      unknown: (key: string) => `unknown setting "${key}"`,
      invalid: (key: string, expected: string) => `"${key}" must be ${expected}`
    },
    jsonc: {
      codes: {
        InvalidSymbol: 'invalid symbol',
        InvalidNumberFormat: 'invalid number',
        PropertyNameExpected: 'property name expected',
        ValueExpected: 'value expected',
        ColonExpected: '":" expected',
        CommaExpected: '"," expected',
        CloseBraceExpected: '"}" expected',
        CloseBracketExpected: '"]" expected',
        EndOfFileExpected: 'end of file expected',
        InvalidCommentToken: 'invalid comment',
        UnexpectedEndOfComment: 'unterminated comment',
        UnexpectedEndOfString: 'unterminated string',
        UnexpectedEndOfNumber: 'incomplete number',
        InvalidUnicode: 'invalid unicode sequence',
        InvalidEscapeCharacter: 'invalid escape character',
        InvalidCharacter: 'invalid character'
      },
      at: (message: string, position: string) => `${message} (line:column ${position})`
    },
    files: {
      user: 'settings.json (user)',
      workspace: '.walph/settings.json (workspace)',
      readFailed: (label: string, code: string) => `${label}: could not read the file (${code})`,
      applyFailed: (label: string, message: string) => `${label}: error applying the settings (${message})`,
      fixBeforeEditing: (label: string, error: string) =>
        `Fix ${label} before changing settings through the interface: ${error}.`,
      pointsOutside: (label: string) => `${label} points outside the workspace folder; it is not safe to write it.`,
      writeFailed: (label: string, detail: string) => `Could not write ${label} (${detail}).`,
      createFailed: (label: string, message: string) => `Could not create ${label}: ${message}`
    },
    errors: {
      invalidWorkspaceFolder: 'Invalid workspace folder: provide an absolute path.',
      folderMismatch: 'Workspace folder differs from the folder open in this window.',
      invalidFileKind: 'Invalid settings file type.',
      openFolderToEdit: 'Open a folder to edit the workspace settings.',
      openFolderToChange: 'Open a folder to change the workspace settings.',
      invalidLayer: 'Invalid settings layer.',
      unknownSetting: (key: string) => `Unknown setting: "${key}".`,
      userOnly: (key: string) => `"${key}" can only be changed in the user settings.`,
      invalidValue: (warnings: string) => `Invalid value: ${warnings}.`
    },
    templates: {
      user: [
        'Walph user settings (JSON with comments).',
        'Uncomment and change whatever you want; the workspace settings (.walph/settings.json) override these.',
        'Saving this file applies the changes right away. Current values (defaults):'
      ].join('\n'),
      workspace: [
        'Settings for this workspace (JSON with comments). They override the user settings in this project only.',
        'Saving this file applies the changes right away. Available keys (with the defaults):'
      ].join('\n'),
      keybindings: [
        'Walph keyboard shortcuts (JSON with comments). They override the default shortcuts.',
        'Format: { "key": "ctrl+shift+p", "command": "<command id>" }; chords separated by a space ("ctrl+k ctrl+s").',
        "A command's 1st entry replaces its default shortcuts; the following ones add to it (the 1st is shown in the menu).",
        '"-<id>" with "key" removes only that shortcut; with an empty "key" it removes all of them. If the key already',
        'belonged to another command, yours wins, unless the "when" of both are disjoint (e.g. "terminalFocus" and',
        '"!terminalFocus"; the terminalFocus, editorFocus, claudeFocus, markdownPreviewFocus and explorerFocus focuses are',
        'also mutually exclusive).',
        'Ids: see the commands in the palette (e.g. workbench.quickOpen, editor.save, terminal.toggle, workbench.selectTheme).'
      ].join('\n')
    },
    themeNotFound: (theme: string, fallback: string) => `Theme "${theme}" not found; using "${fallback}".`,
    loadFailed: (message: string) => `Settings: ${message}`,
    themeSavedInWorkspace: 'Theme saved in the workspace settings.',
    themeSaveFailed: (message: string) => `Could not save the theme: ${message}`
  },
  es: {
    sections: {
      editor: 'Editor',
      files: 'Archivos',
      terminal: 'Terminal',
      claude: 'Claude Code',
      appearance: 'Apariencia',
      shortcuts: 'Atajos'
    },
    items: {
      'editor.fontSize': { label: 'Tamaño de fuente', description: 'Tamaño de fuente del editor, en píxeles.' },
      'editor.fontFamily': {
        label: 'Familia de fuente',
        description: 'Lista de fuentes del editor, en formato CSS (gana la primera instalada).'
      },
      'editor.tabSize': {
        label: 'Tamaño de tabulación',
        description: 'Columnas por nivel de sangría cuando el archivo no tiene una sangría detectable.'
      },
      'editor.insertSpaces': {
        label: 'Sangría con espacios',
        description: 'Usa espacios en lugar de tabulaciones cuando el archivo no tiene una sangría detectable.'
      },
      'editor.wordWrap': { label: 'Ajuste de línea', description: 'Ajusta las líneas largas al ancho del editor.' },
      'editor.lineNumbers': {
        label: 'Números de línea',
        description: 'Muestra la numeración en el margen del editor.'
      },
      'editor.minimap': {
        label: 'Minimapa',
        description: 'Muestra el mapa del código a la derecha del editor, con los cambios de git y los problemas.'
      },
      'editor.stickyScroll.enabled': {
        label: 'Desplazamiento fijo',
        description:
          'Mantiene fijas arriba del editor las líneas de encabezado de las clases, funciones y bloques que rodean la pantalla.'
      },
      'editor.stickyScroll.maxLineCount': {
        label: 'Líneas del desplazamiento fijo',
        description: 'Cantidad máxima de líneas de encabezado fijas arriba del editor.'
      },
      'breadcrumbs.enabled': {
        label: 'Rutas de navegación',
        description: 'Muestra arriba del editor la ruta del archivo y el símbolo donde está el cursor.'
      },
      'editor.codeLens': {
        label: 'Code lens',
        description:
          'Muestra sobre las declaraciones la información del servidor de lenguaje, como el número de referencias.'
      },
      'editor.formatOnSave': {
        label: 'Dar formato al guardar',
        description:
          'Da formato al documento con el servidor de lenguaje al guardar manualmente (no en el guardado automático).'
      },
      'editor.inlayHints.enabled': {
        label: 'Sugerencias insertadas',
        description:
          'Muestra en el código las sugerencias del servidor de lenguaje, como tipos inferidos y nombres de parámetros.'
      },
      'editor.semanticHighlighting.enabled': {
        label: 'Resaltado semántico',
        description:
          'Colorea el código con los tokens semánticos del servidor de lenguaje, por encima del resaltado de sintaxis.'
      },
      'editor.rulers': {
        label: 'Reglas',
        description:
          'Columnas donde el editor dibuja líneas verticales (p. ej. [80, 120]). El max_line_length del .editorconfig suma una.'
      },
      'editor.renderWhitespace': {
        label: 'Mostrar espacios en blanco',
        description: 'Qué espacios y tabulaciones dibuja el editor como puntos y rayas.'
      },
      'files.trimTrailingWhitespace': {
        label: 'Quitar espacios al final de las líneas',
        description:
          'Al guardar, quita espacios y tabulaciones del final de las líneas. Gana el .editorconfig del archivo.'
      },
      'files.insertFinalNewline': {
        label: 'Insertar salto de línea final',
        description: 'Al guardar, termina el archivo con un salto de línea. Gana el .editorconfig del archivo.'
      },
      'files.trimFinalNewlines': {
        label: 'Quitar saltos de línea finales',
        description: 'Al guardar, deja un solo salto de línea después de la última línea con contenido.'
      },
      'editor.snippetSuggestions': {
        label: 'Sugerencias de fragmentos',
        description:
          'Dónde aparecen los fragmentos en la lista de sugerencias: arriba, abajo, mezclados o en ningún lugar.'
      },
      'emmet.enabled': {
        label: 'Emmet',
        description: 'Sugiere y expande abreviaturas de Emmet en HTML, JSX/TSX, Vue y CSS/SCSS/Less.'
      },
      'emmet.triggerExpansionOnTab': {
        label: 'Emmet: expandir con Tab',
        description:
          'Tab expande la abreviatura antes del cursor cuando no hay sugerencias abiertas ni un campo de fragmento activo.'
      },
      'emmet.includeLanguages': {
        label: 'Emmet: lenguajes adicionales',
        description: 'Activa Emmet en otros lenguajes, asignando cada uno a uno compatible (p. ej., "php": "html").'
      },
      'git.blame.inline': {
        label: 'Blame en la línea',
        description:
          'Muestra al final de la línea del cursor el autor, la fecha y el mensaje del último commit que la cambió.'
      },
      'git.blame.statusBar': {
        label: 'Blame en la barra de estado',
        description: 'Muestra en la barra de estado el autor y la fecha del último commit de la línea del cursor.'
      },
      'lsp.servers': {
        label: 'Servidores de lenguaje',
        description: 'Servidores de lenguaje además del TypeScript integrado. Solo en la configuración del usuario.'
      },
      'debug.adapters': {
        label: 'Adaptadores de depuración',
        description:
          'Adaptadores de depuración (Debug Adapter Protocol) por "type" del launch.json, además de Python (debugpy). Solo en la configuración del usuario.'
      },
      'files.autoSave': {
        label: 'Guardado automático',
        description: 'Cuándo guardar los archivos modificados sin necesidad de ⌘S.'
      },
      'files.autoSaveDelay': {
        label: 'Retraso del guardado',
        description: 'Tiempo de inactividad, en milisegundos, hasta guardar en el modo "Tras un retraso".'
      },
      'files.exclude': {
        label: 'Archivos ocultos',
        description: 'Patrones (globs) ocultos en el explorador y en la apertura rápida.'
      },
      'search.exclude': {
        label: 'Excluidos de la búsqueda',
        description: 'Patrones (globs) ignorados solo en la búsqueda global, sumados a los archivos ocultos.'
      },
      'files.watcherExclude': {
        label: 'Fuera de la observación de archivos',
        description:
          'Patrones (globs) que la app no observa en busca de cambios. Los cambios en esas carpetas no aparecen solos en el explorador. Para carpetas pesadas (p. ej., **/target/**, **/.venv/**) agrégalas aquí.'
      },
      'terminal.fontSize': { label: 'Tamaño de fuente', description: 'Tamaño de fuente de la terminal, en píxeles.' },
      'terminal.scrollback': {
        label: 'Historial (líneas)',
        description:
          'Cuántas líneas guarda cada terminal para desplazarse hacia arriba. Los valores altos usan más memoria.'
      },
      'terminal.shell': {
        label: 'Shell',
        description:
          'Ejecutable del shell: ruta absoluta o nombre resuelto mediante el PATH. Vacío usa el predeterminado del sistema.'
      },
      'terminal.profiles': {
        label: 'Perfiles de shell',
        description: 'Perfiles ofrecidos en el botón "+" de la terminal.'
      },
      'terminal.defaultProfile': {
        label: 'Perfil predeterminado',
        description: 'Perfil usado por "Nueva terminal". Sin perfil, vale el shell de arriba.'
      },
      'terminal.copyOnSelection': {
        label: 'Copiar al seleccionar',
        description: 'Copia el texto al portapapeles en cuanto se selecciona en la terminal.'
      },
      'terminal.colorPrompt': {
        label: 'Prompt con color',
        description:
          'Da al prompt predeterminado de zsh y bash los colores del tema. Los prompts personalizados no cambian. Se aplica a las terminales nuevas.'
      },
      'terminal.gpuAcceleration': {
        label: 'Aceleración por GPU',
        description: 'Renderiza la terminal con WebGL; "Desactivada" usa siempre el DOM.'
      },
      'claude.model': {
        label: 'Modelo',
        description:
          'Modelo de las conversaciones nuevas: un alias (opus, sonnet…) o el id completo. Vacío usa el predeterminado de Claude Code.'
      },
      'claude.fallbackModel': {
        label: 'Modelo de respaldo',
        description:
          'Se usa cuando el modelo principal está sobrecargado o no disponible. Varios: sepáralos con comas, en orden. Vacío lo desactiva.'
      },
      'claude.initialPermissionMode': {
        label: 'Modo de permisos inicial',
        description: 'Modo con el que empieza cada conversación nueva.'
      },
      'claude.effort': {
        label: 'Esfuerzo predeterminado',
        description: 'Esfuerzo con el que empieza cada conversación nueva. Automático usa el predeterminado del modelo.'
      },
      'claude.allowBypassPermissions': {
        label: 'Permitir "Bypass permissions"',
        description:
          'Habilita el modo en que los comandos se ejecutan sin preguntar. Úsalo solo en carpetas de confianza.'
      },
      'claude.autoContext': {
        label: 'Adjuntar contexto del editor',
        description: 'Adjunta el archivo activo y la selección del editor a cada mensaje.'
      },
      'claude.executable': {
        label: 'Ejecutable de Claude Code',
        description: 'Ruta o nombre del ejecutable. Vacío usa el binario incluido con la app.'
      },
      'claude.env': {
        label: 'Variables de entorno',
        description: 'Variables sumadas al entorno del proceso de Claude Code.'
      },
      'claude.notifications.toast': {
        label: 'Avisos en la ventana',
        description: 'Qué eventos de las conversaciones se convierten en aviso (toast) en la esquina de la ventana.'
      },
      'claude.notifications.system': {
        label: 'Notificaciones del sistema',
        description:
          'Avisa mediante el sistema cuando una conversación termina, pide algo o falla con la ventana sin foco.'
      },
      'claude.notifications.sound': {
        label: 'Sonido de los avisos',
        description: 'Reproduce un sonido cuando aparece un aviso de conversación (en la ventana o del sistema).'
      },
      'claude.idleSleepMinutes': {
        label: 'Suspender conversación inactiva',
        description:
          'Minutos sin uso hasta que se detiene el proceso de Claude de una conversación para liberar memoria; vuelve solo en el próximo envío, reconectando los servidores MCP. 0 = nunca.'
      },
      'workbench.language': {
        label: 'Idioma',
        description: 'Idioma de la interfaz. "Sistema" sigue el idioma del sistema operativo.'
      },
      'workbench.theme': {
        label: 'Tema de color',
        description: 'Tema de la interfaz, del editor y de la terminal.'
      },
      'workbench.fontFamily': {
        label: 'Fuente de la interfaz',
        description:
          'Lista de fuentes de la interfaz, en formato CSS (gana la primera instalada). No afecta al editor ni a la terminal.'
      },
      'workbench.fontSize': {
        label: 'Tamaño de fuente de la interfaz',
        description:
          'Tamaño base del texto de la interfaz, en píxeles. El editor y la terminal tienen sus propios tamaños.'
      },
      'docker.path': {
        label: 'Ejecutable de Docker',
        description:
          'Ruta o nombre del ejecutable usado por la pantalla de Contenedores. Vacío usa el "docker" del PATH.'
      },
      'workspaces.maxLiveViews': {
        label: 'Espacios de trabajo cargados',
        description:
          'Cuántos espacios de trabajo quedan cargados en memoria; los menos usados hibernan. 0 = sin límite. Nunca hibernan los espacios de trabajo con algo en curso: un proceso en la terminal (en Windows, cualquier terminal abierta), Claude trabajando o archivos sin guardar.'
      },
      'workspaces.hibernateAfterMinutes': {
        label: 'Hibernar espacio de trabajo inactivo',
        description:
          'Minutos sin uso hasta que un espacio de trabajo en segundo plano se descarga. 0 = nunca. Nunca hibernan los espacios de trabajo con algo en curso: un proceso en la terminal (en Windows, cualquier terminal abierta), Claude trabajando o archivos sin guardar.'
      },
      'update.enabled': {
        label: 'Actualizar automáticamente',
        description:
          'Busca actualizaciones de Walph al abrir y cada 4 horas, descarga en segundo plano e instala al salir. Solo en la app instalada.'
      },
      'update.channel': {
        label: 'Canal de actualización',
        description: 'Estable recibe solo las versiones finales; Beta también recibe versiones preliminares.'
      }
    },
    options: {
      renderWhitespace: {
        none: 'Ninguno',
        boundary: 'Bordes (menos el espacio simple entre palabras)',
        selection: 'Solo en la selección',
        trailing: 'Solo al final de las líneas',
        all: 'Todos'
      },
      wordWrap: { off: 'Desactivado', on: 'Activado' },
      lineNumbers: { on: 'Mostrar', off: 'Ocultar' },
      inlayHints: { on: 'Mostrar', off: 'Ocultar' },
      autoSave: { off: 'Desactivado', afterDelay: 'Tras un retraso', onFocusChange: 'Al salir del editor' },
      gpuAcceleration: { auto: 'Automática', off: 'Desactivada' },
      snippetSuggestions: { top: 'Arriba', bottom: 'Abajo', inline: 'Mezclados', none: 'Ninguna' },
      effortAuto: 'Automático',
      toast: { all: 'Todos (terminó, pidió, falló)', attention: 'Solo pedidos y fallos', off: 'Ninguno' },
      languageSystem: 'Sistema',
      updateChannel: { stable: 'Estable', beta: 'Beta' }
    },
    placeholders: {
      shell: 'Predeterminado del sistema',
      model: 'Predeterminado de Claude Code',
      fallbackModel: 'Sin respaldo',
      executable: 'Binario incluido'
    },
    autoSaveDelayNote: 'Solo vale con "Guardado automático" en "Tras un retraso".',
    emmetDisabledNote: 'Solo vale con Emmet activado.',
    summary: {
      patterns: (n: number) =>
        n === 0 ? 'Ningún patrón activo' : plural(n, '1 patrón activo', `${n} patrones activos`),
      profiles: (n: number) => (n === 0 ? 'Ningún perfil' : plural(n, '1 perfil', `${n} perfiles`)),
      servers: (n: number) =>
        n === 0 ? 'Ningún servidor además del integrado' : plural(n, '1 servidor', `${n} servidores`),
      columns: (n: number) => (n === 0 ? 'Ninguna regla' : plural(n, '1 regla', `${n} reglas`)),
      adapters: (n: number) =>
        n === 0
          ? 'Solo el predeterminado (Python)'
          : plural(n, '1 adaptador configurado', `${n} adaptadores configurados`),
      env: (n: number) => (n === 0 ? 'Ninguna variable' : plural(n, '1 variable', `${n} variables`))
    },
    modal: {
      sectionsAria: 'Secciones',
      scopeAria: 'Alcance de la configuración',
      userHint: 'Valen para todos los espacios de trabajo.',
      workspaceHint: 'Valen solo en esta carpeta (.walph/settings.json).',
      workspaceNeedsFolder: 'Abre una carpeta para configurar el espacio de trabajo.',
      userOnlyExecutable: 'Solo en la configuración del usuario: un repositorio no puede elegir ejecutables.',
      userOnlyPermissions:
        'Solo en la configuración del usuario: un repositorio no puede relajar los permisos de Claude.',
      definedInWorkspace: 'definido en el espacio de trabajo',
      restore: 'Restablecer',
      workspaceOverrides: 'El espacio de trabajo actual sobrescribe este valor.',
      restoreDefault: 'Restablecer predeterminado',
      defaultShell: 'Shell predeterminado',
      defaultValue: 'Predeterminado',
      editJson: 'Editar en settings.json',
      shortcutsIntro: 'Atajos en vigor: los predeterminados con los cambios de tu keybindings.json.',
      editKeybindings: 'Editar keybindings.json'
    },
    expected: {
      intBetween: (min: number, max: number) => `un entero entre ${min} y ${max}`,
      intBetweenNever: (min: number, max: number) => `un entero entre ${min} y ${max} (0 = nunca)`,
      intBetweenNoLimit: (min: number, max: number) => `un entero entre ${min} y ${max} (0 = sin límite)`,
      boolean: 'true o false',
      text: 'un texto',
      textUpTo: (max: number) => `un texto de hasta ${max} caracteres`,
      globMap: 'un objeto { "glob": true | false }',
      executable: 'vacío, una ruta absoluta o un nombre de ejecutable sin "/" ni "\\" (no se aceptan rutas relativas)',
      profiles:
        'un objeto { "nombre": { "path": "/bin/zsh", "args": ["-l"], "env": { "VAR": "valor" } } } (nombres de variable sin "=")',
      defaultProfile: 'el nombre de un perfil de "terminal.profiles" (o vacío)',
      language: (locales: string) => `"system" o uno de estos idiomas: ${locales}`,
      themeName: 'el nombre de un tema',
      lspServers:
        'un objeto { "id": { "command", "args", "extensions": [".ext"], "languageId", "enabled" } } (un servidor propio exige "command" y "extensions"; "useWorkspaceTypeScript" solo en el id "typescript")',
      debugAdapters:
        'un objeto { "type": { "command", "args", "transport": "stdio" | "tcp", "env" } } ("tcp" exige "${port}" en "args")',
      model: 'el nombre de un modelo, sin espacios (o vacío)',
      fallbackModels: 'nombres de modelos separados por comas, sin espacios (o vacío)',
      rulers: (max: number, column: number) => `una lista de hasta ${max} columnas (enteros de 1 a ${column})`,
      envMap: 'un objeto { "VAR": "valor" | null } (nombres sin "=")',
      languageMap: 'un objeto { "languageId": "languageId" } (p. ej., { "php": "html" })'
    },
    warnings: {
      notObject: 'el contenido debe ser un objeto JSON ({ ... })',
      userOnly: (key: string) => `"${key}" solo se puede definir en la configuración del usuario`,
      unknown: (key: string) => `configuración desconocida "${key}"`,
      invalid: (key: string, expected: string) => `"${key}" debe ser ${expected}`
    },
    jsonc: {
      codes: {
        InvalidSymbol: 'símbolo no válido',
        InvalidNumberFormat: 'número no válido',
        PropertyNameExpected: 'se esperaba el nombre de la propiedad',
        ValueExpected: 'se esperaba un valor',
        ColonExpected: 'se esperaba ":"',
        CommaExpected: 'se esperaba ","',
        CloseBraceExpected: 'se esperaba "}"',
        CloseBracketExpected: 'se esperaba "]"',
        EndOfFileExpected: 'se esperaba el fin del archivo',
        InvalidCommentToken: 'comentario no válido',
        UnexpectedEndOfComment: 'comentario sin terminar',
        UnexpectedEndOfString: 'texto (string) sin terminar',
        UnexpectedEndOfNumber: 'número incompleto',
        InvalidUnicode: 'secuencia unicode no válida',
        InvalidEscapeCharacter: 'carácter de escape no válido',
        InvalidCharacter: 'carácter no válido'
      },
      at: (message: string, position: string) => `${message} (línea:columna ${position})`
    },
    files: {
      user: 'settings.json (usuario)',
      workspace: '.walph/settings.json (espacio de trabajo)',
      readFailed: (label: string, code: string) => `${label}: no se pudo leer el archivo (${code})`,
      applyFailed: (label: string, message: string) => `${label}: error al aplicar la configuración (${message})`,
      fixBeforeEditing: (label: string, error: string) =>
        `Corrige ${label} antes de cambiar la configuración desde la interfaz: ${error}.`,
      pointsOutside: (label: string) =>
        `${label} apunta fuera de la carpeta del espacio de trabajo; no es seguro escribirlo.`,
      writeFailed: (label: string, detail: string) => `No se pudo escribir ${label} (${detail}).`,
      createFailed: (label: string, message: string) => `No se pudo crear ${label}: ${message}`
    },
    errors: {
      invalidWorkspaceFolder: 'Carpeta del espacio de trabajo no válida: indica una ruta absoluta.',
      folderMismatch: 'La carpeta del espacio de trabajo es distinta de la carpeta abierta en esta ventana.',
      invalidFileKind: 'Tipo de archivo de configuración no válido.',
      openFolderToEdit: 'Abre una carpeta para editar la configuración del espacio de trabajo.',
      openFolderToChange: 'Abre una carpeta para cambiar la configuración del espacio de trabajo.',
      invalidLayer: 'Capa de configuración no válida.',
      unknownSetting: (key: string) => `Configuración desconocida: "${key}".`,
      userOnly: (key: string) => `"${key}" solo se puede cambiar en la configuración del usuario.`,
      invalidValue: (warnings: string) => `Valor no válido: ${warnings}.`
    },
    templates: {
      user: [
        'Configuración del usuario de Walph (JSON con comentarios).',
        'Quita el comentario y cambia lo que quieras; la configuración del espacio de trabajo (.walph/settings.json) sobrescribe esta.',
        'Guardar este archivo aplica los cambios al instante. Valores actuales (predeterminados):'
      ].join('\n'),
      workspace: [
        'Configuración de este espacio de trabajo (JSON con comentarios). Sobrescribe la del usuario solo en este proyecto.',
        'Guardar este archivo aplica los cambios al instante. Claves disponibles (con los predeterminados):'
      ].join('\n'),
      keybindings: [
        'Atajos de teclado de Walph (JSON con comentarios). Sobrescriben los atajos predeterminados.',
        'Formato: { "key": "ctrl+shift+p", "command": "<id del comando>" }; acordes separados por espacio ("ctrl+k ctrl+s").',
        'La 1.ª entrada de un comando reemplaza sus atajos predeterminados; las siguientes se suman (el 1.º es el que se muestra en el menú).',
        '"-<id>" con "key" quita solo ese atajo; con "key" vacía los quita todos. Si la tecla ya era de otro comando, gana el tuyo,',
        'a menos que los "when" de ambos sean disjuntos (p. ej., "terminalFocus" y "!terminalFocus"; los focos terminalFocus,',
        'editorFocus, claudeFocus, markdownPreviewFocus y explorerFocus también son excluyentes entre sí).',
        'Ids: consulta los comandos en la paleta (p. ej., workbench.quickOpen, editor.save, terminal.toggle, workbench.selectTheme).'
      ].join('\n')
    },
    themeNotFound: (theme: string, fallback: string) => `No se encontró el tema "${theme}"; se usa "${fallback}".`,
    loadFailed: (message: string) => `Configuración: ${message}`,
    themeSavedInWorkspace: 'Tema guardado en la configuración del espacio de trabajo.',
    themeSaveFailed: (message: string) => `No se pudo guardar el tema: ${message}`
  }
})
