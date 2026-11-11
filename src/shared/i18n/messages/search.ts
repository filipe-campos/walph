import { defineMessages, plural } from '../define'

export const search = defineMessages({
  'pt-BR': {
    view: {
      clearResults: 'Limpar resultados',
      expandAll: 'Expandir tudo',
      collapseAll: 'Recolher tudo',
      toggleReplace: 'Alternar substituição',
      openFolder: 'Abra uma pasta para buscar',
      matchCase: 'Diferenciar maiúsculas',
      wholeWord: 'Palavra inteira',
      regex: 'Expressão regular',
      replace: 'Substituir',
      replaceAll: 'Substituir tudo',
      replaceInFile: 'Substituir no arquivo',
      toggleDetails: 'Alternar detalhes da busca',
      include: 'arquivos a incluir',
      includeLabel: 'Arquivos a incluir',
      includePlaceholder: 'ex.: *.ts, src/**',
      exclude: 'arquivos a excluir',
      excludeLabel: 'Arquivos a excluir',
      excludePlaceholder: 'ex.: **/*.test.ts, dist',
      searching: 'Buscando…',
      noResults: 'Nenhum resultado.',
      summary: (total: number, truncated: boolean, files: number) =>
        `${total}${truncated ? '+' : ''} resultado(s) em ${files} arquivo(s)`,
      resultsLabel: 'Resultados da busca'
    },
    actions: {
      invalidRegex: 'Expressão regular inválida: não é possível substituir.',
      confirmReplace: (matches: number, files: number, replacement: string) =>
        `Substituir ${matches} ocorrência(s) em ${files} arquivo(s) por "${replacement}"?`,
      confirmRemove: (matches: number, files: number) => `Remover ${matches} ocorrência(s) em ${files} arquivo(s)?`,
      truncated: 'A busca foi limitada: só as ocorrências mostradas serão substituídas.',
      replace: 'Substituir',
      editorUnreadable: (name: string) => `${name}: não foi possível ler o editor.`,
      replaced: (matches: number, files: number) => `${matches} ocorrência(s) substituída(s) em ${files} arquivo(s).`,
      skipped: (n: number) => `${n} ocorrência(s) não foram substituídas porque o texto mudou desde a busca.`
    },
    errors: {
      rgNotFound: 'Erro na busca: o ripgrep não foi encontrado.',
      rgNoPermission: 'Erro na busca: sem permissão para executar o ripgrep.',
      failed: (detail: string) => `Erro na busca: ${detail}`,
      failedGeneric: 'Erro na busca.',
      invalidRegex: (detail: string) => `Expressão regular inválida: ${detail}`,
      onlyOwnFolder: 'Só é possível buscar na pasta aberta nesta janela.',
      invalidQuery: 'Consulta de busca inválida.',
      invalidOptions: 'Opções de busca inválidas.',
      invalidReplace: 'Pedido de substituição inválido.',
      unsupportedRegex: (query: string) => `Esta expressão regular não é suportada na substituição: ${query}`
    },
    replaceFile: {
      outside: 'O arquivo está fora da pasta aberta; nada foi alterado.',
      gone: 'O arquivo não existe mais; nada foi alterado.',
      readNoPermission: (name: string) => `Sem permissão para ler "${name}"; nada foi alterado.`,
      isDir: (name: string) => `"${name}" é uma pasta; nada foi alterado.`,
      notDirInPath: (name: string) => `Um item no caminho de "${name}" não é uma pasta; nada foi alterado.`,
      readFailed: (name: string, detail: string) => `Não foi possível ler "${name}": ${detail}`,
      notAFile: (name: string) => `"${name}" não é um arquivo; nada foi alterado.`,
      tooLarge: 'O arquivo é maior que 2 MB; nada foi alterado.',
      notUtf8: 'O arquivo não está em UTF-8; nada foi alterado.'
    }
  },
  en: {
    view: {
      clearResults: 'Clear Results',
      expandAll: 'Expand All',
      collapseAll: 'Collapse All',
      toggleReplace: 'Toggle Replace',
      openFolder: 'Open a folder to search',
      matchCase: 'Match Case',
      wholeWord: 'Match Whole Word',
      regex: 'Use Regular Expression',
      replace: 'Replace',
      replaceAll: 'Replace All',
      replaceInFile: 'Replace in File',
      toggleDetails: 'Toggle Search Details',
      include: 'files to include',
      includeLabel: 'Files to include',
      includePlaceholder: 'e.g. *.ts, src/**',
      exclude: 'files to exclude',
      excludeLabel: 'Files to exclude',
      excludePlaceholder: 'e.g. **/*.test.ts, dist',
      searching: 'Searching…',
      noResults: 'No results.',
      summary: (total: number, truncated: boolean, files: number) =>
        `${total}${truncated ? '+' : ''} ${plural(total, 'result', 'results')} in ${files} ${plural(files, 'file', 'files')}`,
      resultsLabel: 'Search results'
    },
    actions: {
      invalidRegex: 'Invalid regular expression: cannot replace.',
      confirmReplace: (matches: number, files: number, replacement: string) =>
        `Replace ${matches} ${plural(matches, 'occurrence', 'occurrences')} in ${files} ${plural(files, 'file', 'files')} with "${replacement}"?`,
      confirmRemove: (matches: number, files: number) =>
        `Remove ${matches} ${plural(matches, 'occurrence', 'occurrences')} in ${files} ${plural(files, 'file', 'files')}?`,
      truncated: 'The search was limited: only the occurrences shown will be replaced.',
      replace: 'Replace',
      editorUnreadable: (name: string) => `${name}: could not read the editor.`,
      replaced: (matches: number, files: number) =>
        `Replaced ${matches} ${plural(matches, 'occurrence', 'occurrences')} in ${files} ${plural(files, 'file', 'files')}.`,
      skipped: (n: number) =>
        n === 1
          ? '1 occurrence was not replaced because the text changed since the search.'
          : `${n} occurrences were not replaced because the text changed since the search.`
    },
    errors: {
      rgNotFound: 'Search error: ripgrep was not found.',
      rgNoPermission: 'Search error: no permission to run ripgrep.',
      failed: (detail: string) => `Search error: ${detail}`,
      failedGeneric: 'Search error.',
      invalidRegex: (detail: string) => `Invalid regular expression: ${detail}`,
      onlyOwnFolder: 'Only the folder open in this window can be searched.',
      invalidQuery: 'Invalid search query.',
      invalidOptions: 'Invalid search options.',
      invalidReplace: 'Invalid replace request.',
      unsupportedRegex: (query: string) => `This regular expression is not supported for replacing: ${query}`
    },
    replaceFile: {
      outside: 'The file is outside the open folder; nothing was changed.',
      gone: 'The file no longer exists; nothing was changed.',
      readNoPermission: (name: string) => `No permission to read "${name}"; nothing was changed.`,
      isDir: (name: string) => `"${name}" is a folder; nothing was changed.`,
      notDirInPath: (name: string) => `An item in the path of "${name}" is not a folder; nothing was changed.`,
      readFailed: (name: string, detail: string) => `Could not read "${name}": ${detail}`,
      notAFile: (name: string) => `"${name}" is not a file; nothing was changed.`,
      tooLarge: 'The file is larger than 2 MB; nothing was changed.',
      notUtf8: 'The file is not UTF-8; nothing was changed.'
    }
  },
  es: {
    view: {
      clearResults: 'Borrar resultados',
      expandAll: 'Expandir todo',
      collapseAll: 'Contraer todo',
      toggleReplace: 'Alternar reemplazo',
      openFolder: 'Abre una carpeta para buscar',
      matchCase: 'Coincidir mayúsculas y minúsculas',
      wholeWord: 'Solo palabras completas',
      regex: 'Usar expresión regular',
      replace: 'Reemplazar',
      replaceAll: 'Reemplazar todo',
      replaceInFile: 'Reemplazar en el archivo',
      toggleDetails: 'Alternar detalles de la búsqueda',
      include: 'archivos para incluir',
      includeLabel: 'Archivos para incluir',
      includePlaceholder: 'p. ej., *.ts, src/**',
      exclude: 'archivos para excluir',
      excludeLabel: 'Archivos para excluir',
      excludePlaceholder: 'p. ej., **/*.test.ts, dist',
      searching: 'Buscando…',
      noResults: 'Sin resultados.',
      summary: (total: number, truncated: boolean, files: number) =>
        `${total}${truncated ? '+' : ''} ${plural(total, 'resultado', 'resultados')} en ${files} ${plural(files, 'archivo', 'archivos')}`,
      resultsLabel: 'Resultados de la búsqueda'
    },
    actions: {
      invalidRegex: 'Expresión regular no válida: no se puede reemplazar.',
      confirmReplace: (matches: number, files: number, replacement: string) =>
        `¿Reemplazar ${matches} ${plural(matches, 'coincidencia', 'coincidencias')} en ${files} ${plural(files, 'archivo', 'archivos')} por "${replacement}"?`,
      confirmRemove: (matches: number, files: number) =>
        `¿Eliminar ${matches} ${plural(matches, 'coincidencia', 'coincidencias')} en ${files} ${plural(files, 'archivo', 'archivos')}?`,
      truncated: 'La búsqueda se limitó: solo se reemplazarán las coincidencias mostradas.',
      replace: 'Reemplazar',
      editorUnreadable: (name: string) => `${name}: no se pudo leer el editor.`,
      replaced: (matches: number, files: number) =>
        `Se ${plural(matches, 'reemplazó', 'reemplazaron')} ${matches} ${plural(matches, 'coincidencia', 'coincidencias')} en ${files} ${plural(files, 'archivo', 'archivos')}.`,
      skipped: (n: number) =>
        n === 1
          ? '1 coincidencia no se reemplazó porque el texto cambió desde la búsqueda.'
          : `${n} coincidencias no se reemplazaron porque el texto cambió desde la búsqueda.`
    },
    errors: {
      rgNotFound: 'Error en la búsqueda: no se encontró ripgrep.',
      rgNoPermission: 'Error en la búsqueda: sin permiso para ejecutar ripgrep.',
      failed: (detail: string) => `Error en la búsqueda: ${detail}`,
      failedGeneric: 'Error en la búsqueda.',
      invalidRegex: (detail: string) => `Expresión regular no válida: ${detail}`,
      onlyOwnFolder: 'Solo se puede buscar en la carpeta abierta en esta ventana.',
      invalidQuery: 'Consulta de búsqueda no válida.',
      invalidOptions: 'Opciones de búsqueda no válidas.',
      invalidReplace: 'Solicitud de reemplazo no válida.',
      unsupportedRegex: (query: string) => `Esta expresión regular no es compatible con el reemplazo: ${query}`
    },
    replaceFile: {
      outside: 'El archivo está fuera de la carpeta abierta; no se modificó nada.',
      gone: 'El archivo ya no existe; no se modificó nada.',
      readNoPermission: (name: string) => `Sin permiso para leer "${name}"; no se modificó nada.`,
      isDir: (name: string) => `"${name}" es una carpeta; no se modificó nada.`,
      notDirInPath: (name: string) => `Un elemento de la ruta de "${name}" no es una carpeta; no se modificó nada.`,
      readFailed: (name: string, detail: string) => `No se pudo leer "${name}": ${detail}`,
      notAFile: (name: string) => `"${name}" no es un archivo; no se modificó nada.`,
      tooLarge: 'El archivo supera los 2 MB; no se modificó nada.',
      notUtf8: 'El archivo no está en UTF-8; no se modificó nada.'
    }
  }
})
