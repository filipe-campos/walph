import { defineMessages, plural } from '../define'

/** Time unit of the `docker ps` `Up …`. */
export type UptimeUnit = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'

const PT_UNITS: Record<UptimeUnit, [string, string]> = {
  second: ['segundo', 'segundos'],
  minute: ['minuto', 'minutos'],
  hour: ['hora', 'horas'],
  day: ['dia', 'dias'],
  week: ['semana', 'semanas'],
  month: ['mês', 'meses'],
  year: ['ano', 'anos']
}

const EN_UNITS: Record<UptimeUnit, [string, string]> = {
  second: ['second', 'seconds'],
  minute: ['minute', 'minutes'],
  hour: ['hour', 'hours'],
  day: ['day', 'days'],
  week: ['week', 'weeks'],
  month: ['month', 'months'],
  year: ['year', 'years']
}
const EN_ONE: Record<UptimeUnit, string> = {
  second: 'a second',
  minute: 'a minute',
  hour: 'an hour',
  day: 'a day',
  week: 'a week',
  month: 'a month',
  year: 'a year'
}

const ES_UNITS: Record<UptimeUnit, [string, string]> = {
  second: ['segundo', 'segundos'],
  minute: ['minuto', 'minutos'],
  hour: ['hora', 'horas'],
  day: ['día', 'días'],
  week: ['semana', 'semanas'],
  month: ['mes', 'meses'],
  year: ['año', 'años']
}
// The article agrees with the unit's gender ("una hora", "un día").
const ES_ONE: Record<UptimeUnit, string> = {
  second: 'un segundo',
  minute: 'un minuto',
  hour: 'una hora',
  day: 'un día',
  week: 'una semana',
  month: 'un mes',
  year: 'un año'
}

const count = (units: Record<UptimeUnit, [string, string]>, n: number, unit: UptimeUnit): string =>
  `${n} ${plural(n, units[unit][0], units[unit][1])}`

