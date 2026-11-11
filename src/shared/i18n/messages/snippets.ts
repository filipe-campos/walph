import { defineMessages } from '../define'

export const snippets = defineMessages({
  'pt-BR': {
    errors: {
      invalidFileKind: 'Tipo de arquivo de snippets inválido.',
      invalidName: (name: string) => `Nome de arquivo de snippets inválido: "${name}".`,
      openFolder: 'Abra uma pasta para criar snippets do workspace.',
      createFailed: (file: string, message: string) => `Não foi possível criar ${file}: ${message}`,
      readFailed: (file: string, message: string) => `Não foi possível ler ${file}: ${message}`,
      parseFailed: (file: string, error: string) => `${file}: ${error}`,
      notObject: (file: string) => `${file}: o arquivo precisa ser um objeto { "nome": { "prefix", "body" } }.`,
      invalidEntry: (file: string, name: string) =>
        `${file}: snippet "${name}" ignorado (precisa de "prefix" e "body" como texto ou lista de textos).`,
      tooLarge: (file: string) => `${file}: arquivo grande demais, ignorado.`
    },
    templates: {
      language: (languageId: string) =>
        [
          `Snippets de ${languageId} (JSON com comentários, formato do VS Code).`,
          'Cada snippet tem um nome, um ou mais "prefix" (o que se digita), o "body" (texto ou lista de linhas) e uma',
          '"description" opcional. No corpo: $1, $2 para tabstops, ${1:padrão} para placeholders, ${1|a,b|} para',
          'escolhas, $0 para a posição final e variáveis como $TM_FILENAME, $CURRENT_YEAR ou $CLIPBOARD. Exemplo:'
        ].join('\n'),
      global: [
        'Snippets globais (JSON com comentários, formato do VS Code). "scope" lista os languageIds onde o snippet vale',
        '(separados por vírgula); sem "scope", vale em todas as linguagens. No corpo: $1, ${1:padrão}, ${1|a,b|}, $0 e',
        'variáveis como $TM_FILENAME, $CURRENT_YEAR ou $CLIPBOARD. Exemplo:'
      ].join('\n'),
      workspace: [
        'Snippets deste workspace (JSON com comentários, formato do VS Code). "scope" lista os languageIds onde o',
        'snippet vale (separados por vírgula); sem "scope", vale em todas as linguagens. Exemplo:'
      ].join('\n'),
      exampleDescription: 'Mostra um valor no console'
    },
    pick: {
      openFile: 'Abra um arquivo para inserir um snippet.',
      none: 'Nenhum snippet para esta linguagem.',
      noMatch: 'Nenhum snippet encontrado.',
      user: 'usuário',
      workspace: 'workspace',
      existing: 'Arquivos existentes',
      newFile: 'Novo arquivo',
      languages: 'Snippets por linguagem',
      newGlobal: 'Novo arquivo de snippets global…',
      newWorkspace: (folder: string) => `Novo arquivo de snippets para "${folder}"…`,
      fileName: 'Digite o nome do arquivo de snippets',
      createFile: (name: string) => `Criar ${name}`
    },
    emmet: {
      completionDetail: 'Abreviação do Emmet',
      wrapPrompt: 'Digite uma abreviação do Emmet para envolver a seleção',
      wrapWith: (abbreviation: string) => `Envolver com ${abbreviation}`,
      noAbbreviation: 'Nenhuma abreviação do Emmet válida antes do cursor.',
      unsupported: 'O Emmet não está disponível nesta linguagem.',
      disabled: 'O Emmet está desligado (emmet.enabled).',
      invalidAbbreviation: (abbreviation: string) => `Abreviação do Emmet inválida: ${abbreviation}`
    }
  },
  en: {
    errors: {
      invalidFileKind: 'Invalid snippets file kind.',
      invalidName: (name: string) => `Invalid snippets file name: "${name}".`,
      openFolder: 'Open a folder to create workspace snippets.',
      createFailed: (file: string, message: string) => `Could not create ${file}: ${message}`,
      readFailed: (file: string, message: string) => `Could not read ${file}: ${message}`,
      parseFailed: (file: string, error: string) => `${file}: ${error}`,
      notObject: (file: string) => `${file}: the file must be an object { "name": { "prefix", "body" } }.`,
      invalidEntry: (file: string, name: string) =>
        `${file}: snippet "${name}" ignored (it needs "prefix" and "body" as a string or a list of strings).`,
      tooLarge: (file: string) => `${file}: file too large, ignored.`
    },
    templates: {
      language: (languageId: string) =>
        [
          `${languageId} snippets (JSON with comments, VS Code format).`,
          'Each snippet has a name, one or more "prefix" values (what you type), the "body" (a string or a list of',
          'lines) and an optional "description". In the body: $1, $2 for tab stops, ${1:default} for placeholders,',
          '${1|a,b|} for choices, $0 for the final position and variables like $TM_FILENAME, $CURRENT_YEAR or $CLIPBOARD. Example:'
        ].join('\n'),
      global: [
        'Global snippets (JSON with comments, VS Code format). "scope" lists the languageIds where the snippet applies',
        '(comma separated); without "scope", it applies to every language. In the body: $1, ${1:default}, ${1|a,b|},',
        '$0 and variables like $TM_FILENAME, $CURRENT_YEAR or $CLIPBOARD. Example:'
      ].join('\n'),
      workspace: [
        'Snippets of this workspace (JSON with comments, VS Code format). "scope" lists the languageIds where the',
        'snippet applies (comma separated); without "scope", it applies to every language. Example:'
      ].join('\n'),
      exampleDescription: 'Logs a value to the console'
    },
    pick: {
      openFile: 'Open a file to insert a snippet.',
      none: 'No snippets for this language.',
      noMatch: 'No matching snippets.',
      user: 'user',
      workspace: 'workspace',
      existing: 'Existing Files',
      newFile: 'New File',
      languages: 'Language Snippets',
      newGlobal: 'New Global Snippets File…',
      newWorkspace: (folder: string) => `New Snippets File for "${folder}"…`,
      fileName: 'Type the snippets file name',
      createFile: (name: string) => `Create ${name}`
    },
    emmet: {
      completionDetail: 'Emmet Abbreviation',
      wrapPrompt: 'Type an Emmet abbreviation to wrap the selection',
      wrapWith: (abbreviation: string) => `Wrap with ${abbreviation}`,
      noAbbreviation: 'No valid Emmet abbreviation before the cursor.',
      unsupported: 'Emmet is not available in this language.',
      disabled: 'Emmet is disabled (emmet.enabled).',
      invalidAbbreviation: (abbreviation: string) => `Invalid Emmet abbreviation: ${abbreviation}`
    }
  },
  es: {
    errors: {
      invalidFileKind: 'Tipo de archivo de fragmentos no válido.',
      invalidName: (name: string) => `Nombre de archivo de fragmentos no válido: "${name}".`,
      openFolder: 'Abre una carpeta para crear fragmentos del espacio de trabajo.',
      createFailed: (file: string, message: string) => `No se pudo crear ${file}: ${message}`,
      readFailed: (file: string, message: string) => `No se pudo leer ${file}: ${message}`,
      parseFailed: (file: string, error: string) => `${file}: ${error}`,
      notObject: (file: string) => `${file}: el archivo debe ser un objeto { "nombre": { "prefix", "body" } }.`,
      invalidEntry: (file: string, name: string) =>
        `${file}: fragmento "${name}" ignorado (necesita "prefix" y "body" como texto o lista de textos).`,
      tooLarge: (file: string) => `${file}: archivo demasiado grande, ignorado.`
    },
    templates: {
      language: (languageId: string) =>
        [
          `Fragmentos de ${languageId} (JSON con comentarios, formato de VS Code).`,
          'Cada fragmento tiene un nombre, uno o más "prefix" (lo que se escribe), el "body" (texto o lista de líneas)',
          'y una "description" opcional. En el cuerpo: $1, $2 para tabulaciones, ${1:predeterminado} para marcadores,',
          '${1|a,b|} para opciones, $0 para la posición final y variables como $TM_FILENAME, $CURRENT_YEAR o $CLIPBOARD. Ejemplo:'
        ].join('\n'),
      global: [
        'Fragmentos globales (JSON con comentarios, formato de VS Code). "scope" lista los languageIds donde vale el',
        'fragmento (separados por comas); sin "scope", vale en todos los lenguajes. En el cuerpo: $1, ${1:predeterminado},',
        '${1|a,b|}, $0 y variables como $TM_FILENAME, $CURRENT_YEAR o $CLIPBOARD. Ejemplo:'
      ].join('\n'),
      workspace: [
        'Fragmentos de este espacio de trabajo (JSON con comentarios, formato de VS Code). "scope" lista los',
        'languageIds donde vale el fragmento (separados por comas); sin "scope", vale en todos los lenguajes. Ejemplo:'
      ].join('\n'),
      exampleDescription: 'Muestra un valor en la consola'
    },
    pick: {
      openFile: 'Abre un archivo para insertar un fragmento.',
      none: 'No hay fragmentos para este lenguaje.',
      noMatch: 'No se encontraron fragmentos.',
      user: 'usuario',
      workspace: 'espacio de trabajo',
      existing: 'Archivos existentes',
      newFile: 'Archivo nuevo',
      languages: 'Fragmentos por lenguaje',
      newGlobal: 'Nuevo archivo de fragmentos global…',
      newWorkspace: (folder: string) => `Nuevo archivo de fragmentos para "${folder}"…`,
      fileName: 'Escribe el nombre del archivo de fragmentos',
      createFile: (name: string) => `Crear ${name}`
    },
    emmet: {
      completionDetail: 'Abreviatura de Emmet',
      wrapPrompt: 'Escribe una abreviatura de Emmet para encapsular la selección',
      wrapWith: (abbreviation: string) => `Encapsular con ${abbreviation}`,
      noAbbreviation: 'No hay una abreviatura de Emmet válida antes del cursor.',
      unsupported: 'Emmet no está disponible en este lenguaje.',
      disabled: 'Emmet está desactivado (emmet.enabled).',
      invalidAbbreviation: (abbreviation: string) => `Abreviatura de Emmet no válida: ${abbreviation}`
    }
  }
})
