import { defineMessages, plural } from '../define'

// Debugger UI texts (Run and Debug view, floating toolbar, Debug Console, editor).
export const debugUi = defineMessages({
  'pt-BR': {
    toolbar: 'Barra de depuração',
    view: {
      title: 'Executar e Depurar',
      configuration: 'Configuração de depuração',
      noConfigurations: 'Nenhuma configuração',
      builtinOption: (name: string) => `${name} (padrão)`,
      start: 'Iniciar Depuração',
      stop: 'Parar Depuração',
      openLaunchJson: 'Abrir launch.json',
      launchJsonError: (message: string) => `launch.json: ${message}`,
      notRunning: 'Nenhuma sessão de depuração. Escolha uma configuração e inicie (F5).',
      createLaunchJson: 'Criar launch.json'
    },
    sections: {
      variables: 'Variáveis',
      watch: 'Inspeção',
      callStack: 'Pilha de Chamadas',
      breakpoints: 'Breakpoints'
    },
    variables: {
      notStopped: 'Disponível quando o programa estiver pausado.',
      empty: 'Nenhuma variável.',
      loading: 'Carregando…',
      expand: (name: string) => `Expandir ${name}`
    },
    watch: {
      add: 'Adicionar Expressão',
      removeAll: 'Remover Todas as Expressões',
      remove: 'Remover Expressão',
      edit: 'Editar Expressão',
      inputLabel: 'Expressão a inspecionar',
      empty: 'Nenhuma expressão.',
      notAvailable: 'indisponível'
    },
    callStack: {
      empty: 'Nenhuma sessão em execução.',
      running: 'Executando',
      starting: 'Iniciando',
      paused: (reason: string) => `Pausado em ${reason}`,
      pausedPlain: 'Pausado',
      noFrames: 'Nenhum quadro disponível.',
      frameLocation: (source: string, line: number) => `${source}:${line}`,
      unknownSource: 'origem desconhecida',
      session: (name: string) => `Sessão ${name}`,
      thread: (name: string) => `Thread ${name}`
    },
    breakpoints: {
      empty: 'Nenhum breakpoint. Clique à esquerda dos números de linha (ou F9) para adicionar.',
      enable: (label: string) => `Ativar ${label}`,
      remove: 'Remover Breakpoint',
      removeAll: 'Remover Todos os Breakpoints',
      toggleAll: 'Ativar/Desativar Todos os Breakpoints',
      editCondition: 'Editar Condição',
      conditionLabel: 'Condição do breakpoint',
      location: (file: string, line: number) => `${file}:${line}`,
      unverified: 'Não verificado pelo depurador',
      condition: (text: string) => `Condição: ${text}`,
      hitCondition: (text: string) => `Contagem: ${text}`,
      logMessage: (text: string) => `Log: ${text}`,
      count: (n: number) => plural(n, '1 breakpoint', `${n} breakpoints`)
    },
    gutter: {
      modeExpression: 'Expressão',
      modeHitCount: 'Contagem',
      modeLog: 'Mensagem de log',
      modeLabel: 'Tipo do breakpoint (clique para trocar)',
      placeholderExpression: 'Pausa quando a expressão for verdadeira. Enter confirma, Esc cancela.',
      placeholderHitCount: 'Pausa a partir de N passagens (ex.: 3 ou >= 3). Enter confirma, Esc cancela.',
      placeholderLog: 'Mensagem a registrar; {expressão} é interpolada. Enter confirma, Esc cancela.',
      inputLabel: 'Condição do breakpoint',
      stoppedHere: 'Execução pausada aqui'
    },
    toolbarActions: {
      continue: 'Continuar',
      pause: 'Pausar',
      stepOver: 'Passar por Cima',
      stepInto: 'Entrar',
      stepOut: 'Sair',
      restart: 'Reiniciar',
      stop: 'Parar'
    },
    console: {
      label: 'Console de Depuração',
      empty: 'A saída do programa e das expressões avaliadas aparece aqui.',
      inputLabel: 'Avaliar expressão',
      placeholder: 'Avaliar expressão (Enter). ↑/↓ percorrem o histórico.',
      placeholderIdle: 'Inicie uma sessão de depuração para avaliar expressões.',
      clear: 'Limpar Console'
    },
    picker: {
      none: 'Nenhuma configuração de depuração.',
      create: 'Criar launch.json…',
      open: 'Abrir launch.json',
      builtin: 'padrão do Walph'
    },
    errors: {
      noConfiguration: 'Nenhuma configuração de depuração. Crie um .vscode/launch.json.',
      noSession: 'Nenhuma sessão de depuração ativa.'
    }
  },
  en: {
    toolbar: 'Debug toolbar',
    view: {
      title: 'Run and Debug',
      configuration: 'Debug configuration',
      noConfigurations: 'No configurations',
      builtinOption: (name: string) => `${name} (default)`,
      start: 'Start Debugging',
      stop: 'Stop Debugging',
      openLaunchJson: 'Open launch.json',
      launchJsonError: (message: string) => `launch.json: ${message}`,
      notRunning: 'No debug session. Pick a configuration and start (F5).',
      createLaunchJson: 'Create launch.json'
    },
    sections: {
      variables: 'Variables',
      watch: 'Watch',
      callStack: 'Call Stack',
      breakpoints: 'Breakpoints'
    },
    variables: {
      notStopped: 'Available while the program is paused.',
      empty: 'No variables.',
      loading: 'Loading…',
      expand: (name: string) => `Expand ${name}`
    },
    watch: {
      add: 'Add Expression',
      removeAll: 'Remove All Expressions',
      remove: 'Remove Expression',
      edit: 'Edit Expression',
      inputLabel: 'Expression to watch',
      empty: 'No expressions.',
      notAvailable: 'not available'
    },
    callStack: {
      empty: 'No session running.',
      running: 'Running',
      starting: 'Starting',
      paused: (reason: string) => `Paused on ${reason}`,
      pausedPlain: 'Paused',
      noFrames: 'No frames available.',
      frameLocation: (source: string, line: number) => `${source}:${line}`,
      unknownSource: 'unknown source',
      session: (name: string) => `Session ${name}`,
      thread: (name: string) => `Thread ${name}`
    },
    breakpoints: {
      empty: 'No breakpoints. Click left of the line numbers (or F9) to add one.',
      enable: (label: string) => `Enable ${label}`,
      remove: 'Remove Breakpoint',
      removeAll: 'Remove All Breakpoints',
      toggleAll: 'Enable/Disable All Breakpoints',
      editCondition: 'Edit Condition',
      conditionLabel: 'Breakpoint condition',
      location: (file: string, line: number) => `${file}:${line}`,
      unverified: 'Not verified by the debugger',
      condition: (text: string) => `Condition: ${text}`,
      hitCondition: (text: string) => `Hit count: ${text}`,
      logMessage: (text: string) => `Log: ${text}`,
      count: (n: number) => plural(n, '1 breakpoint', `${n} breakpoints`)
    },
    gutter: {
      modeExpression: 'Expression',
      modeHitCount: 'Hit Count',
      modeLog: 'Log Message',
      modeLabel: 'Breakpoint type (click to change)',
      placeholderExpression: 'Break when the expression is true. Enter to accept, Esc to cancel.',
      placeholderHitCount: 'Break after N hits (e.g. 3 or >= 3). Enter to accept, Esc to cancel.',
      placeholderLog: 'Message to log; {expression} is interpolated. Enter to accept, Esc to cancel.',
      inputLabel: 'Breakpoint condition',
      stoppedHere: 'Execution paused here'
    },
    toolbarActions: {
      continue: 'Continue',
      pause: 'Pause',
      stepOver: 'Step Over',
      stepInto: 'Step Into',
      stepOut: 'Step Out',
      restart: 'Restart',
      stop: 'Stop'
    },
    console: {
      label: 'Debug Console',
      empty: 'Program output and evaluated expressions show up here.',
      inputLabel: 'Evaluate expression',
      placeholder: 'Evaluate expression (Enter). Up/Down browse the history.',
      placeholderIdle: 'Start a debug session to evaluate expressions.',
      clear: 'Clear Console'
    },
    picker: {
      none: 'No debug configurations.',
      create: 'Create launch.json…',
      open: 'Open launch.json',
      builtin: 'Walph default'
    },
    errors: {
      noConfiguration: 'No debug configuration. Create a .vscode/launch.json.',
      noSession: 'No active debug session.'
    }
  },
  es: {
    toolbar: 'Barra de depuración',
    view: {
      title: 'Ejecutar y depurar',
      configuration: 'Configuración de depuración',
      noConfigurations: 'Ninguna configuración',
      builtinOption: (name: string) => `${name} (predeterminada)`,
      start: 'Iniciar depuración',
      stop: 'Detener depuración',
      openLaunchJson: 'Abrir launch.json',
      launchJsonError: (message: string) => `launch.json: ${message}`,
      notRunning: 'No hay sesión de depuración. Elija una configuración e inicie (F5).',
      createLaunchJson: 'Crear launch.json'
    },
    sections: {
      variables: 'Variables',
      watch: 'Inspección',
      callStack: 'Pila de llamadas',
      breakpoints: 'Puntos de interrupción'
    },
    variables: {
      notStopped: 'Disponible cuando el programa está en pausa.',
      empty: 'Ninguna variable.',
      loading: 'Cargando…',
      expand: (name: string) => `Expandir ${name}`
    },
    watch: {
      add: 'Agregar expresión',
      removeAll: 'Quitar todas las expresiones',
      remove: 'Quitar expresión',
      edit: 'Editar expresión',
      inputLabel: 'Expresión a inspeccionar',
      empty: 'Ninguna expresión.',
      notAvailable: 'no disponible'
    },
    callStack: {
      empty: 'Ninguna sesión en ejecución.',
      running: 'En ejecución',
      starting: 'Iniciando',
      paused: (reason: string) => `En pausa por ${reason}`,
      pausedPlain: 'En pausa',
      noFrames: 'No hay marcos disponibles.',
      frameLocation: (source: string, line: number) => `${source}:${line}`,
      unknownSource: 'origen desconocido',
      session: (name: string) => `Sesión ${name}`,
      thread: (name: string) => `Hilo ${name}`
    },
    breakpoints: {
      empty: 'Ningún punto de interrupción. Haga clic a la izquierda de los números de línea (o F9) para agregar uno.',
      enable: (label: string) => `Activar ${label}`,
      remove: 'Quitar punto de interrupción',
      removeAll: 'Quitar todos los puntos de interrupción',
      toggleAll: 'Activar/desactivar todos los puntos de interrupción',
      editCondition: 'Editar condición',
      conditionLabel: 'Condición del punto de interrupción',
      location: (file: string, line: number) => `${file}:${line}`,
      unverified: 'No verificado por el depurador',
      condition: (text: string) => `Condición: ${text}`,
      hitCondition: (text: string) => `Recuento: ${text}`,
      logMessage: (text: string) => `Registro: ${text}`,
      count: (n: number) => plural(n, '1 punto de interrupción', `${n} puntos de interrupción`)
    },
    gutter: {
      modeExpression: 'Expresión',
      modeHitCount: 'Recuento',
      modeLog: 'Mensaje de registro',
      modeLabel: 'Tipo de punto de interrupción (clic para cambiar)',
      placeholderExpression: 'Se detiene cuando la expresión es verdadera. Enter acepta, Esc cancela.',
      placeholderHitCount: 'Se detiene tras N pasadas (p. ej. 3 o >= 3). Enter acepta, Esc cancela.',
      placeholderLog: 'Mensaje a registrar; {expresión} se interpola. Enter acepta, Esc cancela.',
      inputLabel: 'Condición del punto de interrupción',
      stoppedHere: 'Ejecución en pausa aquí'
    },
    toolbarActions: {
      continue: 'Continuar',
      pause: 'Pausar',
      stepOver: 'Paso a paso por procedimientos',
      stepInto: 'Paso a paso por instrucciones',
      stepOut: 'Salir',
      restart: 'Reiniciar',
      stop: 'Detener'
    },
    console: {
      label: 'Consola de depuración',
      empty: 'La salida del programa y las expresiones evaluadas aparecen aquí.',
      inputLabel: 'Evaluar expresión',
      placeholder: 'Evaluar expresión (Enter). Arriba/Abajo recorren el historial.',
      placeholderIdle: 'Inicie una sesión de depuración para evaluar expresiones.',
      clear: 'Borrar consola'
    },
    picker: {
      none: 'Ninguna configuración de depuración.',
      create: 'Crear launch.json…',
      open: 'Abrir launch.json',
      builtin: 'predeterminada de Walph'
    },
    errors: {
      noConfiguration: 'Ninguna configuración de depuración. Cree un .vscode/launch.json.',
      noSession: 'No hay ninguna sesión de depuración activa.'
    }
  }
})
