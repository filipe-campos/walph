import { defineMessages } from '../define'

export const editor = defineMessages({
  'pt-BR': {
    conflict: {
      message: 'O arquivo foi alterado no disco.',
      reload: 'Recarregar do disco',
      keepMine: 'Manter minha versão'
    },
    diff: {
      openFile: 'Abrir arquivo',
      commitReadOnly: (hash: string) => `Commit ${hash} (somente leitura)`,
      claudeProposal: 'Disco ↔ Proposta do Claude',
      headToStaged: 'HEAD ↔ Staged',
      stagedToWorkingTree: 'Staged ↔ Working Tree',
      proposalGone: 'Este pedido do Claude não está mais pendente.',
      compareFiles: (left: string, right: string) => `${left} ↔ ${right}`,
      savedSuffix: '(salvo)'
    },
    tabs: {
      tabsLabel: 'Abas do editor',
      editorLabel: 'Editor',
      deletedTitle: (path: string) => `${path} (removido do disco)`,
      commitTitle: (path: string, hash: string) => `${path} (commit ${hash})`,
      previewTitle: (path: string) => `Preview de ${path}`,
      previewLabel: (name: string) => `Preview ${name}`,
      stagedSuffix: '(staged)',
      changesSuffix: '(alterações)'
    },
    actions: {
      openPreviewToSide: 'Abrir Preview ao Lado',
      closePreviewToSide: 'Fechar Preview ao Lado',
      openImagePreview: 'Abrir Prévia da Imagem',
      splitEditor: 'Dividir Editor',
      openClaude: 'Abrir o Claude Code',
      closeClaude: 'Fechar o Claude Code'
    },
    image: {
      zoomOut: 'Diminuir',
      zoomIn: 'Ampliar',
      fit: 'Ajustar',
      openAsText: 'Abrir como texto'
    },
    markdown: {
      image: 'Imagem',
      imageNotLoaded: 'Imagem não carregada',
      imageLoadFailed: 'Não foi possível carregar a imagem.',
      remoteImages: 'Imagens remotas não são carregadas.',
      noImageSource: 'Imagem sem origem.',
      fileNotFound: (name: string) => `Arquivo não encontrado: ${name}`,
      diagramError: 'Não foi possível desenhar o diagrama.'
    },
    breadcrumbs: {
      label: 'Breadcrumbs',
      folderItems: (name: string) => `Itens ao lado de ${name}`,
      symbols: 'Símbolos',
      empty: 'Pasta vazia.'
    },
    outline: {
      title: 'Estrutura',
      treeLabel: 'Símbolos do arquivo',
      collapseAll: 'Recolher Tudo',
      sortBy: 'Ordenar por',
      sortPosition: 'Ordenar por: Posição',
      sortName: 'Ordenar por: Nome',
      sortKind: 'Ordenar por: Categoria',
      filter: 'Filtrar símbolos',
      noEditor: 'O editor ativo não tem informações de estrutura.',
      noSymbols: 'Nenhum símbolo encontrado no documento.',
      noMatches: 'Nenhum símbolo corresponde ao filtro.'
    },
    find: {
      find: 'Localizar',
      replace: 'Substituir',
      toggleReplace: 'Alternar substituição',
      matchCase: 'Diferenciar maiúsculas e minúsculas',
      wholeWord: 'Palavra inteira',
      regexp: 'Usar expressão regular',
      previous: 'Ocorrência anterior (Shift+Enter)',
      next: 'Próxima ocorrência (Enter)',
      close: 'Fechar (Esc)',
      replaceAll: 'Substituir tudo',
      invalid: 'Expressão inválida',
      noResults: 'Sem resultados',
      count: (current: string, total: string) => `${current} de ${total}`
    },
    indent: {
      tabs: 'Tabs',
      spaces: (size: number) => `Espaços: ${size}`
    },
    encoding: {
      utf8bom: 'UTF-8 com BOM'
    },
    language: {
      plainText: 'Texto',
      loadFailed: (message: string) => `Não foi possível carregar a linguagem: ${message}`
    },
    file: {
      saveFailed: (name: string, message: string) => `Erro ao salvar "${name}": ${message}`,
      readFailed: (name: string, message: string) => `Não foi possível ler "${name}": ${message}`,
      reopenFailed: (name: string, message: string) => `Não foi possível reabrir "${name}": ${message}`,
      editedDuringRead: 'O arquivo foi editado durante a leitura; reabra de novo.',
      goneFromDisk: 'O arquivo não existe mais no disco.',
      nothingToConvert: 'Nenhuma linha precisava de conversão.',
      discardForEncoding: (name: string) => `Descartar as alterações de "${name}"?`,
      discardForEncodingDetail: 'O arquivo será relido do disco com a codificação escolhida.',
      discardAndReopen: 'Descartar e reabrir'
    },
    // CodeMirror's built-in UI (`EditorState.phrases`): go to line, folding, lint, completion, diff.
    phrases: {
      goToLine: 'Ir para a linha',
      go: 'ir',
      find: 'Localizar',
      replace: 'Substituir',
      next: 'próxima',
      previous: 'anterior',
      all: 'todas',
      matchCase: 'diferenciar maiúsculas',
      regexp: 'expressão regular',
      byWord: 'palavra inteira',
      replaceOne: 'substituir',
      replaceAll: 'substituir tudo',
      close: 'fechar',
      currentMatch: 'ocorrência atual',
      onLine: 'na linha',
      replacedMatchOnLine: 'ocorrência substituída na linha $',
      replacedMatches: '$ ocorrências substituídas',
      foldLine: 'Dobrar linha',
      unfoldLine: 'Desdobrar linha',
      foldedLines: 'Linhas dobradas',
      unfoldedLines: 'Linhas desdobradas',
      to: 'até',
      foldedCode: 'código dobrado',
      unfold: 'desdobrar',
      diagnostics: 'Diagnósticos',
      noDiagnostics: 'Nenhum diagnóstico',
      completions: 'Sugestões',
      controlCharacter: 'Caractere de controle',
      selectionDeleted: 'Seleção excluída',
      unchangedLines: '$ linhas sem alteração',
      accept: 'Aceitar',
      reject: 'Rejeitar',
      revertChunk: 'Reverter este trecho'
    }
  },
  en: {
    conflict: {
      message: 'The file was changed on disk.',
      reload: 'Reload from Disk',
      keepMine: 'Keep My Version'
    },
    diff: {
      openFile: 'Open File',
      commitReadOnly: (hash: string) => `Commit ${hash} (read-only)`,
      claudeProposal: 'Disk ↔ Claude Proposal',
      headToStaged: 'HEAD ↔ Staged',
      stagedToWorkingTree: 'Staged ↔ Working Tree',
      proposalGone: 'This Claude request is no longer pending.',
      compareFiles: (left: string, right: string) => `${left} ↔ ${right}`,
      savedSuffix: '(saved)'
    },
    tabs: {
      tabsLabel: 'Editor tabs',
      editorLabel: 'Editor',
      deletedTitle: (path: string) => `${path} (deleted from disk)`,
      commitTitle: (path: string, hash: string) => `${path} (commit ${hash})`,
      previewTitle: (path: string) => `Preview of ${path}`,
      previewLabel: (name: string) => `Preview ${name}`,
      stagedSuffix: '(staged)',
      changesSuffix: '(changes)'
    },
    actions: {
      openPreviewToSide: 'Open Preview to the Side',
      closePreviewToSide: 'Close Preview to the Side',
      openImagePreview: 'Open Image Preview',
      splitEditor: 'Split Editor',
      openClaude: 'Open Claude Code',
      closeClaude: 'Close Claude Code'
    },
    image: {
      zoomOut: 'Zoom Out',
      zoomIn: 'Zoom In',
      fit: 'Fit',
      openAsText: 'Open as Text'
    },
    markdown: {
      image: 'Image',
      imageNotLoaded: 'Image not loaded',
      imageLoadFailed: 'Could not load the image.',
      remoteImages: 'Remote images are not loaded.',
      noImageSource: 'Image without a source.',
      fileNotFound: (name: string) => `File not found: ${name}`,
      diagramError: 'Could not draw the diagram.'
    },
    breadcrumbs: {
      label: 'Breadcrumbs',
      folderItems: (name: string) => `Items next to ${name}`,
      symbols: 'Symbols',
      empty: 'Empty folder.'
    },
    outline: {
      title: 'Outline',
      treeLabel: 'File symbols',
      collapseAll: 'Collapse All',
      sortBy: 'Sort By',
      sortPosition: 'Sort By: Position',
      sortName: 'Sort By: Name',
      sortKind: 'Sort By: Category',
      filter: 'Filter symbols',
      noEditor: 'The active editor cannot provide outline information.',
      noSymbols: 'No symbols found in the document.',
      noMatches: 'No symbols match the filter.'
    },
    find: {
      find: 'Find',
      replace: 'Replace',
      toggleReplace: 'Toggle Replace',
      matchCase: 'Match Case',
      wholeWord: 'Match Whole Word',
      regexp: 'Use Regular Expression',
      previous: 'Previous Match (Shift+Enter)',
      next: 'Next Match (Enter)',
      close: 'Close (Esc)',
      replaceAll: 'Replace All',
      invalid: 'Invalid expression',
      noResults: 'No results',
      count: (current: string, total: string) => `${current} of ${total}`
    },
    indent: {
      tabs: 'Tabs',
      spaces: (size: number) => `Spaces: ${size}`
    },
    encoding: {
      utf8bom: 'UTF-8 with BOM'
    },
    language: {
      plainText: 'Plain Text',
      loadFailed: (message: string) => `Could not load the language: ${message}`
    },
    file: {
      saveFailed: (name: string, message: string) => `Error saving "${name}": ${message}`,
      readFailed: (name: string, message: string) => `Could not read "${name}": ${message}`,
      reopenFailed: (name: string, message: string) => `Could not reopen "${name}": ${message}`,
      editedDuringRead: 'The file was edited while it was being read; reopen it again.',
      goneFromDisk: 'The file no longer exists on disk.',
      nothingToConvert: 'No lines needed conversion.',
      discardForEncoding: (name: string) => `Discard the changes to "${name}"?`,
      discardForEncodingDetail: 'The file will be read again from disk with the chosen encoding.',
      discardAndReopen: 'Discard and Reopen'
    },
    phrases: {
      goToLine: 'Go to line',
      go: 'go',
      find: 'Find',
      replace: 'Replace',
      next: 'next',
      previous: 'previous',
      all: 'all',
      matchCase: 'match case',
      regexp: 'regexp',
      byWord: 'by word',
      replaceOne: 'replace',
      replaceAll: 'replace all',
      close: 'close',
      currentMatch: 'current match',
      onLine: 'on line',
      replacedMatchOnLine: 'replaced match on line $',
      replacedMatches: 'replaced $ matches',
      foldLine: 'Fold line',
      unfoldLine: 'Unfold line',
      foldedLines: 'Folded lines',
      unfoldedLines: 'Unfolded lines',
      to: 'to',
      foldedCode: 'folded code',
      unfold: 'unfold',
      diagnostics: 'Diagnostics',
      noDiagnostics: 'No diagnostics',
      completions: 'Completions',
      controlCharacter: 'Control character',
      selectionDeleted: 'Selection deleted',
      unchangedLines: '$ unchanged lines',
      accept: 'Accept',
      reject: 'Reject',
      revertChunk: 'Revert this chunk'
    }
  },
  es: {
    conflict: {
      message: 'El archivo se modificó en el disco.',
      reload: 'Volver a cargar desde el disco',
      keepMine: 'Conservar mi versión'
    },
    diff: {
      openFile: 'Abrir archivo',
      commitReadOnly: (hash: string) => `Commit ${hash} (solo lectura)`,
      claudeProposal: 'Disco ↔ Propuesta de Claude',
      headToStaged: 'HEAD ↔ Staged',
      stagedToWorkingTree: 'Staged ↔ Working Tree',
      proposalGone: 'Esta solicitud de Claude ya no está pendiente.',
      compareFiles: (left: string, right: string) => `${left} ↔ ${right}`,
      savedSuffix: '(guardado)'
    },
    tabs: {
      tabsLabel: 'Pestañas del editor',
      editorLabel: 'Editor',
      deletedTitle: (path: string) => `${path} (eliminado del disco)`,
      commitTitle: (path: string, hash: string) => `${path} (commit ${hash})`,
      previewTitle: (path: string) => `Vista previa de ${path}`,
      previewLabel: (name: string) => `Vista previa ${name}`,
      stagedSuffix: '(staged)',
      changesSuffix: '(cambios)'
    },
    actions: {
      openPreviewToSide: 'Abrir vista previa en el lateral',
      closePreviewToSide: 'Cerrar vista previa en el lateral',
      openImagePreview: 'Abrir vista previa de la imagen',
      splitEditor: 'Dividir editor',
      openClaude: 'Abrir Claude Code',
      closeClaude: 'Cerrar Claude Code'
    },
    image: {
      zoomOut: 'Alejar',
      zoomIn: 'Acercar',
      fit: 'Ajustar',
      openAsText: 'Abrir como texto'
    },
    markdown: {
      image: 'Imagen',
      imageNotLoaded: 'Imagen no cargada',
      imageLoadFailed: 'No se pudo cargar la imagen.',
      remoteImages: 'Las imágenes remotas no se cargan.',
      noImageSource: 'Imagen sin origen.',
      fileNotFound: (name: string) => `Archivo no encontrado: ${name}`,
      diagramError: 'No se pudo dibujar el diagrama.'
    },
    breadcrumbs: {
      label: 'Rutas de navegación',
      folderItems: (name: string) => `Elementos junto a ${name}`,
      symbols: 'Símbolos',
      empty: 'Carpeta vacía.'
    },
    outline: {
      title: 'Esquema',
      treeLabel: 'Símbolos del archivo',
      collapseAll: 'Contraer todo',
      sortBy: 'Ordenar por',
      sortPosition: 'Ordenar por: posición',
      sortName: 'Ordenar por: nombre',
      sortKind: 'Ordenar por: categoría',
      filter: 'Filtrar símbolos',
      noEditor: 'El editor activo no puede proporcionar información de esquema.',
      noSymbols: 'No se encontraron símbolos en el documento.',
      noMatches: 'Ningún símbolo coincide con el filtro.'
    },
    find: {
      find: 'Buscar',
      replace: 'Reemplazar',
      toggleReplace: 'Alternar reemplazo',
      matchCase: 'Coincidir mayúsculas y minúsculas',
      wholeWord: 'Solo palabras completas',
      regexp: 'Usar expresión regular',
      previous: 'Coincidencia anterior (Shift+Enter)',
      next: 'Coincidencia siguiente (Enter)',
      close: 'Cerrar (Esc)',
      replaceAll: 'Reemplazar todo',
      invalid: 'Expresión no válida',
      noResults: 'Sin resultados',
      count: (current: string, total: string) => `${current} de ${total}`
    },
    indent: {
      tabs: 'Tabulaciones',
      spaces: (size: number) => `Espacios: ${size}`
    },
    encoding: {
      utf8bom: 'UTF-8 con BOM'
    },
    language: {
      plainText: 'Texto sin formato',
      loadFailed: (message: string) => `No se pudo cargar el lenguaje: ${message}`
    },
    file: {
      saveFailed: (name: string, message: string) => `Error al guardar "${name}": ${message}`,
      readFailed: (name: string, message: string) => `No se pudo leer "${name}": ${message}`,
      reopenFailed: (name: string, message: string) => `No se pudo volver a abrir "${name}": ${message}`,
      editedDuringRead: 'El archivo se editó durante la lectura; vuelva a abrirlo.',
      goneFromDisk: 'El archivo ya no existe en el disco.',
      nothingToConvert: 'Ninguna línea necesitaba conversión.',
      discardForEncoding: (name: string) => `¿Descartar los cambios de "${name}"?`,
      discardForEncodingDetail: 'El archivo se volverá a leer del disco con la codificación elegida.',
      discardAndReopen: 'Descartar y volver a abrir'
    },
    phrases: {
      goToLine: 'Ir a la línea',
      go: 'ir',
      find: 'Buscar',
      replace: 'Reemplazar',
      next: 'siguiente',
      previous: 'anterior',
      all: 'todas',
      matchCase: 'coincidir mayúsculas',
      regexp: 'expresión regular',
      byWord: 'palabra completa',
      replaceOne: 'reemplazar',
      replaceAll: 'reemplazar todo',
      close: 'cerrar',
      currentMatch: 'coincidencia actual',
      onLine: 'en la línea',
      replacedMatchOnLine: 'coincidencia reemplazada en la línea $',
      replacedMatches: '$ coincidencias reemplazadas',
      foldLine: 'Plegar línea',
      unfoldLine: 'Desplegar línea',
      foldedLines: 'Líneas plegadas',
      unfoldedLines: 'Líneas desplegadas',
      to: 'a',
      foldedCode: 'código plegado',
      unfold: 'desplegar',
      diagnostics: 'Diagnósticos',
      noDiagnostics: 'Sin diagnósticos',
      completions: 'Sugerencias',
      controlCharacter: 'Carácter de control',
      selectionDeleted: 'Selección eliminada',
      unchangedLines: '$ líneas sin cambios',
      accept: 'Aceptar',
      reject: 'Rechazar',
      revertChunk: 'Revertir este fragmento'
    }
  }
})
