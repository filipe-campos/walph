import { defineMessages } from '../define'

export const terminal = defineMessages({
  'pt-BR': {
    createFailed: (detail: string) => `Não foi possível abrir o terminal: ${detail}`,
    linkHint: (modifier: string) => `${modifier} + clique para abrir`,
    find: {
      placeholder: 'Localizar',
      label: 'Localizar no terminal',
      caseSensitive: 'Diferenciar maiúsculas de minúsculas',
      regex: 'Usar expressão regular',
      noResults: 'Sem resultados',
      position: (index: number, count: number) => `${index} de ${count}`,
      previous: 'Resultado anterior (Shift+Enter)',
      next: 'Próximo resultado (Enter)',
      close: 'Fechar (Esc)',
      failed: (detail: string) => `Busca no terminal: ${detail}`
    },
    errors: {
      profileNotFound: (name: string) => `Perfil de terminal "${name}" não existe. Confira "terminal.profiles".`,
      reloadedBeforeLogin: 'A janela foi recarregada ou fechada antes de o login abrir.',
      reloadedBeforeContainer: 'A janela foi recarregada ou fechada antes de o terminal do container abrir.',
      sourceUnavailable: 'Não foi possível abrir este terminal.',
      spawnFailedClaude: (file: string, detail: string) =>
        `Não foi possível iniciar o shell "${file}": ${detail}. Confira "claude.executable".`,
      spawnFailedDocker: (file: string, detail: string) =>
        `Não foi possível iniciar o shell "${file}": ${detail}. Confira "docker.path".`,
      spawnFailedShell: (file: string, detail: string) =>
        `Não foi possível iniciar o shell "${file}": ${detail}. Confira "terminal.shell" e "terminal.profiles".`
    }
  },
  en: {
    createFailed: (detail: string) => `Couldn't open the terminal: ${detail}`,
    linkHint: (modifier: string) => `${modifier} + click to open`,
    find: {
      placeholder: 'Find',
      label: 'Find in terminal',
      caseSensitive: 'Match Case',
      regex: 'Use Regular Expression',
      noResults: 'No results',
      position: (index: number, count: number) => `${index} of ${count}`,
      previous: 'Previous Match (Shift+Enter)',
      next: 'Next Match (Enter)',
      close: 'Close (Esc)',
      failed: (detail: string) => `Terminal search: ${detail}`
    },
    errors: {
      profileNotFound: (name: string) => `Terminal profile "${name}" doesn't exist. Check "terminal.profiles".`,
      reloadedBeforeLogin: 'The window was reloaded or closed before the login opened.',
      reloadedBeforeContainer: 'The window was reloaded or closed before the container terminal opened.',
      sourceUnavailable: "Couldn't open this terminal.",
      spawnFailedClaude: (file: string, detail: string) =>
        `Couldn't start the shell "${file}": ${detail}. Check "claude.executable".`,
      spawnFailedDocker: (file: string, detail: string) =>
        `Couldn't start the shell "${file}": ${detail}. Check "docker.path".`,
      spawnFailedShell: (file: string, detail: string) =>
        `Couldn't start the shell "${file}": ${detail}. Check "terminal.shell" and "terminal.profiles".`
    }
  },
  es: {
    createFailed: (detail: string) => `No se pudo abrir el terminal: ${detail}`,
    linkHint: (modifier: string) => `${modifier} + clic para abrir`,
    find: {
      placeholder: 'Buscar',
      label: 'Buscar en el terminal',
      caseSensitive: 'Coincidir mayúsculas y minúsculas',
      regex: 'Usar expresión regular',
      noResults: 'Sin resultados',
      position: (index: number, count: number) => `${index} de ${count}`,
      previous: 'Resultado anterior (Shift+Enter)',
      next: 'Resultado siguiente (Enter)',
      close: 'Cerrar (Esc)',
      failed: (detail: string) => `Búsqueda en el terminal: ${detail}`
    },
    errors: {
      profileNotFound: (name: string) => `El perfil de terminal "${name}" no existe. Revisa "terminal.profiles".`,
      reloadedBeforeLogin: 'La ventana se recargó o se cerró antes de que se abriera el inicio de sesión.',
      reloadedBeforeContainer: 'La ventana se recargó o se cerró antes de que se abriera el terminal del contenedor.',
      sourceUnavailable: 'No se pudo abrir este terminal.',
      spawnFailedClaude: (file: string, detail: string) =>
        `No se pudo iniciar el shell "${file}": ${detail}. Revisa "claude.executable".`,
      spawnFailedDocker: (file: string, detail: string) =>
        `No se pudo iniciar el shell "${file}": ${detail}. Revisa "docker.path".`,
      spawnFailedShell: (file: string, detail: string) =>
        `No se pudo iniciar el shell "${file}": ${detail}. Revisa "terminal.shell" y "terminal.profiles".`
    }
  }
})
