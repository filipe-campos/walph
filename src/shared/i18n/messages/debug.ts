import { defineMessages } from '../define'

// Debugger texts produced in main (errors, console output, names of the default configurations).
export const debug = defineMessages({
  'pt-BR': {
    builtinConfig: {
      pythonFile: 'Python: Arquivo Atual',
      nodeFile: 'Node.js: Arquivo Atual'
    },
    console: {
      starting: (command: string) => `Iniciando o adaptador: ${command}`,
      exited: (code: number) => `O programa terminou com o código ${code}.`,
      preLaunchTaskIgnored: (task: string) => `"preLaunchTask" (${task}) ignorado: o Walph não executa tarefas.`,
      postDebugTaskIgnored: (task: string) => `"postDebugTask" (${task}) ignorado: o Walph não executa tarefas.`
    },
    errors: {
      noFolder: 'Abra uma pasta para depurar.',
      configNotFound: (name: string) => `Configuração de depuração "${name}" não encontrada no launch.json.`,
      launchJsonInvalid: (detail: string) => `O .vscode/launch.json é inválido: ${detail}`,
      launchJsonRead: (detail: string) => `Não foi possível ler o .vscode/launch.json: ${detail}`,
      launchJsonShape: 'esperado um objeto com a lista "configurations"',
      invalidConfig: (name: string) =>
        `A configuração "${name}" precisa de "type" e de "request" ("launch" ou "attach").`,
      unsupportedVariable: (variable: string) => `A variável \${${variable}} não é suportada no launch.json.`,
      needsFile: (variable: string) => `A variável \${${variable}} exige um arquivo aberto no editor.`,
      noAdapter: (type: string) =>
        `Nenhum adaptador de depuração para o tipo "${type}". Configure "debug.adapters" nas configurações do usuário.`,
      spawn: (command: string, detail: string) => `Não foi possível iniciar o adaptador "${command}": ${detail}`,
      exited: (how: string) => `O adaptador de depuração encerrou inesperadamente (${how}).`,
      exitedDetail: (how: string, detail: string) =>
        `O adaptador de depuração encerrou inesperadamente (${how}): ${detail}`,
      executableNotFound: (value: string) =>
        `Executável do adaptador de depuração não encontrado: ${value}. Confira "debug.adapters" (Python: pip install debugpy).`,
      scriptNotExecutable: (file: string) =>
        `"${file}" é um script .cmd/.bat e não roda sem shell: aponte "debug.adapters" para o executável real.`,
      exitSignal: (signal: string) => `sinal ${signal}`,
      exitCode: (code: string) => `código ${code}`,
      connectTimeout: 'O adaptador de depuração não abriu a porta local a tempo.',
      timeout: (request: string) => `O adaptador de depuração demorou demais para responder (${request}).`,
      communication: (request: string) => `Falha na comunicação com o adaptador de depuração (${request}).`,
      adapter: (message: string) => `Depurador: ${message}`,
      sessionEnded: 'A sessão de depuração já terminou.',
      noThread: 'Nenhuma thread disponível na sessão de depuração.',
      invalidRequest: (what: string) => `Pedido de depuração inválido: ${what}.`,
      ticketExpired: 'O pedido do depurador para abrir um terminal expirou.',
      runSpawn: (file: string, detail: string) => `Não foi possível iniciar o programa "${file}": ${detail}`,
      createLaunchFile: (detail: string) => `Não foi possível criar o .vscode/launch.json: ${detail}`
    },
    args: {
      name: 'nome da configuração',
      options: 'opções',
      session: 'sessão',
      action: 'ação',
      thread: 'thread',
      frame: 'quadro da pilha',
      reference: 'referência de variáveis',
      expression: 'expressão',
      context: 'contexto'
    }
  },
  en: {
    builtinConfig: {
      pythonFile: 'Python: Current File',
      nodeFile: 'Node.js: Current File'
    },
    console: {
      starting: (command: string) => `Starting the adapter: ${command}`,
      exited: (code: number) => `The program exited with code ${code}.`,
      preLaunchTaskIgnored: (task: string) => `"preLaunchTask" (${task}) ignored: Walph does not run tasks.`,
      postDebugTaskIgnored: (task: string) => `"postDebugTask" (${task}) ignored: Walph does not run tasks.`
    },
    errors: {
      noFolder: 'Open a folder to debug.',
      configNotFound: (name: string) => `Debug configuration "${name}" not found in launch.json.`,
      launchJsonInvalid: (detail: string) => `.vscode/launch.json is invalid: ${detail}`,
      launchJsonRead: (detail: string) => `Could not read .vscode/launch.json: ${detail}`,
      launchJsonShape: 'expected an object with a "configurations" list',
      invalidConfig: (name: string) => `The configuration "${name}" needs "type" and "request" ("launch" or "attach").`,
      unsupportedVariable: (variable: string) => `The variable \${${variable}} is not supported in launch.json.`,
      needsFile: (variable: string) => `The variable \${${variable}} needs a file open in the editor.`,
      noAdapter: (type: string) =>
        `No debug adapter for the type "${type}". Configure "debug.adapters" in the user settings.`,
      spawn: (command: string, detail: string) => `Could not start the adapter "${command}": ${detail}`,
      exited: (how: string) => `The debug adapter exited unexpectedly (${how}).`,
      exitedDetail: (how: string, detail: string) => `The debug adapter exited unexpectedly (${how}): ${detail}`,
      executableNotFound: (value: string) =>
        `Debug adapter executable not found: ${value}. Check "debug.adapters" (Python: pip install debugpy).`,
      scriptNotExecutable: (file: string) =>
        `"${file}" is a .cmd/.bat script and does not run without a shell: point "debug.adapters" to the real executable.`,
      exitSignal: (signal: string) => `signal ${signal}`,
      exitCode: (code: string) => `code ${code}`,
      connectTimeout: 'The debug adapter did not open its local port in time.',
      timeout: (request: string) => `The debug adapter took too long to respond (${request}).`,
      communication: (request: string) => `Communication with the debug adapter failed (${request}).`,
      adapter: (message: string) => `Debugger: ${message}`,
      sessionEnded: 'The debug session has already ended.',
      noThread: 'No thread available in the debug session.',
      invalidRequest: (what: string) => `Invalid debug request: ${what}.`,
      ticketExpired: 'The debugger request to open a terminal has expired.',
      runSpawn: (file: string, detail: string) => `Could not start the program "${file}": ${detail}`,
      createLaunchFile: (detail: string) => `Could not create .vscode/launch.json: ${detail}`
    },
    args: {
      name: 'configuration name',
      options: 'options',
      session: 'session',
      action: 'action',
      thread: 'thread',
      frame: 'stack frame',
      reference: 'variables reference',
      expression: 'expression',
      context: 'context'
    }
  },
  es: {
    builtinConfig: {
      pythonFile: 'Python: archivo actual',
      nodeFile: 'Node.js: archivo actual'
    },
    console: {
      starting: (command: string) => `Iniciando el adaptador: ${command}`,
      exited: (code: number) => `El programa terminó con el código ${code}.`,
      preLaunchTaskIgnored: (task: string) => `"preLaunchTask" (${task}) ignorado: Walph no ejecuta tareas.`,
      postDebugTaskIgnored: (task: string) => `"postDebugTask" (${task}) ignorado: Walph no ejecuta tareas.`
    },
    errors: {
      noFolder: 'Abra una carpeta para depurar.',
      configNotFound: (name: string) => `No se encontró la configuración de depuración "${name}" en launch.json.`,
      launchJsonInvalid: (detail: string) => `El archivo .vscode/launch.json no es válido: ${detail}`,
      launchJsonRead: (detail: string) => `No se pudo leer .vscode/launch.json: ${detail}`,
      launchJsonShape: 'se esperaba un objeto con la lista "configurations"',
      invalidConfig: (name: string) => `La configuración "${name}" necesita "type" y "request" ("launch" o "attach").`,
      unsupportedVariable: (variable: string) => `La variable \${${variable}} no es compatible en launch.json.`,
      needsFile: (variable: string) => `La variable \${${variable}} necesita un archivo abierto en el editor.`,
      noAdapter: (type: string) =>
        `No hay adaptador de depuración para el tipo "${type}". Configure "debug.adapters" en la configuración del usuario.`,
      spawn: (command: string, detail: string) => `No se pudo iniciar el adaptador "${command}": ${detail}`,
      exited: (how: string) => `El adaptador de depuración terminó inesperadamente (${how}).`,
      exitedDetail: (how: string, detail: string) =>
        `El adaptador de depuración terminó inesperadamente (${how}): ${detail}`,
      executableNotFound: (value: string) =>
        `No se encontró el ejecutable del adaptador de depuración: ${value}. Revise "debug.adapters" (Python: pip install debugpy).`,
      scriptNotExecutable: (file: string) =>
        `"${file}" es un script .cmd/.bat y no se ejecuta sin shell: apunte "debug.adapters" al ejecutable real.`,
      exitSignal: (signal: string) => `señal ${signal}`,
      exitCode: (code: string) => `código ${code}`,
      connectTimeout: 'El adaptador de depuración no abrió su puerto local a tiempo.',
      timeout: (request: string) => `El adaptador de depuración tardó demasiado en responder (${request}).`,
      communication: (request: string) => `Falló la comunicación con el adaptador de depuración (${request}).`,
      adapter: (message: string) => `Depurador: ${message}`,
      sessionEnded: 'La sesión de depuración ya terminó.',
      noThread: 'No hay ningún hilo disponible en la sesión de depuración.',
      invalidRequest: (what: string) => `Solicitud de depuración no válida: ${what}.`,
      ticketExpired: 'La solicitud del depurador para abrir una terminal expiró.',
      runSpawn: (file: string, detail: string) => `No se pudo iniciar el programa "${file}": ${detail}`,
      createLaunchFile: (detail: string) => `No se pudo crear .vscode/launch.json: ${detail}`
    },
    args: {
      name: 'nombre de la configuración',
      options: 'opciones',
      session: 'sesión',
      action: 'acción',
      thread: 'hilo',
      frame: 'marco de pila',
      reference: 'referencia de variables',
      expression: 'expresión',
      context: 'contexto'
    }
  }
})
