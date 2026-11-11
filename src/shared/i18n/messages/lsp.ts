import { defineMessages } from '../define'

export const lsp = defineMessages({
  'pt-BR': {
    // Request name in the timeout/failure messages ("took too long to respond (hover)").
    requests: {
      completion: 'completar',
      resolveCompletion: 'detalhes do item',
      hover: 'hover',
      signatureHelp: 'ajuda de assinatura',
      definition: 'definição',
      references: 'referências',
      rename: 'renomear',
      format: 'formatar',
      codeActions: 'ações de código',
      resolveCodeAction: 'resolver ação',
      executeCommand: 'executar comando',
      documentSymbols: 'símbolos do arquivo',
      workspaceSymbols: 'símbolos do workspace',
      inlayHints: 'inlay hints',
      documentHighlights: 'destaque de ocorrências',
      semanticTokens: 'realce semântico'
    },
    log: {
      willStart: (name: string, root: string) => `Servidor "${name}" será iniciado em ${root}.`,
      stopped: 'Servidor encerrado (configuração alterada ou desligado).',
      idleStopped: (why: string) => `Servidor desligado por inatividade (${why}); reabre quando for preciso.`,
      idleNoDocuments: 'sem documentos abertos',
      idleWorkspace: 'workspace inativo',
      starting: (command: string) => `Iniciando: ${command}`,
      protocolError: (message: string) => `Erro de protocolo: ${message}`,
      ready: 'Servidor pronto.',
      initializeFailed: (message: string) => `Falha ao inicializar: ${message}`,
      crashed: (how: string) => `O servidor encerrou inesperadamente (${how}).`,
      restartingIn: (seconds: number, attempt: number, max: number) =>
        `Reiniciando em ${seconds} s (tentativa ${attempt} de ${max}).`
    },
    state: {
      restarting: (attempt: number, max: number) => `reiniciando (tentativa ${attempt} de ${max})`,
      gaveUp: (how: string, max: number) =>
        `O servidor encerrou inesperadamente (${how}) e não voltou após ${max} tentativas. Use "Reiniciar Servidor de Linguagem".`,
      exitSignal: (signal: string) => `sinal ${signal}`,
      exitCode: (code: string) => `código ${code}`
    },
    errors: {
      notReady: 'O servidor de linguagem não está pronto.',
      timeout: (request: string) => `O servidor de linguagem demorou demais para responder (${request}).`,
      communication: (request: string) => `Falha na comunicação com o servidor de linguagem (${request}).`,
      server: (message: string) => `Servidor de linguagem: ${message}`,
      initializeTimeout: 'o servidor não respondeu ao "initialize" a tempo',
      noServer: 'Nenhum servidor de linguagem pronto para este arquivo.',
      noActiveServer: 'Nenhum servidor de linguagem ativo para este arquivo.',
      commandRejected: (command: string) => `O servidor de linguagem não aceita o comando "${command}".`,
      noFolder: 'Nenhuma pasta aberta nesta janela.',
      bundledMissing: 'O typescript-language-server embutido não foi encontrado na instalação do app.',
      spawn: (command: string, detail: string) => `Não foi possível iniciar "${command}": ${detail}`,
      spawnWindowsScript: (command: string, detail: string) =>
        `Não foi possível iniciar "${command}": ${detail}. Scripts .cmd/.bat não rodam sem shell e o Walph não usa shell: ` +
        'aponte "command" para o executável real ou use "node" com o script em "args".',
      spawnWindowsInvalid: (command: string, detail: string) =>
        `Não foi possível iniciar "${command}": ${detail}. Se for um .cmd/.bat, aponte para o executável real ou use ` +
        '"node" com o script em "args".',
      invalidServer: 'Servidor de linguagem inválido.',
      invalidRequest: (what: string) => `Pedido ao servidor de linguagem inválido (${what}).`
    },
    // Argument rejected in `errors.invalidRequest`.
    args: {
      path: 'caminho',
      position: 'posição',
      trigger: 'caractere de gatilho',
      item: 'item',
      newName: 'novo nome',
      formatOptions: 'opções de formatação',
      range: 'intervalo',
      command: 'comando',
      query: 'consulta'
    },
    edit: {
      malformed: 'A edição enviada pelo servidor está malformada. Nada foi alterado.',
      resourceOperations:
        'A edição pede para criar, renomear ou apagar arquivos, o que o Walph ainda não suporta. Nada foi alterado.',
      notLocal: 'A edição altera um recurso que não é um arquivo local. Nada foi alterado.',
      outsideWorkspace: (path: string) =>
        `A edição altera um arquivo fora da pasta do workspace (${path}). Nada foi alterado.`,
      staleRetry: 'A edição foi calculada para uma versão antiga do arquivo. Tente de novo.',
      stale: 'A edição foi calculada para uma versão antiga do arquivo.',
      sequential: 'A edição em etapas sobre o mesmo arquivo não é suportada. Nada foi alterado.',
      overlapping: 'As edições do servidor se sobrepõem.',
      unavailable: 'Indisponível.',
      cannotApply: 'A edição não pode ser aplicada.',
      folderChanged: 'A pasta foi trocada durante a operação.',
      changedWhileWaiting: (name: string) => `"${name}" foi alterado enquanto o servidor respondia.`,
      closedDuring: (name: string) => `"${name}" foi fechado durante a operação.`,
      expired: 'O pedido do servidor expirou.',
      expiredDuring: 'O pedido do servidor expirou durante a operação.',
      writeFailed: (failures: string) => `Não foi possível gravar ${failures}`,
      writeFailedPartial: (failures: string, written: string) =>
        `Não foi possível gravar ${failures} (já gravados: ${written})`,
      partiallyApplied: (applied: number, total: number) =>
        `Alteração aplicada em ${applied} de ${total} arquivos: um arquivo aberto mudou durante a operação.`
    },
    navigation: {
      noDefinition: 'Nenhuma definição encontrada.',
      noDefinitionFor: (name: string) => `Nenhuma definição encontrada para "${name}".`,
      definitions: 'Definições',
      definitionsOf: (name: string) => `Definições de "${name}"`,
      noReference: 'Nenhuma referência encontrada.',
      noReferenceFor: (name: string) => `Nenhuma referência encontrada para "${name}".`,
      references: 'Referências',
      referencesOf: (name: string) => `Referências de "${name}"`
    },
    rename: {
      inputLabel: 'Novo nome do símbolo',
      notRenamable: 'Não é possível renomear este símbolo.',
      noChanges: 'O servidor não propôs nenhuma alteração.',
      failed: (reason: string) => `Não foi possível renomear: ${reason}`,
      done: (files: number) => (files === 1 ? 'Renomeado em 1 arquivo.' : `Renomeado em ${files} arquivos.`)
    },
    format: {
      changedDuring: 'O documento mudou durante a formatação; tente de novo.',
      alreadyFormatted: 'O documento já está formatado.'
    },
    codeActions: {
      show: (shortcut: string) => `Mostrar ações de código (${shortcut})`,
      menuLabel: 'Ações de código',
      none: 'Nenhuma ação de código disponível aqui.',
      stale: 'O documento mudou; peça as ações de código de novo.',
      applyFailed: (title: string, reason: string) => `Não foi possível aplicar "${title}": ${reason}`
    },
    panels: {
      problems: 'Problemas',
      noProblems: 'Nenhum problema foi detectado no workspace.',
      position: (line: number, column: number) => `[Ln ${line}, Col ${column}]`,
      references: 'Referências',
      noReferences: 'Nenhum resultado. Use Ir para Referências em um símbolo.',
      noReferencesWithKey: (key: string) => `Nenhum resultado. Use Ir para Referências (${key}) em um símbolo.`,
      output: 'Saída',
      noOutput: 'Nenhuma saída dos servidores de linguagem.',
      clearOutput: 'Limpar Saída',
      outputFailed: (message: string) => `Saída: ${message}`
    }
  },
  en: {
    requests: {
      completion: 'completion',
      resolveCompletion: 'item details',
      hover: 'hover',
      signatureHelp: 'signature help',
      definition: 'definition',
      references: 'references',
      rename: 'rename',
      format: 'format',
      codeActions: 'code actions',
      resolveCodeAction: 'resolve action',
      executeCommand: 'execute command',
      documentSymbols: 'file symbols',
      workspaceSymbols: 'workspace symbols',
      inlayHints: 'inlay hints',
      documentHighlights: 'occurrence highlights',
      semanticTokens: 'semantic highlighting'
    },
    log: {
      willStart: (name: string, root: string) => `Server "${name}" will start in ${root}.`,
      stopped: 'Server stopped (configuration changed or turned off).',
      idleStopped: (why: string) => `Server stopped due to inactivity (${why}); it reopens when needed.`,
      idleNoDocuments: 'no open documents',
      idleWorkspace: 'inactive workspace',
      starting: (command: string) => `Starting: ${command}`,
      protocolError: (message: string) => `Protocol error: ${message}`,
      ready: 'Server ready.',
      initializeFailed: (message: string) => `Failed to initialize: ${message}`,
      crashed: (how: string) => `The server exited unexpectedly (${how}).`,
      restartingIn: (seconds: number, attempt: number, max: number) =>
        `Restarting in ${seconds} s (attempt ${attempt} of ${max}).`
    },
    state: {
      restarting: (attempt: number, max: number) => `restarting (attempt ${attempt} of ${max})`,
      gaveUp: (how: string, max: number) =>
        `The server exited unexpectedly (${how}) and did not come back after ${max} attempts. Use "Restart Language Server".`,
      exitSignal: (signal: string) => `signal ${signal}`,
      exitCode: (code: string) => `code ${code}`
    },
    errors: {
      notReady: 'The language server is not ready.',
      timeout: (request: string) => `The language server took too long to respond (${request}).`,
      communication: (request: string) => `Communication with the language server failed (${request}).`,
      server: (message: string) => `Language server: ${message}`,
      initializeTimeout: 'the server did not respond to "initialize" in time',
      noServer: 'No language server is ready for this file.',
      noActiveServer: 'No language server is active for this file.',
      commandRejected: (command: string) => `The language server does not accept the command "${command}".`,
      noFolder: 'No folder is open in this window.',
      bundledMissing: 'The bundled typescript-language-server was not found in the app installation.',
      spawn: (command: string, detail: string) => `Could not start "${command}": ${detail}`,
      spawnWindowsScript: (command: string, detail: string) =>
        `Could not start "${command}": ${detail}. .cmd/.bat scripts do not run without a shell and Walph does not use ` +
        'a shell: point "command" to the real executable or use "node" with the script in "args".',
      spawnWindowsInvalid: (command: string, detail: string) =>
        `Could not start "${command}": ${detail}. If it is a .cmd/.bat, point to the real executable or use "node" ` +
        'with the script in "args".',
      invalidServer: 'Invalid language server.',
      invalidRequest: (what: string) => `Invalid language server request (${what}).`
    },
    args: {
      path: 'path',
      position: 'position',
      trigger: 'trigger character',
      item: 'item',
      newName: 'new name',
      formatOptions: 'formatting options',
      range: 'range',
      command: 'command',
      query: 'query'
    },
    edit: {
      malformed: 'The edit sent by the server is malformed. Nothing was changed.',
      resourceOperations:
        'The edit asks to create, rename or delete files, which Walph does not support yet. Nothing was changed.',
      notLocal: 'The edit changes a resource that is not a local file. Nothing was changed.',
      outsideWorkspace: (path: string) =>
        `The edit changes a file outside the workspace folder (${path}). Nothing was changed.`,
      staleRetry: 'The edit was computed for an old version of the file. Try again.',
      stale: 'The edit was computed for an old version of the file.',
      sequential: 'Edits in steps on the same file are not supported. Nothing was changed.',
      overlapping: 'The server edits overlap.',
      unavailable: 'Unavailable.',
      cannotApply: 'The edit cannot be applied.',
      folderChanged: 'The folder changed during the operation.',
      changedWhileWaiting: (name: string) => `"${name}" changed while the server was responding.`,
      closedDuring: (name: string) => `"${name}" was closed during the operation.`,
      expired: 'The server request expired.',
      expiredDuring: 'The server request expired during the operation.',
      writeFailed: (failures: string) => `Could not write ${failures}`,
      writeFailedPartial: (failures: string, written: string) =>
        `Could not write ${failures} (already written: ${written})`,
      partiallyApplied: (applied: number, total: number) =>
        `Change applied to ${applied} of ${total} files: an open file changed during the operation.`
    },
    navigation: {
      noDefinition: 'No definition found.',
      noDefinitionFor: (name: string) => `No definition found for "${name}".`,
      definitions: 'Definitions',
      definitionsOf: (name: string) => `Definitions of "${name}"`,
      noReference: 'No references found.',
      noReferenceFor: (name: string) => `No references found for "${name}".`,
      references: 'References',
      referencesOf: (name: string) => `References to "${name}"`
    },
    rename: {
      inputLabel: 'New symbol name',
      notRenamable: 'This symbol cannot be renamed.',
      noChanges: 'The server did not propose any changes.',
      failed: (reason: string) => `Could not rename: ${reason}`,
      done: (files: number) => (files === 1 ? 'Renamed in 1 file.' : `Renamed in ${files} files.`)
    },
    format: {
      changedDuring: 'The document changed during formatting; try again.',
      alreadyFormatted: 'The document is already formatted.'
    },
    codeActions: {
      show: (shortcut: string) => `Show Code Actions (${shortcut})`,
      menuLabel: 'Code actions',
      none: 'No code actions available here.',
      stale: 'The document changed; request the code actions again.',
      applyFailed: (title: string, reason: string) => `Could not apply "${title}": ${reason}`
    },
    panels: {
      problems: 'Problems',
      noProblems: 'No problems have been detected in the workspace.',
      position: (line: number, column: number) => `[Ln ${line}, Col ${column}]`,
      references: 'References',
      noReferences: 'No results. Use Go to References on a symbol.',
      noReferencesWithKey: (key: string) => `No results. Use Go to References (${key}) on a symbol.`,
      output: 'Output',
      noOutput: 'No output from the language servers.',
      clearOutput: 'Clear Output',
      outputFailed: (message: string) => `Output: ${message}`
    }
  },
  es: {
    requests: {
      completion: 'completar',
      resolveCompletion: 'detalles del elemento',
      hover: 'hover',
      signatureHelp: 'ayuda de firma',
      definition: 'definición',
      references: 'referencias',
      rename: 'cambiar nombre',
      format: 'formatear',
      codeActions: 'acciones de código',
      resolveCodeAction: 'resolver acción',
      executeCommand: 'ejecutar comando',
      documentSymbols: 'símbolos del archivo',
      workspaceSymbols: 'símbolos del espacio de trabajo',
      inlayHints: 'sugerencias insertadas',
      documentHighlights: 'resaltado de apariciones',
      semanticTokens: 'resaltado semántico'
    },
    log: {
      willStart: (name: string, root: string) => `El servidor "${name}" se iniciará en ${root}.`,
      stopped: 'Servidor detenido (configuración modificada o desactivado).',
      idleStopped: (why: string) => `Servidor detenido por inactividad (${why}); se vuelve a abrir cuando haga falta.`,
      idleNoDocuments: 'sin documentos abiertos',
      idleWorkspace: 'espacio de trabajo inactivo',
      starting: (command: string) => `Iniciando: ${command}`,
      protocolError: (message: string) => `Error de protocolo: ${message}`,
      ready: 'Servidor listo.',
      initializeFailed: (message: string) => `No se pudo inicializar: ${message}`,
      crashed: (how: string) => `El servidor terminó inesperadamente (${how}).`,
      restartingIn: (seconds: number, attempt: number, max: number) =>
        `Reiniciando en ${seconds} s (intento ${attempt} de ${max}).`
    },
    state: {
      restarting: (attempt: number, max: number) => `reiniciando (intento ${attempt} de ${max})`,
      gaveUp: (how: string, max: number) =>
        `El servidor terminó inesperadamente (${how}) y no volvió después de ${max} intentos. Use "Reiniciar servidor de lenguaje".`,
      exitSignal: (signal: string) => `señal ${signal}`,
      exitCode: (code: string) => `código ${code}`
    },
    errors: {
      notReady: 'El servidor de lenguaje no está listo.',
      timeout: (request: string) => `El servidor de lenguaje tardó demasiado en responder (${request}).`,
      communication: (request: string) => `Falló la comunicación con el servidor de lenguaje (${request}).`,
      server: (message: string) => `Servidor de lenguaje: ${message}`,
      initializeTimeout: 'el servidor no respondió a "initialize" a tiempo',
      noServer: 'Ningún servidor de lenguaje está listo para este archivo.',
      noActiveServer: 'Ningún servidor de lenguaje está activo para este archivo.',
      commandRejected: (command: string) => `El servidor de lenguaje no acepta el comando "${command}".`,
      noFolder: 'No hay ninguna carpeta abierta en esta ventana.',
      bundledMissing: 'No se encontró el typescript-language-server incluido en la instalación de la app.',
      spawn: (command: string, detail: string) => `No se pudo iniciar "${command}": ${detail}`,
      spawnWindowsScript: (command: string, detail: string) =>
        `No se pudo iniciar "${command}": ${detail}. Los scripts .cmd/.bat no se ejecutan sin shell y Walph no usa ` +
        'shell: apunte "command" al ejecutable real o use "node" con el script en "args".',
      spawnWindowsInvalid: (command: string, detail: string) =>
        `No se pudo iniciar "${command}": ${detail}. Si es un .cmd/.bat, apunte al ejecutable real o use "node" con ` +
        'el script en "args".',
      invalidServer: 'Servidor de lenguaje no válido.',
      invalidRequest: (what: string) => `Solicitud al servidor de lenguaje no válida (${what}).`
    },
    args: {
      path: 'ruta',
      position: 'posición',
      trigger: 'carácter de activación',
      item: 'elemento',
      newName: 'nuevo nombre',
      formatOptions: 'opciones de formato',
      range: 'intervalo',
      command: 'comando',
      query: 'consulta'
    },
    edit: {
      malformed: 'La edición enviada por el servidor está mal formada. No se modificó nada.',
      resourceOperations:
        'La edición pide crear, cambiar el nombre o eliminar archivos, algo que Walph todavía no admite. No se modificó nada.',
      notLocal: 'La edición modifica un recurso que no es un archivo local. No se modificó nada.',
      outsideWorkspace: (path: string) =>
        `La edición modifica un archivo fuera de la carpeta del espacio de trabajo (${path}). No se modificó nada.`,
      staleRetry: 'La edición se calculó para una versión antigua del archivo. Inténtelo de nuevo.',
      stale: 'La edición se calculó para una versión antigua del archivo.',
      sequential: 'No se admiten ediciones por etapas sobre el mismo archivo. No se modificó nada.',
      overlapping: 'Las ediciones del servidor se superponen.',
      unavailable: 'No disponible.',
      cannotApply: 'No se puede aplicar la edición.',
      folderChanged: 'La carpeta cambió durante la operación.',
      changedWhileWaiting: (name: string) => `"${name}" se modificó mientras el servidor respondía.`,
      closedDuring: (name: string) => `"${name}" se cerró durante la operación.`,
      expired: 'La solicitud del servidor caducó.',
      expiredDuring: 'La solicitud del servidor caducó durante la operación.',
      writeFailed: (failures: string) => `No se pudo escribir ${failures}`,
      writeFailedPartial: (failures: string, written: string) =>
        `No se pudo escribir ${failures} (ya escritos: ${written})`,
      partiallyApplied: (applied: number, total: number) =>
        `Cambio aplicado en ${applied} de ${total} archivos: un archivo abierto cambió durante la operación.`
    },
    navigation: {
      noDefinition: 'No se encontró ninguna definición.',
      noDefinitionFor: (name: string) => `No se encontró ninguna definición para "${name}".`,
      definitions: 'Definiciones',
      definitionsOf: (name: string) => `Definiciones de "${name}"`,
      noReference: 'No se encontró ninguna referencia.',
      noReferenceFor: (name: string) => `No se encontró ninguna referencia para "${name}".`,
      references: 'Referencias',
      referencesOf: (name: string) => `Referencias de "${name}"`
    },
    rename: {
      inputLabel: 'Nuevo nombre del símbolo',
      notRenamable: 'No se puede cambiar el nombre de este símbolo.',
      noChanges: 'El servidor no propuso ningún cambio.',
      failed: (reason: string) => `No se pudo cambiar el nombre: ${reason}`,
      done: (files: number) => (files === 1 ? 'Nombre cambiado en 1 archivo.' : `Nombre cambiado en ${files} archivos.`)
    },
    format: {
      changedDuring: 'El documento cambió durante el formato; inténtelo de nuevo.',
      alreadyFormatted: 'El documento ya tiene formato.'
    },
    codeActions: {
      show: (shortcut: string) => `Mostrar acciones de código (${shortcut})`,
      menuLabel: 'Acciones de código',
      none: 'No hay acciones de código disponibles aquí.',
      stale: 'El documento cambió; vuelva a pedir las acciones de código.',
      applyFailed: (title: string, reason: string) => `No se pudo aplicar "${title}": ${reason}`
    },
    panels: {
      problems: 'Problemas',
      noProblems: 'No se detectaron problemas en el espacio de trabajo.',
      position: (line: number, column: number) => `[Lín. ${line}, col. ${column}]`,
      references: 'Referencias',
      noReferences: 'Sin resultados. Use Ir a referencias en un símbolo.',
      noReferencesWithKey: (key: string) => `Sin resultados. Use Ir a referencias (${key}) en un símbolo.`,
      output: 'Salida',
      noOutput: 'No hay salida de los servidores de lenguaje.',
      clearOutput: 'Limpiar salida',
      outputFailed: (message: string) => `Salida: ${message}`
    }
  }
})
