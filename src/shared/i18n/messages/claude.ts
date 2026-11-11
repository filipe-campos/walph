import { defineMessages, plural } from '../define'

export const claude = defineMessages({
  'pt-BR': {
    panel: {
      renameSession: 'Renomear sessão',
      favorite: 'Favorita',
      unread: (n: number) => plural(n, '1 não lida', `${n} não lidas`),
      closeConversation: 'Fechar conversa',
      closeTitle: (title: string) => `Fechar ${title}`,
      duplicate: 'Duplicar',
      exportConversation: 'Exportar conversa (.md)',
      compactContext: 'Compactar contexto',
      sessionCost: (cost: string) => `Custo da sessão: ${cost}`,
      planUsage: 'Uso do plano',
      account: (account: string) => `Conta: ${account}`,
      logout: 'Sair da conta',
      login: 'Entrar na conta',
      mcpServers: 'Servidores MCP',
      closeHistory: 'Fechar histórico',
      previousConversations: 'Conversas anteriores',
      hidePanel: 'Fechar painel',
      closeSession: 'Fechar sessão',
      unfavorite: 'Remover dos favoritos',
      favoriteSession: 'Favoritar sessão',
      moreActions: 'Mais ações da sessão',
      moreActionsContext: (percent: number) => `Mais ações da sessão — contexto em ${percent}%`,
      conversations: 'Conversas',
      newConversation: 'Nova conversa',
      openFolder: 'Abra uma pasta para conversar com o Claude Code.',
      starting: 'Iniciando o Claude Code…',
      emptyTitle: 'Nenhuma conversa aberta.',
      emptyText: 'Peça uma mudança, tire uma dúvida sobre o código ou investigue um erro. As edições abrem como diff.',
      suggestions: 'Sugestões',
      suggestExplain: 'Explique este projeto',
      suggestBugs: 'Encontre possíveis bugs',
      suggestTests: 'Sugira testes que faltam'
    },
    conversationPane: {
      wakeFailed: 'Não foi possível retomar esta conversa.',
      newConversation: 'Nova conversa',
      authBefore: 'Você não está conectado ao Claude Code. Entre pelo terminal (rodamos ',
      authAfter: ' na pasta da janela); as conversas reiniciam sozinhas quando o login terminar.',
      login: 'Entrar com o Claude Code',
      closed: 'A conversa foi encerrada.'
    },
    timeline: {
      label: 'Conversa',
      emptyTitle: 'Nova sessão',
      emptyText: 'Pergunte sobre o código, peça uma mudança ou use / para comandos.',
      emptyHint: '@ cita arquivos e pastas; as edições abrem como diff para você aceitar.',
      sending: 'Enviando…',
      thinking: 'Pensando…'
    },
    timelineParts: {
      queued: 'Na fila',
      openImage: (n: number, total: number) => `Ampliar imagem ${n} de ${total}`,
      imageName: (n: number, total: number) => `Imagem ${n} de ${total}`,
      rewindBoth: 'Código e conversa',
      rewindConversation: 'Só a conversa',
      rewindCode: 'Só o código',
      copyMessage: 'Copiar mensagem',
      copyReply: 'Copiar resposta',
      rewindBusy: 'Aguarde o Claude terminar para voltar',
      rewind: 'Voltar até antes desta mensagem',
      compacted: 'Conversa compactada',
      compactedDetail: (tokens: string | null, auto: boolean) =>
        `Conversa compactada${tokens ? ` · ${tokens} tokens antes` : ''}${auto ? ' (automático)' : ''}`,
      scheduledRun: 'Execução agendada',
      backgroundDone: 'Tarefa em segundo plano concluída · Claude continuou',
      blocked: (tool: string, reason: string) => `Bloqueado: ${tool}${reason ? ` — ${reason}` : ''}`,
      showLess: 'Mostrar menos',
      showAll: (lines: number) => `Mostrar tudo (${lines} linhas)`,
      scrollToMessage: 'Rolar até sua mensagem',
      replaceAllNote: 'Troca em todas as ocorrências: a contagem é de uma ocorrência.',
      overwriteNote: 'Arquivo sobrescrito: as linhas removidas não são contadas.',
      linesAdded: 'Linhas adicionadas: ',
      linesRemoved: 'Linhas removidas: ',
      reviewFile: (path: string) => `Revisar ${path}`,
      review: 'Revisar',
      turnSummary: 'Resumo do turno',
      turnDuration: 'Duração do turno',
      tookTime: (duration: string) => `Levou ${duration}`,
      backgroundTasks: 'Tarefas em segundo plano',
      stopping: 'Parando…',
      stopTask: (who: string) => `Parar ${who}`
    },
    toolRowView: {
      states: {
        running: 'Rodando',
        done: 'Concluído',
        error: 'Falhou',
        stopped: 'Interrompido'
      },
      openInEditor: (target: string) => `Abrir ${target} no editor`,
      reasoning: 'Raciocínio'
    },
    markdown: {
      copyCode: 'Copiar código'
    },
    promptBox: {
      noActiveFile: 'nenhum arquivo ativo',
      inputLabel: 'Mensagem para o Claude',
      placeholderLoading: 'A sessão está iniciando… você já pode escrever',
      placeholderWorking: 'Escreva para enfileirar… (Esc interrompe)',
      placeholder: 'Pergunte ao Claude… (@ arquivos, / comandos)',
      suggestionHint: 'Sugestão, Tab aceita: ',
      attach: 'Anexar arquivos',
      commandsTitle: 'Comandos (/)',
      commands: 'Comandos',
      autoContextOn: (file: string) => `Contexto automático ligado: ${file} e a seleção vão com a mensagem`,
      autoContextOff: 'Contexto automático desligado',
      noContext: 'Sem contexto'
    },
    sendControls: {
      stop: 'Parar (Esc)',
      interrupt: 'Interromper',
      queueTitle: 'Enfileirar mensagem (Enter)',
      sendTitle: 'Enviar (Enter)',
      queue: 'Enfileirar',
      send: 'Enviar'
    },
    promptMenu: {
      emptyFile: '.claude/commands/nome.md',
      emptyHint: 'Nenhum comando do projeto ou pessoal ainda. Crie {file} na pasta ou em {dir}.',
      files: 'Arquivos',
      commands: 'Comandos'
    },
    find: {
      placeholder: 'Localizar',
      label: 'Localizar na sessão',
      matchCase: 'Diferenciar maiúsculas de minúsculas',
      noResults: 'Sem resultados',
      position: (index: number, count: number) => `${index} de ${count}`,
      previous: 'Resultado anterior (Shift+Enter)',
      next: 'Próximo resultado (Enter)',
      close: 'Fechar (Esc)'
    },
    mcpModal: {
      title: 'Servidores MCP',
      addServer: 'Adicionar servidor',
      refreshFailed: 'Não foi possível atualizar a lista.',
      loadFailed: 'Não foi possível carregar os servidores.',
      loading: 'Carregando servidores…',
      empty: 'Nenhum servidor MCP configurado.',
      emptyHint: 'Adicione um para dar novas ferramentas ao Claude.',
      confirmRemove: (name: string) => `Remover «${name}»?`,
      remove: 'Remover',
      reconnect: 'Reconectar',
      authenticate: 'Autenticar',
      logout: 'Sair',
      removeServer: (name: string) => `Remover ${name}`,
      enableServer: (name: string) => `Ativar ${name}`,
      awaitingAuth: 'Aguardando autenticação no navegador…',
      authUrl: 'URL de autenticação',
      copyUrl: 'Copiar URL',
      callbackUrl: 'Colar URL de retorno',
      send: 'Enviar',
      server: 'Servidor',
      transport: 'Transporte',
      command: 'Comando',
      url: 'URL',
      variables: 'Variáveis',
      headers: 'Headers',
      hiddenValues: '(valores ocultos)',
      tools: (n: number) => `Ferramentas (${n})`,
      readOnly: 'somente leitura',
      destructive: 'destrutiva',
      noTools: 'Nenhuma ferramenta exposta.'
    },
    mcpForm: {
      scopes: { local: 'Local', project: 'Projeto', user: 'Usuário' },
      scopeHints: {
        local: 'Local — só você, neste projeto.',
        project: 'Projeto — .mcp.json, compartilhado com o repositório.',
        user: 'Usuário — todos os seus projetos.'
      },
      name: 'Nome',
      namePlaceholder: 'meu-servidor',
      commandLine: 'Comando e argumentos',
      commandPlaceholder: 'npx -y @modelcontextprotocol/server-filesystem "/caminho com espaço"',
      url: 'URL',
      urlPlaceholder: 'https://exemplo.com/mcp',
      envLabel: 'Variáveis de ambiente (opcional)',
      headersLabel: 'Headers (opcional)',
      envPlaceholder: 'CHAVE=valor',
      pairsHint: 'Uma por linha, no formato CHAVE=valor. Os valores ficam só no arquivo de configuração.',
      scope: 'Escopo',
      adding: 'Adicionando…',
      add: 'Adicionar'
    },
    commandArgs: {
      hint: 'Argumentos esperados:',
      send: 'Enviar',
      inputLabel: (name: string) => `Argumentos de /${name}`
    },
    favorites: {
      newFavorite: 'Novo command favorito',
      stepCommand: '1 · Command',
      searchCommand: 'Buscar command',
      command: 'Command',
      noneFound: 'Nenhum command encontrado',
      commandsPending: 'Os commands aparecem quando a conversa terminar de iniciar.',
      allFavorited: 'Todos os commands já estão nos favoritos.',
      stepIcon: '2 · Ícone',
      icon: 'Ícone',
      maxFavorites: (n: number) => `No máximo ${n} favoritos`,
      add: 'Adicionar',
      toolbar: 'Commands favoritos',
      runTitle: (command: string) => `${command} (clique para executar)`,
      run: (name: string) => `Executar /${name}`,
      remove: 'Remover dos favoritos',
      removeCommand: (name: string) => `Remover /${name} dos favoritos`,
      addFavorite: 'Adicionar command favorito',
      emptyHint: 'Fixe commands aqui para rodar com um clique'
    },
    elicitationCard: {
      ariaLabel: (server: string) => `Pedido do servidor MCP ${server}`,
      kicker: (server: string) => `Servidor MCP · ${server}`,
      closeTitle: 'Fechar sem responder (Esc)',
      close: 'Fechar sem responder',
      urlHint: 'Confira o endereço: ele abre no seu navegador.',
      escHint: 'Esc fecha sem responder',
      required: '* obrigatório',
      decline: 'Recusar',
      openInBrowser: 'Abrir no navegador',
      send: 'Enviar'
    },
    questionCard: {
      ariaLabel: 'Pergunta do Claude',
      kicker: 'O Claude tem uma pergunta',
      skip: 'Pular — o Claude decide sozinho',
      questions: 'Perguntas',
      answered: (header: string) => `${header} (respondida)`,
      chooseMany: 'Escolha uma ou mais',
      other: 'Outro',
      otherPlaceholder: 'Digite sua resposta',
      otherLabel: 'Outro: sua resposta',
      count: (current: number, total: number) => `${current} de ${total}`,
      keys: (max: number) => `Teclas 1–${max}`,
      back: 'Voltar',
      next: 'Próxima',
      answerAll: 'Responda todas as perguntas',
      submit: 'Responder'
    },
    permissions: {
      toolAriaLabel: 'Pedido de permissão',
      denyComment: 'Comentário para o Claude (opcional, ao negar)',
      allow: 'Permitir',
      allowAlwaysTitle: 'Não pergunta de novo para pedidos parecidos, só nesta sessão',
      allowAlways: 'Permitir sempre',
      allowWorkspaceTitle: 'Grava a regra em .claude/settings.local.json desta pasta: vale também em sessões novas',
      allowWorkspace: 'Sempre neste workspace',
      deny: 'Negar',
      editAriaLabel: 'Edição pendente',
      create: 'Criar',
      edit: 'Editar',
      viewDiff: 'Ver diff',
      accept: 'Aceitar',
      reject: 'Rejeitar',
      plan: 'Plano',
      planTitle: 'Plano para revisar',
      runWith: 'Executar com:',
      runMode: 'Modo da execução',
      planFeedback: 'O que deve mudar no plano?',
      approve: 'Aprovar e executar',
      sendAndKeepPlanning: 'Enviar e continuar planejando',
      keepPlanning: 'Continuar planejando'
    },
    promptChips: {
      modeLabel: (mode: string, shortcut: string) => `Modo de execução: ${mode} (${shortcut} alterna)`,
      modeLabelBypass: (mode: string, shortcut: string) =>
        `Modo de execução: ${mode}, os comandos rodam sem perguntar (${shortcut} alterna)`,
      modeHead: (shortcut: string) => `Modo de execução · ${shortcut}`,
      bypassLocked: { before: 'Desativado. Ative ', after: ' nas configurações do usuário.' },
      searchModel: 'Buscar modelo',
      model: 'Modelo',
      noModels: 'Nenhum modelo encontrado',
      effortGroup: 'Esforço de raciocínio',
      effort: 'Esforço',
      effortKeys: '← → ajustam',
      effortUnsupported: 'Este modelo não aceita este nível',
      effortNote: { before: 'auto usa o padrão do modelo. ', after: ' vale só para esta sessão.' },
      modelLabel: (model: string) => `Modelo e esforço: ${model}`,
      modelEffortLabel: (model: string, effort: string) => `Modelo e esforço: ${model}, ${effort}`
    },
    usageModal: {
      title: 'Uso do Claude',
      loading: 'Carregando uso…',
      loadFailed: 'Não foi possível carregar o uso.',
      unsupported: 'O Claude Code instalado não informa o uso.',
      unsupportedHint: 'Atualize o Claude Code para ver os limites do plano e o custo da sessão.',
      planLimits: 'Limites do plano',
      noLimits: 'Nenhum limite informado.',
      limitsNotApplicable: 'Os limites do plano não se aplicam a esta conta (chave de API ou provedor de terceiros).',
      extraUsage: 'Uso extra',
      monthlyOverage: 'Excedente do mês',
      usedOfLimit: (used: string, limit: string) => `${used} de ${limit}`,
      session: 'Sessão',
      thisSession: 'Esta sessão',
      cost: 'Custo',
      totalTime: 'Tempo total',
      apiTime: 'Tempo de API',
      lines: 'Linhas',
      model: 'Modelo',
      input: 'Entrada',
      output: 'Saída',
      cache: 'Cache'
    },
    history: {
      title: 'Conversas anteriores',
      searchPlaceholder: 'Buscar conversas pelo título',
      search: 'Buscar conversas',
      close: 'Fechar histórico',
      empty: 'Nenhuma conversa anterior.',
      noMatch: 'Nada encontrado.',
      favorite: 'Favorita',
      untitled: 'Sem título'
    },
    agentsStrip: {
      title: 'Agentes',
      status: { running: 'Trabalhando', done: 'Concluído', failed: 'Falhou', stopped: 'Interrompido' },
      now: (summary: string) => `Agora: ${summary}`
    },
    proposal: {
      reasonPlaceholder: 'Motivo para o Claude (opcional)',
      reason: 'Motivo da rejeição',
      reject: 'Rejeitar',
      rejectEllipsis: 'Rejeitar…',
      accept: 'Aceitar',
      newFile: 'Arquivo novo proposto pelo Claude',
      edit: 'Edição proposta pelo Claude'
    },
    attachmentChips: {
      imageAlt: (name: string) => `Imagem anexada: ${name}`,
      preview: (name: string) => `Ampliar ${name}`,
      remove: (name: string) => `Remover ${name}`
    },
    useAttachments: {
      pasted: 'colada',
      image: 'imagem',
      imageTooLarge: (name: string) => `A imagem "${name}" passa de 5 MB.`,
      unsupportedImage: 'Formato de imagem não aceito (use PNG, JPEG, GIF ou WebP).',
      notOnDisk: (name: string) => `Não foi possível anexar "${name}": o arquivo não está no disco.`
    },
    actions: {
      failed: (message: string) => `Claude: ${message}`,
      openSession: 'Abrir sessão',
      review: 'Revisar',
      toasts: {
        done: 'Claude Code terminou',
        failed: 'Claude Code falhou',
        turnFailed: (title: string) => `${title} · o turno terminou com erro`,
        question: 'Claude Code tem uma pergunta',
        mcpNeedsYou: 'Um servidor MCP precisa de você',
        needsYou: 'Claude Code precisa de você',
        sessionFallback: (from: string, to: string) =>
          `O modelo ${from} recusou o pedido; a sessão passou a usar ${to}.`,
        subagentFallback: (from: string, to: string) =>
          `Um subagente foi refeito com ${to} depois de uma recusa de ${from}.`,
        conversationExported: 'Conversa exportada'
      },
      start: {
        sessionFailed: 'Claude: não foi possível abrir uma sessão. Sua pergunta ficou na caixa de texto.',
        folderTimeout: 'Claude: a pasta não abriu a tempo.',
        notSent: 'O pedido não foi enviado.',
        copyRequest: 'Copiar pedido'
      },
      openFileForReference: 'Abra um arquivo para inserir uma referência.',
      openConversationFailed: 'Claude: não foi possível abrir a conversa agora.',
      sessionStarting: 'A sessão ainda está iniciando. Tente de novo em instantes.',
      waitResume: 'Aguarde a conversa ser retomada.',
      forkNotOpened: 'A cópia foi criada, mas não abriu agora. Ela está em "Conversas anteriores".',
      fileOutsideFolder: 'Este arquivo está fora da pasta da janela.',
      noGitDiff: 'Sem diferenças no git para este arquivo; abrindo o arquivo.',
      conversationEnded: 'A conversa foi encerrada. Abra uma nova.',
      notDelivered: 'Não foi possível enviar a mensagem: a sessão não ficou pronta. O texto voltou para a caixa.',
      openForMcp: 'Abra uma conversa do Claude para gerenciar os servidores MCP.',
      notStarted: 'A conversa ainda não foi iniciada.',
      openForUsage: 'Abra uma conversa do Claude para ver o uso.',
      unavailable: 'A conversa não está disponível.',
      waitToClear: 'Aguarde o Claude terminar (ou interrompa) para limpar a conversa.',
      clearFailed: 'Claude: não foi possível limpar a conversa agora.',
      nothingToRepeat: 'Não há mensagem anterior para repetir.',
      attachFailed: (name: string, reason: string) => `Não foi possível anexar "${name}": ${reason}`,
      answerRefused: 'Claude: a resposta não foi aceita; revise e tente de novo.',
      fileChangedOnDisk: 'O arquivo mudou no disco. Rejeitei a edição para o Claude propor de novo.',
      waitToRewind: 'Aguarde o Claude terminar (ou interrompa) para voltar.',
      draftKept: 'Seu rascunho foi mantido; a mensagem anterior foi colocada no fim dele.',
      filesRestored: (n: number) => (n === 0 ? 'Nenhum arquivo precisou voltar.' : `${n} arquivo(s) restaurado(s).`),
      fileNotFound: (path: string) => `Arquivo não encontrado: ${path}`,
      login: {
        notDetected: 'Ainda não detectamos o login. Conclua no terminal e tente de novo.',
        connectedAs: (email: string) => `Conectado ao Claude como ${email}.`,
        connected: 'Conectado ao Claude.',
        signingIn: 'Entrando no Claude…',
        finishInTerminal: 'Conclua o login no terminal. Avisamos quando terminar.',
        done: 'Já entrei'
      },
      logout: {
        confirm: 'Sair da conta do Claude?',
        detail: 'As conversas abertas serão reiniciadas e você precisará entrar de novo para continuar.',
        action: 'Sair',
        done: 'Você saiu da conta do Claude.'
      }
    },
    conversation: {
      newTitle: 'Nova conversa',
      loadStep: {
        wake: 'Retomando conversa…',
        init: 'Iniciando sessão…',
        mcp: 'Conectando servidores MCP…'
      },
      backgroundKind: {
        agent: 'agente',
        shell: 'comando',
        other: 'tarefa'
      },
      backgroundCount: {
        agent: (n: number) => plural(n, '1 agente', `${n} agentes`),
        shell: (n: number) => plural(n, '1 comando', `${n} comandos`),
        other: (n: number) => plural(n, '1 tarefa', `${n} tarefas`)
      },
      inBackground: (list: string) => `${list} em segundo plano`
    },
    prompt: {
      localCommands: {
        login: 'Entrar na conta do Claude (abre o terminal)',
        logout: 'Sair da conta do Claude',
        usage: 'Uso do plano e custo da sessão'
      },
      groups: {
        project: 'Projeto',
        user: 'Pessoais'
      }
    },
    turnSummary: {
      filesChanged: (n: number) => plural(n, '1 arquivo alterado', `${n} arquivos alterados`)
    },
    toolRow: {
      labels: {
        read: 'Leu',
        write: 'Criou',
        edit: 'Editou',
        output: 'Saída',
        grep: 'Buscou',
        list: 'Listou',
        fetch: 'Abriu',
        webSearch: 'Pesquisou',
        agent: 'Agente',
        todos: 'Tarefas',
        asked: 'Perguntou',
        plan: 'Plano',
        skill: 'Skill',
        command: 'Comando'
      },
      omittedLines: (n: number) => `… ${n} linhas omitidas`,
      noOutput: '(sem saída)',
      lines: (n: number) => plural(n, '1 linha', `${n} linhas`),
      results: (n: number) => plural(n, '1 resultado', `${n} resultados`),
      todosDone: (done: number, total: number) => `${done} de ${total} concluídas`
    },
    tools: {
      read: 'Ler',
      edit: 'Editar',
      write: 'Escrever',
      editNotebook: 'Editar notebook',
      findFiles: 'Buscar arquivos',
      search: 'Buscar',
      fetch: 'Acessar página',
      webSearch: 'Pesquisar na web',
      subagent: 'Subagente',
      todos: 'Tarefas',
      asked: 'Perguntou',
      plan: 'Plano',
      items: (n: number) => plural(n, '1 item', `${n} itens`),
      omittedChars: (n: number) => `(${n} caracteres omitidos)`
    },
    agents: {
      defaultName: 'Agente',
      title: 'Agentes',
      running: (n: number) => `${n} trabalhando`,
      done: (n: number) => plural(n, '1 concluído', `${n} concluídos`),
      failed: (n: number) => plural(n, '1 falhou', `${n} falharam`),
      stopped: (n: number) => plural(n, '1 interrompido', `${n} interrompidos`)
    },
    agentStatus: {
      running: 'Claude Code trabalhando',
      done: 'Claude Code terminou',
      attention: 'Claude Code aguardando você',
      error: 'Claude Code falhou'
    },
    progress: {
      tokens: (n: number) => plural(n, '1 token', `${n} tokens`),
      thousandTokens: (n: string) => `${n} mil tokens`,
      millionTokens: (n: string) => `${n} mi de tokens`,
      tools: (n: number) => plural(n, '1 ferramenta', `${n} ferramentas`)
    },
    mcp: {
      groups: {
        project: 'Projeto',
        local: 'Local',
        user: 'Usuário',
        claudeai: 'claude.ai',
        plugin: 'Plugins',
        other: 'Interno e outros'
      },
      status: {
        connected: 'Conectado',
        failed: 'Falhou',
        needsAuth: 'Requer autenticação',
        pending: 'Conectando…',
        disabled: 'Desativado',
        unknown: 'Desconhecido'
      },
      toolCount: (n: number) => plural(n, '1 ferramenta', `${n} ferramentas`),
      errors: {
        pairFormat: (line: number) => `Linha ${line}: use CHAVE=valor.`,
        pairName: (line: number, key: string) => `Linha ${line}: nome inválido "${key}".`,
        name: 'Use letras, números, "-" e "_" (até 64).',
        unclosedQuotes: 'Aspas sem fechar.',
        commandRequired: 'Informe o comando.',
        urlScheme: 'A URL deve começar com http:// ou https://.',
        urlInvalid: 'URL inválida.',
        urlRequired: 'Informe a URL.'
      }
    },
    elicitation: {
      chooseOption: 'Escolha uma opção.',
      required: 'Campo obrigatório.',
      number: 'Digite um número.',
      invalidValue: 'Valor inválido.',
      minLength: (n: string) => `Use pelo menos ${n} caracteres.`,
      maxLength: (n: string) => `Use no máximo ${n} caracteres.`,
      minimum: (n: string) => `O valor mínimo é ${n}.`,
      maximum: (n: string) => `O valor máximo é ${n}.`,
      integer: 'Digite um número inteiro.',
      email: 'E-mail inválido.',
      uri: 'Endereço inválido (ex.: https://exemplo.com).',
      date: 'Data inválida.',
      dateTime: 'Data e hora inválidas.',
      option: 'Opção inválida.'
    },
    modes: {
      default: 'Pergunta antes de editar arquivos e de rodar comandos.',
      acceptEdits: 'Edita arquivos sozinho; pergunta antes de rodar comandos.',
      plan: 'Só lê e propõe um plano. Nada muda até você aprovar.',
      planNote: 'Plan: o Claude só lê e propõe; nada é alterado até você aprovar',
      auto: 'Edita e roda comandos seguros; pergunta só no que for arriscado.',
      bypassPermissions: 'Executa tudo sem perguntar. Só em ambiente isolado.'
    },
    rateLimit: {
      windows: {
        five_hour: '5 horas',
        seven_day: 'semanal',
        seven_day_opus: 'semanal do Opus',
        seven_day_sonnet: 'semanal do Sonnet',
        overage: 'créditos extras',
        other: 'uso'
      },
      today: (time: string) => `às ${time}`,
      tomorrow: (time: string) => `amanhã às ${time}`,
      onDate: (date: string, time: string) => `em ${date} às ${time}`,
      reached: (label: string) => `Limite de ${label} atingido`,
      used: (percent: number, label: string) => `Você usou ${percent}% do limite de ${label}`,
      near: (label: string) => `Você está perto do limite de ${label}`,
      renews: (when: string) => `renova ${when}`,
      usingOverage: 'usando créditos extras'
    },
    usage: {
      resetNow: 'reinicia agora',
      resetMinutes: (minutes: number) => `reinicia em ${minutes} min`,
      resetHours: (hours: number, minutes: string) => `reinicia em ${hours} h ${minutes} min`,
      resetDays: (days: number, hours: number) =>
        `reinicia em ${days} ${plural(days, 'dia', 'dias')}${hours ? ` ${hours} h` : ''}`,
      used: (percent: number) => `${percent}% usado`,
      unknown: 'uso não informado',
      freePlan: 'Gratuito'
    },
    retry: {
      connection: 'Falha de conexão',
      overloaded: 'Servidor sobrecarregado',
      tooMany: 'Muitas requisições',
      server: (status: number) => `Erro no servidor (${status})`,
      api: (status: number) => `Erro da API (${status})`,
      lead: (cause: string, attempt: number, max: number) => `${cause} — tentando de novo (${attempt}/${max})`,
      countdown: (seconds: number) => ` em ${seconds} s`,
      now: ' agora'
    },
    modelName: {
      default: 'Padrão'
    },
    context: {
      taskCompleted: 'Tarefa em segundo plano concluída',
      taskFailed: 'Tarefa em segundo plano falhou',
      taskStopped: 'Tarefa em segundo plano interrompida',
      taskWithSummary: (lead: string, summary: string) => `${lead}: ${summary}`
    },
    thinkingWords: {
      // Separated by `|` (the catalog only stores texts).
      words:
        'Matutando|Ruminando|Destrinchando|Garimpando ideias|Cozinhando|Maquinando|Tecendo|Conjecturando|Cogitando|' +
        'Burilando|Esquadrinhando|Alinhavando|Desenrolando|Peneirando|Lapidando|Fermentando|Destilando|Mastigando|' +
        'Arquitetando|Tramando|Deslindando|Costurando ideias|Esmiuçando|Perscrutando|Ponderando|Cavucando|Destecendo|' +
        'Tricotando|Fuçando|Rabiscando|Calibrando|Arquivando mentalmente|Rastreando pistas|Remoendo|Cirandando|' +
        'Alquimiando|Desemaranhando|Esculpindo|Vasculhando|Mapeando o terreno'
    }
  },
  en: {
    panel: {
      renameSession: 'Rename session',
      favorite: 'Favorite',
      unread: (n: number) => plural(n, '1 unread', `${n} unread`),
      closeConversation: 'Close Conversation',
      closeTitle: (title: string) => `Close ${title}`,
      duplicate: 'Duplicate',
      exportConversation: 'Export Conversation (.md)',
      compactContext: 'Compact Context',
      sessionCost: (cost: string) => `Session cost: ${cost}`,
      planUsage: 'Plan Usage',
      account: (account: string) => `Account: ${account}`,
      logout: 'Log Out',
      login: 'Log In',
      mcpServers: 'MCP Servers',
      closeHistory: 'Close History',
      previousConversations: 'Previous Conversations',
      hidePanel: 'Close Panel',
      closeSession: 'Close Session',
      unfavorite: 'Remove from Favorites',
      favoriteSession: 'Favorite Session',
      moreActions: 'More Session Actions',
      moreActionsContext: (percent: number) => `More Session Actions (context at ${percent}%)`,
      conversations: 'Conversations',
      newConversation: 'New Conversation',
      openFolder: 'Open a folder to chat with Claude Code.',
      starting: 'Starting Claude Code…',
      emptyTitle: 'No open conversations.',
      emptyText: 'Ask for a change, ask a question about the code or investigate an error. Edits open as a diff.',
      suggestions: 'Suggestions',
      suggestExplain: 'Explain this project',
      suggestBugs: 'Find possible bugs',
      suggestTests: 'Suggest missing tests'
    },
    conversationPane: {
      wakeFailed: 'Could not resume this conversation.',
      newConversation: 'New Conversation',
      authBefore: 'You are not logged in to Claude Code. Log in from the terminal (we run ',
      authAfter: " in the window's folder); conversations restart on their own when the login finishes.",
      login: 'Log In with Claude Code',
      closed: 'The conversation has ended.'
    },
    timeline: {
      label: 'Conversation',
      emptyTitle: 'New session',
      emptyText: 'Ask about the code, request a change or use / for commands.',
      emptyHint: '@ mentions files and folders; edits open as a diff for you to accept.',
      sending: 'Sending…',
      thinking: 'Thinking…'
    },
    timelineParts: {
      queued: 'Queued',
      openImage: (n: number, total: number) => `Enlarge image ${n} of ${total}`,
      imageName: (n: number, total: number) => `Image ${n} of ${total}`,
      rewindBoth: 'Code and Conversation',
      rewindConversation: 'Conversation Only',
      rewindCode: 'Code Only',
      copyMessage: 'Copy Message',
      copyReply: 'Copy Reply',
      rewindBusy: 'Wait for Claude to finish before going back',
      rewind: 'Go back to before this message',
      compacted: 'Conversation compacted',
      compactedDetail: (tokens: string | null, auto: boolean) =>
        `Conversation compacted${tokens ? ` · ${tokens} tokens before` : ''}${auto ? ' (automatic)' : ''}`,
      scheduledRun: 'Scheduled run',
      backgroundDone: 'Background task finished · Claude continued',
      blocked: (tool: string, reason: string) => `Blocked: ${tool}${reason ? ` (${reason})` : ''}`,
      showLess: 'Show Less',
      showAll: (lines: number) => `Show All (${lines} lines)`,
      scrollToMessage: 'Scroll to your message',
      replaceAllNote: 'Replaced every occurrence: the count is for one occurrence.',
      overwriteNote: 'File overwritten: removed lines are not counted.',
      linesAdded: 'Lines added: ',
      linesRemoved: 'Lines removed: ',
      reviewFile: (path: string) => `Review ${path}`,
      review: 'Review',
      turnSummary: 'Turn summary',
      turnDuration: 'Turn duration',
      tookTime: (duration: string) => `Took ${duration}`,
      backgroundTasks: 'Background tasks',
      stopping: 'Stopping…',
      stopTask: (who: string) => `Stop ${who}`
    },
    toolRowView: {
      states: {
        running: 'Running',
        done: 'Done',
        error: 'Failed',
        stopped: 'Interrupted'
      },
      openInEditor: (target: string) => `Open ${target} in the editor`,
      reasoning: 'Reasoning'
    },
    markdown: {
      copyCode: 'Copy Code'
    },
    promptBox: {
      noActiveFile: 'no active file',
      inputLabel: 'Message to Claude',
      placeholderLoading: 'The session is starting… you can already type',
      placeholderWorking: 'Type to queue… (Esc interrupts)',
      placeholder: 'Ask Claude… (@ files, / commands)',
      suggestionHint: 'Suggestion, Tab accepts: ',
      attach: 'Attach Files',
      commandsTitle: 'Commands (/)',
      commands: 'Commands',
      autoContextOn: (file: string) => `Automatic context on: ${file} and the selection go with the message`,
      autoContextOff: 'Automatic context off',
      noContext: 'No context'
    },
    sendControls: {
      stop: 'Stop (Esc)',
      interrupt: 'Interrupt',
      queueTitle: 'Queue Message (Enter)',
      sendTitle: 'Send (Enter)',
      queue: 'Queue',
      send: 'Send'
    },
    promptMenu: {
      emptyFile: '.claude/commands/name.md',
      emptyHint: 'No project or personal commands yet. Create {file} in the folder or in {dir}.',
      files: 'Files',
      commands: 'Commands'
    },
    find: {
      placeholder: 'Find',
      label: 'Find in session',
      matchCase: 'Match Case',
      noResults: 'No results',
      position: (index: number, count: number) => `${index} of ${count}`,
      previous: 'Previous Match (Shift+Enter)',
      next: 'Next Match (Enter)',
      close: 'Close (Esc)'
    },
    mcpModal: {
      title: 'MCP Servers',
      addServer: 'Add Server',
      refreshFailed: 'Could not refresh the list.',
      loadFailed: 'Could not load the servers.',
      loading: 'Loading servers…',
      empty: 'No MCP servers configured.',
      emptyHint: 'Add one to give Claude new tools.',
      confirmRemove: (name: string) => `Remove "${name}"?`,
      remove: 'Remove',
      reconnect: 'Reconnect',
      authenticate: 'Authenticate',
      logout: 'Log Out',
      removeServer: (name: string) => `Remove ${name}`,
      enableServer: (name: string) => `Enable ${name}`,
      awaitingAuth: 'Waiting for authentication in the browser…',
      authUrl: 'Authentication URL',
      copyUrl: 'Copy URL',
      callbackUrl: 'Paste callback URL',
      send: 'Send',
      server: 'Server',
      transport: 'Transport',
      command: 'Command',
      url: 'URL',
      variables: 'Variables',
      headers: 'Headers',
      hiddenValues: '(values hidden)',
      tools: (n: number) => `Tools (${n})`,
      readOnly: 'read-only',
      destructive: 'destructive',
      noTools: 'No tools exposed.'
    },
    mcpForm: {
      scopes: { local: 'Local', project: 'Project', user: 'User' },
      scopeHints: {
        local: 'Local: only you, in this project.',
        project: 'Project: .mcp.json, shared with the repository.',
        user: 'User: all your projects.'
      },
      name: 'Name',
      namePlaceholder: 'my-server',
      commandLine: 'Command and arguments',
      commandPlaceholder: 'npx -y @modelcontextprotocol/server-filesystem "/path with spaces"',
      url: 'URL',
      urlPlaceholder: 'https://example.com/mcp',
      envLabel: 'Environment variables (optional)',
      headersLabel: 'Headers (optional)',
      envPlaceholder: 'KEY=value',
      pairsHint: 'One per line, as KEY=value. Values are stored only in the configuration file.',
      scope: 'Scope',
      adding: 'Adding…',
      add: 'Add'
    },
    commandArgs: {
      hint: 'Expected arguments:',
      send: 'Send',
      inputLabel: (name: string) => `Arguments for /${name}`
    },
    favorites: {
      newFavorite: 'New favorite command',
      stepCommand: '1 · Command',
      searchCommand: 'Search commands',
      command: 'Command',
      noneFound: 'No commands found',
      commandsPending: 'Commands appear once the conversation finishes starting.',
      allFavorited: 'All commands are already in your favorites.',
      stepIcon: '2 · Icon',
      icon: 'Icon',
      maxFavorites: (n: number) => `At most ${n} favorites`,
      add: 'Add',
      toolbar: 'Favorite commands',
      runTitle: (command: string) => `${command} (click to run)`,
      run: (name: string) => `Run /${name}`,
      remove: 'Remove from favorites',
      removeCommand: (name: string) => `Remove /${name} from favorites`,
      addFavorite: 'Add favorite command',
      emptyHint: 'Pin commands here to run them with one click'
    },
    elicitationCard: {
      ariaLabel: (server: string) => `Request from MCP server ${server}`,
      kicker: (server: string) => `MCP server · ${server}`,
      closeTitle: 'Close without answering (Esc)',
      close: 'Close without answering',
      urlHint: 'Check the address: it opens in your browser.',
      escHint: 'Esc closes without answering',
      required: '* required',
      decline: 'Decline',
      openInBrowser: 'Open in Browser',
      send: 'Send'
    },
    questionCard: {
      ariaLabel: 'Question from Claude',
      kicker: 'Claude has a question',
      skip: 'Skip, Claude decides on its own',
      questions: 'Questions',
      answered: (header: string) => `${header} (answered)`,
      chooseMany: 'Choose one or more',
      other: 'Other',
      otherPlaceholder: 'Type your answer',
      otherLabel: 'Other: your answer',
      count: (current: number, total: number) => `${current} of ${total}`,
      keys: (max: number) => `Keys 1–${max}`,
      back: 'Back',
      next: 'Next',
      answerAll: 'Answer all questions',
      submit: 'Answer'
    },
    permissions: {
      toolAriaLabel: 'Permission request',
      denyComment: 'Comment for Claude (optional, when denying)',
      allow: 'Allow',
      allowAlwaysTitle: "Won't ask again for similar requests, in this session only",
      allowAlways: 'Always Allow',
      allowWorkspaceTitle: "Saves the rule to this folder's .claude/settings.local.json: also applies to new sessions",
      allowWorkspace: 'Always in This Workspace',
      deny: 'Deny',
      editAriaLabel: 'Pending edit',
      create: 'Create',
      edit: 'Edit',
      viewDiff: 'View Diff',
      accept: 'Accept',
      reject: 'Reject',
      plan: 'Plan',
      planTitle: 'Plan to review',
      runWith: 'Run with:',
      runMode: 'Run mode',
      planFeedback: 'What should change in the plan?',
      approve: 'Approve and Run',
      sendAndKeepPlanning: 'Send and Keep Planning',
      keepPlanning: 'Keep Planning'
    },
    promptChips: {
      modeLabel: (mode: string, shortcut: string) => `Run mode: ${mode} (${shortcut} cycles)`,
      modeLabelBypass: (mode: string, shortcut: string) =>
        `Run mode: ${mode}, commands run without asking (${shortcut} cycles)`,
      modeHead: (shortcut: string) => `Run mode · ${shortcut}`,
      bypassLocked: { before: 'Disabled. Turn on ', after: ' in the user settings.' },
      searchModel: 'Search models',
      model: 'Model',
      noModels: 'No models found',
      effortGroup: 'Reasoning effort',
      effort: 'Effort',
      effortKeys: '← → adjust',
      effortUnsupported: "This model doesn't support this level",
      effortNote: { before: 'auto uses the model default. ', after: ' applies to this session only.' },
      modelLabel: (model: string) => `Model and effort: ${model}`,
      modelEffortLabel: (model: string, effort: string) => `Model and effort: ${model}, ${effort}`
    },
    usageModal: {
      title: 'Claude Usage',
      loading: 'Loading usage…',
      loadFailed: 'Could not load usage.',
      unsupported: "The installed Claude Code doesn't report usage.",
      unsupportedHint: 'Update Claude Code to see the plan limits and the session cost.',
      planLimits: 'Plan limits',
      noLimits: 'No limits reported.',
      limitsNotApplicable: "Plan limits don't apply to this account (API key or third-party provider).",
      extraUsage: 'Extra usage',
      monthlyOverage: 'Monthly overage',
      usedOfLimit: (used: string, limit: string) => `${used} of ${limit}`,
      session: 'Session',
      thisSession: 'This session',
      cost: 'Cost',
      totalTime: 'Total time',
      apiTime: 'API time',
      lines: 'Lines',
      model: 'Model',
      input: 'Input',
      output: 'Output',
      cache: 'Cache'
    },
    history: {
      title: 'Previous conversations',
      searchPlaceholder: 'Search conversations by title',
      search: 'Search conversations',
      close: 'Close history',
      empty: 'No previous conversations.',
      noMatch: 'Nothing found.',
      favorite: 'Favorite',
      untitled: 'Untitled'
    },
    agentsStrip: {
      title: 'Agents',
      status: { running: 'Working', done: 'Done', failed: 'Failed', stopped: 'Stopped' },
      now: (summary: string) => `Now: ${summary}`
    },
    proposal: {
      reasonPlaceholder: 'Reason for Claude (optional)',
      reason: 'Rejection reason',
      reject: 'Reject',
      rejectEllipsis: 'Reject…',
      accept: 'Accept',
      newFile: 'New file proposed by Claude',
      edit: 'Edit proposed by Claude'
    },
    attachmentChips: {
      imageAlt: (name: string) => `Attached image: ${name}`,
      preview: (name: string) => `Enlarge ${name}`,
      remove: (name: string) => `Remove ${name}`
    },
    useAttachments: {
      pasted: 'pasted',
      image: 'image',
      imageTooLarge: (name: string) => `The image "${name}" is larger than 5 MB.`,
      unsupportedImage: 'Unsupported image format (use PNG, JPEG, GIF or WebP).',
      notOnDisk: (name: string) => `Could not attach "${name}": the file is not on disk.`
    },
    actions: {
      failed: (message: string) => `Claude: ${message}`,
      openSession: 'Open Session',
      review: 'Review',
      toasts: {
        done: 'Claude Code finished',
        failed: 'Claude Code failed',
        turnFailed: (title: string) => `${title} · the turn ended with an error`,
        question: 'Claude Code has a question',
        mcpNeedsYou: 'An MCP server needs you',
        needsYou: 'Claude Code needs you',
        sessionFallback: (from: string, to: string) =>
          `The ${from} model declined the request; the session now uses ${to}.`,
        subagentFallback: (from: string, to: string) => `A subagent was rerun with ${to} after ${from} declined.`,
        conversationExported: 'Conversation exported'
      },
      start: {
        sessionFailed: 'Claude: could not open a session. Your question was kept in the text box.',
        folderTimeout: 'Claude: the folder did not open in time.',
        notSent: 'The request was not sent.',
        copyRequest: 'Copy Request'
      },
      openFileForReference: 'Open a file to insert a reference.',
      openConversationFailed: 'Claude: could not open the conversation right now.',
      sessionStarting: 'The session is still starting. Try again in a moment.',
      waitResume: 'Wait for the conversation to resume.',
      forkNotOpened: 'The copy was created but could not be opened now. It is in "Previous conversations".',
      fileOutsideFolder: 'This file is outside the window folder.',
      noGitDiff: 'No git changes for this file; opening the file.',
      conversationEnded: 'The conversation has ended. Open a new one.',
      notDelivered: 'Could not send the message: the session did not become ready. The text is back in the box.',
      openForMcp: 'Open a Claude conversation to manage MCP servers.',
      notStarted: 'The conversation has not started yet.',
      openForUsage: 'Open a Claude conversation to see usage.',
      unavailable: 'The conversation is not available.',
      waitToClear: 'Wait for Claude to finish (or interrupt it) to clear the conversation.',
      clearFailed: 'Claude: could not clear the conversation right now.',
      nothingToRepeat: 'There is no previous message to repeat.',
      attachFailed: (name: string, reason: string) => `Could not attach "${name}": ${reason}`,
      answerRefused: 'Claude: the answer was not accepted; review it and try again.',
      fileChangedOnDisk: 'The file changed on disk. The edit was rejected so Claude can propose it again.',
      waitToRewind: 'Wait for Claude to finish (or interrupt it) to go back.',
      draftKept: 'Your draft was kept; the previous message was added to the end of it.',
      filesRestored: (n: number) =>
        n === 0 ? 'No files needed to be restored.' : plural(n, '1 file restored.', `${n} files restored.`),
      fileNotFound: (path: string) => `File not found: ${path}`,
      login: {
        notDetected: 'Sign-in not detected yet. Finish it in the terminal and try again.',
        connectedAs: (email: string) => `Signed in to Claude as ${email}.`,
        connected: 'Signed in to Claude.',
        signingIn: 'Signing in to Claude…',
        finishInTerminal: 'Finish signing in in the terminal. We will let you know when it is done.',
        done: "I'm Signed In"
      },
      logout: {
        confirm: 'Sign out of your Claude account?',
        detail: 'Open conversations will restart and you will need to sign in again to continue.',
        action: 'Sign Out',
        done: 'You signed out of your Claude account.'
      }
    },
    conversation: {
      newTitle: 'New conversation',
      loadStep: {
        wake: 'Resuming conversation…',
        init: 'Starting session…',
        mcp: 'Connecting MCP servers…'
      },
      backgroundKind: {
        agent: 'agent',
        shell: 'command',
        other: 'task'
      },
      backgroundCount: {
        agent: (n: number) => plural(n, '1 agent', `${n} agents`),
        shell: (n: number) => plural(n, '1 command', `${n} commands`),
        other: (n: number) => plural(n, '1 task', `${n} tasks`)
      },
      inBackground: (list: string) => `${list} in the background`
    },
    prompt: {
      localCommands: {
        login: 'Sign in to your Claude account (opens the terminal)',
        logout: 'Sign out of your Claude account',
        usage: 'Plan usage and session cost'
      },
      groups: {
        project: 'Project',
        user: 'Personal'
      }
    },
    turnSummary: {
      filesChanged: (n: number) => plural(n, '1 file changed', `${n} files changed`)
    },
    toolRow: {
      labels: {
        read: 'Read',
        write: 'Created',
        edit: 'Edited',
        output: 'Output',
        grep: 'Searched',
        list: 'Listed',
        fetch: 'Opened',
        webSearch: 'Searched the web',
        agent: 'Agent',
        todos: 'Tasks',
        asked: 'Asked',
        plan: 'Plan',
        skill: 'Skill',
        command: 'Command'
      },
      omittedLines: (n: number) => `… ${n} lines omitted`,
      noOutput: '(no output)',
      lines: (n: number) => plural(n, '1 line', `${n} lines`),
      results: (n: number) => plural(n, '1 result', `${n} results`),
      todosDone: (done: number, total: number) => `${done} of ${total} done`
    },
    tools: {
      read: 'Read',
      edit: 'Edit',
      write: 'Write',
      editNotebook: 'Edit Notebook',
      findFiles: 'Find Files',
      search: 'Search',
      fetch: 'Fetch Page',
      webSearch: 'Search the Web',
      subagent: 'Subagent',
      todos: 'Tasks',
      asked: 'Asked',
      plan: 'Plan',
      items: (n: number) => plural(n, '1 item', `${n} items`),
      omittedChars: (n: number) => `(${n} characters omitted)`
    },
    agents: {
      defaultName: 'Agent',
      title: 'Agents',
      running: (n: number) => `${n} working`,
      done: (n: number) => `${n} done`,
      failed: (n: number) => `${n} failed`,
      stopped: (n: number) => `${n} stopped`
    },
    agentStatus: {
      running: 'Claude Code working',
      done: 'Claude Code finished',
      attention: 'Claude Code waiting for you',
      error: 'Claude Code failed'
    },
    progress: {
      tokens: (n: number) => plural(n, '1 token', `${n} tokens`),
      thousandTokens: (n: string) => `${n}K tokens`,
      millionTokens: (n: string) => `${n}M tokens`,
      tools: (n: number) => plural(n, '1 tool', `${n} tools`)
    },
    mcp: {
      groups: {
        project: 'Project',
        local: 'Local',
        user: 'User',
        claudeai: 'claude.ai',
        plugin: 'Plugins',
        other: 'Built-in and other'
      },
      status: {
        connected: 'Connected',
        failed: 'Failed',
        needsAuth: 'Needs authentication',
        pending: 'Connecting…',
        disabled: 'Disabled',
        unknown: 'Unknown'
      },
      toolCount: (n: number) => plural(n, '1 tool', `${n} tools`),
      errors: {
        pairFormat: (line: number) => `Line ${line}: use KEY=value.`,
        pairName: (line: number, key: string) => `Line ${line}: invalid name "${key}".`,
        name: 'Use letters, numbers, "-" and "_" (up to 64).',
        unclosedQuotes: 'Unclosed quotes.',
        commandRequired: 'Enter the command.',
        urlScheme: 'The URL must start with http:// or https://.',
        urlInvalid: 'Invalid URL.',
        urlRequired: 'Enter the URL.'
      }
    },
    elicitation: {
      chooseOption: 'Choose an option.',
      required: 'Required field.',
      number: 'Enter a number.',
      invalidValue: 'Invalid value.',
      minLength: (n: string) => `Use at least ${n} characters.`,
      maxLength: (n: string) => `Use at most ${n} characters.`,
      minimum: (n: string) => `The minimum value is ${n}.`,
      maximum: (n: string) => `The maximum value is ${n}.`,
      integer: 'Enter a whole number.',
      email: 'Invalid email.',
      uri: 'Invalid address (e.g. https://example.com).',
      date: 'Invalid date.',
      dateTime: 'Invalid date and time.',
      option: 'Invalid option.'
    },
    modes: {
      default: 'Asks before editing files and running commands.',
      acceptEdits: 'Edits files on its own; asks before running commands.',
      plan: 'Only reads and proposes a plan. Nothing changes until you approve.',
      planNote: 'Plan: Claude only reads and proposes; nothing changes until you approve',
      auto: 'Edits and runs safe commands; asks only about risky ones.',
      bypassPermissions: 'Runs everything without asking. Only in an isolated environment.'
    },
    rateLimit: {
      windows: {
        five_hour: '5-hour',
        seven_day: 'weekly',
        seven_day_opus: 'weekly Opus',
        seven_day_sonnet: 'weekly Sonnet',
        overage: 'extra credits',
        other: 'usage'
      },
      today: (time: string) => `at ${time}`,
      tomorrow: (time: string) => `tomorrow at ${time}`,
      onDate: (date: string, time: string) => `on ${date} at ${time}`,
      reached: (label: string) => `You reached the ${label} limit`,
      used: (percent: number, label: string) => `You used ${percent}% of the ${label} limit`,
      near: (label: string) => `You're close to the ${label} limit`,
      renews: (when: string) => `resets ${when}`,
      usingOverage: 'using extra credits'
    },
    usage: {
      resetNow: 'resets now',
      resetMinutes: (minutes: number) => `resets in ${minutes} min`,
      resetHours: (hours: number, minutes: string) => `resets in ${hours} h ${minutes} min`,
      resetDays: (days: number, hours: number) =>
        `resets in ${days} ${plural(days, 'day', 'days')}${hours ? ` ${hours} h` : ''}`,
      used: (percent: number) => `${percent}% used`,
      unknown: 'usage not reported',
      freePlan: 'Free'
    },
    retry: {
      connection: 'Connection failed',
      overloaded: 'Server overloaded',
      tooMany: 'Too many requests',
      server: (status: number) => `Server error (${status})`,
      api: (status: number) => `API error (${status})`,
      lead: (cause: string, attempt: number, max: number) => `${cause}, retrying (${attempt}/${max})`,
      countdown: (seconds: number) => ` in ${seconds} s`,
      now: ' now'
    },
    modelName: {
      default: 'Default'
    },
    context: {
      taskCompleted: 'Background task completed',
      taskFailed: 'Background task failed',
      taskStopped: 'Background task stopped',
      taskWithSummary: (lead: string, summary: string) => `${lead}: ${summary}`
    },
    thinkingWords: {
      words:
        'Pondering|Mulling|Untangling|Mining ideas|Cooking|Scheming|Weaving|Conjecturing|Musing|Polishing|' +
        'Scrutinizing|Stitching|Unraveling|Sifting|Refining|Brewing|Distilling|Chewing on it|Architecting|Plotting|' +
        'Deciphering|Sewing ideas together|Dissecting|Peering|Deliberating|Digging|Unweaving|Knitting|Rummaging|' +
        'Doodling|Calibrating|Filing away|Following clues|Brooding|Twirling|Alchemizing|Disentangling|Sculpting|' +
        'Combing through|Mapping the terrain'
    }
  },
  es: {
    panel: {
      renameSession: 'Cambiar nombre de la sesión',
      favorite: 'Favorita',
      unread: (n: number) => plural(n, '1 sin leer', `${n} sin leer`),
      closeConversation: 'Cerrar conversación',
      closeTitle: (title: string) => `Cerrar ${title}`,
      duplicate: 'Duplicar',
      exportConversation: 'Exportar conversación (.md)',
      compactContext: 'Compactar contexto',
      sessionCost: (cost: string) => `Costo de la sesión: ${cost}`,
      planUsage: 'Uso del plan',
      account: (account: string) => `Cuenta: ${account}`,
      logout: 'Cerrar sesión de la cuenta',
      login: 'Iniciar sesión en la cuenta',
      mcpServers: 'Servidores MCP',
      closeHistory: 'Cerrar historial',
      previousConversations: 'Conversaciones anteriores',
      hidePanel: 'Cerrar panel',
      closeSession: 'Cerrar sesión',
      unfavorite: 'Quitar de favoritos',
      favoriteSession: 'Marcar sesión como favorita',
      moreActions: 'Más acciones de la sesión',
      moreActionsContext: (percent: number) => `Más acciones de la sesión (contexto al ${percent}%)`,
      conversations: 'Conversaciones',
      newConversation: 'Nueva conversación',
      openFolder: 'Abre una carpeta para conversar con Claude Code.',
      starting: 'Iniciando Claude Code…',
      emptyTitle: 'No hay conversaciones abiertas.',
      emptyText:
        'Pide un cambio, resuelve una duda sobre el código o investiga un error. Las ediciones se abren como diff.',
      suggestions: 'Sugerencias',
      suggestExplain: 'Explica este proyecto',
      suggestBugs: 'Encuentra posibles bugs',
      suggestTests: 'Sugiere las pruebas que faltan'
    },
    conversationPane: {
      wakeFailed: 'No se pudo retomar esta conversación.',
      newConversation: 'Nueva conversación',
      authBefore: 'No has iniciado sesión en Claude Code. Inicia sesión desde la terminal (ejecutamos ',
      authAfter:
        ' en la carpeta de la ventana); las conversaciones se reinician solas cuando termina el inicio de sesión.',
      login: 'Iniciar sesión con Claude Code',
      closed: 'La conversación terminó.'
    },
    timeline: {
      label: 'Conversación',
      emptyTitle: 'Nueva sesión',
      emptyText: 'Pregunta sobre el código, pide un cambio o usa / para comandos.',
      emptyHint: '@ menciona archivos y carpetas; las ediciones se abren como diff para que las aceptes.',
      sending: 'Enviando…',
      thinking: 'Pensando…'
    },
    timelineParts: {
      queued: 'En cola',
      openImage: (n: number, total: number) => `Ampliar imagen ${n} de ${total}`,
      imageName: (n: number, total: number) => `Imagen ${n} de ${total}`,
      rewindBoth: 'Código y conversación',
      rewindConversation: 'Solo la conversación',
      rewindCode: 'Solo el código',
      copyMessage: 'Copiar mensaje',
      copyReply: 'Copiar respuesta',
      rewindBusy: 'Espera a que Claude termine para volver',
      rewind: 'Volver a antes de este mensaje',
      compacted: 'Conversación compactada',
      compactedDetail: (tokens: string | null, auto: boolean) =>
        `Conversación compactada${tokens ? ` · ${tokens} tokens antes` : ''}${auto ? ' (automático)' : ''}`,
      scheduledRun: 'Ejecución programada',
      backgroundDone: 'Tarea en segundo plano terminada · Claude continuó',
      blocked: (tool: string, reason: string) => `Bloqueado: ${tool}${reason ? ` (${reason})` : ''}`,
      showLess: 'Mostrar menos',
      showAll: (lines: number) => `Mostrar todo (${lines} líneas)`,
      scrollToMessage: 'Desplazarse hasta tu mensaje',
      replaceAllNote: 'Reemplazo en todas las apariciones: el conteo es de una aparición.',
      overwriteNote: 'Archivo sobrescrito: las líneas eliminadas no se cuentan.',
      linesAdded: 'Líneas agregadas: ',
      linesRemoved: 'Líneas eliminadas: ',
      reviewFile: (path: string) => `Revisar ${path}`,
      review: 'Revisar',
      turnSummary: 'Resumen del turno',
      turnDuration: 'Duración del turno',
      tookTime: (duration: string) => `Tardó ${duration}`,
      backgroundTasks: 'Tareas en segundo plano',
      stopping: 'Deteniendo…',
      stopTask: (who: string) => `Detener ${who}`
    },
    toolRowView: {
      states: {
        running: 'En ejecución',
        done: 'Completado',
        error: 'Falló',
        stopped: 'Interrumpido'
      },
      openInEditor: (target: string) => `Abrir ${target} en el editor`,
      reasoning: 'Razonamiento'
    },
    markdown: {
      copyCode: 'Copiar código'
    },
    promptBox: {
      noActiveFile: 'ningún archivo activo',
      inputLabel: 'Mensaje para Claude',
      placeholderLoading: 'La sesión se está iniciando… ya puedes escribir',
      placeholderWorking: 'Escribe para poner en cola… (Esc interrumpe)',
      placeholder: 'Pregúntale a Claude… (@ archivos, / comandos)',
      suggestionHint: 'Sugerencia, Tab acepta: ',
      attach: 'Adjuntar archivos',
      commandsTitle: 'Comandos (/)',
      commands: 'Comandos',
      autoContextOn: (file: string) => `Contexto automático activado: ${file} y la selección van con el mensaje`,
      autoContextOff: 'Contexto automático desactivado',
      noContext: 'Sin contexto'
    },
    sendControls: {
      stop: 'Detener (Esc)',
      interrupt: 'Interrumpir',
      queueTitle: 'Poner mensaje en cola (Enter)',
      sendTitle: 'Enviar (Enter)',
      queue: 'Poner en cola',
      send: 'Enviar'
    },
    promptMenu: {
      emptyFile: '.claude/commands/nombre.md',
      emptyHint: 'Todavía no hay comandos del proyecto ni personales. Crea {file} en la carpeta o en {dir}.',
      files: 'Archivos',
      commands: 'Comandos'
    },
    find: {
      placeholder: 'Buscar',
      label: 'Buscar en la sesión',
      matchCase: 'Coincidir mayúsculas y minúsculas',
      noResults: 'Sin resultados',
      position: (index: number, count: number) => `${index} de ${count}`,
      previous: 'Resultado anterior (Shift+Enter)',
      next: 'Resultado siguiente (Enter)',
      close: 'Cerrar (Esc)'
    },
    mcpModal: {
      title: 'Servidores MCP',
      addServer: 'Agregar servidor',
      refreshFailed: 'No se pudo actualizar la lista.',
      loadFailed: 'No se pudieron cargar los servidores.',
      loading: 'Cargando servidores…',
      empty: 'No hay servidores MCP configurados.',
      emptyHint: 'Agrega uno para darle nuevas herramientas a Claude.',
      confirmRemove: (name: string) => `¿Quitar «${name}»?`,
      remove: 'Quitar',
      reconnect: 'Reconectar',
      authenticate: 'Autenticar',
      logout: 'Cerrar sesión',
      removeServer: (name: string) => `Quitar ${name}`,
      enableServer: (name: string) => `Activar ${name}`,
      awaitingAuth: 'Esperando la autenticación en el navegador…',
      authUrl: 'URL de autenticación',
      copyUrl: 'Copiar URL',
      callbackUrl: 'Pegar URL de retorno',
      send: 'Enviar',
      server: 'Servidor',
      transport: 'Transporte',
      command: 'Comando',
      url: 'URL',
      variables: 'Variables',
      headers: 'Headers',
      hiddenValues: '(valores ocultos)',
      tools: (n: number) => `Herramientas (${n})`,
      readOnly: 'solo lectura',
      destructive: 'destructiva',
      noTools: 'No expone herramientas.'
    },
    mcpForm: {
      scopes: { local: 'Local', project: 'Proyecto', user: 'Usuario' },
      scopeHints: {
        local: 'Local: solo tú, en este proyecto.',
        project: 'Proyecto: .mcp.json, compartido con el repositorio.',
        user: 'Usuario: todos tus proyectos.'
      },
      name: 'Nombre',
      namePlaceholder: 'mi-servidor',
      commandLine: 'Comando y argumentos',
      commandPlaceholder: 'npx -y @modelcontextprotocol/server-filesystem "/ruta con espacios"',
      url: 'URL',
      urlPlaceholder: 'https://ejemplo.com/mcp',
      envLabel: 'Variables de entorno (opcional)',
      headersLabel: 'Headers (opcional)',
      envPlaceholder: 'CLAVE=valor',
      pairsHint: 'Una por línea, con el formato CLAVE=valor. Los valores solo quedan en el archivo de configuración.',
      scope: 'Ámbito',
      adding: 'Agregando…',
      add: 'Agregar'
    },
    commandArgs: {
      hint: 'Argumentos esperados:',
      send: 'Enviar',
      inputLabel: (name: string) => `Argumentos de /${name}`
    },
    favorites: {
      newFavorite: 'Nuevo command favorito',
      stepCommand: '1 · Command',
      searchCommand: 'Buscar command',
      command: 'Command',
      noneFound: 'No se encontraron commands',
      commandsPending: 'Los commands aparecen cuando la conversación termina de iniciar.',
      allFavorited: 'Todos los commands ya están en favoritos.',
      stepIcon: '2 · Ícono',
      icon: 'Ícono',
      maxFavorites: (n: number) => `Como máximo ${n} favoritos`,
      add: 'Agregar',
      toolbar: 'Commands favoritos',
      runTitle: (command: string) => `${command} (haz clic para ejecutar)`,
      run: (name: string) => `Ejecutar /${name}`,
      remove: 'Quitar de favoritos',
      removeCommand: (name: string) => `Quitar /${name} de favoritos`,
      addFavorite: 'Agregar command favorito',
      emptyHint: 'Fija commands aquí para ejecutarlos con un clic'
    },
    elicitationCard: {
      ariaLabel: (server: string) => `Solicitud del servidor MCP ${server}`,
      kicker: (server: string) => `Servidor MCP · ${server}`,
      closeTitle: 'Cerrar sin responder (Esc)',
      close: 'Cerrar sin responder',
      urlHint: 'Revisa la dirección: se abre en tu navegador.',
      escHint: 'Esc cierra sin responder',
      required: '* obligatorio',
      decline: 'Rechazar',
      openInBrowser: 'Abrir en el navegador',
      send: 'Enviar'
    },
    questionCard: {
      ariaLabel: 'Pregunta de Claude',
      kicker: 'Claude tiene una pregunta',
      skip: 'Omitir, Claude decide por su cuenta',
      questions: 'Preguntas',
      answered: (header: string) => `${header} (respondida)`,
      chooseMany: 'Elige una o más',
      other: 'Otro',
      otherPlaceholder: 'Escribe tu respuesta',
      otherLabel: 'Otro: tu respuesta',
      count: (current: number, total: number) => `${current} de ${total}`,
      keys: (max: number) => `Teclas 1–${max}`,
      back: 'Atrás',
      next: 'Siguiente',
      answerAll: 'Responde todas las preguntas',
      submit: 'Responder'
    },
    permissions: {
      toolAriaLabel: 'Solicitud de permiso',
      denyComment: 'Comentario para Claude (opcional, al denegar)',
      allow: 'Permitir',
      allowAlwaysTitle: 'No vuelve a preguntar por solicitudes parecidas, solo en esta sesión',
      allowAlways: 'Permitir siempre',
      allowWorkspaceTitle:
        'Guarda la regla en .claude/settings.local.json de esta carpeta: también vale en sesiones nuevas',
      allowWorkspace: 'Siempre en este espacio de trabajo',
      deny: 'Denegar',
      editAriaLabel: 'Edición pendiente',
      create: 'Crear',
      edit: 'Editar',
      viewDiff: 'Ver diff',
      accept: 'Aceptar',
      reject: 'Rechazar',
      plan: 'Plan',
      planTitle: 'Plan para revisar',
      runWith: 'Ejecutar con:',
      runMode: 'Modo de ejecución',
      planFeedback: '¿Qué debe cambiar en el plan?',
      approve: 'Aprobar y ejecutar',
      sendAndKeepPlanning: 'Enviar y seguir planificando',
      keepPlanning: 'Seguir planificando'
    },
    promptChips: {
      modeLabel: (mode: string, shortcut: string) => `Modo de ejecución: ${mode} (${shortcut} alterna)`,
      modeLabelBypass: (mode: string, shortcut: string) =>
        `Modo de ejecución: ${mode}, los comandos se ejecutan sin preguntar (${shortcut} alterna)`,
      modeHead: (shortcut: string) => `Modo de ejecución · ${shortcut}`,
      bypassLocked: { before: 'Desactivado. Activa ', after: ' en la configuración del usuario.' },
      searchModel: 'Buscar modelo',
      model: 'Modelo',
      noModels: 'No se encontraron modelos',
      effortGroup: 'Esfuerzo de razonamiento',
      effort: 'Esfuerzo',
      effortKeys: '← → ajustan',
      effortUnsupported: 'Este modelo no admite este nivel',
      effortNote: { before: 'auto usa el valor predeterminado del modelo. ', after: ' solo vale para esta sesión.' },
      modelLabel: (model: string) => `Modelo y esfuerzo: ${model}`,
      modelEffortLabel: (model: string, effort: string) => `Modelo y esfuerzo: ${model}, ${effort}`
    },
    usageModal: {
      title: 'Uso de Claude',
      loading: 'Cargando uso…',
      loadFailed: 'No se pudo cargar el uso.',
      unsupported: 'El Claude Code instalado no informa el uso.',
      unsupportedHint: 'Actualiza Claude Code para ver los límites del plan y el costo de la sesión.',
      planLimits: 'Límites del plan',
      noLimits: 'No se informaron límites.',
      limitsNotApplicable: 'Los límites del plan no se aplican a esta cuenta (clave de API o proveedor externo).',
      extraUsage: 'Uso adicional',
      monthlyOverage: 'Excedente del mes',
      usedOfLimit: (used: string, limit: string) => `${used} de ${limit}`,
      session: 'Sesión',
      thisSession: 'Esta sesión',
      cost: 'Costo',
      totalTime: 'Tiempo total',
      apiTime: 'Tiempo de API',
      lines: 'Líneas',
      model: 'Modelo',
      input: 'Entrada',
      output: 'Salida',
      cache: 'Caché'
    },
    history: {
      title: 'Conversaciones anteriores',
      searchPlaceholder: 'Buscar conversaciones por título',
      search: 'Buscar conversaciones',
      close: 'Cerrar historial',
      empty: 'No hay conversaciones anteriores.',
      noMatch: 'No se encontró nada.',
      favorite: 'Favorita',
      untitled: 'Sin título'
    },
    agentsStrip: {
      title: 'Agentes',
      status: { running: 'Trabajando', done: 'Completado', failed: 'Falló', stopped: 'Interrumpido' },
      now: (summary: string) => `Ahora: ${summary}`
    },
    proposal: {
      reasonPlaceholder: 'Motivo para Claude (opcional)',
      reason: 'Motivo del rechazo',
      reject: 'Rechazar',
      rejectEllipsis: 'Rechazar…',
      accept: 'Aceptar',
      newFile: 'Archivo nuevo propuesto por Claude',
      edit: 'Edición propuesta por Claude'
    },
    attachmentChips: {
      imageAlt: (name: string) => `Imagen adjunta: ${name}`,
      preview: (name: string) => `Ampliar ${name}`,
      remove: (name: string) => `Quitar ${name}`
    },
    useAttachments: {
      pasted: 'pegada',
      image: 'imagen',
      imageTooLarge: (name: string) => `La imagen "${name}" supera los 5 MB.`,
      unsupportedImage: 'Formato de imagen no admitido (usa PNG, JPEG, GIF o WebP).',
      notOnDisk: (name: string) => `No se pudo adjuntar "${name}": el archivo no está en el disco.`
    },
    actions: {
      failed: (message: string) => `Claude: ${message}`,
      openSession: 'Abrir sesión',
      review: 'Revisar',
      toasts: {
        done: 'Claude Code terminó',
        failed: 'Claude Code falló',
        turnFailed: (title: string) => `${title} · el turno terminó con un error`,
        question: 'Claude Code tiene una pregunta',
        mcpNeedsYou: 'Un servidor MCP te necesita',
        needsYou: 'Claude Code te necesita',
        sessionFallback: (from: string, to: string) =>
          `El modelo ${from} rechazó la solicitud; la sesión ahora usa ${to}.`,
        subagentFallback: (from: string, to: string) =>
          `Un subagente se volvió a ejecutar con ${to} después de un rechazo de ${from}.`,
        conversationExported: 'Conversación exportada'
      },
      start: {
        sessionFailed: 'Claude: no se pudo abrir una sesión. Tu pregunta quedó en el cuadro de texto.',
        folderTimeout: 'Claude: la carpeta no se abrió a tiempo.',
        notSent: 'La solicitud no se envió.',
        copyRequest: 'Copiar solicitud'
      },
      openFileForReference: 'Abre un archivo para insertar una referencia.',
      openConversationFailed: 'Claude: no se pudo abrir la conversación ahora.',
      sessionStarting: 'La sesión todavía se está iniciando. Inténtalo de nuevo en unos instantes.',
      waitResume: 'Espera a que se reanude la conversación.',
      forkNotOpened: 'La copia se creó, pero no se pudo abrir ahora. Está en "Conversaciones anteriores".',
      fileOutsideFolder: 'Este archivo está fuera de la carpeta de la ventana.',
      noGitDiff: 'No hay cambios en git para este archivo; abriendo el archivo.',
      conversationEnded: 'La conversación terminó. Abre una nueva.',
      notDelivered: 'No se pudo enviar el mensaje: la sesión no quedó lista. El texto volvió al cuadro.',
      openForMcp: 'Abre una conversación de Claude para administrar los servidores MCP.',
      notStarted: 'La conversación todavía no se inició.',
      openForUsage: 'Abre una conversación de Claude para ver el uso.',
      unavailable: 'La conversación no está disponible.',
      waitToClear: 'Espera a que Claude termine (o interrúmpelo) para limpiar la conversación.',
      clearFailed: 'Claude: no se pudo limpiar la conversación ahora.',
      nothingToRepeat: 'No hay un mensaje anterior para repetir.',
      attachFailed: (name: string, reason: string) => `No se pudo adjuntar "${name}": ${reason}`,
      answerRefused: 'Claude: la respuesta no fue aceptada; revísala e inténtalo de nuevo.',
      fileChangedOnDisk: 'El archivo cambió en el disco. Se rechazó la edición para que Claude la proponga de nuevo.',
      waitToRewind: 'Espera a que Claude termine (o interrúmpelo) para volver.',
      draftKept: 'Se conservó tu borrador; el mensaje anterior se agregó al final.',
      filesRestored: (n: number) =>
        n === 0
          ? 'No fue necesario restaurar ningún archivo.'
          : plural(n, '1 archivo restaurado.', `${n} archivos restaurados.`),
      fileNotFound: (path: string) => `Archivo no encontrado: ${path}`,
      login: {
        notDetected: 'Todavía no detectamos el inicio de sesión. Termínalo en la terminal e inténtalo de nuevo.',
        connectedAs: (email: string) => `Conectado a Claude como ${email}.`,
        connected: 'Conectado a Claude.',
        signingIn: 'Iniciando sesión en Claude…',
        finishInTerminal: 'Termina de iniciar sesión en la terminal. Te avisaremos cuando termine.',
        done: 'Ya inicié sesión'
      },
      logout: {
        confirm: '¿Cerrar sesión en tu cuenta de Claude?',
        detail: 'Las conversaciones abiertas se reiniciarán y tendrás que iniciar sesión de nuevo para continuar.',
        action: 'Cerrar sesión',
        done: 'Cerraste sesión en tu cuenta de Claude.'
      }
    },
    conversation: {
      newTitle: 'Nueva conversación',
      loadStep: {
        wake: 'Reanudando conversación…',
        init: 'Iniciando sesión…',
        mcp: 'Conectando servidores MCP…'
      },
      backgroundKind: {
        agent: 'agente',
        shell: 'comando',
        other: 'tarea'
      },
      backgroundCount: {
        agent: (n: number) => plural(n, '1 agente', `${n} agentes`),
        shell: (n: number) => plural(n, '1 comando', `${n} comandos`),
        other: (n: number) => plural(n, '1 tarea', `${n} tareas`)
      },
      inBackground: (list: string) => `${list} en segundo plano`
    },
    prompt: {
      localCommands: {
        login: 'Iniciar sesión en la cuenta de Claude (abre la terminal)',
        logout: 'Cerrar sesión en la cuenta de Claude',
        usage: 'Uso del plan y costo de la sesión'
      },
      groups: {
        project: 'Proyecto',
        user: 'Personales'
      }
    },
    turnSummary: {
      filesChanged: (n: number) => plural(n, '1 archivo modificado', `${n} archivos modificados`)
    },
    toolRow: {
      labels: {
        read: 'Leyó',
        write: 'Creó',
        edit: 'Editó',
        output: 'Salida',
        grep: 'Buscó',
        list: 'Listó',
        fetch: 'Abrió',
        webSearch: 'Investigó',
        agent: 'Agente',
        todos: 'Tareas',
        asked: 'Preguntó',
        plan: 'Plan',
        skill: 'Skill',
        command: 'Comando'
      },
      omittedLines: (n: number) => `… ${n} líneas omitidas`,
      noOutput: '(sin salida)',
      lines: (n: number) => plural(n, '1 línea', `${n} líneas`),
      results: (n: number) => plural(n, '1 resultado', `${n} resultados`),
      todosDone: (done: number, total: number) => `${done} de ${total} completadas`
    },
    tools: {
      read: 'Leer',
      edit: 'Editar',
      write: 'Escribir',
      editNotebook: 'Editar notebook',
      findFiles: 'Buscar archivos',
      search: 'Buscar',
      fetch: 'Abrir página',
      webSearch: 'Buscar en la web',
      subagent: 'Subagente',
      todos: 'Tareas',
      asked: 'Preguntó',
      plan: 'Plan',
      items: (n: number) => plural(n, '1 elemento', `${n} elementos`),
      omittedChars: (n: number) => `(${n} caracteres omitidos)`
    },
    agents: {
      defaultName: 'Agente',
      title: 'Agentes',
      running: (n: number) => `${n} trabajando`,
      done: (n: number) => plural(n, '1 completado', `${n} completados`),
      failed: (n: number) => plural(n, '1 falló', `${n} fallaron`),
      stopped: (n: number) => plural(n, '1 interrumpido', `${n} interrumpidos`)
    },
    agentStatus: {
      running: 'Claude Code trabajando',
      done: 'Claude Code terminó',
      attention: 'Claude Code te espera',
      error: 'Claude Code falló'
    },
    progress: {
      tokens: (n: number) => plural(n, '1 token', `${n} tokens`),
      thousandTokens: (n: string) => `${n} mil tokens`,
      millionTokens: (n: string) => `${n} M de tokens`,
      tools: (n: number) => plural(n, '1 herramienta', `${n} herramientas`)
    },
    mcp: {
      groups: {
        project: 'Proyecto',
        local: 'Local',
        user: 'Usuario',
        claudeai: 'claude.ai',
        plugin: 'Plugins',
        other: 'Integrados y otros'
      },
      status: {
        connected: 'Conectado',
        failed: 'Falló',
        needsAuth: 'Requiere autenticación',
        pending: 'Conectando…',
        disabled: 'Desactivado',
        unknown: 'Desconocido'
      },
      toolCount: (n: number) => plural(n, '1 herramienta', `${n} herramientas`),
      errors: {
        pairFormat: (line: number) => `Línea ${line}: usa CLAVE=valor.`,
        pairName: (line: number, key: string) => `Línea ${line}: nombre no válido "${key}".`,
        name: 'Usa letras, números, "-" y "_" (hasta 64).',
        unclosedQuotes: 'Comillas sin cerrar.',
        commandRequired: 'Escribe el comando.',
        urlScheme: 'La URL debe comenzar con http:// o https://.',
        urlInvalid: 'URL no válida.',
        urlRequired: 'Escribe la URL.'
      }
    },
    elicitation: {
      chooseOption: 'Elige una opción.',
      required: 'Campo obligatorio.',
      number: 'Escribe un número.',
      invalidValue: 'Valor no válido.',
      minLength: (n: string) => `Usa al menos ${n} caracteres.`,
      maxLength: (n: string) => `Usa como máximo ${n} caracteres.`,
      minimum: (n: string) => `El valor mínimo es ${n}.`,
      maximum: (n: string) => `El valor máximo es ${n}.`,
      integer: 'Escribe un número entero.',
      email: 'Correo electrónico no válido.',
      uri: 'Dirección no válida (p. ej.: https://ejemplo.com).',
      date: 'Fecha no válida.',
      dateTime: 'Fecha y hora no válidas.',
      option: 'Opción no válida.'
    },
    modes: {
      default: 'Pregunta antes de editar archivos y de ejecutar comandos.',
      acceptEdits: 'Edita archivos por su cuenta; pregunta antes de ejecutar comandos.',
      plan: 'Solo lee y propone un plan. Nada cambia hasta que lo apruebes.',
      planNote: 'Plan: Claude solo lee y propone; nada cambia hasta que lo apruebes',
      auto: 'Edita y ejecuta comandos seguros; pregunta solo en lo riesgoso.',
      bypassPermissions: 'Ejecuta todo sin preguntar. Solo en un entorno aislado.'
    },
    rateLimit: {
      windows: {
        five_hour: 'de 5 horas',
        seven_day: 'semanal',
        seven_day_opus: 'semanal de Opus',
        seven_day_sonnet: 'semanal de Sonnet',
        overage: 'de créditos extra',
        other: 'de uso'
      },
      today: (time: string) => `a las ${time}`,
      tomorrow: (time: string) => `mañana a las ${time}`,
      onDate: (date: string, time: string) => `el ${date} a las ${time}`,
      reached: (label: string) => `Alcanzaste el límite ${label}`,
      used: (percent: number, label: string) => `Usaste el ${percent}% del límite ${label}`,
      near: (label: string) => `Estás cerca del límite ${label}`,
      renews: (when: string) => `se renueva ${when}`,
      usingOverage: 'usando créditos extra'
    },
    usage: {
      resetNow: 'se reinicia ahora',
      resetMinutes: (minutes: number) => `se reinicia en ${minutes} min`,
      resetHours: (hours: number, minutes: string) => `se reinicia en ${hours} h ${minutes} min`,
      resetDays: (days: number, hours: number) =>
        `se reinicia en ${days} ${plural(days, 'día', 'días')}${hours ? ` ${hours} h` : ''}`,
      used: (percent: number) => `${percent}% usado`,
      unknown: 'uso no informado',
      freePlan: 'Gratis'
    },
    retry: {
      connection: 'Error de conexión',
      overloaded: 'Servidor sobrecargado',
      tooMany: 'Demasiadas solicitudes',
      server: (status: number) => `Error del servidor (${status})`,
      api: (status: number) => `Error de la API (${status})`,
      lead: (cause: string, attempt: number, max: number) => `${cause}, reintentando (${attempt}/${max})`,
      countdown: (seconds: number) => ` en ${seconds} s`,
      now: ' ahora'
    },
    modelName: {
      default: 'Predeterminado'
    },
    context: {
      taskCompleted: 'Tarea en segundo plano completada',
      taskFailed: 'Tarea en segundo plano fallida',
      taskStopped: 'Tarea en segundo plano interrumpida',
      taskWithSummary: (lead: string, summary: string) => `${lead}: ${summary}`
    },
    thinkingWords: {
      words:
        'Cavilando|Rumiando|Desmenuzando|Buscando ideas|Cocinando|Maquinando|Tejiendo|Conjeturando|Cogitando|' +
        'Puliendo|Escudriñando|Hilvanando|Desenrollando|Tamizando|Lapidando|Fermentando|Destilando|Masticando|' +
        'Arquitectando|Tramando|Descifrando|Cosiendo ideas|Desglosando|Indagando|Ponderando|Excavando|Destejiendo|' +
        'Tricotando|Hurgando|Garabateando|Calibrando|Archivando mentalmente|Siguiendo pistas|Dándole vueltas|' +
        'Girando|Alquimizando|Desenredando|Esculpiendo|Rebuscando|Mapeando el terreno'
    }
  }
})
