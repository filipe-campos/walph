import { defineMessages, plural } from '../define'

export const git = defineMessages({
  'pt-BR': {
    view: {
      title: 'Controle de Código',
      openFolder: 'Abra uma pasta para usar o Git.',
      notARepo: 'Esta pasta não é um repositório Git.',
      initRepo: 'Inicializar Repositório',
      pull: 'Pull',
      push: 'Push',
      staged: 'Staged',
      unstageAll: 'Remover tudo do stage',
      unstage: 'Remover do stage',
      changes: 'Alterações',
      discardAll: 'Descartar todas as alterações',
      stageAll: 'Adicionar tudo ao stage',
      openFile: 'Abrir arquivo',
      discard: 'Descartar alterações',
      stage: 'Adicionar ao stage',
      noChanges: 'Nenhuma alteração.'
    },
    commitBox: {
      noMessage: 'Escreva a mensagem do commit',
      nothingStaged: 'Adicione arquivos ao stage primeiro',
      placeholder: (keys: string, branch: string) => `Mensagem (${keys}Enter para commit em "${branch}")`,
      amendPlaceholder: (keys: string, branch: string) =>
        `Mensagem (${keys}Enter para alterar o commit em "${branch}")`,
      amendTitle: 'Substitui o último commit pelo stage atual e esta mensagem',
      amendLabel: 'Amend (alterar o último commit)',
      commit: 'Commit',
      amend: 'Alterar Commit'
    },
    stashes: {
      title: 'Stashes',
      apply: 'Aplicar',
      pop: 'Aplicar e remover (pop)',
      drop: 'Remover',
      save: 'Guardar alterações (stash)…',
      empty: 'Nenhum stash.'
    },
    history: {
      title: 'Histórico',
      noFiles: 'Nenhum arquivo alterado.',
      renamedFrom: (path: string) => `(de ${path})`,
      noCommits: 'Nenhum commit ainda.',
      loadMore: 'Carregar mais',
      error: (detail: string) => `Histórico: ${detail}`
    },
    status: {
      M: 'Modificado',
      A: 'Adicionado',
      D: 'Removido',
      R: 'Renomeado',
      C: 'Copiado',
      T: 'Tipo alterado',
      U: 'Conflito',
      untracked: 'Não rastreado'
    },
    sync: {
      toPush: (n: number) => `${n} ${plural(n, 'commit', 'commits')} para enviar`,
      toPull: (n: number) => `${n} ${plural(n, 'commit', 'commits')} para receber`,
      synced: (upstream: string) => `Sincronizado com ${upstream}`
    },
    operation: {
      pull: 'Recebendo…',
      push: 'Enviando…',
      sync: 'Sincronizando…'
    },
    done: {
      pull: 'Pull concluído',
      push: 'Push concluído',
      sync: 'Sincronização concluída'
    },
    actions: {
      branchCreated: (name: string) => `Branch "${name}" criada.`,
      noBranchToPublish: 'Não há branch para publicar (HEAD destacado).',
      publishConfirm: (branch: string) => `A branch "${branch}" não tem upstream. Publicar em origin?`,
      publishDetail: (branch: string) => `Executa "git push -u origin ${branch}".`,
      publish: 'Publicar',
      published: (branch: string) => `Branch "${branch}" publicada em origin.`,
      amended: 'Último commit alterado.',
      undoneKeptDraft: 'Último commit desfeito; as alterações voltaram para o stage.',
      undoneRestoredMessage: 'Último commit desfeito. A mensagem voltou para a caixa de commit.',
      nothingToDiscard: 'Não há alterações para descartar.',
      cannotBeUndone: 'Esta ação não pode ser desfeita.',
      untrackedToTrash: (n: number) =>
        n === 1
          ? 'O arquivo não rastreado será movido para a lixeira.'
          : `${n} arquivos não rastreados serão movidos para a lixeira.`,
      discardConfirmOne: (name: string) => `Descartar as alterações de "${name}"?`,
      discardConfirmMany: (n: number) => `Descartar as alterações de ${n} arquivos?`,
      discard: 'Descartar',
      stashSaved: 'Alterações guardadas no stash.',
      stashApplied: 'Stash aplicado.',
      stashPopped: 'Stash aplicado e removido.',
      stashDropConfirm: (label: string) => `Remover o stash "${label}"?`,
      stashDropConfirmRef: (ref: string) => `Remover o stash ${ref}?`,
      stashDrop: 'Remover',
      stashDropped: 'Stash removido.',
      stashError: (detail: string) => `Stash: ${detail}`,
      noStashes: 'Não há stashes neste repositório.'
    },
    clone: {
      inProgress: 'Já há uma clonagem em andamento.',
      cancelled: 'Clonagem cancelada.',
      cloning: (name: string) => `Clonando ${name}…`,
      cloned: (name: string) => `${name} clonado.`,
      pickTitle: 'Escolha onde clonar',
      pickButton: 'Clonar aqui',
      folderExists: (name: string, parent: string) => `A pasta "${name}" já existe em ${parent}.`,
      mkdirFailed: (name: string, parent: string, detail: string) =>
        `Não foi possível criar a pasta "${name}" em ${parent}: ${detail}`,
      gitNotFound: 'Git não encontrado. Instale o git e tente de novo.',
      spawnFailed: (detail: string) => `Falha ao iniciar o git: ${detail}`,
      stages: {
        connecting: 'Conectando',
        enumerating: 'Enumerando objetos',
        counting: 'Contando objetos',
        compressing: 'Comprimindo objetos',
        receiving: 'Recebendo objetos',
        resolving: 'Resolvendo deltas',
        updating: 'Atualizando arquivos'
      },
      url: {
        invalid: (reason: string) => `URL de clone inválida: ${reason}`,
        badHost: 'host ausente ou inválido.',
        noFolderName: 'não foi possível descobrir o nome da pasta a partir da URL.',
        notAString: 'informe uma URL.',
        empty: 'informe a URL do repositório.',
        tooLong: 'a URL é longa demais.',
        dashPrefix: 'URLs que começam com "-" não são aceitas.',
        transportNotAllowed: (helper: string) => `Transporte "${helper}::" não é permitido.`,
        controlChars: 'a URL não pode ter espaços nem caracteres de controle.',
        fileNotAllowed: 'URLs "file://" não são aceitas.',
        protocolNotAllowed: (name: string) =>
          `o protocolo "${name}://" não é aceito. Use https://, ssh:// ou usuario@host:caminho.`,
        unparseable: 'a URL não pôde ser interpretada.',
        localPath: 'caminhos locais não são aceitos. Use https://, ssh:// ou usuario@host:caminho.',
        unsupported: 'use https://, ssh:// ou usuario@host:caminho.'
      }
    },
    merge: {
      title: 'Alterações de Merge',
      markResolved: 'Marcar como resolvido (stage)',
      markResolvedConfirm: (name: string) =>
        `"${name}" ainda tem marcadores de conflito. Marcar como resolvido mesmo assim?`,
      markResolvedButton: 'Marcar como resolvido',
      inProgress: {
        merge: 'Merge em andamento',
        rebase: 'Rebase em andamento',
        cherryPick: 'Cherry-pick em andamento',
        revert: 'Revert em andamento'
      },
      abort: {
        merge: 'Abortar Merge',
        rebase: 'Abortar Rebase',
        cherryPick: 'Abortar Cherry-pick',
        revert: 'Abortar Revert'
      },
      abortConfirm: {
        merge: 'Abortar o merge em andamento?',
        rebase: 'Abortar o rebase em andamento?',
        cherryPick: 'Abortar o cherry-pick em andamento?',
        revert: 'Abortar o revert em andamento?'
      },
      abortDetail:
        'O repositório volta ao estado de antes da operação e as resoluções de conflito feitas são perdidas.',
      aborted: 'Operação abortada.',
      acceptCurrent: 'Aceitar Alteração Atual',
      acceptIncoming: 'Aceitar Alteração de Entrada',
      acceptBoth: 'Aceitar Ambas as Alterações',
      compare: 'Comparar Alterações',
      currentChange: '(Alteração Atual)',
      incomingChange: '(Alteração de Entrada)',
      conflictActions: 'Ações do conflito',
      noConflicts: 'Nenhum conflito de merge neste arquivo.',
      compareHeader: 'Alteração atual ↔ alteração de entrada'
    },
    hunks: {
      stage: 'Stage do trecho',
      unstage: 'Unstage do trecho',
      revert: 'Reverter trecho',
      actions: 'Ações do trecho',
      nothingSelected: 'Nenhuma alteração nas linhas selecionadas.',
      saveFirst: 'Salve o arquivo antes de reverter pelo diff: ele tem alterações não salvas.',
      revertConfirm: (name: string) => `Reverter as alterações selecionadas de "${name}" no disco?`,
      revertButton: 'Reverter'
    },
    blame: {
      uncommitted: 'Não commitado ainda',
      inline: (author: string, when: string, summary: string) => `${author}, ${when} • ${summary}`,
      status: (author: string, when: string) => `${author}, ${when}`,
      statusAria: (author: string, when: string, summary: string) => `Blame da linha: ${author}, ${when}, ${summary}`,
      title: (hash: string, author: string, date: string, summary: string) =>
        `${hash} · ${author} · ${date}\n${summary}`,
      showInHistory: 'Mostrar no Histórico',
      details: 'Detalhes do commit'
    },
    errors: {
      onlyOwnFolder: 'Só é possível usar o git na pasta aberta nesta janela.',
      notARepo: 'A pasta aberta não é um repositório git.',
      fileOutsideRepo: 'O arquivo está fora do repositório.',
      noFiles: 'Nenhum arquivo informado.',
      invalidFile: 'Arquivo inválido.',
      invalidCommit: 'Commit inválido.',
      invalidStash: 'Stash inválido.',
      invalidBranchName: 'Nome de branch inválido.',
      invalidRef: 'Referência inválida.',
      invalidCommitMessage: 'Mensagem de commit inválida.',
      enterCommitMessage: 'Digite uma mensagem de commit.',
      noCommitToUndo: 'Não há commit para desfazer.',
      detachedNoCommitToUndo: 'HEAD destacado: não há commit para desfazer nesta branch.',
      detachedNoSync: 'HEAD destacado: não há branch para sincronizar.',
      remoteBranchNotFound: 'Branch remota não encontrada.',
      invalidPagination: 'Paginação inválida.',
      commitNotFound: 'Commit não encontrado.',
      stashNotFound: 'Stash não encontrado. Atualize a lista e tente de novo.',
      stashChanged: 'O stash mudou desde que a lista foi carregada. Atualize a lista e tente de novo.',
      conflictDiscard: 'Arquivo em conflito: resolva o conflito antes de descartar.',
      networkCancelled: 'A operação de rede foi cancelada.',
      networkTimeout: 'A operação de rede demorou demais e foi cancelada.',
      cancelled: 'A operação do Git foi cancelada.',
      timeout:
        'O Git demorou demais para responder (um hook ou um pedido de senha pode estar travado) e foi cancelado.',
      exitCode: (command: string, code: string) => `git ${command} terminou com código ${code}`,
      noRemote: 'Nenhum remoto configurado.',
      ambiguousRemote: 'Há vários remotos e nenhum se chama origin. Publique a branch pelo terminal integrado.',
      localUpstream: 'O upstream desta branch é local. Envie pelo terminal integrado.',
      auth: 'Falha de autenticação no remoto. Configure as credenciais pelo terminal integrado (ex.: rode `git push` lá) e tente de novo.',
      stashPopConflict:
        'Conflitos ao aplicar o stash. Ele foi mantido na pilha; resolva os conflitos e remova-o depois.',
      stashApplyConflict: 'Conflitos ao aplicar o stash. Resolva-os nos arquivos marcados.',
      nothingToStash: 'Não há alterações locais para guardar no stash.',
      noInitialCommit: 'O repositório ainda não tem nenhum commit.',
      wouldOverwrite:
        'Há alterações locais que seriam sobrescritas. Faça commit, guarde em stash ou descarte-as e tente de novo.',
      diverged:
        'A branch local e a remota divergiram e não é possível avançar (fast-forward). Faça merge ou rebase pelo terminal integrado.',
      pushRejected: 'O remoto tem commits que você ainda não tem (push rejeitado). Faça pull antes de enviar.',
      noUpstream: 'A branch atual não tem upstream configurado. Publique a branch para criá-lo.',
      nothingToPush: 'Não há nada para enviar: faça um commit primeiro.',
      invalidRemote: 'Remoto inválido ou não configurado.',
      network: 'Não foi possível conectar ao remoto. Verifique sua conexão e tente de novo.',
      branchExists: 'Já existe uma branch com esse nome.',
      nothingToCommit: 'Não há nada para commitar.',
      noIdentity:
        'Identidade do git não configurada. Defina `user.name` e `user.email` (ex.: pelo terminal integrado).',
      indexLock:
        'Outro processo do git está em execução neste repositório (arquivo index.lock). Tente de novo em instantes.',
      cloneTargetExists: 'A pasta de destino já existe e não está vazia.',
      cloneNotFound:
        'Repositório não encontrado, ou sem permissão de acesso. Confira a URL e, se for privado, configure as credenciais pelo terminal integrado (ex.: rode `git clone` lá).',
      cloneFailed: (detail: string) => `Não foi possível clonar o repositório: ${detail}`,
      cloneFailedGeneric: 'Não foi possível clonar o repositório.',
      invalidRanges: 'Linhas inválidas.',
      fileTooLarge: 'O arquivo é grande demais para stage por trecho.',
      binaryRanges: 'Arquivo binário: faça o stage do arquivo inteiro.',
      invalidContents: 'Conteúdo inválido.',
      noOperation: 'Não há merge, rebase, cherry-pick ou revert em andamento.'
    }
  },
  en: {
    view: {
      title: 'Source Control',
      openFolder: 'Open a folder to use Git.',
      notARepo: 'This folder is not a Git repository.',
      initRepo: 'Initialize Repository',
      pull: 'Pull',
      push: 'Push',
      staged: 'Staged',
      unstageAll: 'Unstage All',
      unstage: 'Unstage',
      changes: 'Changes',
      discardAll: 'Discard All Changes',
      stageAll: 'Stage All',
      openFile: 'Open File',
      discard: 'Discard Changes',
      stage: 'Stage',
      noChanges: 'No changes.'
    },
    commitBox: {
      noMessage: 'Write the commit message',
      nothingStaged: 'Stage some files first',
      placeholder: (keys: string, branch: string) => `Message (${keys}Enter to commit on "${branch}")`,
      amendPlaceholder: (keys: string, branch: string) => `Message (${keys}Enter to amend the commit on "${branch}")`,
      amendTitle: 'Replaces the last commit with the current stage and this message',
      amendLabel: 'Amend (change the last commit)',
      commit: 'Commit',
      amend: 'Amend Commit'
    },
    stashes: {
      title: 'Stashes',
      apply: 'Apply',
      pop: 'Apply and Drop (Pop)',
      drop: 'Drop',
      save: 'Stash Changes…',
      empty: 'No stashes.'
    },
    history: {
      title: 'History',
      noFiles: 'No files changed.',
      renamedFrom: (path: string) => `(from ${path})`,
      noCommits: 'No commits yet.',
      loadMore: 'Load More',
      error: (detail: string) => `History: ${detail}`
    },
    status: {
      M: 'Modified',
      A: 'Added',
      D: 'Deleted',
      R: 'Renamed',
      C: 'Copied',
      T: 'Type changed',
      U: 'Conflict',
      untracked: 'Untracked'
    },
    sync: {
      toPush: (n: number) => `${n} ${plural(n, 'commit', 'commits')} to push`,
      toPull: (n: number) => `${n} ${plural(n, 'commit', 'commits')} to pull`,
      synced: (upstream: string) => `In sync with ${upstream}`
    },
    operation: {
      pull: 'Pulling…',
      push: 'Pushing…',
      sync: 'Syncing…'
    },
    done: {
      pull: 'Pull complete',
      push: 'Push complete',
      sync: 'Sync complete'
    },
    actions: {
      branchCreated: (name: string) => `Branch "${name}" created.`,
      noBranchToPublish: 'There is no branch to publish (detached HEAD).',
      publishConfirm: (branch: string) => `The branch "${branch}" has no upstream. Publish to origin?`,
      publishDetail: (branch: string) => `Runs "git push -u origin ${branch}".`,
      publish: 'Publish',
      published: (branch: string) => `Branch "${branch}" published to origin.`,
      amended: 'Last commit amended.',
      undoneKeptDraft: 'Last commit undone; the changes are back in the stage.',
      undoneRestoredMessage: 'Last commit undone. The message is back in the commit box.',
      nothingToDiscard: 'There are no changes to discard.',
      cannotBeUndone: 'This action cannot be undone.',
      untrackedToTrash: (n: number) =>
        n === 1 ? 'The untracked file will be moved to the trash.' : `${n} untracked files will be moved to the trash.`,
      discardConfirmOne: (name: string) => `Discard the changes to "${name}"?`,
      discardConfirmMany: (n: number) => `Discard the changes to ${n} files?`,
      discard: 'Discard',
      stashSaved: 'Changes stashed.',
      stashApplied: 'Stash applied.',
      stashPopped: 'Stash applied and dropped.',
      stashDropConfirm: (label: string) => `Drop the stash "${label}"?`,
      stashDropConfirmRef: (ref: string) => `Drop the stash ${ref}?`,
      stashDrop: 'Drop',
      stashDropped: 'Stash dropped.',
      stashError: (detail: string) => `Stash: ${detail}`,
      noStashes: 'There are no stashes in this repository.'
    },
    clone: {
      inProgress: 'A clone is already in progress.',
      cancelled: 'Clone cancelled.',
      cloning: (name: string) => `Cloning ${name}…`,
      cloned: (name: string) => `${name} cloned.`,
      pickTitle: 'Choose where to clone',
      pickButton: 'Clone Here',
      folderExists: (name: string, parent: string) => `The folder "${name}" already exists in ${parent}.`,
      mkdirFailed: (name: string, parent: string, detail: string) =>
        `Could not create the folder "${name}" in ${parent}: ${detail}`,
      gitNotFound: 'Git not found. Install git and try again.',
      spawnFailed: (detail: string) => `Failed to start git: ${detail}`,
      stages: {
        connecting: 'Connecting',
        enumerating: 'Enumerating objects',
        counting: 'Counting objects',
        compressing: 'Compressing objects',
        receiving: 'Receiving objects',
        resolving: 'Resolving deltas',
        updating: 'Updating files'
      },
      url: {
        invalid: (reason: string) => `Invalid clone URL: ${reason}`,
        badHost: 'missing or invalid host.',
        noFolderName: 'could not determine the folder name from the URL.',
        notAString: 'enter a URL.',
        empty: 'enter the repository URL.',
        tooLong: 'the URL is too long.',
        dashPrefix: 'URLs starting with "-" are not accepted.',
        transportNotAllowed: (helper: string) => `The "${helper}::" transport is not allowed.`,
        controlChars: 'the URL cannot contain spaces or control characters.',
        fileNotAllowed: '"file://" URLs are not accepted.',
        protocolNotAllowed: (name: string) =>
          `the "${name}://" protocol is not accepted. Use https://, ssh:// or user@host:path.`,
        unparseable: 'the URL could not be parsed.',
        localPath: 'local paths are not accepted. Use https://, ssh:// or user@host:path.',
        unsupported: 'use https://, ssh:// or user@host:path.'
      }
    },
    merge: {
      title: 'Merge Changes',
      markResolved: 'Mark as Resolved (Stage)',
      markResolvedConfirm: (name: string) => `"${name}" still has conflict markers. Mark it as resolved anyway?`,
      markResolvedButton: 'Mark as Resolved',
      inProgress: {
        merge: 'Merge in progress',
        rebase: 'Rebase in progress',
        cherryPick: 'Cherry-pick in progress',
        revert: 'Revert in progress'
      },
      abort: {
        merge: 'Abort Merge',
        rebase: 'Abort Rebase',
        cherryPick: 'Abort Cherry-Pick',
        revert: 'Abort Revert'
      },
      abortConfirm: {
        merge: 'Abort the merge in progress?',
        rebase: 'Abort the rebase in progress?',
        cherryPick: 'Abort the cherry-pick in progress?',
        revert: 'Abort the revert in progress?'
      },
      abortDetail:
        'The repository goes back to the state before the operation and the conflict resolutions made are lost.',
      aborted: 'Operation aborted.',
      acceptCurrent: 'Accept Current Change',
      acceptIncoming: 'Accept Incoming Change',
      acceptBoth: 'Accept Both Changes',
      compare: 'Compare Changes',
      currentChange: '(Current Change)',
      incomingChange: '(Incoming Change)',
      conflictActions: 'Conflict actions',
      noConflicts: 'No merge conflicts in this file.',
      compareHeader: 'Current change ↔ incoming change'
    },
    hunks: {
      stage: 'Stage Hunk',
      unstage: 'Unstage Hunk',
      revert: 'Revert Hunk',
      actions: 'Hunk actions',
      nothingSelected: 'No changes in the selected lines.',
      saveFirst: 'Save the file before reverting from the diff: it has unsaved changes.',
      revertConfirm: (name: string) => `Revert the selected changes of "${name}" on disk?`,
      revertButton: 'Revert'
    },
    blame: {
      uncommitted: 'Not Committed Yet',
      inline: (author: string, when: string, summary: string) => `${author}, ${when} • ${summary}`,
      status: (author: string, when: string) => `${author}, ${when}`,
      statusAria: (author: string, when: string, summary: string) => `Line blame: ${author}, ${when}, ${summary}`,
      title: (hash: string, author: string, date: string, summary: string) =>
        `${hash} · ${author} · ${date}\n${summary}`,
      showInHistory: 'Show in History',
      details: 'Commit details'
    },
    errors: {
      onlyOwnFolder: 'Git can only be used in the folder open in this window.',
      notARepo: 'The open folder is not a git repository.',
      fileOutsideRepo: 'The file is outside the repository.',
      noFiles: 'No file given.',
      invalidFile: 'Invalid file.',
      invalidCommit: 'Invalid commit.',
      invalidStash: 'Invalid stash.',
      invalidBranchName: 'Invalid branch name.',
      invalidRef: 'Invalid reference.',
      invalidCommitMessage: 'Invalid commit message.',
      enterCommitMessage: 'Enter a commit message.',
      noCommitToUndo: 'There is no commit to undo.',
      detachedNoCommitToUndo: 'Detached HEAD: there is no commit to undo on this branch.',
      detachedNoSync: 'Detached HEAD: there is no branch to sync.',
      remoteBranchNotFound: 'Remote branch not found.',
      invalidPagination: 'Invalid pagination.',
      commitNotFound: 'Commit not found.',
      stashNotFound: 'Stash not found. Refresh the list and try again.',
      stashChanged: 'The stash changed since the list was loaded. Refresh the list and try again.',
      conflictDiscard: 'File in conflict: resolve the conflict before discarding.',
      networkCancelled: 'The network operation was cancelled.',
      networkTimeout: 'The network operation took too long and was cancelled.',
      cancelled: 'The Git operation was cancelled.',
      timeout: 'Git took too long to respond (a hook or a password prompt may be stuck) and was cancelled.',
      exitCode: (command: string, code: string) => `git ${command} exited with code ${code}`,
      noRemote: 'No remote configured.',
      ambiguousRemote:
        'There are several remotes and none is named origin. Publish the branch from the integrated terminal.',
      localUpstream: "This branch's upstream is local. Push from the integrated terminal.",
      auth: 'Authentication with the remote failed. Set up the credentials in the integrated terminal (e.g. run `git push` there) and try again.',
      stashPopConflict:
        'Conflicts while applying the stash. It was kept on the stack; resolve the conflicts and drop it afterwards.',
      stashApplyConflict: 'Conflicts while applying the stash. Resolve them in the marked files.',
      nothingToStash: 'There are no local changes to stash.',
      noInitialCommit: 'The repository has no commits yet.',
      wouldOverwrite: 'There are local changes that would be overwritten. Commit, stash or discard them and try again.',
      diverged:
        'The local and remote branches have diverged and cannot fast-forward. Merge or rebase from the integrated terminal.',
      pushRejected: 'The remote has commits you do not have yet (push rejected). Pull before pushing.',
      noUpstream: 'The current branch has no upstream configured. Publish the branch to create it.',
      nothingToPush: 'There is nothing to push: make a commit first.',
      invalidRemote: 'Invalid or unconfigured remote.',
      network: 'Could not connect to the remote. Check your connection and try again.',
      branchExists: 'A branch with that name already exists.',
      nothingToCommit: 'There is nothing to commit.',
      noIdentity: 'Git identity not configured. Set `user.name` and `user.email` (e.g. from the integrated terminal).',
      indexLock: 'Another git process is running in this repository (index.lock file). Try again in a moment.',
      cloneTargetExists: 'The destination folder already exists and is not empty.',
      cloneNotFound:
        'Repository not found, or no access permission. Check the URL and, if it is private, set up the credentials in the integrated terminal (e.g. run `git clone` there).',
      cloneFailed: (detail: string) => `Could not clone the repository: ${detail}`,
      cloneFailedGeneric: 'Could not clone the repository.',
      invalidRanges: 'Invalid line ranges.',
      fileTooLarge: 'The file is too large to stage by hunk.',
      binaryRanges: 'Binary file: stage the whole file.',
      invalidContents: 'Invalid contents.',
      noOperation: 'There is no merge, rebase, cherry-pick or revert in progress.'
    }
  },
  es: {
    view: {
      title: 'Control de código fuente',
      openFolder: 'Abre una carpeta para usar Git.',
      notARepo: 'Esta carpeta no es un repositorio Git.',
      initRepo: 'Inicializar repositorio',
      pull: 'Pull',
      push: 'Push',
      staged: 'Staged',
      unstageAll: 'Quitar todo del stage',
      unstage: 'Quitar del stage',
      changes: 'Cambios',
      discardAll: 'Descartar todos los cambios',
      stageAll: 'Agregar todo al stage',
      openFile: 'Abrir archivo',
      discard: 'Descartar cambios',
      stage: 'Agregar al stage',
      noChanges: 'No hay cambios.'
    },
    commitBox: {
      noMessage: 'Escribe el mensaje del commit',
      nothingStaged: 'Primero agrega archivos al stage',
      placeholder: (keys: string, branch: string) => `Mensaje (${keys}Enter para hacer commit en "${branch}")`,
      amendPlaceholder: (keys: string, branch: string) =>
        `Mensaje (${keys}Enter para modificar el commit en "${branch}")`,
      amendTitle: 'Reemplaza el último commit con el stage actual y este mensaje',
      amendLabel: 'Amend (modificar el último commit)',
      commit: 'Commit',
      amend: 'Modificar commit'
    },
    stashes: {
      title: 'Stashes',
      apply: 'Aplicar',
      pop: 'Aplicar y eliminar (pop)',
      drop: 'Eliminar',
      save: 'Guardar cambios (stash)…',
      empty: 'No hay stashes.'
    },
    history: {
      title: 'Historial',
      noFiles: 'No hay archivos modificados.',
      renamedFrom: (path: string) => `(desde ${path})`,
      noCommits: 'Todavía no hay commits.',
      loadMore: 'Cargar más',
      error: (detail: string) => `Historial: ${detail}`
    },
    status: {
      M: 'Modificado',
      A: 'Agregado',
      D: 'Eliminado',
      R: 'Renombrado',
      C: 'Copiado',
      T: 'Tipo cambiado',
      U: 'Conflicto',
      untracked: 'Sin seguimiento'
    },
    sync: {
      toPush: (n: number) => `${n} ${plural(n, 'commit', 'commits')} por enviar`,
      toPull: (n: number) => `${n} ${plural(n, 'commit', 'commits')} por recibir`,
      synced: (upstream: string) => `Sincronizado con ${upstream}`
    },
    operation: {
      pull: 'Recibiendo…',
      push: 'Enviando…',
      sync: 'Sincronizando…'
    },
    done: {
      pull: 'Pull completado',
      push: 'Push completado',
      sync: 'Sincronización completada'
    },
    actions: {
      branchCreated: (name: string) => `Rama "${name}" creada.`,
      noBranchToPublish: 'No hay ninguna rama para publicar (HEAD separado).',
      publishConfirm: (branch: string) => `La rama "${branch}" no tiene upstream. ¿Publicar en origin?`,
      publishDetail: (branch: string) => `Ejecuta "git push -u origin ${branch}".`,
      publish: 'Publicar',
      published: (branch: string) => `Rama "${branch}" publicada en origin.`,
      amended: 'Último commit modificado.',
      undoneKeptDraft: 'Último commit deshecho; los cambios volvieron al stage.',
      undoneRestoredMessage: 'Último commit deshecho. El mensaje volvió al cuadro de commit.',
      nothingToDiscard: 'No hay cambios para descartar.',
      cannotBeUndone: 'Esta acción no se puede deshacer.',
      untrackedToTrash: (n: number) =>
        n === 1
          ? 'El archivo sin seguimiento se moverá a la papelera.'
          : `${n} archivos sin seguimiento se moverán a la papelera.`,
      discardConfirmOne: (name: string) => `¿Descartar los cambios de "${name}"?`,
      discardConfirmMany: (n: number) => `¿Descartar los cambios de ${n} archivos?`,
      discard: 'Descartar',
      stashSaved: 'Cambios guardados en el stash.',
      stashApplied: 'Stash aplicado.',
      stashPopped: 'Stash aplicado y eliminado.',
      stashDropConfirm: (label: string) => `¿Eliminar el stash "${label}"?`,
      stashDropConfirmRef: (ref: string) => `¿Eliminar el stash ${ref}?`,
      stashDrop: 'Eliminar',
      stashDropped: 'Stash eliminado.',
      stashError: (detail: string) => `Stash: ${detail}`,
      noStashes: 'No hay stashes en este repositorio.'
    },
    clone: {
      inProgress: 'Ya hay una clonación en curso.',
      cancelled: 'Clonación cancelada.',
      cloning: (name: string) => `Clonando ${name}…`,
      cloned: (name: string) => `${name} clonado.`,
      pickTitle: 'Elige dónde clonar',
      pickButton: 'Clonar aquí',
      folderExists: (name: string, parent: string) => `La carpeta "${name}" ya existe en ${parent}.`,
      mkdirFailed: (name: string, parent: string, detail: string) =>
        `No se pudo crear la carpeta "${name}" en ${parent}: ${detail}`,
      gitNotFound: 'No se encontró Git. Instala git e inténtalo de nuevo.',
      spawnFailed: (detail: string) => `No se pudo iniciar git: ${detail}`,
      stages: {
        connecting: 'Conectando',
        enumerating: 'Enumerando objetos',
        counting: 'Contando objetos',
        compressing: 'Comprimiendo objetos',
        receiving: 'Recibiendo objetos',
        resolving: 'Resolviendo deltas',
        updating: 'Actualizando archivos'
      },
      url: {
        invalid: (reason: string) => `URL de clonación no válida: ${reason}`,
        badHost: 'host ausente o no válido.',
        noFolderName: 'no se pudo determinar el nombre de la carpeta a partir de la URL.',
        notAString: 'ingresa una URL.',
        empty: 'ingresa la URL del repositorio.',
        tooLong: 'la URL es demasiado larga.',
        dashPrefix: 'no se aceptan URL que empiecen con "-".',
        transportNotAllowed: (helper: string) => `El transporte "${helper}::" no está permitido.`,
        controlChars: 'la URL no puede tener espacios ni caracteres de control.',
        fileNotAllowed: 'no se aceptan URL "file://".',
        protocolNotAllowed: (name: string) =>
          `no se acepta el protocolo "${name}://". Usa https://, ssh:// o usuario@host:ruta.`,
        unparseable: 'no se pudo interpretar la URL.',
        localPath: 'no se aceptan rutas locales. Usa https://, ssh:// o usuario@host:ruta.',
        unsupported: 'usa https://, ssh:// o usuario@host:ruta.'
      }
    },
    merge: {
      title: 'Cambios de fusión',
      markResolved: 'Marcar como resuelto (stage)',
      markResolvedConfirm: (name: string) =>
        `"${name}" todavía tiene marcadores de conflicto. ¿Marcarlo como resuelto de todos modos?`,
      markResolvedButton: 'Marcar como resuelto',
      inProgress: {
        merge: 'Fusión en curso',
        rebase: 'Rebase en curso',
        cherryPick: 'Cherry-pick en curso',
        revert: 'Revert en curso'
      },
      abort: {
        merge: 'Anular fusión',
        rebase: 'Anular rebase',
        cherryPick: 'Anular cherry-pick',
        revert: 'Anular revert'
      },
      abortConfirm: {
        merge: '¿Anular la fusión en curso?',
        rebase: '¿Anular el rebase en curso?',
        cherryPick: '¿Anular el cherry-pick en curso?',
        revert: '¿Anular el revert en curso?'
      },
      abortDetail:
        'El repositorio vuelve al estado anterior a la operación y se pierden las resoluciones de conflictos hechas.',
      aborted: 'Operación anulada.',
      acceptCurrent: 'Aceptar cambio actual',
      acceptIncoming: 'Aceptar cambio entrante',
      acceptBoth: 'Aceptar ambos cambios',
      compare: 'Comparar cambios',
      currentChange: '(Cambio actual)',
      incomingChange: '(Cambio entrante)',
      conflictActions: 'Acciones del conflicto',
      noConflicts: 'No hay conflictos de fusión en este archivo.',
      compareHeader: 'Cambio actual ↔ cambio entrante'
    },
    hunks: {
      stage: 'Stage del fragmento',
      unstage: 'Unstage del fragmento',
      revert: 'Revertir fragmento',
      actions: 'Acciones del fragmento',
      nothingSelected: 'No hay cambios en las líneas seleccionadas.',
      saveFirst: 'Guarda el archivo antes de revertir desde el diff: tiene cambios sin guardar.',
      revertConfirm: (name: string) => `¿Revertir los cambios seleccionados de "${name}" en el disco?`,
      revertButton: 'Revertir'
    },
    blame: {
      uncommitted: 'Sin commit aún',
      inline: (author: string, when: string, summary: string) => `${author}, ${when} • ${summary}`,
      status: (author: string, when: string) => `${author}, ${when}`,
      statusAria: (author: string, when: string, summary: string) =>
        `Blame de la línea: ${author}, ${when}, ${summary}`,
      title: (hash: string, author: string, date: string, summary: string) =>
        `${hash} · ${author} · ${date}\n${summary}`,
      showInHistory: 'Mostrar en el historial',
      details: 'Detalles del commit'
    },
    errors: {
      onlyOwnFolder: 'Solo se puede usar git en la carpeta abierta en esta ventana.',
      notARepo: 'La carpeta abierta no es un repositorio git.',
      fileOutsideRepo: 'El archivo está fuera del repositorio.',
      noFiles: 'No se indicó ningún archivo.',
      invalidFile: 'Archivo no válido.',
      invalidCommit: 'Commit no válido.',
      invalidStash: 'Stash no válido.',
      invalidBranchName: 'Nombre de rama no válido.',
      invalidRef: 'Referencia no válida.',
      invalidCommitMessage: 'Mensaje de commit no válido.',
      enterCommitMessage: 'Escribe un mensaje de commit.',
      noCommitToUndo: 'No hay ningún commit para deshacer.',
      detachedNoCommitToUndo: 'HEAD separado: no hay ningún commit para deshacer en esta rama.',
      detachedNoSync: 'HEAD separado: no hay ninguna rama para sincronizar.',
      remoteBranchNotFound: 'No se encontró la rama remota.',
      invalidPagination: 'Paginación no válida.',
      commitNotFound: 'No se encontró el commit.',
      stashNotFound: 'No se encontró el stash. Actualiza la lista e inténtalo de nuevo.',
      stashChanged: 'El stash cambió desde que se cargó la lista. Actualiza la lista e inténtalo de nuevo.',
      conflictDiscard: 'Archivo en conflicto: resuelve el conflicto antes de descartar.',
      networkCancelled: 'Se canceló la operación de red.',
      networkTimeout: 'La operación de red tardó demasiado y se canceló.',
      cancelled: 'Se canceló la operación de Git.',
      timeout:
        'Git tardó demasiado en responder (un hook o una solicitud de contraseña puede estar bloqueado) y se canceló.',
      exitCode: (command: string, code: string) => `git ${command} terminó con el código ${code}`,
      noRemote: 'No hay ningún remoto configurado.',
      ambiguousRemote: 'Hay varios remotos y ninguno se llama origin. Publica la rama desde la terminal integrada.',
      localUpstream: 'El upstream de esta rama es local. Envía desde la terminal integrada.',
      auth: 'Falló la autenticación con el remoto. Configura las credenciales desde la terminal integrada (p. ej., ejecuta `git push` allí) e inténtalo de nuevo.',
      stashPopConflict:
        'Conflictos al aplicar el stash. Se mantuvo en la pila; resuelve los conflictos y elimínalo después.',
      stashApplyConflict: 'Conflictos al aplicar el stash. Resuélvelos en los archivos marcados.',
      nothingToStash: 'No hay cambios locales para guardar en el stash.',
      noInitialCommit: 'El repositorio todavía no tiene ningún commit.',
      wouldOverwrite:
        'Hay cambios locales que se sobrescribirían. Haz commit, guárdalos en el stash o descártalos e inténtalo de nuevo.',
      diverged:
        'La rama local y la remota divergieron y no se puede avanzar (fast-forward). Haz merge o rebase desde la terminal integrada.',
      pushRejected: 'El remoto tiene commits que todavía no tienes (push rechazado). Haz pull antes de enviar.',
      noUpstream: 'La rama actual no tiene upstream configurado. Publica la rama para crearlo.',
      nothingToPush: 'No hay nada para enviar: primero haz un commit.',
      invalidRemote: 'Remoto no válido o no configurado.',
      network: 'No se pudo conectar al remoto. Verifica tu conexión e inténtalo de nuevo.',
      branchExists: 'Ya existe una rama con ese nombre.',
      nothingToCommit: 'No hay nada para hacer commit.',
      noIdentity:
        'La identidad de git no está configurada. Define `user.name` y `user.email` (p. ej., desde la terminal integrada).',
      indexLock:
        'Otro proceso de git se está ejecutando en este repositorio (archivo index.lock). Inténtalo de nuevo en unos instantes.',
      cloneTargetExists: 'La carpeta de destino ya existe y no está vacía.',
      cloneNotFound:
        'No se encontró el repositorio, o no tienes permiso de acceso. Revisa la URL y, si es privado, configura las credenciales desde la terminal integrada (p. ej., ejecuta `git clone` allí).',
      cloneFailed: (detail: string) => `No se pudo clonar el repositorio: ${detail}`,
      cloneFailedGeneric: 'No se pudo clonar el repositorio.',
      invalidRanges: 'Rangos de líneas no válidos.',
      fileTooLarge: 'El archivo es demasiado grande para hacer stage por fragmento.',
      binaryRanges: 'Archivo binario: haz stage del archivo completo.',
      invalidContents: 'Contenido no válido.',
      noOperation: 'No hay ninguna fusión, rebase, cherry-pick o revert en curso.'
    }
  }
})
