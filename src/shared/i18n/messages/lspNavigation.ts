import { defineMessages } from '../define'

// Extended LSP navigation: implementation, type, declaration, peek, code lens and hierarchies.
export const lspNavigation = defineMessages({
  'pt-BR': {
    // Request name in the timeout/failure messages.
    requests: {
      implementation: 'implementação',
      typeDefinition: 'definição de tipo',
      declaration: 'declaração',
      codeLens: 'code lens',
      resolveCodeLens: 'resolver code lens',
      callHierarchy: 'hierarquia de chamadas',
      typeHierarchy: 'hierarquia de tipos'
    },
    args: {
      kind: 'tipo de hierarquia',
      direction: 'direção'
    },
    locations: {
      implementation: {
        none: 'Nenhuma implementação encontrada.',
        noneFor: (name: string) => `Nenhuma implementação encontrada para "${name}".`,
        title: 'Implementações',
        titleOf: (name: string) => `Implementações de "${name}"`
      },
      typeDefinition: {
        none: 'Nenhuma definição de tipo encontrada.',
        noneFor: (name: string) => `Nenhuma definição de tipo encontrada para "${name}".`,
        title: 'Definições de tipo',
        titleOf: (name: string) => `Definições de tipo de "${name}"`
      },
      declaration: {
        none: 'Nenhuma declaração encontrada.',
        noneFor: (name: string) => `Nenhuma declaração encontrada para "${name}".`,
        title: 'Declarações',
        titleOf: (name: string) => `Declarações de "${name}"`
      }
    },
    peek: {
      region: (title: string) => `Prévia: ${title}`,
      list: 'Locais',
      position: (index: number, total: number) => `${index} de ${total}`,
      openInTab: 'Abrir em uma aba (Enter)',
      close: 'Fechar (Esc)',
      loading: 'Carregando…',
      unreadable: 'Não foi possível ler o arquivo.'
    },
    hierarchy: {
      callsOf: (name: string) => `Hierarquia de chamadas de "${name}"`,
      typesOf: (name: string) => `Hierarquia de tipos de "${name}"`,
      directions: 'Direção',
      incoming: 'Chamadas de entrada',
      outgoing: 'Chamadas de saída',
      supertypes: 'Supertipos',
      subtypes: 'Subtipos',
      empty: 'Nenhum resultado. Use Mostrar Hierarquia de Chamadas em um símbolo.',
      noCalls: 'Nenhuma hierarquia de chamadas para este símbolo.',
      noTypes: 'Nenhuma hierarquia de tipos para este símbolo.',
      loading: 'Carregando…',
      noResults: 'Nenhum resultado',
      failed: 'Não foi possível carregar'
    }
  },
  en: {
    requests: {
      implementation: 'implementation',
      typeDefinition: 'type definition',
      declaration: 'declaration',
      codeLens: 'code lens',
      resolveCodeLens: 'resolve code lens',
      callHierarchy: 'call hierarchy',
      typeHierarchy: 'type hierarchy'
    },
    args: {
      kind: 'hierarchy kind',
      direction: 'direction'
    },
    locations: {
      implementation: {
        none: 'No implementation found.',
        noneFor: (name: string) => `No implementation found for "${name}".`,
        title: 'Implementations',
        titleOf: (name: string) => `Implementations of "${name}"`
      },
      typeDefinition: {
        none: 'No type definition found.',
        noneFor: (name: string) => `No type definition found for "${name}".`,
        title: 'Type Definitions',
        titleOf: (name: string) => `Type definitions of "${name}"`
      },
      declaration: {
        none: 'No declaration found.',
        noneFor: (name: string) => `No declaration found for "${name}".`,
        title: 'Declarations',
        titleOf: (name: string) => `Declarations of "${name}"`
      }
    },
    peek: {
      region: (title: string) => `Peek: ${title}`,
      list: 'Locations',
      position: (index: number, total: number) => `${index} of ${total}`,
      openInTab: 'Open in a Tab (Enter)',
      close: 'Close (Esc)',
      loading: 'Loading…',
      unreadable: 'Could not read the file.'
    },
    hierarchy: {
      callsOf: (name: string) => `Call hierarchy of "${name}"`,
      typesOf: (name: string) => `Type hierarchy of "${name}"`,
      directions: 'Direction',
      incoming: 'Incoming Calls',
      outgoing: 'Outgoing Calls',
      supertypes: 'Supertypes',
      subtypes: 'Subtypes',
      empty: 'No results. Use Show Call Hierarchy on a symbol.',
      noCalls: 'No call hierarchy for this symbol.',
      noTypes: 'No type hierarchy for this symbol.',
      loading: 'Loading…',
      noResults: 'No results',
      failed: 'Could not load'
    }
  },
  es: {
    requests: {
      implementation: 'implementación',
      typeDefinition: 'definición de tipo',
      declaration: 'declaración',
      codeLens: 'code lens',
      resolveCodeLens: 'resolver code lens',
      callHierarchy: 'jerarquía de llamadas',
      typeHierarchy: 'jerarquía de tipos'
    },
    args: {
      kind: 'tipo de jerarquía',
      direction: 'dirección'
    },
    locations: {
      implementation: {
        none: 'No se encontró ninguna implementación.',
        noneFor: (name: string) => `No se encontró ninguna implementación para "${name}".`,
        title: 'Implementaciones',
        titleOf: (name: string) => `Implementaciones de "${name}"`
      },
      typeDefinition: {
        none: 'No se encontró ninguna definición de tipo.',
        noneFor: (name: string) => `No se encontró ninguna definición de tipo para "${name}".`,
        title: 'Definiciones de tipo',
        titleOf: (name: string) => `Definiciones de tipo de "${name}"`
      },
      declaration: {
        none: 'No se encontró ninguna declaración.',
        noneFor: (name: string) => `No se encontró ninguna declaración para "${name}".`,
        title: 'Declaraciones',
        titleOf: (name: string) => `Declaraciones de "${name}"`
      }
    },
    peek: {
      region: (title: string) => `Vista previa: ${title}`,
      list: 'Ubicaciones',
      position: (index: number, total: number) => `${index} de ${total}`,
      openInTab: 'Abrir en una pestaña (Enter)',
      close: 'Cerrar (Esc)',
      loading: 'Cargando…',
      unreadable: 'No se pudo leer el archivo.'
    },
    hierarchy: {
      callsOf: (name: string) => `Jerarquía de llamadas de "${name}"`,
      typesOf: (name: string) => `Jerarquía de tipos de "${name}"`,
      directions: 'Dirección',
      incoming: 'Llamadas entrantes',
      outgoing: 'Llamadas salientes',
      supertypes: 'Supertipos',
      subtypes: 'Subtipos',
      empty: 'Sin resultados. Use Mostrar jerarquía de llamadas en un símbolo.',
      noCalls: 'No hay jerarquía de llamadas para este símbolo.',
      noTypes: 'No hay jerarquía de tipos para este símbolo.',
      loading: 'Cargando…',
      noResults: 'Sin resultados',
      failed: 'No se pudo cargar'
    }
  }
})