export const containers = defineMessages({
  'pt-BR': {
    title: 'Containers',
    uptime: {
      count: (n: number, unit: UptimeUnit) => count(PT_UNITS, n, unit),
      lessThanOne: (unit: UptimeUnit) => `menos de 1 ${PT_UNITS[unit][0]}`,
      aboutOne: (unit: UptimeUnit) => `cerca de 1 ${PT_UNITS[unit][0]}`
    },
    status: {
      unhealthy: 'Não saudável',
      starting: 'Iniciando',
      healthy: 'Saudável',
      running: 'Rodando',
      restarting: 'Reiniciando',
      paused: 'Pausado',
      exited: 'Parado',
      created: 'Criado',
      dead: 'Morto',
      removing: 'Removendo'
    },
    problem: {
      restartLoop: 'Reiniciando em loop',
      withUptime: (status: string, uptime: string) => `${status} · rodando há ${uptime}`,
      label: (name: string) => `Problema em ${name}`,
      investigate: 'Investigar com o Claude',
      viewLogs: 'Ver logs',
      more: (n: number) => `+${n} com problema`,
      needsFolder: 'Abra uma pasta para investigar com o Claude.'
    },
    standalone: 'Avulsos',
    logLevel: { info: 'INFO', warn: 'AVISO', error: 'ERRO', debug: 'DEBUG' },
    summary: {
      running: 'Rodando',
      ofTotal: (total: number) => `de ${total} containers`,
      stopped: 'Parados',
      stoppedHint: 'fora de execução',
      problems: 'Com problema',
      problemsHint: 'não saudável ou reiniciando',
      allGood: 'tudo certo',
      resources: 'CPU e memória',
      memoryOf: (used: string, total: string) => `${used} de ${total}`,
      memoryLabel: 'Memória total em uso'
    },
    view: {
      loading: 'Carregando containers…',
      empty: 'Nenhum container neste Docker. Suba um projeto com "Compose up".',
      noMatch: 'Nenhum container corresponde à busca ou ao filtro.',
      search: 'Buscar containers',
      filterLabel: 'Filtrar containers',
      filters: { all: 'Todos', running: 'Rodando', stopped: 'Parados' },
      composeUp: 'Compose up',
      composeUpIn: (target: string) => `Compose up em ${target}`,
      noComposeFile: 'Nenhum arquivo compose na pasta deste workspace'
    },
    group: {
      running: (running: number, total: number) => `${running}/${total} rodando`,
      inWorkspace: 'Deste workspace',
      restart: 'Reiniciar',
      stop: 'Parar'
    },
    row: {
      start: (name: string) => `Iniciar ${name}`,
      stop: (name: string) => `Parar ${name}`,
      restart: (name: string) => `Reiniciar ${name}`,
      logs: (name: string) => `Logs de ${name}`,
      terminal: (name: string) => `Terminal em ${name}`,
      memory: (name: string) => `Memória de ${name}`,
      openUrl: (url: string) => `Abrir ${url}`,
      openUrlInBrowser: (url: string) => `Abrir ${url} no navegador`,
      morePorts: (n: number, ports: string) => `Mais ${n} portas: ${ports}`
    },
    detail: {
      label: (name: string) => `Detalhes de ${name}`,
      tabsLabel: 'Detalhes do container',
      tabs: { logs: 'Logs', details: 'Detalhes' },
      back: 'Voltar à lista',
      terminal: 'Terminal',
      openTerminal: 'Abrir um terminal dentro do container',
      notRunning: 'O container não está rodando',
      close: 'Fechar detalhes (Esc)',
      closeLabel: 'Fechar detalhes'
    },
    logs: {
      ended: 'Parou de seguir',
      following: 'Seguindo',
      paused: 'Pausado na rolagem',
      lines: (n: number) => plural(n, '1 linha', `${n} linhas`),
      toEnd: 'Ir para o fim',
      label: 'Logs do container',
      waiting: 'Aguardando logs…',
      none: 'O container não gerou logs.'
    },
    fields: {
      loading: 'Carregando detalhes…',
      image: 'Imagem',
      command: 'Comando',
      created: 'Criado em',
      restarts: 'Reinícios',
      exitCode: (code: number) => `saída ${code}`,
      health: 'Saúde',
      failingStreak: (n: number) => plural(n, '1 falha seguida', `${n} falhas seguidas`),
      noHealthCheck: 'Sem health check',
      networks: 'Redes',
      ports: 'Portas',
      volumes: 'Volumes',
      readOnly: 'somente leitura',
      env: 'Variáveis de ambiente',
      envCount: (n: number) => `${n} (valores não são exibidos)`
    },
    errors: {
      notInstalled:
        'Docker não encontrado. Instale o Docker Desktop ou configure "docker.path" com o caminho do executável.',
      daemonDown: 'Não foi possível conectar ao Docker. Abra o Docker Desktop (ou inicie o daemon) e tente de novo.',
      timeout: 'O Docker não respondeu a tempo.',
      outputTooLarge: 'A resposta do Docker é grande demais para ser lida.',
      noDetail: 'O Docker falhou sem detalhes.',
      withDetail: (detail: string) => `Docker: ${detail}`,
      unexpectedInfo: 'Docker: resposta inesperada do "docker info".',
      executableNotFound: (value: string) => `Executável do Docker não encontrado: ${value}`,
      scriptNotExecutable: (file: string) =>
        `"${file}" é um script (.cmd/.bat) e não pode ser executado diretamente. Aponte "docker.path" para o docker.exe.`,
      invalidAction: 'Ação do Docker inválida.',
      invalidComposeProject: 'Projeto compose inválido.',
      unknownContainer: 'Container desconhecido. Atualize a lista de containers e tente de novo.',
      unexpectedInspect: 'Resposta inesperada do Docker ao inspecionar o container.',
      containerNotFound: 'Container não encontrado.',
      cancelled: 'Comando do Docker cancelado: a janela foi recarregada ou fechada.',
      projectNotFound: (project: string) => `Projeto "${project}" não encontrado. Atualize a lista de containers.`,
      projectWithoutDir: (project: string) =>
        `O projeto "${project}" não informa a pasta do compose; não dá para executá-lo daqui.`,
      projectDirNotFound: (project: string, dir: string) => `Pasta do projeto "${project}" não encontrada: ${dir}`,
      composeFileNotFound: (file: string) => `Arquivo do compose não encontrado: ${file}`,
      noWorkspaceCompose: 'Nenhum arquivo compose (compose.yaml, docker-compose.yml…) na pasta do workspace.'
    }
  },
  en: {
    title: 'Containers',
    uptime: {
      count: (n: number, unit: UptimeUnit) => count(EN_UNITS, n, unit),
      lessThanOne: (unit: UptimeUnit) => `less than ${EN_ONE[unit]}`,
      aboutOne: (unit: UptimeUnit) => `about ${EN_ONE[unit]}`
    },
    status: {
      unhealthy: 'Unhealthy',
      starting: 'Starting',
      healthy: 'Healthy',
      running: 'Running',
      restarting: 'Restarting',
      paused: 'Paused',
      exited: 'Stopped',
      created: 'Created',
      dead: 'Dead',
      removing: 'Removing'
    },
    problem: {
      restartLoop: 'Restarting in a loop',
      withUptime: (status: string, uptime: string) => `${status} · up for ${uptime}`,
      label: (name: string) => `Problem in ${name}`,
      investigate: 'Investigate with Claude',
      viewLogs: 'View Logs',
      more: (n: number) => `+${n} with problems`,
      needsFolder: 'Open a folder to investigate with Claude.'
    },
    standalone: 'Standalone',
    logLevel: { info: 'INFO', warn: 'WARN', error: 'ERROR', debug: 'DEBUG' },
    summary: {
      running: 'Running',
      ofTotal: (total: number) => `of ${total} containers`,
      stopped: 'Stopped',
      stoppedHint: 'not running',
      problems: 'With problems',
      problemsHint: 'unhealthy or restarting',
      allGood: 'all good',
      resources: 'CPU and memory',
      memoryOf: (used: string, total: string) => `${used} of ${total}`,
      memoryLabel: 'Total memory in use'
    },
    view: {
      loading: 'Loading containers…',
      empty: 'No containers in this Docker. Start a project with "Compose Up".',
      noMatch: 'No containers match the search or the filter.',
      search: 'Search containers',
      filterLabel: 'Filter containers',
      filters: { all: 'All', running: 'Running', stopped: 'Stopped' },
      composeUp: 'Compose Up',
      composeUpIn: (target: string) => `Compose up in ${target}`,
      noComposeFile: 'No compose file in this workspace folder'
    },
    group: {
      running: (running: number, total: number) => `${running}/${total} running`,
      inWorkspace: 'This workspace',
      restart: 'Restart',
      stop: 'Stop'
    },
    row: {
      start: (name: string) => `Start ${name}`,
      stop: (name: string) => `Stop ${name}`,
      restart: (name: string) => `Restart ${name}`,
      logs: (name: string) => `Logs of ${name}`,
      terminal: (name: string) => `Terminal in ${name}`,
      memory: (name: string) => `Memory of ${name}`,
      openUrl: (url: string) => `Open ${url}`,
      openUrlInBrowser: (url: string) => `Open ${url} in the browser`,
      morePorts: (n: number, ports: string) => `${n} more ports: ${ports}`
    },
    detail: {
      label: (name: string) => `Details of ${name}`,
      tabsLabel: 'Container details',
      tabs: { logs: 'Logs', details: 'Details' },
      back: 'Back to List',
      terminal: 'Terminal',
      openTerminal: 'Open a terminal inside the container',
      notRunning: "The container isn't running",
      close: 'Close Details (Esc)',
      closeLabel: 'Close details'
    },
    logs: {
      ended: 'Stopped following',
      following: 'Following',
      paused: 'Paused while scrolling',
      lines: (n: number) => plural(n, '1 line', `${n} lines`),
      toEnd: 'Go to End',
      label: 'Container logs',
      waiting: 'Waiting for logs…',
      none: "The container didn't produce any logs."
    },
    fields: {
      loading: 'Loading details…',
      image: 'Image',
      command: 'Command',
      created: 'Created',
      restarts: 'Restarts',
      exitCode: (code: number) => `exit ${code}`,
      health: 'Health',
      failingStreak: (n: number) => plural(n, '1 failure in a row', `${n} failures in a row`),
      noHealthCheck: 'No health check',
      networks: 'Networks',
      ports: 'Ports',
      volumes: 'Volumes',
      readOnly: 'read-only',
      env: 'Environment variables',
      envCount: (n: number) => `${n} (values are not shown)`
    },
    errors: {
      notInstalled: 'Docker not found. Install Docker Desktop or set "docker.path" to the path of the executable.',
      daemonDown: "Couldn't connect to Docker. Open Docker Desktop (or start the daemon) and try again.",
      timeout: "Docker didn't respond in time.",
      outputTooLarge: 'The Docker response is too large to read.',
      noDetail: 'Docker failed without details.',
      withDetail: (detail: string) => `Docker: ${detail}`,
      unexpectedInfo: 'Docker: unexpected response from "docker info".',
      executableNotFound: (value: string) => `Docker executable not found: ${value}`,
      scriptNotExecutable: (file: string) =>
        `"${file}" is a script (.cmd/.bat) and can't be run directly. Point "docker.path" to docker.exe.`,
      invalidAction: 'Invalid Docker action.',
      invalidComposeProject: 'Invalid compose project.',
      unknownContainer: 'Unknown container. Refresh the container list and try again.',
      unexpectedInspect: 'Unexpected response from Docker while inspecting the container.',
      containerNotFound: 'Container not found.',
      cancelled: 'Docker command cancelled: the window was reloaded or closed.',
      projectNotFound: (project: string) => `Project "${project}" not found. Refresh the container list.`,
      projectWithoutDir: (project: string) =>
        `Project "${project}" doesn't report its compose folder, so it can't be run from here.`,
      projectDirNotFound: (project: string, dir: string) => `Folder of project "${project}" not found: ${dir}`,
      composeFileNotFound: (file: string) => `Compose file not found: ${file}`,
      noWorkspaceCompose: 'No compose file (compose.yaml, docker-compose.yml…) in the workspace folder.'
    }
  },
  es: {
    title: 'Contenedores',
    uptime: {
      count: (n: number, unit: UptimeUnit) => count(ES_UNITS, n, unit),
      lessThanOne: (unit: UptimeUnit) => `menos de ${ES_ONE[unit]}`,
      aboutOne: (unit: UptimeUnit) => `alrededor de ${ES_ONE[unit]}`
    },
    status: {
      unhealthy: 'No saludable',
      starting: 'Iniciando',
      healthy: 'Saludable',
      running: 'En ejecución',
      restarting: 'Reiniciando',
      paused: 'En pausa',
      exited: 'Detenido',
      created: 'Creado',
      dead: 'Muerto',
      removing: 'Eliminando'
    },
    problem: {
      restartLoop: 'Reiniciando en bucle',
      withUptime: (status: string, uptime: string) => `${status} · en ejecución desde hace ${uptime}`,
      label: (name: string) => `Problema en ${name}`,
      investigate: 'Investigar con Claude',
      viewLogs: 'Ver logs',
      more: (n: number) => `+${n} con problemas`,
      needsFolder: 'Abre una carpeta para investigar con Claude.'
    },
    standalone: 'Independientes',
    logLevel: { info: 'INFO', warn: 'AVISO', error: 'ERROR', debug: 'DEBUG' },
    summary: {
      running: 'En ejecución',
      ofTotal: (total: number) => `de ${total} contenedores`,
      stopped: 'Detenidos',
      stoppedHint: 'fuera de ejecución',
      problems: 'Con problemas',
      problemsHint: 'no saludables o reiniciando',
      allGood: 'todo bien',
      resources: 'CPU y memoria',
      memoryOf: (used: string, total: string) => `${used} de ${total}`,
      memoryLabel: 'Memoria total en uso'
    },
    view: {
      loading: 'Cargando contenedores…',
      empty: 'No hay contenedores en este Docker. Levanta un proyecto con "Compose up".',
      noMatch: 'Ningún contenedor coincide con la búsqueda o el filtro.',
      search: 'Buscar contenedores',
      filterLabel: 'Filtrar contenedores',
      filters: { all: 'Todos', running: 'En ejecución', stopped: 'Detenidos' },
      composeUp: 'Compose up',
      composeUpIn: (target: string) => `Compose up en ${target}`,
      noComposeFile: 'No hay ningún archivo compose en la carpeta de este espacio de trabajo'
    },
    group: {
      running: (running: number, total: number) => `${running}/${total} en ejecución`,
      inWorkspace: 'De este espacio de trabajo',
      restart: 'Reiniciar',
      stop: 'Detener'
    },
    row: {
      start: (name: string) => `Iniciar ${name}`,
      stop: (name: string) => `Detener ${name}`,
      restart: (name: string) => `Reiniciar ${name}`,
      logs: (name: string) => `Logs de ${name}`,
      terminal: (name: string) => `Terminal en ${name}`,
      memory: (name: string) => `Memoria de ${name}`,
      openUrl: (url: string) => `Abrir ${url}`,
      openUrlInBrowser: (url: string) => `Abrir ${url} en el navegador`,
      morePorts: (n: number, ports: string) => `${n} puertos más: ${ports}`
    },
    detail: {
      label: (name: string) => `Detalles de ${name}`,
      tabsLabel: 'Detalles del contenedor',
      tabs: { logs: 'Logs', details: 'Detalles' },
      back: 'Volver a la lista',
      terminal: 'Terminal',
      openTerminal: 'Abrir un terminal dentro del contenedor',
      notRunning: 'El contenedor no está en ejecución',
      close: 'Cerrar detalles (Esc)',
      closeLabel: 'Cerrar detalles'
    },
    logs: {
      ended: 'Se dejó de seguir',
      following: 'Siguiendo',
      paused: 'En pausa al desplazarse',
      lines: (n: number) => plural(n, '1 línea', `${n} líneas`),
      toEnd: 'Ir al final',
      label: 'Logs del contenedor',
      waiting: 'Esperando logs…',
      none: 'El contenedor no generó logs.'
    },
    fields: {
      loading: 'Cargando detalles…',
      image: 'Imagen',
      command: 'Comando',
      created: 'Creado el',
      restarts: 'Reinicios',
      exitCode: (code: number) => `salida ${code}`,
      health: 'Salud',
      failingStreak: (n: number) => plural(n, '1 fallo seguido', `${n} fallos seguidos`),
      noHealthCheck: 'Sin health check',
      networks: 'Redes',
      ports: 'Puertos',
      volumes: 'Volúmenes',
      readOnly: 'solo lectura',
      env: 'Variables de entorno',
      envCount: (n: number) => `${n} (los valores no se muestran)`
    },
    errors: {
      notInstalled:
        'No se encontró Docker. Instala Docker Desktop o configura "docker.path" con la ruta del ejecutable.',
      daemonDown: 'No se pudo conectar a Docker. Abre Docker Desktop (o inicia el daemon) y vuelve a intentarlo.',
      timeout: 'Docker no respondió a tiempo.',
      outputTooLarge: 'La respuesta de Docker es demasiado grande para leerla.',
      noDetail: 'Docker falló sin detalles.',
      withDetail: (detail: string) => `Docker: ${detail}`,
      unexpectedInfo: 'Docker: respuesta inesperada de "docker info".',
      executableNotFound: (value: string) => `No se encontró el ejecutable de Docker: ${value}`,
      scriptNotExecutable: (file: string) =>
        `"${file}" es un script (.cmd/.bat) y no se puede ejecutar directamente. Apunta "docker.path" a docker.exe.`,
      invalidAction: 'Acción de Docker no válida.',
      invalidComposeProject: 'Proyecto compose no válido.',
      unknownContainer: 'Contenedor desconocido. Actualiza la lista de contenedores y vuelve a intentarlo.',
      unexpectedInspect: 'Respuesta inesperada de Docker al inspeccionar el contenedor.',
      containerNotFound: 'No se encontró el contenedor.',
      cancelled: 'Comando de Docker cancelado: la ventana se recargó o se cerró.',
      projectNotFound: (project: string) =>
        `No se encontró el proyecto "${project}". Actualiza la lista de contenedores.`,
      projectWithoutDir: (project: string) =>
        `El proyecto "${project}" no indica la carpeta del compose; no se puede ejecutar desde aquí.`,
      projectDirNotFound: (project: string, dir: string) =>
        `No se encontró la carpeta del proyecto "${project}": ${dir}`,
      composeFileNotFound: (file: string) => `No se encontró el archivo compose: ${file}`,
      noWorkspaceCompose:
        'No hay ningún archivo compose (compose.yaml, docker-compose.yml…) en la carpeta del espacio de trabajo.'
    }
  }
})
