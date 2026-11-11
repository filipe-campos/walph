/* @ds-bundle: {"format":4,"namespace":"Walph","components":[{"name":"WorkspaceBar"},{"name":"WorkspaceTab"},{"name":"Toast"},{"name":"Button"},{"name":"Input"},{"name":"EditorTab"},{"name":"TreeItem"},{"name":"CommandPalette"},{"name":"Terminal"},{"name":"ClaudePanel"},{"name":"Code"},{"name":"Welcome"},{"name":"NeonCard"},{"name":"Sidebar"},{"name":"Modal"},{"name":"Switch"},{"name":"Select"},{"name":"Menu"},{"name":"ContainersView"},{"name":"EditorTabs"},{"name":"ClaudeQuestion"},{"name":"StatusBar"},{"name":"Logo"},{"name":"FileIcon"}]} */
(function () {
  var React = window.React;
  var h = React.createElement;
  var cx = function () { return Array.prototype.filter.call(arguments, Boolean).join(' '); };

  /* ---- icons: 16px grid, 1.35 stroke, duotone (tinted fill at 16% + line), currentColor.
         AI icons (ai: true) use the --grad-ai gradient for line and fill. ---- */
  var GRAD_ID = 'wp-ai-grad';
  function Icon(items, opts) {
    opts = opts || {};
    return function (p) {
      var ai = !!opts.ai, paint = ai ? 'url(#' + GRAD_ID + ')' : 'currentColor', kids = [];
      if (ai) kids.push(h('defs', { key: 'g' }, h('linearGradient', { id: GRAD_ID, x1: '0', y1: '0', x2: '1', y2: '1' },
        h('stop', { offset: '0', style: { stopColor: 'var(--accent-3)' } }),
        h('stop', { offset: '.55', style: { stopColor: 'var(--accent)' } }),
        h('stop', { offset: '1', style: { stopColor: 'var(--accent-2)' } }))));
      [].concat(items).forEach(function (it, i) {
        if (typeof it === 'string') { kids.push(h('path', { key: i, d: it })); return; }
        if (it.solid) { kids.push(h('path', { key: i, d: it.d, fill: paint, stroke: 'none' })); return; }
        kids.push(h('path', { key: i + 'f', d: it.d, fill: paint, fillOpacity: ai ? 0.28 : 0.16, stroke: 'none' }));
        kids.push(h('path', { key: i, d: it.d }));
      });
      return h('svg', Object.assign({ viewBox: '0 0 16 16', fill: 'none', stroke: paint, strokeWidth: 1.35, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, p), kids);
    };
  }
  var D = function (d) { return { d: d }; };
  var Icons = {
    close: Icon(['M4.5 4.5l7 7', 'M11.5 4.5l-7 7']),
    plus: Icon(['M8 3.5v9', 'M3.5 8h9']),
    chevron: Icon('M6.5 4.5L10 8l-3.5 3.5'),
    check: Icon('M3.5 8.4l2.8 2.8L12.5 5'),
    alert: Icon([D('M7.13 2.7a1 1 0 0 1 1.74 0l5.5 9.8a1 1 0 0 1-.87 1.5H2.5a1 1 0 0 1-.87-1.5z'), 'M8 6.3v3', 'M8 11.4v.01']),
    error: Icon([D('M8 14.2A6.2 6.2 0 1 0 8 1.8a6.2 6.2 0 0 0 0 12.4z'), 'M6 6l4 4', 'M10 6l-4 4']),
    spark: Icon([D('M7 1.8l1.2 3.3a2.2 2.2 0 0 0 1.3 1.3L12.8 7.6 9.5 8.8a2.2 2.2 0 0 0-1.3 1.3L7 13.4 5.8 10.1a2.2 2.2 0 0 0-1.3-1.3L1.2 7.6l3.3-1.2a2.2 2.2 0 0 0 1.3-1.3z'),
      { d: 'M12.8 1.2l.45 1.15 1.15.45-1.15.45-.45 1.15-.45-1.15-1.15-.45 1.15-.45z', solid: true },
      { d: 'M13 11.2l.3.8.8.3-.8.3-.3.8-.3-.8-.8-.3.8-.3z', solid: true }], { ai: true }),
    file: Icon([D('M4.3 1.8h4.9l3.3 3.3v8.1a1 1 0 0 1-1 1H4.3a1 1 0 0 1-1-1V2.8a1 1 0 0 1 1-1z'), 'M9.2 1.8v3.3h3.3', 'M5.8 8.6h4.4', 'M5.8 11h2.8']),
    folder: Icon([D('M1.8 4.3a1.1 1.1 0 0 1 1.1-1.1h3.2l1.5 1.7h5.5a1.1 1.1 0 0 1 1.1 1.1v6.7a1.1 1.1 0 0 1-1.1 1.1H2.9a1.1 1.1 0 0 1-1.1-1.1z'), 'M1.8 6.9h12.4']),
    search: Icon([D('M7.1 11.9a4.8 4.8 0 1 0 0-9.6 4.8 4.8 0 0 0 0 9.6z'), 'M10.6 10.6l3.4 3.4']),
    branch: Icon(['M4.5 4.6v6.8', 'M11.5 6.1v.4a3 3 0 0 1-3 3h-4', D('M4.5 4.6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z'), D('M11.5 6.1a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z'), D('M4.5 14.4a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z')]),
    terminal: Icon([D('M3.3 2.4h9.4a1.5 1.5 0 0 1 1.5 1.5v8.2a1.5 1.5 0 0 1-1.5 1.5H3.3a1.5 1.5 0 0 1-1.5-1.5V3.9a1.5 1.5 0 0 1 1.5-1.5z'), 'M4.8 6.3L6.8 8l-2 1.7', 'M8.6 10h2.6']),
    send: Icon(['M8 12.8V3.6', 'M4.3 7.2L8 3.5l3.7 3.7']),
    command: Icon('M6 6V4.5A1.5 1.5 0 1 0 4.5 6H6zm0 0h4m-4 0v4m4-4V4.5A1.5 1.5 0 1 1 11.5 6H10zm0 0v4m0 0h1.5a1.5 1.5 0 1 1-1.5 1.5V10zm0 0H6m0 0v1.5A1.5 1.5 0 1 1 4.5 10H6z'),
    diff: Icon([D('M3.6 1.8h8.8a1.1 1.1 0 0 1 1.1 1.1v10.2a1.1 1.1 0 0 1-1.1 1.1H3.6a1.1 1.1 0 0 1-1.1-1.1V2.9a1.1 1.1 0 0 1 1.1-1.1z'), 'M8 4.6v3.8', 'M6.1 6.5h3.8', 'M6.1 11h3.8']),
    agent: Icon([D('M8 1.8l5.4 3.1v6.2L8 14.2l-5.4-3.1V4.9z'), 'M8 8v6.2', 'M8 8l5.4-3.1', 'M8 8L2.6 4.9', { d: 'M8 9.4a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8z', solid: true }], { ai: true }),
    layers: Icon([D('M8 2l6 3.2-6 3.2-6-3.2z'), 'M2 8.2l6 3.2 6-3.2', 'M2 11l6 3.2 6-3.2']),
    files: Icon(['M6.2 1.8h4.2l2.8 2.8v6.6a1 1 0 0 1-1 1', D('M3.8 4.2h4.4l2.8 2.8v6.2a1 1 0 0 1-1 1H3.8a1 1 0 0 1-1-1V5.2a1 1 0 0 1 1-1z'), 'M8.2 4.2V7H11']),
    gear: Icon([D('M12.76 6.84 L14.21 6.93 L14.21 9.07 L12.76 9.16 L12.19 10.54 L13.14 11.64 L11.64 13.14 L10.54 12.19 L9.16 12.76 L9.07 14.21 L6.93 14.21 L6.84 12.76 L5.46 12.19 L4.36 13.14 L2.86 11.64 L3.81 10.54 L3.24 9.16 L1.79 9.07 L1.79 6.93 L3.24 6.84 L3.81 5.46 L2.86 4.36 L4.36 2.86 L5.46 3.81 L6.84 3.24 L6.93 1.79 L9.07 1.79 L9.16 3.24 L10.54 3.81 L11.64 2.86 L13.14 4.36 L12.19 5.46Z'), 'M8 10.1a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2z']),
    clip: Icon('M13 7.6l-5.3 5.3a3.1 3.1 0 0 1-4.4-4.4L9 2.8a2.1 2.1 0 0 1 3 3L6.5 11.3a1 1 0 0 1-1.5-1.5L10 4.9'),
    more: Icon([{ d: 'M3.6 9.3a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6z', solid: true }, { d: 'M8 9.3a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6z', solid: true }, { d: 'M12.4 9.3a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6z', solid: true }]),
    mic: Icon([D('M8 10.2a2.3 2.3 0 0 0 2.3-2.3V4.1a2.3 2.3 0 1 0-4.6 0v3.8A2.3 2.3 0 0 0 8 10.2z'), 'M3.9 7.7a4.1 4.1 0 0 0 8.2 0', 'M8 11.9v2.3']),
    star: Icon(D('M8 1.9l1.85 3.75 4.15.6-3 2.92.7 4.13L8 11.35 4.3 13.3l.7-4.13-3-2.92 4.15-.6z')),
    hand: Icon([D('M5.4 9.9V4.2a1 1 0 0 1 2 0V7.6V2.9a1 1 0 0 1 2 0v4.7V3.9a1 1 0 0 1 2 0v4.9c0 2.9-1.7 5.2-4.5 5.2-1.7 0-2.7-.8-3.6-2.1L1.9 9.6a1 1 0 0 1 1.5-1.3z')]),
    pencil: Icon([D('M10.9 2.5l2.6 2.6-7.8 7.8-3.3.7.7-3.3z'), 'M9.4 4l2.6 2.6']),
    plan: Icon(['M6.4 4h7.1', 'M6.4 8h7.1', 'M6.4 12h4.6', { d: 'M2.4 3.1h1.8v1.8H2.4z', solid: true }, { d: 'M2.4 7.1h1.8v1.8H2.4z', solid: true }, { d: 'M2.4 11.1h1.8v1.8H2.4z', solid: true }]),
    bolt: Icon(D('M9.2 1.6L3.4 9.1h4.1l-.9 5.3 6-7.6H8.4z'), { ai: true }),
    shield: Icon([D('M8 1.8l5 1.9v4.1c0 3-2.1 5.3-5 6.4-2.9-1.1-5-3.4-5-6.4V3.7z'), 'M2.2 2.2l11.6 11.6']),
    stop: Icon({ d: 'M4.6 4.6h6.8v6.8H4.6z', solid: true }),
    box: Icon([D('M2.2 5.2h11.6v7.6H2.2z'), 'M2.2 5.2l1.6-2.2h8.4l1.6 2.2', 'M5.1 7.4v3.2', 'M8 7.4v3.2', 'M10.9 7.4v3.2']),
    play: Icon(D('M5 3.1v9.8L12.8 8z')),
    restart: Icon(['M13.1 8.4a5.1 5.1 0 1 1-1.6-4.1', 'M13.2 2.6v2.9h-2.9']),
    logs: Icon(['M3 4h10', 'M3 8h6.5', 'M3 12h8.5']),
    external: Icon(['M9.4 2.6h4v4', 'M13.4 2.6L7.6 8.4', 'M11.6 9.6v3.6H2.8V4.4h3.6']),
    split: Icon([D('M3.1 2.4h9.8a1.3 1.3 0 0 1 1.3 1.3v8.6a1.3 1.3 0 0 1-1.3 1.3H3.1a1.3 1.3 0 0 1-1.3-1.3V3.7a1.3 1.3 0 0 1 1.3-1.3z'), 'M8 2.4v11.2']),
    markdown: Icon([D('M2.9 3.4h10.2a1.1 1.1 0 0 1 1.1 1.1v7a1.1 1.1 0 0 1-1.1 1.1H2.9a1.1 1.1 0 0 1-1.1-1.1v-7a1.1 1.1 0 0 1 1.1-1.1z'), 'M4.2 10.2V5.8l1.9 2.3 1.9-2.3v4.4', 'M11 5.8v4.3', 'M9.6 8.8l1.4 1.4 1.4-1.4']),
    slash: Icon([D('M3.6 2.2h8.8a1.4 1.4 0 0 1 1.4 1.4v8.8a1.4 1.4 0 0 1-1.4 1.4H3.6a1.4 1.4 0 0 1-1.4-1.4V3.6a1.4 1.4 0 0 1 1.4-1.4z'), 'M9.7 4.8l-3.4 6.4']),
    question: Icon([D('M8 14.2A6.2 6.2 0 1 0 8 1.8a6.2 6.2 0 0 0 0 12.4z'), 'M6.2 6.2a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.1v.4', 'M8 11.3v.01']),
    commit: Icon(['M1.6 8h3.6', 'M10.8 8h3.6', D('M8 10.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z')]),
    arrowUp: Icon(['M8 12.6V3.6', 'M4.6 7L8 3.6 11.4 7']),
    arrowDown: Icon(['M8 3.4v9', 'M4.6 9L8 12.4 11.4 9']),
    eye: Icon([D('M1.4 8S3.8 3.4 8 3.4 14.6 8 14.6 8 12.2 12.6 8 12.6 1.4 8 1.4 8z'), { d: 'M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', solid: true }]),
    globe: Icon([D('M8 14.2A6.2 6.2 0 1 0 8 1.8a6.2 6.2 0 0 0 0 12.4z'), 'M1.8 8h12.4', 'M8 1.8c1.7 1.8 2.6 3.9 2.6 6.2S9.7 12.4 8 14.2C6.3 12.4 5.4 10.3 5.4 8S6.3 3.6 8 1.8z']),
    filePlus: Icon([D('M4.3 1.8h4.9l3.3 3.3v8.1a1 1 0 0 1-1 1H4.3a1 1 0 0 1-1-1V2.8a1 1 0 0 1 1-1z'), 'M9.2 1.8v3.3h3.3', 'M8 7.6v4', 'M6 9.6h4']),
    rocket: Icon([D('M9.8 2c2.4 0 4.2 1.8 4.2 4.2 0 2.4-2.6 4.8-5 6.2L5.6 9C7 6.6 7.4 2 9.8 2z'), 'M5.6 9L3 9.8 2 13.2l3.4-1 .8-2.6', { d: 'M10.4 6.8a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2z', solid: true }]),
    flask: Icon(['M5.8 2.2h4.4', D('M6.8 2.2v4L3.1 12.3a1.1 1.1 0 0 0 .95 1.7h7.9a1.1 1.1 0 0 0 .95-1.7L9.2 6.2v-4z'), 'M4.6 9.8h6.8']),
    bug: Icon([D('M8 14a3.6 3.6 0 0 1-3.6-3.6V7.6a3.6 3.6 0 0 1 7.2 0v2.8A3.6 3.6 0 0 1 8 14z'), 'M5.8 4.6L4.6 3', 'M10.2 4.6L11.4 3', 'M4.4 8.6H2', 'M14 8.6h-2.4', 'M4.6 11.6l-1.8 1', 'M11.4 11.6l1.8 1', 'M8 7v7']),
    book: Icon([D('M3 2.4h8a1.4 1.4 0 0 1 1.4 1.4v9.8H4.6A1.6 1.6 0 0 1 3 12z'), 'M3 12a1.6 1.6 0 0 1 1.6-1.6h7.8', 'M6 5.4h3.6']),
    database: Icon([D('M2.8 4c0-1.2 2.3-2 5.2-2s5.2.8 5.2 2v8c0 1.2-2.3 2-5.2 2s-5.2-.8-5.2-2z'), 'M2.8 4c0 1.2 2.3 2 5.2 2s5.2-.8 5.2-2', 'M2.8 8c0 1.2 2.3 2 5.2 2s5.2-.8 5.2-2']),
    brain: Icon([D('M7.4 2.6a2.3 2.3 0 0 0-3.6 1.6 2.3 2.3 0 0 0-1.7 3.1 2.4 2.4 0 0 0 .5 3.6 2.3 2.3 0 0 0 2.7 2.5 2.1 2.1 0 0 0 2.1 1.1z'),
      D('M8.6 2.6a2.3 2.3 0 0 1 3.6 1.6 2.3 2.3 0 0 1 1.7 3.1 2.4 2.4 0 0 1-.5 3.6 2.3 2.3 0 0 1-2.7 2.5 2.1 2.1 0 0 1-2.1 1.1z'),
      'M4.6 6.4c.9 0 1.6.4 2 1.1', 'M3.9 9.6c.8-.4 1.8-.3 2.5.3', 'M11.4 6.4c-.9 0-1.6.4-2 1.1', 'M12.1 9.6c-.8-.4-1.8-.3-2.5.3',
      { d: 'M6.6 7.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5z', solid: true }, { d: 'M9.4 7.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5z', solid: true },
      { d: 'M6.4 10.7a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5z', solid: true }, { d: 'M9.6 10.7a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5z', solid: true }], { ai: true })
  };

  function StatusDot(p) {
    var s = p.status || 'idle';
    return h('span', { className: cx('wp-dot', 'wp-dot-' + s, p.ping && 'wp-dot-ping'), role: 'img', 'aria-label': STATUS_LABEL[s] });
  }
  var STATUS_LABEL = { idle: 'Ocioso', running: 'Claude Code trabalhando', done: 'Claude Code terminou', attention: 'Claude Code aguardando você', error: 'Claude Code falhou' };

  /* ---- usePrev: detects a status transition to fire a one-shot ping ---- */
  function useTransitionPing(status) {
    var ref = React.useRef(status);
    var st = React.useState(0), n = st[0], setN = st[1];
    React.useEffect(function () {
      if (ref.current !== status && (status === 'done' || status === 'attention' || status === 'error')) setN(function (x) { return x + 1; });
      ref.current = status;
    }, [status]);
    return n;
  }

  function WorkspaceTab(p) {
    var status = p.status || 'idle';
    var pingKey = useTransitionPing(status);
    var unread = p.unread || 0;
    return h('div', {
      role: 'tab', tabIndex: 0, 'aria-selected': !!p.active,
      className: cx('wp-wtab', p.active && 'wp-wtab-active', unread > 0 && 'wp-wtab-unread', (p.active || status === 'running') && 'wp-neon', status === 'running' && 'wp-neon-live', p.className),
      onClick: p.onSelect,
      onKeyDown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onSelect && p.onSelect(); } },
      title: p.path || p.name
    },
      h(StatusDot, { key: 'd' + pingKey, status: status, ping: pingKey > 0 }),
      h('span', { className: 'wp-wtab-text' },
        h('span', { className: 'wp-wtab-name' }, p.name),
        p.branch ? h('span', { className: 'wp-wtab-branch' }, h(Icons.branch), h('span', { className: 'wp-wtab-branch-label' }, p.branch)) : null),
      unread > 0 && !p.active ? h('span', { key: 'c' + unread, className: cx('wp-count', 'wp-count-' + status), 'aria-label': unread + ' notificações' }, unread > 9 ? '9+' : unread) : null,
      p.shortcut ? h('span', { className: 'wp-wtab-kbd', 'aria-label': 'Atalho ' + p.shortcut.replace('⌘', 'Command ') }, /^⌘/.test(p.shortcut) ? [h(Icons.command, { key: 'm', className: 'wp-wtab-kbd-mod' }), h('span', { key: 'k', className: 'wp-wtab-kbd-key' }, p.shortcut.slice(1))] : p.shortcut) : null,
      p.onClose ? h('button', { className: 'wp-x', 'aria-label': 'Fechar workspace ' + p.name, onClick: function (e) { e.stopPropagation(); p.onClose(); } }, h(Icons.close)) : null
    );
  }

  function WorkspaceBar(p) {
    var list = p.workspaces || [];
    return h('div', { className: cx('wp-wbar', p.className), role: 'tablist', 'aria-label': 'Workspaces' },
      h('div', { className: 'wp-wbar-tabs' },
        list.map(function (w, i) {
          return h(WorkspaceTab, Object.assign({ key: w.id, shortcut: i < 9 ? '⌘' + (i + 1) : undefined }, w, {
            active: w.id === p.activeId,
            onSelect: function () { p.onSelect && p.onSelect(w.id); },
            onClose: p.onClose ? function () { p.onClose(w.id); } : undefined
          }));
        })),
      p.onAdd ? h('button', { className: 'wp-btn wp-btn-ghost wp-btn-sm wp-wbar-add', 'aria-label': 'Abrir workspace', onClick: p.onAdd }, h(Icons.plus)) : null
    );
  }

  var TOAST_ICON = { done: Icons.check, attention: Icons.alert, error: Icons.error, info: Icons.spark };
  function Toast(p) {
    var tone = p.tone || 'done';
    var lv = React.useState(false), leaving = lv[0], setLeaving = lv[1];
    var dismiss = function () { if (!leaving) setLeaving(true); };
    return h('div', {
      role: tone === 'error' || tone === 'attention' ? 'alert' : 'status',
      className: cx('wp-toast-stack', 'wp-toast-stack-' + tone, leaving && 'wp-toast-leaving', p.className),
      onAnimationEnd: function (e) { if (leaving && e.target === e.currentTarget) p.onDismiss && p.onDismiss(); }
    },
      p.workspace ? h('div', { className: 'wp-toast-wscard', title: p.workspacePath || p.workspace },
        h(Icons.layers), h('span', { className: 'wp-toast-wscard-name' }, p.workspace),
        p.branch ? h('span', { className: 'wp-toast-wscard-branch' }, h(Icons.branch), p.branch) : null) : null,
      h('div', { className: cx('wp-toast', 'wp-toast-' + tone, p.workspace && 'wp-toast-has-ws', (tone === 'done' || tone === 'info') && 'wp-neon', tone === 'info' && 'wp-neon-live') },
      h('span', { className: 'wp-toast-icon' }, h(TOAST_ICON[tone] || Icons.spark)),
      h('div', null,
        h('p', { className: 'wp-toast-title' }, p.title),
        p.description ? h('p', { className: 'wp-toast-desc' }, p.description) : null,
        (p.actionLabel || p.secondaryLabel) ? h('div', { className: 'wp-toast-actions' },
          p.actionLabel ? h(Button, { size: 'sm', variant: 'primary', onClick: function () { p.onAction && p.onAction(); dismiss(); } }, p.actionLabel) : null,
          p.secondaryLabel ? h(Button, { size: 'sm', variant: 'ghost', onClick: dismiss }, p.secondaryLabel) : null) : null),
      h('button', { className: 'wp-x', 'aria-label': 'Dispensar', onClick: dismiss }, h(Icons.close)),
      p.duration ? h('span', { className: 'wp-toast-bar', style: { animation: 'wp-progress ' + p.duration + 'ms linear forwards' }, onAnimationEnd: function (e) { e.stopPropagation(); dismiss(); } }) : null
    ));
  }

  function Button(p) {
    var variant = p.variant || 'secondary', size = p.size || 'md';
    var rest = Object.assign({}, p); delete rest.variant; delete rest.size; delete rest.icon; delete rest.className;
    return h('button', Object.assign({ type: 'button' }, rest, { className: cx('wp-btn', 'wp-btn-' + variant, size === 'sm' && 'wp-btn-sm', p.className) }),
      p.icon && Icons[p.icon] ? h(Icons[p.icon]) : null, p.children);
  }

  function Input(p) {
    var rest = Object.assign({}, p); delete rest.icon; delete rest.shortcut; delete rest.className;
    return h('label', { className: cx('wp-input', p.className) },
      p.icon && Icons[p.icon] ? h(Icons[p.icon]) : null,
      h('input', rest),
      p.shortcut ? h('span', { className: 'wp-kbd' }, p.shortcut) : null);
  }

  function EditorTab(p) {
    return h('div', {
      role: 'tab', tabIndex: 0, 'aria-selected': !!p.active,
      className: cx('wp-etab', p.active && 'wp-etab-active', p.className), onClick: p.onSelect,
      onKeyDown: function (e) { if (e.key === 'Enter') p.onSelect && p.onSelect(); }
    },
      h(FileIcon, { name: p.name, className: 'wp-etab-icon' }),
      h('span', null, p.name),
      p.dirty ? h('span', { className: 'wp-etab-dirty', 'aria-label': 'Não salvo' }) : null,
      h('button', { className: 'wp-x', 'aria-label': 'Fechar ' + p.name, onClick: function (e) { e.stopPropagation(); p.onClose && p.onClose(); } }, h(Icons.close)));
  }
  /* the editor's tab strip: tabs that scroll, plus split / markdown preview on the right */
  var MD_RE = /\.(md|mdx|markdown)$/i;
  function EditorTabs(p) {
    var tabs = p.tabs || [];
    var cur = tabs.filter(function (t) { return t.id === p.activeId; })[0];
    var canPreview = p.canPreview != null ? p.canPreview : !!(cur && MD_RE.test(cur.name));
    return h('div', { className: cx('wp-etabs', p.className) },
      h('div', { className: 'wp-etabs-scroll', role: 'tablist', 'aria-label': 'Arquivos abertos' },
        tabs.map(function (t) {
          return h(EditorTab, { key: t.id, name: t.name, dirty: t.dirty, active: t.id === p.activeId,
            onSelect: function () { p.onSelect && p.onSelect(t.id); }, onClose: function () { p.onClose && p.onClose(t.id); } });
        })),
      h('div', { className: 'wp-etabs-actions' },
        p.onPreview && canPreview ? h('button', { className: cx('wp-x', 'wp-etabs-btn', p.previewOpen && 'wp-etabs-btn-on'), 'aria-pressed': !!p.previewOpen,
          'aria-label': p.previewOpen ? 'Fechar preview do Markdown' : 'Abrir preview do Markdown ao lado', title: (p.previewOpen ? 'Fechar preview' : 'Abrir preview ao lado') + ' (⇧⌘V)', onClick: p.onPreview }, h(Icons.markdown)) : null,
        p.onSplit ? h('button', { className: cx('wp-x', 'wp-etabs-btn', p.split && 'wp-etabs-btn-on'), 'aria-pressed': p.split != null ? !!p.split : undefined,
          'aria-label': 'Dividir editor à direita', title: 'Dividir editor (⌘\\)', onClick: p.onSplit }, h(Icons.split)) : null,
        p.actions || null));
  }

  /* ---------------- File icon theme: icons by file type and by folder name ----------------
     Files: languages are a coloured 13px badge with a short mono label; everything else is a duotone glyph in the type's colour.
     Folders: a solid folder in the category colour with the category glyph cut in the lower right; open folders use the open shape. */
  var FI_COLORS = {
    blue: '#5b9dff', sky: '#4fd1ff', cyan: '#2fd3e0', teal: '#3ddcc4', green: '#5fdc8a', lime: '#a6e05a',
    yellow: '#ffd75e', amber: '#f5b951', orange: '#ff9a4d', coral: '#ff7b5c', red: '#ff6b7a', pink: '#ff7ac6',
    violet: '#b97cff', indigo: '#8b8cff', slate: '#9aa3c7', gray: '#8a84a3', brown: '#d0905a'
  };
  var FI_DARK_TEXT = { blue: 1, sky: 1, cyan: 1, teal: 1, green: 1, lime: 1, yellow: 1, amber: 1, orange: 1, coral: 1, red: 1, pink: 1, violet: 1, indigo: 1, slate: 1, gray: 1, brown: 1 };
  var CIRCLE = 'M8 14.2A6.2 6.2 0 1 0 8 1.8a6.2 6.2 0 0 0 0 12.4z';
  var FI_GLYPHS = {
    code: ['M5.6 4.6L2.4 8l3.2 3.4', 'M10.4 4.6L13.6 8l-3.2 3.4', 'M9 3.4L7 12.6'],
    braces: ['M6 2.8c-1.4 0-2 .6-2 1.8v1.6c0 .8-.5 1.4-1.4 1.8.9.4 1.4 1 1.4 1.8v1.6c0 1.2.6 1.8 2 1.8', 'M10 2.8c1.4 0 2 .6 2 1.8v1.6c0 .8.5 1.4 1.4 1.8-.9.4-1.4 1-1.4 1.8v1.6c0 1.2-.6 1.8-2 1.8'],
    hash: ['M6.4 2.6L5 13.4', 'M11 2.6L9.6 13.4', 'M3 5.8h10.6', 'M2.4 10.2h10.6'],
    angle: ['M5.4 4.2L1.8 8l3.6 3.8', 'M10.6 4.2L14.2 8l-3.6 3.8', { d: 'M8 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', solid: true }],
    layers: [D('M8 2l6 3.2-6 3.2-6-3.2z'), 'M2 8.2l6 3.2 6-3.2', 'M2 11l6 3.2 6-3.2'],
    grid: [D('M2.4 2.4h4.6V7H2.4z'), D('M9 2.4h4.6V7H9z'), D('M2.4 9h4.6v4.6H2.4z'), D('M9 9h4.6v4.6H9z')],
    page: [D('M4.3 1.8h4.9l3.3 3.3v8.1a1 1 0 0 1-1 1H4.3a1 1 0 0 1-1-1V2.8a1 1 0 0 1 1-1z'), 'M9.2 1.8v3.3h3.3', 'M5.8 8.6h4.4', 'M5.8 11h2.8'],
    blocks: [D('M8 1.6l2.6 2.6L8 6.8 5.4 4.2z'), D('M4.2 5.4l2.6 2.6-2.6 2.6L1.6 8z'), D('M11.8 5.4L14.4 8l-2.6 2.6L9.2 8z'), D('M8 9.2l2.6 2.6L8 14.4l-2.6-2.6z')],
    layout: [D('M2.4 2.6h11.2v10.8H2.4z'), 'M2.4 5.8h11.2', 'M6.4 5.8v7.6'],
    hook: ['M10.6 2.2v6.6a3.6 3.6 0 0 1-7.2 0V7.4', 'M1.9 9l1.5-1.6L4.9 9', { d: 'M10.6 3.4a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z', solid: true }],
    wrench: [D('M13.4 4.4a3.4 3.4 0 0 1-4.6 3.9L4 13.1a1.5 1.5 0 0 1-2.1-2.1l4.8-4.8a3.4 3.4 0 0 1 3.9-4.6L8.4 3.8l.5 2.3 2.3.5z')],
    server: [D('M2.4 2.6h11.2v4.4H2.4z'), D('M2.4 9h11.2v4.4H2.4z'), { d: 'M5 5.6a.8.8 0 1 0 0-1.6.8.8 0 0 0 0 1.6z', solid: true }, { d: 'M5 12a.8.8 0 1 0 0-1.6.8.8 0 0 0 0 1.6z', solid: true }],
    plug: ['M5.6 1.8v3', 'M10.4 1.8v3', D('M3.6 4.8h8.8v2.6a4.4 4.4 0 0 1-8.8 0z'), 'M8 11.8v2.4'],
    route: ['M8 1.8v12.4', D('M8 3.2h4.6L14 4.8l-1.4 1.6H8z'), D('M8 8h-4.6L2 9.6l1.4 1.6H8z')],
    switch: ['M2.4 5.2h10.4', 'M10.2 2.6l2.6 2.6-2.6 2.6', 'M13.6 10.8H3.2', 'M5.8 8.2l-2.6 2.6 2.6 2.6'],
    filter: [D('M2.2 2.8h11.6L9.2 8.4v4.4l-2.4 1.4V8.4z')],
    cube: [D('M8 1.8l5.4 3.1v6.2L8 14.2l-5.4-3.1V4.9z'), 'M8 8v6.2', 'M8 8l5.4-3.1', 'M8 8L2.6 4.9'],
    database: [D('M2.8 4c0-1.2 2.3-2 5.2-2s5.2.8 5.2 2v8c0 1.2-2.3 2-5.2 2s-5.2-.8-5.2-2z'), 'M2.8 4c0 1.2 2.3 2 5.2 2s5.2-.8 5.2-2', 'M2.8 8c0 1.2 2.3 2 5.2 2s5.2-.8 5.2-2'],
    migrate: [D('M1.8 4.2c0-1 1.8-1.7 4-1.7s4 .7 4 1.7v7.6c0 1-1.8 1.7-4 1.7s-4-.7-4-1.7z'), 'M1.8 4.2c0 1 1.8 1.7 4 1.7s4-.7 4-1.7', 'M10.8 8h3.6', 'M12.6 6.2L14.4 8l-1.8 1.8'],
    bag: [D('M2.8 5.4h10.4l-.9 8.6H3.7z'), 'M5.6 5.4V4.4a2.4 2.4 0 0 1 4.8 0v1'],
    type: [D('M2.4 2.4h11.2v11.2H2.4z'), 'M5.2 5.4h5.6', 'M8 5.4v5.6'],
    gear: [D('M12.76 6.84 L14.21 6.93 L14.21 9.07 L12.76 9.16 L12.19 10.54 L13.14 11.64 L11.64 13.14 L10.54 12.19 L9.16 12.76 L9.07 14.21 L6.93 14.21 L6.84 12.76 L5.46 12.19 L4.36 13.14 L2.86 11.64 L3.81 10.54 L3.24 9.16 L1.79 9.07 L1.79 6.93 L3.24 6.84 L3.81 5.46 L2.86 4.36 L4.36 2.86 L5.46 3.81 L6.84 3.24 L6.93 1.79 L9.07 1.79 L9.16 3.24 L10.54 3.81 L11.64 2.86 L13.14 4.36 L12.19 5.46Z'), 'M8 10.1a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2z'],
    list: ['M6 4h7.4', 'M6 8h7.4', 'M6 12h7.4', { d: 'M3 4.9a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8z', solid: true }, { d: 'M3 8.9a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8z', solid: true }, { d: 'M3 12.9a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8z', solid: true }],
    image: [D('M2.2 2.8h11.6v10.4H2.2z'), 'M2.2 11.2l3.6-3.6 2.6 2.6 1.8-1.8 3.6 3.6', { d: 'M10.6 6.6a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z', solid: true }],
    font: ['M2.8 13.4L8 2.6l5.2 10.8', 'M4.8 9.4h6.4'],
    brush: [D('M13 2.2c.7.6-3.4 6.2-4.8 7.4L6.6 8c1.2-1.4 5.7-6.4 6.4-5.8z'), D('M6 9.4c-1.6 0-2.6 1-2.6 2.4 0 .8-.6 1.4-1.4 1.6 2.6 1.2 5.6.2 5.6-2.4z')],
    globe: [D(CIRCLE), 'M1.8 8h12.4', 'M8 1.8c1.7 1.8 2.6 3.9 2.6 6.2S9.7 12.4 8 14.2C6.3 12.4 5.4 10.3 5.4 8S6.3 3.6 8 1.8z'],
    flask: ['M5.8 2.2h4.4', D('M6.8 2.2v4L3.1 12.3a1.1 1.1 0 0 0 .95 1.7h7.9a1.1 1.1 0 0 0 .95-1.7L9.2 6.2v-4z'), 'M4.6 9.8h6.8'],
    book: [D('M3 2.4h8a1.4 1.4 0 0 1 1.4 1.4v9.8H4.6A1.6 1.6 0 0 1 3 12z'), 'M3 12a1.6 1.6 0 0 1 1.6-1.6h7.8', 'M6 5.4h3.6'],
    terminal: [D('M3.3 2.4h9.4a1.5 1.5 0 0 1 1.5 1.5v8.2a1.5 1.5 0 0 1-1.5 1.5H3.3a1.5 1.5 0 0 1-1.5-1.5V3.9a1.5 1.5 0 0 1 1.5-1.5z'), 'M4.8 6.3L6.8 8l-2 1.7', 'M8.6 10h2.6'],
    package: [D('M8 1.8l5.6 3v6.4L8 14.2l-5.6-3V4.8z'), 'M2.4 4.8L8 7.8l5.6-3', 'M8 7.8v6.4', 'M5.2 3.3l5.6 3'],
    git: ['M4.5 4.6v6.8', 'M11.5 6.1v.4a3 3 0 0 1-3 3h-4', D('M4.5 4.6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z'), D('M11.5 6.1a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z'), D('M4.5 14.4a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z')],
    brain: [D('M7.4 2.6a2.3 2.3 0 0 0-3.6 1.6 2.3 2.3 0 0 0-1.7 3.1 2.4 2.4 0 0 0 .5 3.6 2.3 2.3 0 0 0 2.7 2.5 2.1 2.1 0 0 0 2.1 1.1z'), D('M8.6 2.6a2.3 2.3 0 0 1 3.6 1.6 2.3 2.3 0 0 1 1.7 3.1 2.4 2.4 0 0 1-.5 3.6 2.3 2.3 0 0 1-2.7 2.5 2.1 2.1 0 0 1-2.1 1.1z'), 'M4.6 6.4c.9 0 1.6.4 2 1.1', 'M3.9 9.6c.8-.4 1.8-.3 2.5.3', 'M11.4 6.4c-.9 0-1.6.4-2 1.1', 'M12.1 9.6c-.8-.4-1.8-.3-2.5.3'],
    container: [D('M1.8 7.6h12.4v3a3 3 0 0 1-3 3H4.8a3 3 0 0 1-3-3z'), D('M3.4 4.8h2.8v2.8H3.4z'), D('M6.6 4.8h2.8v2.8H6.6z'), D('M6.6 2h2.8v2.8H6.6z'), D('M9.8 4.8h2.8v2.8H9.8z')],
    containers: [D('M2 8.6h12v4.6H2z'), D('M2 3h5.4v4.6H2z'), D('M8.6 3H14v4.6H8.6z'), 'M4.6 10.9h6.8'],
    cloud: [D('M4.6 12.8a3.1 3.1 0 0 1-.5-6.2 4.1 4.1 0 0 1 7.8-.8 3.5 3.5 0 0 1 .4 7z')],
    bolt: [D('M9.2 1.6L3.4 9.1h4.1l-.9 5.3 6-7.6H8.4z')],
    language: ['M2 3.8h7', 'M5.5 2.2v1.6', 'M8 3.8c-.6 2.8-2.6 5-5.6 6.2', 'M4.4 6c.8 1.6 2 2.8 3.6 3.6', 'M9 14l2.6-6.4L14.2 14', 'M9.9 12h3.4'],
    logs: ['M3 4h10', 'M3 8h6.5', 'M3 12h8.5'],
    hourglass: [D('M4 2h8v1.8c0 1.7-1.6 3-3.2 4.2C10.4 9.2 12 10.5 12 12.2V14H4v-1.8c0-1.7 1.6-3 3.2-4.2C5.6 6.8 4 5.5 4 3.8z')],
    shield: [D('M8 1.8l5 1.9v4.1c0 3-2.1 5.3-5 6.4-2.9-1.1-5-3.4-5-6.4V3.7z'), 'M5.8 8l1.6 1.6 3-3'],
    key: [D('M5.4 13.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z'), 'M7.8 7.6l5.8-5.8', 'M11.4 3.8l1.8 1.8', 'M9.8 5.4l1.4 1.4'],
    mail: [D('M1.8 3.4h12.4v9.2H1.8z'), 'M2 3.8l6 4.8 6-4.8'],
    clock: [D(CIRCLE), 'M8 4.6V8l2.4 1.6'],
    graph: ['M3.6 4.2h8.8', 'M3.6 4.2L8 12.4', 'M12.4 4.2L8 12.4', { d: 'M3.6 6a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z', solid: true }, { d: 'M12.4 6a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z', solid: true }, { d: 'M8 14.2a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z', solid: true }],
    prism: [D('M8 1.8l6.2 11.4H1.8z'), 'M8 1.8v11.4'],
    monitor: [D('M1.8 2.8h12.4v8.4H1.8z'), 'M5.6 14h4.8', 'M8 11.2V14'],
    phone: [D('M4.4 1.6h7.2v12.8H4.4z'), 'M7 12.2h2'],
    play: [D(CIRCLE), { d: 'M6.6 5.2v5.6L11 8z', solid: true }],
    chart: ['M2.2 13.8h11.6', D('M3.4 8.4h2.4v5.4H3.4z'), D('M6.8 4.8h2.4v9H6.8z'), D('M10.2 2.4h2.4v11.4h-2.4z')],
    puzzle: [D('M2.6 4.4h2.8a1.6 1.6 0 1 1 3.2 0h2.8v2.8a1.6 1.6 0 1 1 0 3.2v3H8.6a1.6 1.6 0 1 0-3.2 0H2.6v-3a1.6 1.6 0 1 0 0-3.2z')],
    share: ['M4.2 8l7.6-4', 'M4.2 8l7.6 4', { d: 'M4.2 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', solid: true }, { d: 'M11.8 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', solid: true }, { d: 'M11.8 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', solid: true }],
    lambda: ['M3.4 2.4h1.8c.8 0 1.4.4 1.7 1.2l4.2 9.8h1.6', 'M6.9 6.4l-3.1 7'],
    signal: ['M1.8 8h2.6l1.8-4.6 3.4 9.2 1.8-4.6h2.8'],
    video: [D('M1.8 3.8h8.8v8.4H1.8z'), D('M10.6 7l3.6-2.2v6.4L10.6 9z')],
    audio: ['M6 12V3.6l7.2-1.6v8.4', D('M4.3 13.9a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z'), D('M11.4 12.2a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6z')],
    archive: [D('M2.4 2.2h11.2v11.6H2.4z'), 'M8 2.2v1.4', 'M8 5v1.4', 'M8 7.8v1.2', D('M6.8 9h2.4v2.8H6.8z')],
    lock: [D('M3.2 7h9.6v7H3.2z'), 'M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7', 'M8 9.6v1.8'],
    text: ['M2.8 3.6h10.4', 'M2.8 6.8h10.4', 'M2.8 10h10.4', 'M2.8 13.2h6.4'],
    table: [D('M2 2.6h12v10.8H2z'), 'M2 6.2h12', 'M2 9.8h12', 'M6.4 2.6v10.8'],
    markdown: [D('M2.9 3.4h10.2a1.1 1.1 0 0 1 1.1 1.1v7a1.1 1.1 0 0 1-1.1 1.1H2.9a1.1 1.1 0 0 1-1.1-1.1v-7a1.1 1.1 0 0 1 1.1-1.1z'), 'M4.2 10.2V5.8l1.9 2.3 1.9-2.3v4.4', 'M11 5.8v4.3', 'M9.6 8.8l1.4 1.4 1.4-1.4'],
    vector: [D('M8 1.8l4 5.6-4 6.8-4-6.8z'), 'M8 1.8v6.4', { d: 'M8 9.2a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2z', solid: true }],
    law: ['M8 2v11.6', 'M4.4 13.8h7.2', 'M2.8 4.4h10.4', D('M2.8 4.4L1.2 8.6a1.9 1.9 0 0 0 3.2 0z'), D('M13.2 4.4l-1.6 4.2a1.9 1.9 0 0 0 3.2 0z')],
    history: ['M2.8 8a5.2 5.2 0 1 0 1.6-3.8', 'M2.4 2.4v2.8h2.8', 'M8 5.2V8l2 1.4'],
    people: [D('M6 7.4a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8z'), D('M1.6 13.6a4.4 4.4 0 0 1 8.8 0z'), 'M10.6 2.8a2.4 2.4 0 0 1 0 4.4', 'M12 9.4a4.4 4.4 0 0 1 2.4 4.2'],
    hammer: [D('M2.2 4.6L6 2l4.2 2.8-1.8 1.8z'), 'M7.6 5.6l6 7.2a1.1 1.1 0 0 1-1.6 1.4L5.8 7.2'],
    bot: [D('M2.8 5.6h10.4v7.6H2.8z'), 'M8 5.6V3', { d: 'M8 3.2a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', solid: true }, { d: 'M5.8 9.6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', solid: true }, { d: 'M10.2 9.6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', solid: true }, 'M6.4 11.4h3.2'],
    diff: [D('M3.6 1.8h8.8a1.1 1.1 0 0 1 1.1 1.1v10.2a1.1 1.1 0 0 1-1.1 1.1H3.6a1.1 1.1 0 0 1-1.1-1.1V2.9a1.1 1.1 0 0 1 1.1-1.1z'), 'M8 4.6v3.8', 'M6.1 6.5h3.8', 'M6.1 11h3.8'],
    hexagon: [D('M8 1.6l5.6 3.2v6.4L8 14.4l-5.6-3.2V4.8z'), { d: 'M8 9.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z', solid: true }],
    camera: [D('M1.8 5h2.8l1.2-1.8h4.4L11.4 5h2.8v8.2H1.8z'), D('M8 11.6a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8z')],
    notebook: [D('M3.6 1.8h9v12.4h-9z'), 'M2 4.6h3', 'M2 8h3', 'M2 11.4h3', 'M7.2 5.2h3.4'],
    spark: [D('M7 1.8l1.2 3.3a2.2 2.2 0 0 0 1.3 1.3L12.8 7.6 9.5 8.8a2.2 2.2 0 0 0-1.3 1.3L7 13.4 5.8 10.1a2.2 2.2 0 0 0-1.3-1.3L1.2 7.6l3.3-1.2a2.2 2.2 0 0 0 1.3-1.3z'), { d: 'M12.8 1.2l.45 1.15 1.15.45-1.15.45-.45 1.15-.45-1.15-1.15-.45 1.15-.45z', solid: true }],
    gauge: ['M2.4 11.8a5.8 5.8 0 1 1 11.2 0', 'M8 10.6l2.8-3.6', { d: 'M8 11.8a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z', solid: true }],
    rocket: [D('M9.8 2c2.4 0 4.2 1.8 4.2 4.2 0 2.4-2.6 4.8-5 6.2L5.6 9C7 6.6 7.4 2 9.8 2z'), 'M5.6 9L3 9.8 2 13.2l3.4-1 .8-2.6', { d: 'M10.4 6.8a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2z', solid: true }],
    wheel: [D(CIRCLE), 'M8 3.2v9.6', 'M3.2 8h9.6', 'M4.6 4.6l6.8 6.8', 'M11.4 4.6l-6.8 6.8'],
    check: [D(CIRCLE), 'M5.4 8.2l1.8 1.8 3.4-3.6'],
    trash: ['M2.6 4.2h10.8', 'M6.2 4.2V2.8h3.6v1.4', D('M3.8 4.2h8.4l-.7 9.6H4.5z')],
    star: [D('M8 1.9l1.85 3.75 4.15.6-3 2.92.7 4.13L8 11.35 4.3 13.3l.7-4.13-3-2.92 4.15-.6z')],
    heart: [D('M8 13.6S2 10 2 6a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 4-6 7.6-6 7.6z')],
    download: ['M8 2.2v8', 'M4.8 7.2L8 10.4l3.2-3.2', 'M2.6 13.4h10.8'],
    cpu: [D('M4.2 4.2h7.6v7.6H4.2z'), 'M6.2 1.8v2.4', 'M9.8 1.8v2.4', 'M6.2 11.8v2.4', 'M9.8 11.8v2.4', 'M1.8 6.2h2.4', 'M1.8 9.8h2.4', 'M11.8 6.2h2.4', 'M11.8 9.8h2.4'],
    eye: [D('M1.4 8S3.8 3.4 8 3.4 14.6 8 14.6 8 12.2 12.6 8 12.6 1.4 8 1.4 8z'), { d: 'M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', solid: true }],
    vial: [D('M5.6 1.8h4.8'), D('M6.4 1.8v9.6a1.6 1.6 0 0 0 3.2 0V1.8z'), 'M6.4 7.2h3.2']
  };
  /* [glyph | badge label, colour]. A string starting with ':' is a badge label. */
  var FI_EXT = {
    ts: [':TS', 'blue'], mts: [':TS', 'blue'], cts: [':TS', 'blue'], tsx: [':TSX', 'sky'], js: [':JS', 'yellow'], mjs: [':JS', 'yellow'], cjs: [':JS', 'yellow'], jsx: [':JSX', 'amber'],
    json: ['braces', 'amber'], jsonc: ['braces', 'amber'], json5: ['braces', 'amber'], md: ['markdown', 'sky'], markdown: ['markdown', 'sky'], mdx: [':MDX', 'amber'], rst: ['text', 'slate'], adoc: ['text', 'coral'],
    css: ['hash', 'blue'], scss: ['hash', 'pink'], sass: ['hash', 'pink'], less: ['hash', 'indigo'], styl: ['hash', 'lime'], pcss: ['hash', 'coral'],
    html: ['code', 'orange'], htm: ['code', 'orange'], xml: ['angle', 'amber'], xhtml: ['code', 'orange'], svg: ['vector', 'amber'],
    vue: [':VUE', 'green'], svelte: [':SV', 'coral'], astro: [':AST', 'violet'], hbs: ['code', 'amber'], ejs: ['code', 'yellow'], pug: ['code', 'brown'], njk: ['code', 'green'], liquid: ['code', 'teal'], twig: ['code', 'lime'],
    py: [':PY', 'sky'], pyi: [':PYI', 'sky'], pyc: [':PY', 'slate'], ipynb: ['notebook', 'orange'], go: [':GO', 'cyan'], rs: [':RS', 'orange'], java: [':JV', 'red'], class: [':JV', 'slate'], jar: ['archive', 'red'],
    kt: [':KT', 'violet'], kts: [':KTS', 'violet'], swift: [':SW', 'coral'], c: [':C', 'blue'], h: [':H', 'violet'], cpp: [':C++', 'blue'], cc: [':C++', 'blue'], cxx: [':C++', 'blue'], hpp: [':H++', 'violet'],
    cs: [':C#', 'green'], csproj: ['gear', 'green'], sln: ['layers', 'violet'], fs: [':F#', 'sky'], vb: [':VB', 'indigo'], php: [':PHP', 'indigo'], rb: [':RB', 'red'], erb: ['code', 'red'], dart: [':DT', 'sky'],
    lua: [':LUA', 'indigo'], r: [':R', 'blue'], rmd: [':RMD', 'blue'], scala: [':SC', 'red'], sc: [':SC', 'red'], ex: [':EX', 'violet'], exs: [':EXS', 'violet'], erl: [':ERL', 'red'], hs: [':HS', 'violet'],
    clj: [':CLJ', 'green'], cljs: [':CLJ', 'sky'], elm: [':ELM', 'cyan'], zig: [':ZIG', 'amber'], nim: [':NIM', 'yellow'], sol: [':SOL', 'slate'], jl: [':JL', 'violet'], pl: [':PL', 'indigo'], pm: [':PM', 'indigo'],
    groovy: [':GR', 'teal'], gradle: ['hammer', 'teal'], m: [':M', 'blue'], mm: [':MM', 'blue'], v: [':V', 'blue'], cr: [':CR', 'slate'], ml: [':ML', 'orange'], asm: [':ASM', 'red'], s: [':ASM', 'red'],
    sh: ['terminal', 'green'], bash: ['terminal', 'green'], zsh: ['terminal', 'green'], fish: ['terminal', 'green'], ps1: ['terminal', 'blue'], psm1: ['terminal', 'blue'], bat: ['terminal', 'slate'], cmd: ['terminal', 'slate'],
    sql: ['database', 'amber'], sqlite: ['database', 'sky'], db: ['database', 'slate'], prisma: ['prism', 'indigo'], graphql: ['graph', 'pink'], gql: ['graph', 'pink'], proto: ['plug', 'teal'], avsc: ['braces', 'teal'],
    yml: ['list', 'red'], yaml: ['list', 'red'], toml: ['gear', 'slate'], ini: ['gear', 'slate'], cfg: ['gear', 'slate'], conf: ['gear', 'slate'], properties: ['gear', 'slate'], env: ['key', 'yellow'],
    lock: ['lock', 'slate'], log: ['logs', 'slate'], txt: ['text', 'slate'], csv: ['table', 'green'], tsv: ['table', 'green'], xlsx: ['table', 'green'], xls: ['table', 'green'], ods: ['table', 'green'], parquet: ['table', 'teal'],
    doc: [':DOC', 'blue'], docx: [':DOC', 'blue'], odt: [':DOC', 'blue'], ppt: [':PPT', 'coral'], pptx: [':PPT', 'coral'], key: ['key', 'amber'], pdf: [':PDF', 'red'], rtf: ['text', 'blue'], epub: ['book', 'teal'],
    png: ['image', 'teal'], jpg: ['image', 'teal'], jpeg: ['image', 'teal'], gif: ['image', 'teal'], webp: ['image', 'teal'], avif: ['image', 'teal'], bmp: ['image', 'teal'], tiff: ['image', 'teal'], heic: ['image', 'teal'], ico: ['image', 'yellow'],
    psd: ['image', 'blue'], fig: ['vector', 'pink'], sketch: ['vector', 'amber'], ai: ['vector', 'orange'], blend: ['cube', 'orange'], glb: ['cube', 'lime'], gltf: ['cube', 'lime'], obj: ['cube', 'slate'], fbx: ['cube', 'slate'],
    mp4: ['video', 'pink'], mov: ['video', 'pink'], webm: ['video', 'pink'], mkv: ['video', 'pink'], avi: ['video', 'pink'], mp3: ['audio', 'violet'], wav: ['audio', 'violet'], flac: ['audio', 'violet'], ogg: ['audio', 'violet'], m4a: ['audio', 'violet'],
    ttf: ['font', 'coral'], otf: ['font', 'coral'], woff: ['font', 'coral'], woff2: ['font', 'coral'], eot: ['font', 'coral'],
    zip: ['archive', 'amber'], tar: ['archive', 'amber'], gz: ['archive', 'amber'], tgz: ['archive', 'amber'], rar: ['archive', 'amber'], '7z': ['archive', 'amber'], bz2: ['archive', 'amber'], xz: ['archive', 'amber'], dmg: ['archive', 'slate'], iso: ['archive', 'slate'],
    wasm: [':WA', 'indigo'], wat: [':WAT', 'indigo'], tf: [':TF', 'violet'], tfvars: [':TF', 'violet'], hcl: [':HCL', 'violet'], nix: ['hexagon', 'sky'], dockerfile: ['container', 'blue'],
    pem: ['key', 'green'], crt: ['shield', 'green'], cer: ['shield', 'green'], p12: ['key', 'green'], pub: ['key', 'green'], gpg: ['lock', 'green'], asc: ['lock', 'green'],
    diff: ['diff', 'green'], patch: ['diff', 'green'], http: ['globe', 'teal'], rest: ['globe', 'teal'], webmanifest: ['globe', 'sky'], map: ['logs', 'gray'], snap: ['camera', 'slate'], tmp: ['hourglass', 'gray'], bak: ['history', 'gray'],
    exe: ['cpu', 'slate'], dll: ['cpu', 'slate'], so: ['cpu', 'slate'], bin: ['cpu', 'slate'], apk: ['phone', 'green'], ipa: ['phone', 'slate'], ics: ['clock', 'red'], vim: [':VIM', 'green'], plist: ['gear', 'slate'], xcconfig: ['gear', 'blue'],
    hurl: ['globe', 'pink'], bru: ['globe', 'amber'], k6: ['gauge', 'violet'], drawio: ['share', 'orange'], mermaid: ['share', 'pink'], mmd: ['share', 'pink'], puml: ['share', 'amber'], excalidraw: ['vector', 'violet']
  };
  /* compound suffixes (checked before the plain extension), longest first */
  var FI_SUFFIX = [
    ['.d.ts', ':DTS', 'indigo'], ['.test.ts', 'flask', 'teal'], ['.spec.ts', 'flask', 'teal'], ['.test.tsx', 'flask', 'teal'], ['.spec.tsx', 'flask', 'teal'], ['.test.js', 'flask', 'yellow'], ['.spec.js', 'flask', 'yellow'],
    ['.test.jsx', 'flask', 'yellow'], ['.e2e.ts', 'flask', 'green'], ['.e2e-spec.ts', 'flask', 'green'], ['.cy.ts', 'flask', 'green'], ['_test.go', 'flask', 'cyan'], ['_test.py', 'flask', 'sky'], ['.bench.ts', 'gauge', 'violet'],
    ['.stories.tsx', 'book', 'pink'], ['.stories.ts', 'book', 'pink'], ['.stories.jsx', 'book', 'pink'], ['.stories.mdx', 'book', 'pink'], ['.module.css', 'hash', 'sky'], ['.module.scss', 'hash', 'pink'],
    ['.controller.ts', 'switch', 'blue'], ['.service.ts', 'server', 'amber'], ['.module.ts', 'cube', 'red'], ['.entity.ts', 'database', 'amber'], ['.dto.ts', 'type', 'teal'], ['.guard.ts', 'shield', 'green'],
    ['.middleware.ts', 'filter', 'violet'], ['.resolver.ts', 'graph', 'pink'], ['.interceptor.ts', 'signal', 'orange'], ['.pipe.ts', 'filter', 'teal'], ['.strategy.ts', 'key', 'yellow'], ['.decorator.ts', 'spark', 'violet'],
    ['.repository.ts', 'database', 'sky'], ['.schema.ts', 'cube', 'teal'], ['.model.ts', 'cube', 'violet'], ['.store.ts', 'bag', 'violet'], ['.hook.ts', 'hook', 'violet'], ['.routes.ts', 'route', 'orange'], ['.router.ts', 'route', 'orange'],
    ['.adapter.ts', 'plug', 'teal'], ['.config.ts', 'gear', 'blue'], ['.config.js', 'gear', 'yellow'], ['.config.mjs', 'gear', 'yellow'], ['.config.cjs', 'gear', 'yellow'], ['.worker.ts', 'cpu', 'amber'], ['.mock.ts', 'flask', 'slate'],
    ['.min.js', ':JS', 'gray'], ['.min.css', 'hash', 'gray'], ['.env.local', 'key', 'yellow'], ['.code-workspace', 'layers', 'blue'], ['.blade.php', 'code', 'coral']
  ];
  /* exact file names (lower case) */
  var FI_NAME = {
    'package.json': ['package', 'green'], 'package-lock.json': ['lock', 'red'], 'yarn.lock': ['lock', 'sky'], 'pnpm-lock.yaml': ['lock', 'amber'], 'pnpm-workspace.yaml': ['layers', 'amber'], 'bun.lockb': ['lock', 'brown'], 'bun.lock': ['lock', 'brown'],
    'tsconfig.json': ['gear', 'blue'], 'jsconfig.json': ['gear', 'yellow'], '.gitignore': ['git', 'orange'], '.gitattributes': ['git', 'orange'], '.gitmodules': ['git', 'orange'], '.gitkeep': ['git', 'gray'], '.git-blame-ignore-revs': ['git', 'gray'],
    '.env': ['key', 'yellow'], '.env.example': ['key', 'gray'], '.env.sample': ['key', 'gray'], '.env.template': ['key', 'gray'], dockerfile: ['container', 'blue'], containerfile: ['container', 'blue'], '.dockerignore': ['container', 'slate'],
    'docker-compose.yml': ['containers', 'blue'], 'docker-compose.yaml': ['containers', 'blue'], 'compose.yml': ['containers', 'blue'], 'compose.yaml': ['containers', 'blue'],
    'readme.md': ['book', 'sky'], readme: ['book', 'sky'], 'readme.txt': ['book', 'sky'], 'changelog.md': ['history', 'green'], changelog: ['history', 'green'], 'history.md': ['history', 'green'],
    license: ['law', 'amber'], 'license.md': ['law', 'amber'], 'license.txt': ['law', 'amber'], copying: ['law', 'amber'], 'contributing.md': ['people', 'teal'], 'code_of_conduct.md': ['heart', 'pink'], 'security.md': ['shield', 'red'], 'support.md': ['heart', 'sky'],
    'authors': ['people', 'violet'], 'codeowners': ['people', 'orange'], 'claude.md': ['brain', 'violet'], 'claude.local.md': ['brain', 'violet'], 'agents.md': ['bot', 'violet'], '.mcp.json': ['plug', 'violet'], 'todo.md': ['check', 'amber'],
    makefile: ['hammer', 'orange'], gnumakefile: ['hammer', 'orange'], justfile: ['hammer', 'amber'], 'taskfile.yml': ['hammer', 'teal'], procfile: ['terminal', 'violet'], 'cmakelists.txt': ['hammer', 'blue'], 'build.gradle': ['hammer', 'teal'],
    '.editorconfig': ['gear', 'slate'], '.prettierrc': ['brush', 'pink'], '.prettierrc.json': ['brush', 'pink'], '.prettierrc.js': ['brush', 'pink'], 'prettier.config.js': ['brush', 'pink'], '.prettierignore': ['brush', 'gray'],
    '.eslintrc': ['check', 'violet'], '.eslintrc.json': ['check', 'violet'], '.eslintrc.js': ['check', 'violet'], '.eslintrc.cjs': ['check', 'violet'], 'eslint.config.js': ['check', 'violet'], 'eslint.config.mjs': ['check', 'violet'], '.eslintignore': ['check', 'gray'],
    'biome.json': ['check', 'sky'], '.stylelintrc': ['check', 'pink'], '.markdownlint.json': ['check', 'sky'], 'commitlint.config.js': ['check', 'teal'], '.lintstagedrc': ['check', 'teal'],
    'vite.config.ts': ['bolt', 'violet'], 'vite.config.js': ['bolt', 'violet'], 'vitest.config.ts': ['flask', 'green'], 'jest.config.js': ['flask', 'red'], 'jest.config.ts': ['flask', 'red'], 'playwright.config.ts': ['flask', 'green'], 'cypress.config.ts': ['flask', 'teal'],
    'next.config.js': ['gear', 'slate'], 'next.config.mjs': ['gear', 'slate'], 'next.config.ts': ['gear', 'slate'], 'nuxt.config.ts': ['gear', 'green'], 'astro.config.mjs': ['gear', 'violet'], 'svelte.config.js': ['gear', 'coral'],
    'tailwind.config.js': ['gear', 'cyan'], 'tailwind.config.ts': ['gear', 'cyan'], 'postcss.config.js': ['gear', 'coral'], 'postcss.config.mjs': ['gear', 'coral'], 'babel.config.js': ['gear', 'yellow'], '.babelrc': ['gear', 'yellow'],
    'webpack.config.js': ['gear', 'blue'], 'rollup.config.js': ['gear', 'red'], 'tsup.config.ts': ['gear', 'amber'], 'nodemon.json': ['gear', 'green'], 'nest-cli.json': ['gear', 'red'], 'angular.json': ['gear', 'red'], 'ormconfig.ts': ['database', 'amber'], 'ormconfig.json': ['database', 'amber'],
    'drizzle.config.ts': ['database', 'lime'], 'knexfile.js': ['database', 'orange'], 'schema.prisma': ['prism', 'indigo'], 'turbo.json': ['bolt', 'pink'], 'nx.json': ['layers', 'sky'], 'lerna.json': ['layers', 'violet'],
    '.nvmrc': ['hexagon', 'green'], '.node-version': ['hexagon', 'green'], '.npmrc': ['package', 'red'], '.npmignore': ['package', 'gray'], '.yarnrc.yml': ['package', 'sky'], '.tool-versions': ['list', 'slate'], '.python-version': [':PY', 'sky'],
    'go.mod': [':GO', 'cyan'], 'go.sum': ['lock', 'cyan'], 'go.work': [':GO', 'cyan'], 'cargo.toml': [':RS', 'orange'], 'cargo.lock': ['lock', 'orange'], 'requirements.txt': ['package', 'sky'], 'pyproject.toml': ['gear', 'sky'], 'pipfile': ['package', 'sky'], 'poetry.lock': ['lock', 'sky'], 'uv.lock': ['lock', 'sky'],
    gemfile: ['package', 'red'], 'gemfile.lock': ['lock', 'red'], 'composer.json': ['package', 'indigo'], 'composer.lock': ['lock', 'indigo'], 'pubspec.yaml': ['package', 'sky'], 'mix.exs': ['package', 'violet'], 'deno.json': ['gear', 'slate'],
    'vercel.json': ['rocket', 'slate'], 'netlify.toml': ['rocket', 'teal'], 'fly.toml': ['rocket', 'violet'], 'render.yaml': ['rocket', 'green'], 'railway.json': ['rocket', 'pink'], 'app.yaml': ['rocket', 'blue'], 'serverless.yml': ['lambda', 'amber'],
    jenkinsfile: ['rocket', 'red'], '.gitlab-ci.yml': ['rocket', 'orange'], '.travis.yml': ['rocket', 'amber'], 'azure-pipelines.yml': ['rocket', 'blue'], 'bitbucket-pipelines.yml': ['rocket', 'blue'], 'renovate.json': ['bot', 'teal'], 'dependabot.yml': ['bot', 'blue'],
    'openapi.yaml': ['plug', 'green'], 'openapi.json': ['plug', 'green'], 'swagger.json': ['plug', 'green'], 'swagger.yaml': ['plug', 'green'], 'robots.txt': ['bot', 'slate'], 'sitemap.xml': ['share', 'teal'], 'manifest.json': ['globe', 'sky'], 'favicon.ico': ['star', 'yellow'],
    '.htaccess': ['gear', 'red'], 'nginx.conf': ['server', 'green'], 'caddyfile': ['server', 'teal'], 'chart.yaml': ['wheel', 'blue'], 'values.yaml': ['wheel', 'sky'], 'kustomization.yaml': ['wheel', 'blue'], 'skaffold.yaml': ['wheel', 'teal'],
    'main.tf': [':TF', 'violet'], 'variables.tf': [':TF', 'violet'], 'terraform.tfstate': ['lock', 'violet'], '.terraform.lock.hcl': ['lock', 'violet'], 'vagrantfile': ['cube', 'blue'], 'brewfile': ['package', 'amber'], '.ds_store': ['eye', 'gray'], 'thumbs.db': ['eye', 'gray'], '.mailmap': ['mail', 'orange']
  };
  /* folder categories: [glyph, colour, names…] */
  var FI_FOLDERS = [
    ['code', 'green', 'src', 'source', 'sources', 'code'],
    ['layers', 'teal', 'lib', 'libs', 'library', 'libraries', 'core', 'shared', 'common'],
    ['grid', 'violet', 'app', 'apps', 'application'],
    ['page', 'pink', 'pages', 'views', 'screens', 'routes-pages', 'content', 'posts', 'blog', 'articles'],
    ['blocks', 'sky', 'components', 'component', 'widgets', 'ui', 'elements', 'atoms', 'molecules', 'organisms', 'design-system'],
    ['layout', 'indigo', 'layouts', 'layout', 'templates', 'template', 'partials'],
    ['hook', 'violet', 'hooks', 'composables', 'use'],
    ['wrench', 'amber', 'utils', 'util', 'utilities', 'helpers', 'helper', 'tools', 'tooling', 'support'],
    ['server', 'indigo', 'services', 'service', 'server', 'servers', 'backend', 'api-server'],
    ['plug', 'teal', 'api', 'apis', 'endpoints', 'rest', 'adapters', 'adapter', 'integrations', 'connectors', 'clients'],
    ['route', 'orange', 'routes', 'router', 'routers', 'routing', 'navigation'],
    ['switch', 'blue', 'controllers', 'controller', 'handlers', 'handler', 'resolvers'],
    ['filter', 'amber', 'middleware', 'middlewares', 'interceptors', 'pipes', 'filters'],
    ['cube', 'violet', 'models', 'model', 'domain', 'domains', 'modules', 'module', 'features', 'feature', 'schemas', 'schema'],
    ['database', 'amber', 'database', 'databases', 'db', 'sql', 'entities', 'entity', 'repositories', 'repository', 'repos', 'orm', 'typeorm'],
    ['migrate', 'green', 'migrations', 'migration', 'seeds', 'seeders', 'seed', 'fixtures-db'],
    ['bag', 'violet', 'store', 'stores', 'state', 'redux', 'zustand', 'pinia', 'atoms-state', 'slices'],
    ['type', 'blue', 'types', 'typings', '@types', 'interfaces', 'dto', 'dtos', 'contracts', 'typedefs'],
    ['gear', 'slate', 'config', 'configs', 'configuration', 'settings', 'environments', 'environment', 'env', '.config'],
    ['list', 'slate', 'constants', 'const', 'enums', 'enum'],
    ['image', 'teal', 'images', 'img', 'imgs', 'icons', 'icon', 'pictures', 'photos', 'screenshots', 'illustrations', 'svg', 'svgs'],
    ['archive', 'amber', 'assets', 'static', 'resources', 'res', 'files', 'uploads', 'archive', 'archives', 'backup', 'backups'],
    ['font', 'coral', 'fonts', 'font', 'typography'],
    ['brush', 'pink', 'styles', 'style', 'css', 'scss', 'sass', 'less', 'theme', 'themes', 'design', 'tokens'],
    ['globe', 'sky', 'public', 'www', 'wwwroot', 'web', 'site', 'website', 'html'],
    ['flask', 'green', 'test', 'tests', '__tests__', 'spec', 'specs', 'e2e', 'integration', 'unit', 'cypress', 'playwright', 'testing', 'qa'],
    ['vial', 'slate', '__mocks__', 'mocks', 'mock', 'fixtures', 'fixture', 'stubs', 'fakes', '__fixtures__'],
    ['camera', 'slate', '__snapshots__', 'snapshots'],
    ['book', 'sky', 'docs', 'doc', 'documentation', 'wiki', 'guides', 'manual', 'adr', 'rfcs'],
    ['book', 'pink', 'stories', 'storybook', '.storybook'],
    ['terminal', 'green', 'scripts', 'script', 'bin', 'cli', 'commands', 'tasks', 'shell'],
    ['package', 'orange', 'dist', 'build', 'builds', 'out', 'output', 'release', 'releases', 'target', '.next', '.nuxt', '.output', '.svelte-kit', '.turbo', '.vercel', 'artifacts', 'bundle'],
    ['package', 'green', 'node_modules', 'vendor', 'vendors', 'packages', '.pnpm', 'bower_components', 'third_party', 'deps', 'external'],
    ['git', 'orange', '.git', '.husky', '.githooks', 'git', 'hooks-git'],
    ['rocket', 'slate', '.github', '.gitlab', '.circleci', 'workflows', 'pipelines', 'ci', 'cd', '.buildkite', 'deploy', 'deployment', 'deployments', 'release-please'],
    ['gear', 'blue', '.vscode', '.idea', '.devcontainer', '.fleet', '.zed', '.cursor', '.walph'],
    ['brain', 'violet', '.claude', 'claude', 'prompts', 'prompt', 'agents', 'agent', 'ai', 'llm', 'ml', 'models-ai', 'mcp'],
    ['container', 'blue', 'docker', '.docker', 'containers', 'compose'],
    ['wheel', 'blue', 'k8s', 'kubernetes', 'helm', 'charts', 'manifests', 'kustomize'],
    ['cloud', 'indigo', 'infra', 'infrastructure', 'terraform', '.terraform', 'cloud', 'aws', 'gcp', 'azure', 'oci', 'pulumi', 'cdk', 'iac', 'ops', 'devops', 'ansible'],
    ['language', 'teal', 'i18n', 'locales', 'locale', 'lang', 'langs', 'languages', 'translations', 'l10n', 'messages'],
    ['logs', 'slate', 'logs', 'log', 'logging'],
    ['hourglass', 'gray', 'tmp', 'temp', '.tmp', 'cache', '.cache', '.parcel-cache'],
    ['shield', 'red', 'auth', 'authentication', 'authorization', 'security', 'permissions', 'guards', 'policies', 'acl', 'iam'],
    ['key', 'yellow', 'keys', 'certs', 'certificates', 'secrets', 'ssl', 'tls', '.ssh', 'credentials'],
    ['mail', 'pink', 'mail', 'mails', 'email', 'emails', 'mailers', 'notifications', 'notification', 'newsletters'],
    ['clock', 'amber', 'jobs', 'job', 'queues', 'queue', 'workers', 'worker', 'cron', 'crons', 'schedulers', 'scheduler', 'bullmq'],
    ['bolt', 'yellow', 'events', 'event', 'listeners', 'subscribers', 'emitters', 'signals'],
    ['graph', 'pink', 'graphql', 'gql', 'apollo'],
    ['prism', 'indigo', 'prisma', 'drizzle'],
    ['monitor', 'sky', 'client', 'clients-web', 'frontend', 'front', 'desktop', 'electron', 'renderer'],
    ['phone', 'green', 'mobile', 'android', 'ios', 'native', 'expo', 'app-mobile'],
    ['play', 'sky', 'examples', 'example', 'samples', 'sample', 'demo', 'demos', 'playground', 'sandbox'],
    ['chart', 'green', 'coverage', 'reports', 'report', 'analytics', 'metrics', 'stats', 'dashboards'],
    ['gauge', 'violet', 'benchmarks', 'benchmark', 'bench', 'perf', 'performance', 'load-tests'],
    ['puzzle', 'teal', 'plugins', 'plugin', 'extensions', 'extension', 'addons', 'addon', 'mods'],
    ['share', 'indigo', 'providers', 'provider', 'context', 'contexts', 'di', 'container-di'],
    ['lambda', 'amber', 'functions', 'function', 'lambda', 'lambdas', 'serverless', 'edge', 'netlify', 'supabase'],
    ['signal', 'teal', 'socket', 'sockets', 'websocket', 'websockets', 'ws', 'realtime', 'gateway', 'gateways', 'streams'],
    ['video', 'pink', 'video', 'videos', 'movies', 'media'],
    ['audio', 'violet', 'audio', 'sounds', 'sound', 'music'],
    ['table', 'green', 'data', 'datasets', 'dataset', 'csv', 'exports', 'imports'],
    ['notebook', 'orange', 'notebooks', 'jupyter'],
    ['spark', 'violet', 'generated', '__generated__', 'gen', 'codegen', 'autogen'],
    ['download', 'slate', 'downloads', 'download'],
    ['trash', 'gray', 'trash', '.trash', 'deprecated', 'old', 'legacy'],
    ['cpu', 'slate', 'native-modules', 'wasm', 'rust', 'go', 'cmd', 'internal', 'pkg'],
    ['people', 'teal', 'users', 'user', 'accounts', 'account', 'customers', 'members', 'profiles', 'teams'],
    ['history', 'green', 'versions', 'changelog', 'changesets', '.changeset', 'history'],
    ['eye', 'sky', 'preview', 'previews', 'review', 'reviews'],
    ['heart', 'pink', 'favorites', 'health', 'healthcheck']
  ];
  var FI_FOLDER_INDEX = {};
  FI_FOLDERS.forEach(function (f) { for (var i = 2; i < f.length; i++) if (!FI_FOLDER_INDEX[f[i]]) FI_FOLDER_INDEX[f[i]] = [f[0], f[1]]; });

  function fileIconFor(name, opts) {
    opts = opts || {};
    var n = String(name || '').split(/[\\/]/).pop().toLowerCase();
    if (opts.folder) {
      var f = FI_FOLDER_INDEX[n] || FI_FOLDER_INDEX[n.replace(/^[._]+/, '')] || null;
      return { kind: 'folder', glyph: f ? f[0] : null, color: f ? f[1] : 'slate', open: !!opts.open };
    }
    var hit = FI_NAME[n];
    if (!hit && /^\.env(\.|$)/.test(n)) hit = ['key', 'yellow'];
    if (!hit && /^dockerfile\./.test(n)) hit = ['container', 'blue'];
    if (!hit && /^tsconfig\..*json$/.test(n)) hit = ['gear', 'blue'];
    if (!hit && /^readme\./.test(n)) hit = ['book', 'sky'];
    if (!hit && /^license/.test(n)) hit = ['law', 'amber'];
    if (!hit) for (var i = 0; i < FI_SUFFIX.length; i++) if (n.length > FI_SUFFIX[i][0].length && n.slice(-FI_SUFFIX[i][0].length) === FI_SUFFIX[i][0]) { hit = [FI_SUFFIX[i][1], FI_SUFFIX[i][2]]; break; }
    if (!hit) { var dot = n.lastIndexOf('.'); if (dot >= 0) hit = FI_EXT[n.slice(dot + 1)]; }
    if (!hit) return { kind: 'file', glyph: 'page', color: 'gray' };
    return hit[0].charAt(0) === ':' ? { kind: 'file', label: hit[0].slice(1), color: hit[1] } : { kind: 'file', glyph: hit[0], color: hit[1] };
  }
  function glyphPaths(name, color, mode, k) {
    var items = FI_GLYPHS[name] || FI_GLYPHS.page, out = [];
    items.forEach(function (it, i) {
      if (typeof it === 'string') { out.push(h('path', { key: k + i, d: it })); return; }
      if (it.solid) { out.push(h('path', { key: k + i, d: it.d, fill: mode === 'cut' ? 'currentColor' : color, stroke: 'none' })); return; }
      if (mode !== 'cut') out.push(h('path', { key: k + i + 'f', d: it.d, fill: color, fillOpacity: 0.2, stroke: 'none' }));
      out.push(h('path', { key: k + i, d: it.d }));
    });
    return out;
  }
  var FOLDER_BACK = 'M.8 3.6a1.3 1.3 0 0 1 1.3-1.3h4l1.6 1.7h6.2a1.3 1.3 0 0 1 1.3 1.3v7.9a1.3 1.3 0 0 1-1.3 1.3H2.1a1.3 1.3 0 0 1-1.3-1.3z';
  var FOLDER_FRONT = 'M.8 5.9h14.4v7.3a1.3 1.3 0 0 1-1.3 1.3H2.1a1.3 1.3 0 0 1-1.3-1.3z';
  var FOLDER_OPEN = 'M2.9 6.4h12.4a.8.8 0 0 1 .76 1.05l-1.9 6.2a1.3 1.3 0 0 1-1.24.85H1.6a.8.8 0 0 1-.76-1.05l1.3-6.3a1 1 0 0 1 .76-.75z';
  function FileIcon(p) {
    var spec = p.spec || fileIconFor(p.name, { folder: p.kind === 'folder', open: p.open });
    var color = FI_COLORS[spec.color] || spec.color || FI_COLORS.gray, size = p.size || 16;
    var base = { viewBox: '0 0 16 16', width: size, height: size, className: cx('wp-ficon', p.className), 'aria-hidden': p.title ? undefined : true, role: p.title ? 'img' : undefined, 'aria-label': p.title, style: p.style };
    if (spec.kind === 'folder') {
      var kids = [h('path', { key: 'b', d: FOLDER_BACK, fill: color, opacity: spec.open ? 0.55 : 0.62 }), h('path', { key: 'f', d: spec.open ? FOLDER_OPEN : FOLDER_FRONT, fill: color })];
      if (spec.glyph) kids.push(h('g', { key: 'g', transform: 'translate(5.4 5.4) scale(.66)', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', color: 'rgba(10,9,15,.78)' }, glyphPaths(spec.glyph, color, 'cut', 'g')));
      return h('svg', base, kids);
    }
    if (spec.label) {
      var L = spec.label, fs = L.length >= 3 ? 5.3 : L.length === 2 ? 6.8 : 8.6;
      return h('svg', base, h('rect', { x: 1.5, y: 1.5, width: 13, height: 13, rx: 3, fill: color }),
        h('text', { x: 8, y: 8.25, textAnchor: 'middle', dominantBaseline: 'central', fontSize: fs, fontWeight: 700, letterSpacing: L.length >= 3 ? -0.2 : -0.1, fill: FI_DARK_TEXT[spec.color] ? '#0a090f' : '#fff', className: 'wp-ficon-label' }, L));
    }
    return h('svg', Object.assign(base, { fill: 'none', stroke: color, strokeWidth: 1.35, strokeLinecap: 'round', strokeLinejoin: 'round' }), glyphPaths(spec.glyph, color, 'file', 'f'));
  }
  var FILE_ICON_DATA = { colors: FI_COLORS, glyphs: Object.keys(FI_GLYPHS), extensions: FI_EXT, suffixes: FI_SUFFIX, names: FI_NAME, folders: FI_FOLDERS };

  function TreeItem(p) {
    var folder = p.kind === 'folder';
    return h('div', {
      role: 'treeitem', tabIndex: 0, 'aria-selected': !!p.selected, 'aria-expanded': folder ? !!p.open : undefined,
      className: cx('wp-tree', folder && 'wp-tree-folder', p.open && 'wp-tree-open', p.selected && 'wp-tree-selected', p.className),
      style: { paddingLeft: 8 + (p.depth || 0) * 12 },
      onClick: p.onClick,
      onKeyDown: function (e) { if (e.key === 'Enter') p.onClick && p.onClick(); }
    },
      folder ? h(Icons.chevron, { className: 'wp-tree-chev' }) : h('span', { style: { width: 14, flex: 'none' } }),
      p.icon && Icons[p.icon] ? h(Icons[p.icon], { className: 'wp-tree-icon' }) : h(FileIcon, { name: p.label, kind: folder ? 'folder' : 'file', open: p.open, className: 'wp-tree-icon' }),
      h('span', { className: 'wp-tree-label' }, p.label),
      p.git ? h('span', { className: 'wp-tree-git wp-tree-git-' + p.git }, p.git) : null);
  }

  /* ---------------- CommandPalette ---------------- */
  function highlight(text, q) {
    if (!q) return text;
    var i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return text;
    return [text.slice(0, i), h('mark', { key: 'm', className: 'wp-cp-mark' }, text.slice(i, i + q.length)), text.slice(i + q.length)];
  }
  function CommandPalette(p) {
    var qs = React.useState(p.defaultQuery || ''), q = qs[0], setQ = qs[1];
    var ai = React.useState(0), active = ai[0], setActive = ai[1];
    var lv = React.useState(false), leaving = lv[0], setLeaving = lv[1];
    var inputRef = React.useRef(null);
    var items = (p.items || []).filter(function (it) { return !q || (it.label + ' ' + (it.hint || '')).toLowerCase().indexOf(q.toLowerCase()) >= 0; });
    if (q && p.onAskClaude) items = items.concat([{ id: '__ask', label: 'Perguntar ao Claude: “' + q + '”', group: 'Claude Code', icon: 'spark', ask: true }]);
    React.useEffect(function () { setActive(0); }, [q]);
    React.useEffect(function () { if (inputRef.current) inputRef.current.focus(); }, []);
    var close = function () { if (!leaving) setLeaving(true); };
    var choose = function (it) { if (!it) return; if (it.ask) p.onAskClaude && p.onAskClaude(q); else p.onSelect && p.onSelect(it); close(); };
    var onKey = function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(function (a) { return Math.min(a + 1, items.length - 1); }); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(function (a) { return Math.max(a - 1, 0); }); }
      else if (e.key === 'Enter') { e.preventDefault(); choose(items[active]); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    };
    var lastGroup = null, rows = [];
    items.forEach(function (it, i) {
      if (it.group && it.group !== lastGroup) { lastGroup = it.group; rows.push(h('div', { key: 'g' + it.group, className: 'wp-cp-group', role: 'presentation' }, it.group)); }
      rows.push(h('div', {
        key: it.id, id: 'wp-cp-' + it.id, role: 'option', 'aria-selected': i === active,
        className: cx('wp-cp-item', i === active && 'wp-cp-active', it.ask && 'wp-cp-ask'),
        onMouseMove: function () { if (active !== i) setActive(i); }, onClick: function () { choose(it); }
      },
        it.status ? h(StatusDot, { status: it.status }) : (it.icon && Icons[it.icon] ? h(Icons[it.icon], { className: 'wp-cp-icon' }) : h('span', { className: 'wp-cp-icon' })),
        h('span', { className: cx('wp-cp-label', it.ask && 'wp-grad-text') }, it.ask ? it.label : highlight(it.label, q)),
        it.hint ? h('span', { className: 'wp-cp-hint' }, it.hint) : null,
        it.shortcut ? h('span', { className: 'wp-kbd' }, it.shortcut) : null));
    });
    return h('div', {
      className: cx('wp-cp-scrim', leaving && 'wp-cp-leaving', p.inline && 'wp-cp-inline', p.className),
      onMouseDown: function (e) { if (e.target === e.currentTarget) close(); },
      onAnimationEnd: function (e) { if (leaving && e.target === e.currentTarget) p.onClose && p.onClose(); }
    },
      h('div', { className: 'wp-cp wp-neon', role: 'dialog', 'aria-label': 'Command palette' },
        h('div', { className: 'wp-cp-search' },
          h(Icons.search),
          h('input', { ref: inputRef, value: q, placeholder: p.placeholder || 'Buscar comandos, arquivos e workspaces', onChange: function (e) { setQ(e.target.value); }, onKeyDown: onKey, role: 'combobox', 'aria-expanded': true, 'aria-controls': 'wp-cp-list', 'aria-activedescendant': items[active] ? 'wp-cp-' + items[active].id : undefined }),
          h('span', { className: 'wp-kbd' }, 'esc')),
        h('div', { className: 'wp-cp-list', id: 'wp-cp-list', role: 'listbox' },
          rows.length ? rows : h('div', { className: 'wp-cp-empty' }, 'Nada encontrado')),
        h('div', { className: 'wp-cp-foot' },
          h('span', null, h('span', { className: 'wp-kbd' }, '↑↓'), ' navegar'),
          h('span', null, h('span', { className: 'wp-kbd' }, '↵'), ' abrir'),
          p.onAskClaude ? h('span', null, h('span', { className: 'wp-kbd' }, '⌘↵'), ' perguntar ao Claude') : null)));
  }

  /* ---------------- Terminal ---------------- */
  function TermTab(p) {
    var t = p.tab, ref = React.useRef(null);
    React.useEffect(function () { if (p.active && ref.current && ref.current.scrollIntoView) ref.current.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [p.active]);
    return h('button', { ref: ref, role: 'tab', 'aria-selected': !!p.active, title: t.name, className: cx('wp-term-tab', p.active && 'wp-term-tab-active'), onClick: p.onSelect },
      t.kind === 'claude' ? h(StatusDot, { status: t.status || 'idle' }) : h(Icons.terminal),
      h('span', { className: 'wp-term-tab-label' }, t.name));
  }
  function Terminal(p) {
    var tabs = p.tabs || [], lines = p.lines || [];
    var bodyRef = React.useRef(null);
    /* stick to the bottom like a real terminal */
    React.useEffect(function () { var b = bodyRef.current; if (b) b.scrollTop = b.scrollHeight; }, [lines.length, p.draft, p.activeId]);
    var parts = (p.cwd || '').split('/'), leaf = parts.pop() || '', parent = parts.length ? parts.join('/') + '/' : '';
    return h('div', { className: cx('wp-term', p.className) },
      h('div', { className: 'wp-term-head' },
        h('div', { className: 'wp-term-tabs', role: 'tablist', 'aria-label': 'Terminais' },
          tabs.map(function (t) { return h(TermTab, { key: t.id, tab: t, active: t.id === p.activeId, onSelect: function () { p.onSelect && p.onSelect(t.id); } }); })),
        p.onAdd ? h('button', { className: 'wp-x wp-term-add', 'aria-label': 'Novo terminal', title: 'Novo terminal (⌃⇧`)', onClick: p.onAdd }, h(Icons.plus)) : null,
        h('span', { className: 'wp-term-spacer' }),
        (p.cwd || p.branch) ? h('div', { className: 'wp-term-meta', title: (p.cwd || '') + (p.branch ? ' · ' + p.branch : '') },
          p.cwd ? h('span', { className: 'wp-term-cwd' }, h('span', { className: 'wp-term-cwd-parent' }, parent), h('span', { className: 'wp-term-cwd-leaf' }, leaf)) : null,
          p.branch ? h('span', { className: 'wp-term-branch' }, h(Icons.branch), h('span', { className: 'wp-term-branch-label' }, p.branch)) : null) : null),
      h('div', { className: 'wp-term-body', ref: bodyRef, role: 'log', 'aria-live': 'polite' },
        lines.map(function (l, i) {
          return h('div', { key: i, className: cx('wp-term-line', 'wp-term-' + (l.kind || 'output')) },
            l.kind === 'input' ? h('span', { className: 'wp-term-prompt' }, '❯ ') : null, l.text);
        }),
        p.prompt !== false ? h('div', { className: 'wp-term-line wp-term-input' }, h('span', { className: 'wp-term-prompt' }, '❯ '), p.draft || '', h('span', { className: 'wp-term-cursor' })) : null));
  }

  /* ---------------- ClaudePanel ---------------- */
  /* Claude Code tools: icon + the action in Portuguese; rows with details expand on click */
  var CL_TOOLS = {
    Read: { icon: 'eye', label: 'Leu' }, Write: { icon: 'filePlus', label: 'Criou' }, Edit: { icon: 'pencil', label: 'Editou' }, MultiEdit: { icon: 'pencil', label: 'Editou' },
    NotebookEdit: { icon: 'pencil', label: 'Editou' }, Bash: { icon: 'terminal', label: 'Bash' }, BashOutput: { icon: 'terminal', label: 'Saída' }, Grep: { icon: 'search', label: 'Buscou' },
    Glob: { icon: 'folder', label: 'Listou' }, LS: { icon: 'folder', label: 'Listou' }, WebFetch: { icon: 'globe', label: 'Abriu' }, WebSearch: { icon: 'globe', label: 'Pesquisou' },
    Task: { icon: 'agent', label: 'Agente' }, Agent: { icon: 'agent', label: 'Agente' }, TodoWrite: { icon: 'plan', label: 'Tarefas' }, AskUserQuestion: { icon: 'question', label: 'Perguntou' },
    ExitPlanMode: { icon: 'plan', label: 'Plano' }, Skill: { icon: 'spark', label: 'Skill' }, SlashCommand: { icon: 'slash', label: 'Comando' }
  };
  function ToolRow(t) {
    var meta = CL_TOOLS[t.name] || { icon: t.icon || 'bolt', label: t.name };
    var o = React.useState(!!t.expanded), open = o[0], setOpen = o[1];
    var state = t.state || 'done';
    var lines = t.detail || null, can = !!(lines && lines.length) || !!t.output;
    var I = Icons[t.icon || meta.icon] || Icons.bolt;
    var head = [
      h('span', { key: 'i', className: cx('wp-cl-tool-ico', 'wp-cl-tool-ico-' + state), title: state === 'running' ? 'Rodando' : state === 'error' ? 'Falhou' : 'Concluído' }, h(I)),
      h('span', { key: 'n', className: 'wp-cl-tool-name' }, t.label || meta.label),
      t.target ? h('span', { key: 't', className: 'wp-cl-tool-target', title: t.target }, t.target) : null,
      t.add != null ? h('span', { key: 's', className: 'wp-cl-stat' }, h('span', { className: 'wp-cl-add' }, '+' + t.add), ' ', h('span', { className: 'wp-cl-del' }, '−' + (t.del || 0))) : null,
      t.meta ? h('span', { key: 'm', className: 'wp-cl-tool-meta' }, t.meta) : null,
      can ? h(Icons.chevron, { key: 'c', className: cx('wp-cl-tool-chev', open && 'open') }) : null];
    return h('div', { className: cx('wp-cl-tool', 'wp-cl-tool-' + state, state === 'running' && 'wp-neon wp-neon-live', open && 'wp-cl-tool-open') },
      can ? h('button', { type: 'button', className: 'wp-cl-tool-head', 'aria-expanded': open, onClick: function () { setOpen(!open); } }, head) : h('div', { className: 'wp-cl-tool-head' }, head),
      open && can ? h('div', { className: 'wp-cl-tool-detail' },
        (lines || String(t.output).split('\n').map(function (x) { return { text: x }; })).map(function (l, i) {
          var L = typeof l === 'string' ? { text: l } : l;
          return h('div', { key: i, className: cx('wp-cl-dl', L.kind && 'wp-cl-dl-' + L.kind) },
            L.kind === 'add' ? h('span', { className: 'wp-cl-dl-sign' }, '+') : L.kind === 'del' ? h('span', { className: 'wp-cl-dl-sign' }, '−') : L.kind === 'cmd' ? h('span', { className: 'wp-cl-dl-sign' }, '❯') : null,
            L.text);
        })) : null);
  }
  function FileRow(f) {
    return h('div', { className: 'wp-cl-file' }, h(FileIcon, { name: f.path, size: 14 }), h('span', { className: 'wp-cl-tool-target', title: f.path }, f.path),
      h('span', { className: 'wp-cl-stat' }, h('span', { className: 'wp-cl-add' }, '+' + f.add), ' ', h('span', { className: 'wp-cl-del' }, '−' + (f.del || 0))));
  }
  /* favourite commands: one-click icons above the compose box */
  var FAV_ICONS = ['bolt', 'play', 'check', 'flask', 'bug', 'rocket', 'diff', 'branch', 'terminal', 'spark', 'search', 'plan', 'pencil', 'book', 'database', 'box', 'shield', 'restart', 'logs', 'globe', 'star', 'gear', 'brain', 'layers'];
  function FavCommands(p) {
    var o = React.useState(false), open = o[0], setOpen = o[1];
    var c = React.useState(null), cmd = c[0], setCmd = c[1];
    var ic = React.useState('bolt'), icon = ic[0], setIcon = ic[1];
    var anchor = React.useRef(null), pop = React.useRef(null);
    var favs = p.favorites || [], cmds = p.commands || [];
    React.useEffect(function () {
      if (!open) return;
      var onDoc = function (e) { if (pop.current && !pop.current.contains(e.target) && anchor.current && !anchor.current.contains(e.target)) setOpen(false); };
      var onKey = function (e) { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); anchor.current && anchor.current.focus(); } };
      document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey, true);
      return function () { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey, true); };
    }, [open]);
    var available = cmds.filter(function (x) { return !favs.some(function (f) { return f.name === x.name; }); });
    var add = function () { if (!cmd) return; p.onChange(favs.concat([{ name: cmd, icon: icon }])); setOpen(false); setCmd(null); setIcon('bolt'); };
    return h('div', { className: 'wp-cl-favs', role: 'toolbar', 'aria-label': 'Commands favoritos' },
      favs.map(function (f) {
        var info = cmds.filter(function (x) { return x.name === f.name; })[0];
        return h('span', { key: f.name, className: 'wp-cl-fav-item' },
          h('button', { type: 'button', className: 'wp-cl-favbtn', title: '/' + f.name + (info && info.description ? ' — ' + info.description : '') + ' (clique para executar)', 'aria-label': 'Executar /' + f.name, onClick: function () { p.onRun(f.name); } },
            h(Icons[f.icon] || Icons.bolt)),
          h('button', { type: 'button', className: 'wp-cl-fav-x', 'aria-label': 'Remover /' + f.name + ' dos favoritos', title: 'Remover dos favoritos', onClick: function () { p.onChange(favs.filter(function (x) { return x.name !== f.name; })); } }, h(Icons.close)));
      }),
      h('span', { className: 'wp-pop wp-cl-favadd-wrap' },
        h('button', { ref: anchor, type: 'button', className: cx('wp-cl-favbtn', 'wp-cl-favadd', open && 'on'), 'aria-haspopup': 'dialog', 'aria-expanded': open, title: 'Adicionar command favorito', 'aria-label': 'Adicionar command favorito',
          onClick: function () { setOpen(!open); if (!cmd && available[0]) setCmd(available[0].name); } }, h(Icons.plus)),
        open ? h('div', { ref: pop, role: 'dialog', 'aria-label': 'Novo command favorito', className: 'wp-menu wp-cl-favpop' },
          h('div', { className: 'wp-menu-head' }, '1 · Command'),
          available.length ? h('div', { className: 'wp-cl-favlist', role: 'radiogroup' }, available.map(function (x) {
            return h('button', { key: x.name, type: 'button', role: 'radio', 'aria-checked': cmd === x.name, className: cx('wp-menu-item', cmd === x.name && 'wp-menu-checked'), onClick: function () { setCmd(x.name); } },
              h('span', { className: 'wp-menu-text' }, h('span', { className: 'wp-menu-label wp-mono' }, '/' + x.name), x.description ? h('span', { className: 'wp-menu-desc' }, x.description) : null),
              cmd === x.name ? h(Icons.check, { className: 'wp-menu-check' }) : null);
          })) : h('div', { className: 'wp-menu-note' }, 'Todos os commands já estão nos favoritos.'),
          h('div', { className: 'wp-menu-sep' }),
          h('div', { className: 'wp-menu-head' }, '2 · Ícone'),
          h('div', { className: 'wp-cl-favicons', role: 'radiogroup', 'aria-label': 'Ícone' }, FAV_ICONS.map(function (n) {
            return h('button', { key: n, type: 'button', role: 'radio', 'aria-checked': icon === n, 'aria-label': n, title: n, className: cx('wp-cl-favicon', icon === n && 'on'), onClick: function () { setIcon(n); } }, h(Icons[n]));
          })),
          h('div', { className: 'wp-cl-favfoot' },
            cmd ? h('span', { className: 'wp-cl-favpreview' }, h('span', { className: 'wp-cl-favbtn as-preview' }, h(Icons[icon])), h('span', { className: 'wp-mono' }, '/' + cmd)) : h('span'),
            h(Button, { size: 'sm', variant: 'primary', disabled: !cmd, onClick: add }, 'Adicionar'))) : null),
      favs.length ? null : h('span', { className: 'wp-cl-favs-hint' }, 'Fixe commands aqui para rodar com um clique'));
  }

  function SessionTab(p) {
    var s = p.session, status = s.status || 'idle';
    var pingKey = useTransitionPing(status);
    var unread = !p.active && s.unread > 0 ? s.unread : 0;
    var ref = React.useRef(null);
    React.useEffect(function () { if (p.active && ref.current && ref.current.scrollIntoView) ref.current.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [p.active]);
    return h('div', {
      ref: ref, role: 'tab', tabIndex: 0, 'aria-selected': !!p.active, title: s.title,
      className: cx('wp-cl-stab', p.active && 'wp-cl-stab-active', status === 'running' && 'wp-cl-stab-running', unread && 'wp-cl-stab-unread'),
      onClick: p.onSelect,
      onKeyDown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onSelect && p.onSelect(); } }
    },
      h(StatusDot, { key: 'd' + pingKey, status: status, ping: pingKey > 0 }),
      s.favorite ? h(Icons.star, { className: 'wp-cl-stab-fav', 'aria-label': 'Favorita' }) : null,
      h('span', { className: 'wp-cl-stab-title' }, s.title),
      unread ? h('span', { key: 'c' + unread, className: cx('wp-count', 'wp-count-' + status), 'aria-label': unread + ' novidades' }, unread > 9 ? '9+' : unread) : null,
      p.onClose ? h('button', { className: 'wp-x', 'aria-label': 'Fechar sessão ' + s.title, onClick: function (e) { e.stopPropagation(); p.onClose(); } }, h(Icons.close)) : null);
  }

  /* ---------------- Menu (popover) ---------------- */
  function Menu(p) {
    var ref = React.useRef(null);
    React.useEffect(function () {
      if (!p.open) return;
      var onDoc = function (e) { var a = p.anchorRef && p.anchorRef.current; if (ref.current && !ref.current.contains(e.target) && !(a && a.contains(e.target))) p.onClose && p.onClose(); };
      var onKey = function (e) { if (e.key === 'Escape') { e.stopPropagation(); p.onClose && p.onClose(); var a = p.anchorRef && p.anchorRef.current; if (a) a.focus(); } };
      document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey, true);
      var first = ref.current && (ref.current.querySelector('[aria-checked="true"]') || ref.current.querySelector('[role^="menuitem"]'));
      if (first) first.focus();
      return function () { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey, true); };
    }, [p.open]);
    if (!p.open) return null;
    var nav = function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      var items = Array.prototype.slice.call(ref.current.querySelectorAll('[role^="menuitem"]'));
      var i = items.indexOf(document.activeElement), j = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      if (items[j]) items[j].focus();
    };
    return h('div', { ref: ref, role: 'menu', 'aria-label': p.label, className: cx('wp-menu', 'wp-menu-' + (p.placement || 'top-start'), p.className), onKeyDown: nav },
      (p.items || []).map(function (it, i) {
        if (it.divider) return h('div', { key: 'd' + i, className: 'wp-menu-sep', role: 'separator' });
        if (it.header) return h('div', { key: 'h' + i, className: 'wp-menu-head' }, it.header);
        return h('button', { key: it.id, type: 'button', role: it.checked != null ? 'menuitemradio' : 'menuitem', 'aria-checked': it.checked != null ? !!it.checked : undefined, tabIndex: -1,
          className: cx('wp-menu-item', it.danger && 'wp-menu-danger', it.checked && 'wp-menu-checked', it.tone && 'wp-tone-' + it.tone),
          onClick: function () { p.onSelect && p.onSelect(it.id); if (p.closeOnSelect !== false) p.onClose && p.onClose(); } },
          it.icon && Icons[it.icon] ? h('span', { className: 'wp-menu-icon' }, h(Icons[it.icon])) : null,
          h('span', { className: 'wp-menu-text' }, h('span', { className: 'wp-menu-label' }, it.label), it.description ? h('span', { className: 'wp-menu-desc' }, it.description) : null),
          it.shortcut ? h('span', { className: 'wp-kbd' }, it.shortcut) : null,
          it.checked ? h(Icons.check, { className: 'wp-menu-check' }) : null);
      }),
      p.children);
  }
  /* button + its menu, sharing open state */
  function Pop(p) {
    var o = React.useState(false), open = o[0], setOpen = o[1];
    var anchor = React.useRef(null);
    return h('span', { className: cx('wp-pop', p.className) },
      p.trigger({ ref: anchor, 'aria-haspopup': 'menu', 'aria-expanded': open, onClick: function () { setOpen(!open); } }, open),
      h(Menu, Object.assign({}, p.menu, { open: open, anchorRef: anchor, onClose: function () { setOpen(false); } })));
  }

  /* ---------------- ClaudePanel ---------------- */
  var CL_MODES = [
    { id: 'manual', icon: 'hand', label: 'Manual', short: 'Manual', description: 'Pergunta antes de editar arquivos e de rodar comandos.' },
    { id: 'edit', icon: 'pencil', label: 'Edit automatically', short: 'Edit auto', description: 'Edita arquivos sozinho; pergunta antes de rodar comandos.' },
    { id: 'plan', icon: 'plan', label: 'Plan', short: 'Plan', description: 'Só lê e propõe um plano. Nada muda até você aprovar.' },
    { id: 'auto', icon: 'bolt', label: 'Auto', short: 'Auto', description: 'Edita e roda comandos seguros; pergunta só no que for arriscado.' },
    { id: 'bypass', icon: 'shield', label: 'Bypass permissions', short: 'Bypass', description: 'Executa tudo sem perguntar. Só em ambiente isolado.', tone: 'danger' }
  ];
  /* effort levels exactly as Claude Code names them (/effort): low · medium · high · xhigh · max, plus auto = the model's default */
  var CL_EFFORT = [
    { id: 'low', label: 'low', description: 'Rápido e barato: respostas diretas, pouco raciocínio' },
    { id: 'medium', label: 'medium', description: 'Equilíbrio para o dia a dia' },
    { id: 'high', label: 'high', description: 'Pensa mais antes de agir; padrão da maioria dos modelos' },
    { id: 'xhigh', label: 'xhigh', description: 'Raciocínio estendido para tarefas difíceis' },
    { id: 'max', label: 'max', description: 'O máximo de raciocínio; vale só para esta sessão' }
  ];
  var CL_MODELS = [
    { id: 'opus', label: 'Opus', description: 'Mais capaz, para tarefas longas', defaultEffort: 'high' },
    { id: 'sonnet', label: 'Sonnet', description: 'Equilíbrio entre velocidade e qualidade', defaultEffort: 'high' },
    { id: 'haiku', label: 'Haiku', description: 'Mais rápido, para tarefas simples', defaultEffort: 'high' }
  ];
  var CL_ACTIONS = [
    { id: 'rename', icon: 'pencil', label: 'Renomear sessão', shortcut: 'F2' },
    { id: 'duplicate', icon: 'layers', label: 'Duplicar sessão' },
    { id: 'export', icon: 'file', label: 'Exportar conversa (.md)' },
    { id: 'compact', icon: 'spark', label: 'Compactar contexto' },
    { divider: true },
    { id: 'close', icon: 'close', label: 'Fechar sessão', shortcut: '⌘W', danger: true }
  ];
  function useCtl(value, fallback, onChange) {
    var st = React.useState(fallback), v = st[0], set = st[1];
    var controlled = value !== undefined;
    return [controlled ? value : v, function (n) { if (!controlled) set(n); onChange && onChange(n); }];
  }
  /* five-step meter: how much of the scale low…max the level fills */
  function EffortBars(p) {
    var n = Math.max(1, CL_EFFORT.findIndex(function (e) { return e.id === p.level; }) + 1);
    return h('span', { className: 'wp-effort', 'aria-hidden': true }, [0, 1, 2, 3, 4].map(function (i) { return h('i', { key: i, className: i < n ? 'on' : '' }); }));
  }
  /* the /effort slider: a track with the five levels, plus "auto" (model default) */
  function EffortSlider(p) {
    var levels = CL_EFFORT, auto = p.value === 'auto';
    var resolved = auto ? (p.modelDefault || 'high') : p.value;
    var idx = Math.max(0, levels.findIndex(function (e) { return e.id === resolved; }));
    var supported = p.supported || null;
    var ok = function (id) { return !supported || supported.indexOf(id) >= 0; };
    var move = function (d) { var j = idx; do { j += d; } while (j >= 0 && j < levels.length && !ok(levels[j].id)); if (j >= 0 && j < levels.length) p.onChange(levels[j].id); };
    var cur = levels[idx];
    return h('div', { className: 'wp-eff' },
      h('div', { className: 'wp-eff-head' },
        h('span', { className: 'wp-menu-head', style: { padding: 0 } }, 'Effort'),
        h('button', { type: 'button', className: cx('wp-eff-auto', auto && 'wp-eff-auto-on'), 'aria-pressed': auto, title: 'Usar o padrão do modelo (/effort auto)', onClick: function () { p.onChange('auto'); } },
          auto ? h(Icons.check) : null, 'auto', h('span', { className: 'wp-eff-auto-hint' }, '· ' + (p.modelDefault || 'high')))),
      h('div', { className: cx('wp-eff-track', auto && 'wp-eff-is-auto'), role: 'radiogroup', 'aria-label': 'Effort', style: { '--wp-eff-pos': (idx / (levels.length - 1) * 100) + '%' },
        onKeyDown: function (e) { if (e.key === 'ArrowRight') { e.preventDefault(); move(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); } } },
        h('span', { className: 'wp-eff-rail', 'aria-hidden': true }, h('span', { className: 'wp-eff-fill' })),
        levels.map(function (e, i) {
          var on = i === idx, can = ok(e.id);
          return h('button', { key: e.id, type: 'button', role: 'radio', 'aria-checked': !auto && on, disabled: !can, tabIndex: on ? 0 : -1,
            className: cx('wp-eff-stop', i <= idx && 'wp-eff-past', on && 'wp-eff-on', !can && 'wp-eff-off'), title: can ? e.description : e.label + ' não está disponível neste modelo', onClick: function () { p.onChange(e.id); } },
            h('span', { className: 'wp-eff-dot', 'aria-hidden': true }), h('span', { className: 'wp-eff-label' }, e.label));
        })),
      h('div', { className: 'wp-menu-note wp-eff-note' }, auto ? 'auto: o modelo usa o padrão dele (' + (p.modelDefault || 'high') + '). ' + cur.description + '.' : cur.description + '.'));
  }
  function AgentsStrip(p) {
    var agents = p.agents, running = agents.filter(function (a) { return a.status === 'running'; }).length;
    var done = agents.filter(function (a) { return a.status === 'done'; }).length;
    var o = React.useState(true), open = o[0], setOpen = o[1];
    return h('div', { className: cx('wp-cl-agents', open && 'wp-cl-agents-open') },
      h('button', { className: 'wp-cl-agents-head', 'aria-expanded': open, onClick: function () { setOpen(!open); } },
        h('span', { className: 'wp-cl-agents-ico' }, h(Icons.agent)),
        h('span', { className: 'wp-cl-agents-title' }, 'Agentes'),
        h('span', { className: 'wp-cl-agents-sum' },
          running ? h('span', { className: 'wp-cl-agents-run' }, h(StatusDot, { status: 'running' }), running + ' trabalhando') : null,
          done ? h('span', null, done + (done > 1 ? ' concluídos' : ' concluído')) : null),
        h(Icons.chevron, { className: 'wp-cl-agents-chev' })),
      open ? h('div', { className: 'wp-cl-agents-list', role: 'list' },
        agents.map(function (a) {
          return h('div', { key: a.id, role: 'listitem', className: cx('wp-cl-agent', 'wp-cl-agent-' + (a.status || 'idle')) },
            h(StatusDot, { status: a.status || 'idle' }),
            h('span', { className: 'wp-cl-agent-name' }, a.name),
            h('span', { className: 'wp-cl-agent-task', title: a.task }, a.task),
            a.elapsed ? h('span', { className: 'wp-cl-agent-time' }, a.elapsed) : null);
        })) : null);
  }
  /* ---------------- ClaudeQuestion (AskUserQuestion) ---------------- */
  var OTHER = '__other';
  function ClaudeQuestion(p) {
    var qs = p.questions || [];
    var ix = React.useState(0), idx = ix[0], setIdx = ix[1];
    var an = React.useState({}), ans = an[0], setAns = an[1];
    var ot = React.useState({}), other = ot[0], setOther = ot[1];
    var ref = React.useRef(null), otherRef = React.useRef(null);
    var q = qs[idx] || qs[0];
    if (!q) return null;
    var key = function (x, i) { return x.id || x.header || String(i); };
    var k = key(q, idx), picked = ans[k] || [];
    var answered = function (x, i) { var a = ans[key(x, i)] || []; return a.length > 0 && (a.indexOf(OTHER) < 0 || (other[key(x, i)] || '').trim()); };
    var allDone = qs.every(answered);
    var last = idx === qs.length - 1;
    var pick = function (label) {
      setAns(function (m) {
        var n = Object.assign({}, m), cur = n[k] || [];
        n[k] = q.multiSelect ? (cur.indexOf(label) >= 0 ? cur.filter(function (x) { return x !== label; }) : cur.concat([label])) : [label];
        return n;
      });
      if (label === OTHER) setTimeout(function () { otherRef.current && otherRef.current.focus(); }, 0);
      else if (!q.multiSelect && !last) setTimeout(function () { setIdx(idx + 1); }, 160);
    };
    var submit = function () {
      if (!allDone) return;
      var out = {};
      qs.forEach(function (x, i) { var kk = key(x, i); out[kk] = (ans[kk] || []).map(function (a) { return a === OTHER ? (other[kk] || '').trim() : a; }); });
      p.onSubmit && p.onSubmit(out);
    };
    var onKey = function (e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') { if (e.key === 'Enter') { e.preventDefault(); last ? submit() : setIdx(idx + 1); } return; }
      var n = parseInt(e.key, 10);
      if (n >= 1 && n <= q.options.length + 1) { e.preventDefault(); pick(n <= q.options.length ? q.options[n - 1].label : OTHER); }
      else if (e.key === 'ArrowRight' && !last) setIdx(idx + 1);
      else if (e.key === 'ArrowLeft' && idx > 0) setIdx(idx - 1);
    };
    return h('div', { ref: ref, className: cx('wp-cq', 'wp-neon', p.className), role: 'group', 'aria-label': 'Pergunta do Claude', onKeyDown: onKey },
      h('div', { className: 'wp-cq-head' },
        h('span', { className: 'wp-cq-ico' }, h(Icons.question)),
        h('span', { className: 'wp-cq-kicker' }, qs.length > 1 ? 'O Claude tem ' + qs.length + ' perguntas' : 'O Claude tem uma pergunta'),
        p.onSkip ? h('button', { className: 'wp-x wp-cq-skip', 'aria-label': 'Pular perguntas', title: 'Pular (o Claude decide sozinho)', onClick: p.onSkip }, h(Icons.close)) : null),
      qs.length > 1 ? h('div', { className: 'wp-cq-steps', role: 'tablist', 'aria-label': 'Perguntas' }, qs.map(function (x, i) {
        var ok = answered(x, i);
        return h('button', { key: key(x, i), role: 'tab', 'aria-selected': i === idx, className: cx('wp-cq-step', i === idx && 'wp-cq-step-on', ok && 'wp-cq-step-ok'), onClick: function () { setIdx(i); } },
          ok ? h(Icons.check) : h('span', { className: 'wp-cq-step-n' }, i + 1), x.header || 'Pergunta ' + (i + 1));
      })) : null,
      h('div', { className: 'wp-cq-q', key: 'q' + idx }, q.question),
      q.multiSelect ? h('div', { className: 'wp-cq-hint' }, 'Escolha uma ou mais') : null,
      h('div', { className: 'wp-cq-opts', role: q.multiSelect ? 'group' : 'radiogroup', 'aria-label': q.header || q.question, key: 'o' + idx },
        q.options.map(function (o, i) {
          var on = picked.indexOf(o.label) >= 0;
          return h('button', { key: o.label, type: 'button', role: q.multiSelect ? 'checkbox' : 'radio', 'aria-checked': on, className: cx('wp-cq-opt', on && 'wp-cq-opt-on'), onClick: function () { pick(o.label); } },
            h('span', { className: cx('wp-cq-mark', q.multiSelect && 'wp-cq-mark-multi') }, on ? h(Icons.check) : null),
            h('span', { className: 'wp-cq-opt-text' }, h('span', { className: 'wp-cq-opt-label' }, o.label), o.description ? h('span', { className: 'wp-cq-opt-desc' }, o.description) : null),
            h('span', { className: 'wp-kbd' }, i + 1));
        }),
        h('div', { className: cx('wp-cq-opt', 'wp-cq-other', picked.indexOf(OTHER) >= 0 && 'wp-cq-opt-on'), onClick: function () { if (picked.indexOf(OTHER) < 0) pick(OTHER); } },
          h('span', { className: cx('wp-cq-mark', q.multiSelect && 'wp-cq-mark-multi'), role: q.multiSelect ? 'checkbox' : 'radio', 'aria-checked': picked.indexOf(OTHER) >= 0, 'aria-label': 'Outro', tabIndex: 0,
            onClick: function (e) { e.stopPropagation(); pick(OTHER); }, onKeyDown: function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); pick(OTHER); } } }, picked.indexOf(OTHER) >= 0 ? h(Icons.check) : null),
          h('input', { ref: otherRef, className: 'wp-cq-other-input', placeholder: 'Outro: escreva sua resposta', value: other[k] || '', 'aria-label': 'Outra resposta',
            onFocus: function () { if (picked.indexOf(OTHER) < 0) pick(OTHER); },
            onChange: function (e) { var v = e.target.value; setOther(function (m) { var n = Object.assign({}, m); n[k] = v; return n; }); } }),
          h('span', { className: 'wp-kbd' }, q.options.length + 1))),
      h('div', { className: 'wp-cq-foot' },
        h('span', { className: 'wp-cq-count' }, qs.length > 1 ? (idx + 1) + ' de ' + qs.length : q.multiSelect ? '' : 'Teclas 1–' + (q.options.length + 1)),
        idx > 0 ? h(Button, { size: 'sm', variant: 'ghost', onClick: function () { setIdx(idx - 1); } }, 'Voltar') : null,
        last ? h(Button, { size: 'sm', variant: 'primary', disabled: !allDone, onClick: submit }, 'Responder') :
          h(Button, { size: 'sm', variant: 'secondary', disabled: !answered(q, idx), onClick: function () { setIdx(idx + 1); } }, 'Próxima')));
  }

  function ClaudePanel(p) {
    var sid = p.activeSessionId || '_';
    var ds = React.useState({}), drafts = ds[0], setDrafts = ds[1];
    var draft = drafts[sid] || '';
    var setDraft = function (v) { setDrafts(function (m) { var n = Object.assign({}, m); n[sid] = v; return n; }); };
    var bodyRef = React.useRef(null), fileRef = React.useRef(null), taRef = React.useRef(null), pinRef = React.useRef(null);
    var msgs = p.messages || [];
    /* the last message you sent stays pinned at the top while the reply scrolls under it */
    var lastUser = -1; msgs.forEach(function (m, i) { if (m.role === 'user') lastUser = i; });
    var pn = React.useState(false), pinned = pn[0], setPinned = pn[1];
    var checkPin = function () {
      var b = bodyRef.current, el = pinRef.current;
      if (!b || !el) { if (pinned) setPinned(false); return; }
      var s = el.getBoundingClientRect().top < b.getBoundingClientRect().top + 8;
      setPinned(function (x) { return x === s ? x : s; });
    };
    React.useEffect(function () { var b = bodyRef.current; if (b) b.scrollTop = b.scrollHeight; checkPin(); }, [msgs.length, p.status, !!p.permission, !!p.question, sid]);
    var cm = React.useState(false), cmdOpen = cm[0], setCmdOpen = cm[1];
    var cmdAnchor = React.useRef(null), cmdBtn = React.useRef(null);
    var commands = p.commands || null;
    var openCmds = function (from) { cmdAnchor.current = from; setCmdOpen(true); };
    var runCmd = function (name) {
      setDraft('/' + name + ' ');
      p.onCommand && p.onCommand(name);
      setTimeout(function () { var t = taRef.current; if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }, 0);
    };
    var cmdItems = function () {
      if (!commands) return [];
      var out = [], groups = [['project', 'Projeto · .claude/commands'], ['user', 'Pessoais · ~/.claude/commands']];
      groups.forEach(function (g) {
        var list = commands.filter(function (c) { return (c.scope || 'project') === g[0]; });
        if (!list.length) return;
        if (out.length) out.push({ divider: true });
        out.push({ header: g[1] });
        list.forEach(function (c) { out.push({ id: c.name, label: '/' + c.name + (c.argumentHint ? ' ' + c.argumentHint : ''), description: c.description }); });
      });
      return out;
    };
    var md = useCtl(p.mode, 'manual', p.onModeChange), mode = md[0], setMode = md[1];
    var ml = useCtl(p.model, 'opus', p.onModelChange), model = ml[0], setModel = ml[1];
    var ef = useCtl(p.effort, 'auto', p.onEffortChange), effort = ef[0], setEffort = ef[1];
    var ls = useCtl(p.listening, false, p.onSpeakChange), listening = ls[0], setListening = ls[1];
    var fv = useCtl(p.favoriteCommands, [], p.onFavoriteCommandsChange), favs = fv[0], setFavs = fv[1];
    var dg = React.useState(false), dragging = dg[0], setDragging = dg[1];
    var models = p.models || CL_MODELS;
    var modeInfo = CL_MODES.filter(function (m) { return m.id === mode; })[0] || CL_MODES[0];
    var modelInfo = models.filter(function (m) { return m.id === model; })[0] || models[0];
    var effResolved = effort === 'auto' ? (modelInfo.defaultEffort || 'high') : effort;
    var effLabel = effort === 'auto' ? 'auto' : effort;
    var attachments = p.attachments || [];
    var submit = function () { if (!draft.trim() && !attachments.length) return; p.onSubmit && p.onSubmit(draft, p.activeSessionId); setDraft(''); };
    var cycleMode = function () { var i = CL_MODES.indexOf(modeInfo); setMode(CL_MODES[(i + 1) % CL_MODES.length].id); };
    var addFiles = function (list) { if (list && list.length && p.onUpload) p.onUpload(Array.prototype.slice.call(list)); };
    var status = p.status || 'idle';
    var sessions = p.sessions || null;
    var cur = sessions ? sessions.filter(function (s) { return s.id === p.activeSessionId; })[0] : null;
    var fav = !!(cur && cur.favorite);
    var empty = !msgs.length && !p.permission && !p.summary;
    var running = status === 'running';
    return h('aside', { className: cx('wp-cl', p.className), 'aria-label': 'Claude Code' },
      /* one bar: Claude mark on the left, session tabs, then "+", favorite and the session menu */
      h('div', { className: 'wp-cl-head' },
        h('span', { className: cx('wp-cl-mark', running && 'wp-cl-mark-live'), role: 'img',
          'aria-label': 'Claude Code' + (p.workspace ? ' em ' + p.workspace : ''), title: 'Claude Code' + (p.workspace ? ' · ' + p.workspace : '') }, h(Icons.brain)),
        sessions ? h('div', { className: 'wp-cl-sessions-scroll', role: 'tablist', 'aria-label': 'Sessões do Claude Code' },
          sessions.map(function (s) {
            return h(SessionTab, { key: s.id, session: s, active: s.id === p.activeSessionId,
              onSelect: function () { p.onSelectSession && p.onSelectSession(s.id); },
              onClose: p.onCloseSession ? function () { p.onCloseSession(s.id); } : undefined });
          })) : h('span', { className: 'wp-cl-solo' }, h(StatusDot, { status: status }), STATUS_TEXT[status]),
        h('div', { className: 'wp-cl-head-tools' },
          p.onNewSession ? h('button', { className: 'wp-x wp-cl-snew', 'aria-label': 'Nova sessão', title: 'Nova sessão (⇧⌘L)', onClick: p.onNewSession }, h(Icons.plus)) : null,
          cur && p.onToggleFavorite ? h('button', { key: 'fav' + fav, className: cx('wp-x', 'wp-cl-fav', fav && 'wp-cl-fav-on'), 'aria-pressed': fav,
            'aria-label': fav ? 'Remover dos favoritos' : 'Favoritar sessão', title: fav ? 'Remover dos favoritos' : 'Favoritar sessão', onClick: function () { p.onToggleFavorite(cur.id); } }, h(Icons.star)) : null,
          h(Pop, { trigger: function (t) { return h('button', Object.assign({ className: 'wp-x wp-cl-more', 'aria-label': 'Opções da sessão', title: 'Opções da sessão' }, t), h(Icons.more)); },
            menu: { label: 'Opções da sessão', placement: 'bottom-end', items: p.sessionActions || CL_ACTIONS,
              onSelect: function (id) { if (id === 'close' && p.onCloseSession && cur) p.onCloseSession(cur.id); else p.onSessionAction && p.onSessionAction(id, cur ? cur.id : undefined); } } }))),
      h('div', { className: 'wp-cl-bodywrap' },
      pinned && lastUser >= 0 ? h('button', { className: 'wp-cl-pin', title: 'Ir para a mensagem', 'aria-label': 'Sua última mensagem: ' + msgs[lastUser].text,
        onClick: function () { var b = bodyRef.current, el = pinRef.current; if (b && el) b.scrollTop += el.getBoundingClientRect().top - b.getBoundingClientRect().top - 16; } },
        h('span', { className: 'wp-cl-pin-msg' }, msgs[lastUser].text)) : null,
      h('div', { className: 'wp-cl-body', ref: bodyRef, key: sid, onScroll: checkPin },
        empty ? h('div', { className: 'wp-cl-empty wp-cl-in' },
          h('span', { className: 'wp-ncard-icon' }, h(Icons.brain)),
          h('div', { className: 'wp-cl-empty-title' }, 'Nova sessão' + (p.workspace ? ' em ' + p.workspace : '')),
          h('div', { className: 'wp-cl-empty-text' }, sessions && sessions.length > 1 ? 'Roda em paralelo às outras sessões deste workspace, com contexto próprio.' : 'Descreva a tarefa. O Claude lê o workspace e pede permissão antes de executar comandos.')) : null,
        msgs.map(function (m, i) {
          if (m.role === 'tool') return h('div', { key: i, className: 'wp-cl-in' }, h(ToolRow, m));
          return h('div', { key: i, ref: i === lastUser ? pinRef : undefined, className: cx('wp-cl-msg', 'wp-cl-' + m.role, 'wp-cl-in', i === lastUser && pinned && 'wp-cl-user-hidden') }, m.text);
        }),
        running && !p.permission && !p.question ? h('div', { className: 'wp-cl-thinking wp-cl-in', role: 'status', 'aria-label': 'Pensando' }, h('svg', { className: 'wp-cl-think-mark', viewBox: '2 11 60 42', 'aria-hidden': true }, h('path', { key: 'b2', className: 'wp-cl-think-base', d: LOGO.V2 }), h('path', { key: 'b1', className: 'wp-cl-think-base', d: LOGO.V1 }), h('path', { key: 'r2', className: 'wp-cl-think-run wp-cl-think-back', d: LOGO.V2, pathLength: 100 }), h('path', { key: 'r1', className: 'wp-cl-think-run wp-cl-think-front', d: LOGO.V1, pathLength: 100 })), h('span', { className: 'wp-cl-think-label', 'aria-hidden': true }, 'Pensando')) : null,
        p.permission ? h('div', { className: 'wp-cl-perm wp-cl-in', role: 'alert' },
          h('div', { className: 'wp-cl-perm-title' }, h(Icons.alert), 'Permitir executar?'),
          h('code', { className: 'wp-cl-perm-cmd' }, p.permission.command),
          h('div', { className: 'wp-toast-actions' },
            h(Button, { size: 'sm', variant: 'primary', onClick: p.permission.onAllow }, 'Permitir'),
            h(Button, { size: 'sm', variant: 'secondary', onClick: p.permission.onAllowAlways }, 'Sempre neste workspace'),
            h(Button, { size: 'sm', variant: 'ghost', onClick: p.permission.onDeny }, 'Negar'))) : null,
        p.question ? h('div', { className: 'wp-cl-in', key: 'q' }, h(ClaudeQuestion, p.question)) : null,
        p.summary ? h('div', { className: 'wp-cl-sum wp-neon wp-cl-in' },
          h('div', { className: 'wp-cl-sum-title' }, h(Icons.check), p.summary.title || 'Pronto'),
          (p.summary.files || []).map(function (f) { return h(FileRow, { key: f.path, path: f.path, add: f.add, del: f.del }); }),
          p.summary.onReview ? h('div', { className: 'wp-toast-actions' }, h(Button, { size: 'sm', variant: 'primary', icon: 'diff', onClick: p.summary.onReview }, 'Revisar diff')) : null) : null)),
      p.agents && p.agents.length ? h(AgentsStrip, { agents: p.agents }) : null,
      commands && (p.favoriteCommands !== undefined || p.onFavoriteCommandsChange || p.showFavorites) ? h(FavCommands, { commands: commands, favorites: favs, onChange: setFavs,
        onRun: function (name) { if (p.onRunCommand) p.onRunCommand(name, p.activeSessionId); else if (p.onSubmit) p.onSubmit('/' + name, p.activeSessionId); } }) : null,
      h('div', { className: cx('wp-cl-compose', 'wp-neon', running && 'wp-neon-live', 'wp-cl-mode-' + mode, dragging && 'wp-cl-drop'),
        onDragOver: function (e) { if (p.onUpload) { e.preventDefault(); setDragging(true); } },
        onDragLeave: function () { setDragging(false); },
        onDrop: function (e) { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); } },
        attachments.length ? h('div', { className: 'wp-cl-atts' }, attachments.map(function (f) {
          return h('span', { key: f.id, className: 'wp-cl-att' }, h(FileIcon, { name: f.name, size: 14 }), h('span', { className: 'wp-cl-att-name', title: f.name }, f.name), f.size ? h('span', { className: 'wp-cl-att-size' }, f.size) : null,
            p.onRemoveAttachment ? h('button', { className: 'wp-x', 'aria-label': 'Remover ' + f.name, onClick: function () { p.onRemoveAttachment(f.id); } }, h(Icons.close)) : null);
        })) : null,
        h('textarea', { ref: taRef, rows: 2, value: draft, 'aria-label': 'Mensagem para o Claude',
          placeholder: listening ? 'Ouvindo… fale sua instrução' : running ? 'Enviar instrução enquanto trabalha…' : mode === 'plan' ? 'Descreva o que planejar' : 'Peça algo ao Claude neste workspace',
          onChange: function (e) { var v = e.target.value; setDraft(v); if (v === '/' && commands && commands.length) openCmds(taRef.current); },
          onKeyDown: function (e) {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
            else if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); cycleMode(); }
          } }),
        h('div', { className: 'wp-cl-tools' },
          p.onUpload ? h('input', { ref: fileRef, type: 'file', multiple: true, hidden: true, onChange: function (e) { addFiles(e.target.files); e.target.value = ''; } }) : null,
          p.onUpload ? h('button', { className: 'wp-cl-tbtn', 'aria-label': 'Anexar arquivos', title: 'Anexar arquivos ou imagens (ou arraste para cá)', onClick: function () { fileRef.current && fileRef.current.click(); } }, h(Icons.clip)) : null,
          commands ? h('span', { className: 'wp-pop' },
            h('button', { ref: cmdBtn, className: cx('wp-cl-tbtn', cmdOpen && 'wp-cl-tbtn-on'), 'aria-haspopup': 'menu', 'aria-expanded': cmdOpen, 'aria-label': 'Comandos', title: 'Comandos de .claude/commands (digite /)',
              onClick: function () { if (cmdOpen) setCmdOpen(false); else openCmds(cmdBtn.current); } }, h(Icons.slash)),
            h(Menu, { open: cmdOpen, anchorRef: cmdAnchor, onClose: function () { setCmdOpen(false); if (cmdAnchor.current === taRef.current && draft === '/') setDraft(''); },
              label: 'Comandos', placement: 'top-start', className: 'wp-menu-wide wp-menu-cmds', items: cmdItems(), onSelect: runCmd },
              commands.length ? null : h('div', { className: 'wp-menu-note' }, 'Nenhum comando ainda. Crie um arquivo .md em .claude/commands para ele aparecer aqui.'))) : null,
          h(Pop, { trigger: function (t, open) { return h('button', Object.assign({ className: cx('wp-cl-chip', 'wp-cl-chip-mode', 'wp-tone-' + (modeInfo.tone || mode)), title: 'Modo de execução: ' + modeInfo.label + ' (⇧Tab alterna)' }, t),
              h(Icons[modeInfo.icon]), h('span', { className: 'wp-cl-chip-label' }, modeInfo.short), h(Icons.chevron, { className: cx('wp-cl-chip-chev', open && 'up') })); },
            menu: { label: 'Modo de execução', placement: 'top-start', className: 'wp-menu-wide',
              items: [{ header: 'Modo de execução · ⇧Tab' }].concat(CL_MODES.map(function (m) { return { id: m.id, icon: m.icon, label: m.label, description: m.description, checked: m.id === mode, danger: m.tone === 'danger', tone: m.id }; })),
              onSelect: setMode } }),
          h(Pop, { trigger: function (t, open) { return h('button', Object.assign({ className: 'wp-cl-chip wp-cl-chip-model', title: 'Modelo ' + modelInfo.label + ' · effort ' + effLabel }, t),
              h('span', { className: 'wp-cl-chip-label' }, modelInfo.label), h(EffortBars, { level: effResolved }), h('span', { className: 'wp-cl-chip-eff' }, effLabel), h(Icons.chevron, { className: cx('wp-cl-chip-chev', open && 'up') })); },
            menu: { label: 'Modelo e esforço', placement: 'top-start', className: 'wp-menu-wide', closeOnSelect: false,
              items: [{ header: 'Modelo' }].concat(models.map(function (m) { return { id: m.id, label: m.label, description: m.description, checked: m.id === model }; })),
              onSelect: setModel,
              children: [h('div', { key: 's', className: 'wp-menu-sep' }),
                h(EffortSlider, { key: 'e', value: effort, modelDefault: modelInfo.defaultEffort || 'high', supported: modelInfo.efforts, onChange: setEffort })] } }),
          h('span', { className: 'wp-term-spacer' }),
          h('button', { className: cx('wp-cl-tbtn', 'wp-cl-mic', listening && 'wp-cl-mic-on'), 'aria-pressed': listening, 'aria-label': listening ? 'Parar de ouvir' : 'Falar', title: listening ? 'Parar de ouvir' : 'Falar (ditado por voz)', onClick: function () { setListening(!listening); } },
            listening ? h('span', { className: 'wp-wave', 'aria-hidden': true }, h('i'), h('i'), h('i'), h('i')) : h(Icons.mic)),
          running && p.onStop ? h('button', { className: 'wp-cl-send wp-cl-stop', 'aria-label': 'Parar', title: 'Parar (esc)', onClick: p.onStop }, h(Icons.stop)) :
            h('button', { className: 'wp-cl-send', 'aria-label': 'Enviar', title: 'Enviar (↵) · nova linha ⇧↵', disabled: !draft.trim() && !attachments.length, onClick: submit }, h(Icons.send))),
        mode === 'bypass' ? h('div', { className: 'wp-cl-mode-note wp-cl-note-danger' }, h(Icons.shield), 'Bypass permissions ativo: o Claude executa comandos sem perguntar') :
          mode === 'plan' ? h('div', { className: 'wp-cl-mode-note' }, h(Icons.plan), 'Plan: o Claude só lê e propõe; nada é alterado até você aprovar') : null));
  }
  var STATUS_TEXT = { idle: 'Pronto', running: 'Trabalhando', done: 'Terminou', attention: 'Aguardando você', error: 'Falhou' };

  /* ---------------- StatusBar ---------------- */
  function initials(name) { return (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase(); }
  function StatusBar(p) {
    var item = function (key, cls, title, onClick, kids) {
      return h(onClick ? 'button' : 'span', { key: key, type: onClick ? 'button' : undefined, className: cx('wp-stb-item', cls), title: title, onClick: onClick }, kids);
    };
    var ahead = p.ahead || 0, behind = p.behind || 0, hasSync = p.ahead != null || p.behind != null;
    var c = p.lastCommit;
    var upstream = p.upstream || (p.branch ? 'origin/' + p.branch : 'o remoto');
    var syncTitle = ahead || behind ? [ahead ? ahead + (ahead > 1 ? ' commits' : ' commit') + ' para enviar' : null, behind ? behind + (behind > 1 ? ' commits' : ' commit') + ' para receber' : null].filter(Boolean).join(' · ') + ' (' + upstream + ') · clique para sincronizar' : 'Em dia com ' + upstream;
    var cursor = p.line != null ? 'Ln ' + p.line + ', Col ' + (p.column || 1) + (p.selection ? ' (' + p.selection + ' selecionados)' : '') : null;
    var pp = (p.path || '').replace(/\/$/, '').split('/'), leaf = pp.pop() || '', parent = pp.length ? pp.join('/') + '/' : '';
    if (parent.length > 26) parent = '…/' + pp.slice(-1).join('/') + '/';
    return h('footer', { className: cx('wp-stb', p.className), role: 'contentinfo', 'aria-label': 'Barra de status' },
      h('div', { className: 'wp-stb-side' },
        p.path ? item('pa', 'wp-stb-path', p.path + (p.onPath ? ' · clique para abrir no Finder' : ''), p.onPath, [h(Icons.folder, { key: 'i' }),
          h('span', { key: 'p', className: 'wp-stb-path-parent' }, parent), h('span', { key: 'l', className: 'wp-stb-path-leaf' }, leaf)]) : null,
        p.branch ? item('br', 'wp-stb-branch', 'Branch ' + p.branch + ' · trocar branch', p.onBranch, [h(Icons.branch, { key: 'i' }), h('span', { key: 't', className: 'wp-stb-trunc' }, p.branch)]) : null,
        hasSync ? item('sy', cx('wp-stb-sync', p.syncing && 'wp-stb-syncing', !ahead && !behind && 'wp-stb-even'), syncTitle, p.onSync, [
          h('span', { key: 'd', className: cx('wp-stb-n', behind && 'wp-stb-n-on') }, h(Icons.arrowDown), behind),
          h('span', { key: 'u', className: cx('wp-stb-n', ahead && 'wp-stb-n-on') }, h(Icons.arrowUp), ahead)]) : null,
        c ? item('cm', 'wp-stb-commit', (c.hash ? c.hash + ' · ' : '') + (c.message || '') + '\n' + c.author + (c.time ? ', ' + c.time : ''), p.onCommit, [
          h('span', { key: 'a', className: 'wp-stb-avatar', 'aria-hidden': true }, initials(c.author)),
          h('span', { key: 'w', className: 'wp-stb-trunc wp-stb-who' }, c.author + (c.time ? ', ' + c.time : '')),
          c.message ? h('span', { key: 'm', className: 'wp-stb-trunc wp-stb-msg' }, c.message) : null]) : null,
        p.left || null),
      h('div', { className: 'wp-stb-side wp-stb-right' },
        p.right || null,
        cursor ? item('ln', 'wp-stb-cursor', 'Ir para linha/coluna (⌃G)', p.onGoToLine, cursor) : null,
        p.indent ? item('in', 'wp-stb-indent', 'Indentação', p.onIndent, p.indent) : null,
        p.encoding ? item('en', 'wp-stb-enc', 'Codificação do arquivo', p.onEncoding, p.encoding) : null,
        p.eol ? item('eol', 'wp-stb-eol', 'Fim de linha: ' + (p.eol === 'CRLF' ? 'Windows (CRLF)' : 'Unix (LF)'), p.onEol, p.eol) : null,
        p.language ? item('lg', 'wp-stb-lang', 'Tipo de arquivo · trocar', p.onLanguage, [h('span', { key: 'b', className: 'wp-stb-braces', 'aria-hidden': true }, '{ }'), h('span', { key: 't' }, p.language)]) : null));
  }

  /* ---------------- Logo (generated from the brand geometry: two overlapping V's = W) ---------------- */
  var LOGO = {"V1": "M5.00 14H14.20L23.00 31.60L29.30 19H38.50L23.00 50Z", "V2": "M27.70 23.4H36.90L41.00 31.60L49.80 14H59.00L41.00 50Z", "fullVB": "0 0 190.44 46.34", "symT": "translate(-5.556 -15.556) scale(1.1111)", "wmT": "translate(71.070 40.000) scale(0.04225)", "wm": "M22 -534H153L256 -145L364 -534H475L583 -145L687 -534H818L657 0H525L419 -358L314 0H182Z M860.0 -134Q860.0 -202 902.5 -241.5Q945.0 -281 1034.0 -298L1211.0 -333Q1211.0 -389 1185.0 -418.0Q1159.0 -447 1109.0 -447Q1018.0 -447 1000.0 -364L869.0 -370Q885.0 -454 947.0 -500.0Q1009.0 -546 1109.0 -546Q1222.0 -546 1280.5 -488.5Q1339.0 -431 1339.0 -324V-130Q1339.0 -109 1346.0 -101.0Q1353.0 -93 1369.0 -93H1386.0V0Q1370.0 4 1340.0 4Q1293.0 4 1264.5 -16.0Q1236.0 -36 1228.0 -83Q1208.0 -40 1159.5 -14.0Q1111.0 12 1046.0 12Q961.0 12 910.5 -26.5Q860.0 -65 860.0 -134ZM1211.0 -216V-246L1073.0 -218Q1031.0 -210 1012.0 -192.0Q993.0 -174 993.0 -146Q993.0 -115 1013.5 -98.0Q1034.0 -81 1072.0 -81Q1135.0 -81 1173.0 -118.0Q1211.0 -155 1211.0 -216Z M1467.0 -126 1468.0 -710H1596.0V-139Q1596.0 -99 1636.0 -99H1675.0V0H1596.0Q1534.0 0 1500.5 -30.5Q1467.0 -61 1467.0 -126Z M1761.0 -534H1884.0L1886.0 -455Q1909.0 -499 1951.0 -522.5Q1993.0 -546 2046.0 -546Q2119.0 -546 2170.5 -509.0Q2222.0 -472 2247.5 -409.0Q2273.0 -346 2273.0 -267Q2273.0 -188 2247.0 -125.0Q2221.0 -62 2170.0 -25.0Q2119.0 12 2045.0 12Q1994.0 12 1952.5 -11.0Q1911.0 -34 1889.0 -73V150H1761.0ZM2140.0 -267Q2140.0 -349 2107.0 -395.5Q2074.0 -442 2015.0 -442Q1955.0 -442 1922.0 -397.5Q1889.0 -353 1889.0 -267Q1889.0 -181 1922.0 -136.5Q1955.0 -92 2015.0 -92Q2074.0 -92 2107.0 -138.5Q2140.0 -185 2140.0 -267Z M2364.0 -710H2492.0V-462Q2512.0 -504 2552.0 -525.0Q2592.0 -546 2644.0 -546Q2730.0 -546 2777.5 -490.5Q2825.0 -435 2825.0 -343V0H2697.0V-312Q2697.0 -378 2674.5 -410.0Q2652.0 -442 2606.0 -442Q2553.0 -442 2522.5 -407.5Q2492.0 -373 2492.0 -309V0H2364.0Z", "T": 14, "B": 50};
  var logoSeq = 0;
  function logoSymbol(id, tone) {
    var mono = tone === 'mono' ? '#eeebf7' : tone === 'dark' ? '#0a090f' : null;
    var mask = '<mask id="' + id + 'k" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><rect width="64" height="64" fill="#fff"/><path d="' + LOGO.V1 + '" fill="#000" stroke="#000" stroke-width="2.2" stroke-linejoin="round"/></mask>';
    if (mono) return mask + '<path d="' + LOGO.V2 + '" fill="' + mono + '" fill-opacity=".62" mask="url(#' + id + 'k)"/><path d="' + LOGO.V1 + '" fill="' + mono + '"/>';
    return '<linearGradient id="' + id + 'a" x1="0" y1="' + LOGO.T + '" x2="0" y2="' + LOGO.B + '" gradientUnits="userSpaceOnUse"><stop offset="0" style="stop-color:var(--accent-3)"/><stop offset="1" style="stop-color:var(--accent)"/></linearGradient>' +
      '<linearGradient id="' + id + 'b" x1="0" y1="' + LOGO.T + '" x2="0" y2="' + LOGO.B + '" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#3d8ff0"/><stop offset="1" stop-color="#6264e8"/></linearGradient>' +
      mask + '<path d="' + LOGO.V2 + '" fill="url(#' + id + 'b)" mask="url(#' + id + 'k)"/><path d="' + LOGO.V1 + '" fill="url(#' + id + 'a)"/>';
  }
  function Logo(p) {
    var idRef = React.useRef(null);
    if (!idRef.current) idRef.current = 'wp-logo-' + (++logoSeq) + '-';
    var tone = p.tone || 'color', full = p.variant !== 'symbol', size = p.size || 28;
    var word = tone === 'dark' ? '#0a090f' : 'var(--ink)';
    var vb = full ? LOGO.fullVB : '5 14 54 36';
    var dims = vb.split(' ').map(Number), w = size * dims[2] / dims[3];
    var inner = full ? '<g transform="' + LOGO.symT + '">' + logoSymbol(idRef.current, tone) + '</g><path transform="' + LOGO.wmT + '" fill="' + word + '" d="' + LOGO.wm + '"/>' : logoSymbol(idRef.current, tone);
    return h('svg', { className: cx('wp-logo', p.className), viewBox: vb, width: w, height: size, role: 'img', 'aria-label': p.title || 'Walph', style: p.style, dangerouslySetInnerHTML: { __html: '<title>' + (p.title || 'Walph') + '</title>' + inner } });
  }

  /* ---------------- NeonCard ---------------- */
  function NeonCard(p) {
    var mode = p.trace || 'static';
    return h(p.as || 'div', {
      className: cx('wp-ncard', 'wp-neon', mode === 'live' && 'wp-neon-live', mode === 'hover' && 'wp-neon-hover', p.glow && 'wp-ncard-glow', p.className),
      style: p.style, onClick: p.onClick, tabIndex: p.onClick ? 0 : undefined, role: p.onClick ? 'button' : undefined
    },
      (p.icon || p.title || p.eyebrow) ? h('div', { className: 'wp-ncard-head' },
        p.icon && Icons[p.icon] ? h('span', { className: 'wp-ncard-icon' }, h(Icons[p.icon])) : null,
        h('div', { className: 'wp-ncard-titles' },
          p.eyebrow ? h('span', { className: 'wp-ncard-eyebrow' }, p.eyebrow) : null,
          p.title ? h('span', { className: 'wp-ncard-title' }, p.title) : null)) : null,
      p.children ? h('div', { className: 'wp-ncard-body' }, p.children) : null);
  }

  /* ---------------- Code (syntax view) ---------------- */
  var MM_COLOR = { keyword: 'var(--syn-keyword)', function: 'var(--syn-function)', type: 'var(--syn-type)', string: 'var(--syn-string)', number: 'var(--syn-number)', constant: 'var(--syn-constant)',
    property: 'var(--syn-property)', tag: 'var(--syn-tag)', comment: 'var(--syn-comment)', operator: 'var(--syn-operator)', variable: 'var(--syn-variable)' };
  function Code(p) {
    var start = p.startLine || 1, lines = p.lines || [], changes = p.changes || {}, mm = p.minimap !== false;
    var sc = React.useRef(null), map = React.useRef(null);
    var vp = React.useState({ top: 0, h: 1 }), view = vp[0], setView = vp[1];
    var sync = function () {
      var el = sc.current; if (!el) return;
      var total = el.scrollHeight || 1;
      setView({ top: el.scrollTop / total, h: Math.min(1, el.clientHeight / total) });
    };
    React.useEffect(function () { sync(); var ro = window.ResizeObserver ? new ResizeObserver(sync) : null; if (ro && sc.current) ro.observe(sc.current); return function () { ro && ro.disconnect(); }; }, [lines.length]);
    var jump = function (e) {
      var el = sc.current, m = map.current; if (!el || !m) return;
      var r = m.getBoundingClientRect(), inner = m.firstChild.getBoundingClientRect();
      var f = Math.max(0, Math.min(1, (e.clientY - inner.top) / Math.max(1, inner.height)));
      el.scrollTop = f * el.scrollHeight - el.clientHeight / 2;
    };
    var drag = function (e) {
      e.preventDefault(); jump(e);
      var mv = function (ev) { jump(ev); }, up = function () { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    };
    var ch = function (n) { return changes[n]; };
    return h('div', { className: cx('wp-code', mm && 'wp-code-mm', p.className), role: 'region', 'aria-label': p.label || 'Código' },
      h('div', { className: 'wp-code-scroll', ref: sc, onScroll: sync },
        lines.map(function (line, i) {
          var n = start + i, c = ch(n);
          return h('div', { key: i, className: cx('wp-code-line', n === p.activeLine && 'wp-code-active') },
            h('span', { className: 'wp-code-gutter', 'aria-hidden': true }, n),
            h('span', { className: cx('wp-code-git', c && 'wp-code-git-' + c), title: c === 'added' ? 'Linha adicionada' : c === 'modified' ? 'Linha alterada' : c === 'deleted' ? 'Linhas removidas aqui' : undefined, 'aria-hidden': true }),
            h('span', { className: 'wp-code-text' }, [].concat(line).map(function (tok, j) {
              if (typeof tok === 'string') return tok;
              return h('span', { key: j, className: 'wp-syn-' + tok[0] }, tok[1]);
            })));
        })),
      mm ? h('div', { className: 'wp-code-minimap', ref: map, onMouseDown: drag, 'aria-hidden': true, title: 'Mapa do código' },
        h('div', { className: 'wp-mm-inner' },
          lines.map(function (line, i) {
            var n = start + i, c = ch(n), x = 0;
            var segs = [].concat(line).map(function (tok, j) {
              var text = typeof tok === 'string' ? tok : tok[1], kind = typeof tok === 'string' ? 'variable' : tok[0];
              var lead = text.length - text.replace(/^\s+/, '').length, w = text.trim().length;
              var el = w ? h('i', { key: j, style: { left: (x + lead) * 1.1, width: w * 1.1, background: MM_COLOR[kind] || MM_COLOR.variable } }) : null;
              x += text.length; return el;
            });
            return h('div', { key: i, className: cx('wp-mm-line', n === p.activeLine && 'wp-mm-active') }, c ? h('b', { className: 'wp-mm-git wp-code-git-' + c }) : null, segs);
          }),
          h('div', { className: 'wp-mm-view', style: { top: (view.top * 100) + '%', height: (view.h * 100) + '%' } }))) : null);
  }

  /* ---------------- Welcome ---------------- */
  function Welcome(p) {
    var recent = p.recent || [];
    var sel = React.useState([]), picked = sel[0], setPicked = sel[1];
    var ask = React.useState(''), prompt = ask[0], setPrompt = ask[1];
    var toggle = function (id) { setPicked(function (l) { return l.indexOf(id) >= 0 ? l.filter(function (x) { return x !== id; }) : l.concat([id]); }); };
    var step = function (i) { return { style: { animationDelay: 'calc(var(--duration-stagger) * ' + i + ')' } }; };
    var action = function (icon, label, kbd, fn) {
      return h('button', { className: 'wp-wl-action', onClick: fn }, h(Icons[icon]), h('span', null, label), kbd ? h('span', { className: 'wp-kbd' }, kbd) : null);
    };
    return h('div', { className: cx('wp-wl-wrap', p.className) }, h('div', { className: 'wp-wl' },
      h('div', { className: 'wp-wl-col' },
        h('div', Object.assign({ className: 'wp-wl-in wp-wl-hero' }, step(0)),
          h('h1', { className: 'wp-wl-name' }, h(Logo, { size: 52 })),
          h('p', { className: 'wp-wl-tag' }, p.tagline || 'Todos os seus workspaces numa janela só.')),
        h('div', Object.assign({ className: 'wp-wl-in wp-wl-actions' }, step(1)),
          action('folder', 'Abrir pasta como workspace', '⌘O', p.onOpenFolder),
          action('branch', 'Clonar repositório', '⇧⌘G', p.onClone),
          action('terminal', 'Novo terminal', '⌃`', p.onTerminal)),
        h('div', Object.assign({ className: 'wp-wl-in wp-wl-ask' }, step(2)),
          h('div', { className: 'wp-wl-label' }, h(Icons.spark), 'Comece com o Claude Code'),
          h('div', { className: 'wp-cl-compose wp-wl-compose wp-neon wp-neon-live' },
            h('textarea', { rows: 2, value: prompt, placeholder: 'Ex.: crie uma API Nest com Postgres e autenticação JWT', onChange: function (e) { setPrompt(e.target.value); },
              onKeyDown: function (e) { if (e.key === 'Enter' && !e.shiftKey && prompt.trim()) { e.preventDefault(); p.onAsk && p.onAsk(prompt); setPrompt(''); } } }),
            h('div', { className: 'wp-cl-compose-foot' },
              h('span', { className: 'wp-kbd' }, 'cria um workspace novo'),
              h('button', { className: 'wp-cl-send', 'aria-label': 'Enviar', disabled: !prompt.trim(), onClick: function () { p.onAsk && p.onAsk(prompt); setPrompt(''); } }, h(Icons.send)))))),
      h('div', { className: 'wp-wl-col' },
        h('div', Object.assign({ className: 'wp-wl-in wp-wl-recent' }, step(3)),
          h('div', { className: 'wp-wl-head' },
            h('span', { className: 'wp-wl-caption' }, 'RECENTES'),
            h(Button, { size: 'sm', variant: picked.length ? 'primary' : 'ghost', disabled: !picked.length && !recent.length,
              onClick: function () { p.onOpen && p.onOpen(picked.length ? picked : recent.map(function (w) { return w.id; })); } },
              picked.length ? 'Abrir ' + picked.length + (picked.length > 1 ? ' workspaces' : ' workspace') : 'Abrir todos')),
          h('div', { className: 'wp-wl-list', role: 'listbox', 'aria-multiselectable': true },
            recent.map(function (w) {
              var on = picked.indexOf(w.id) >= 0;
              return h('div', { key: w.id, role: 'option', 'aria-selected': on, tabIndex: 0, className: cx('wp-wl-row', on && 'wp-wl-row-on'),
                onClick: function (e) { if (e.metaKey || e.shiftKey || picked.length) toggle(w.id); else p.onOpen && p.onOpen([w.id]); },
                onKeyDown: function (e) { if (e.key === ' ') { e.preventDefault(); toggle(w.id); } else if (e.key === 'Enter') p.onOpen && p.onOpen([w.id]); } },
                h('span', { className: 'wp-wl-check', onClick: function (e) { e.stopPropagation(); toggle(w.id); }, 'aria-hidden': true }, on ? h(Icons.check) : null),
                h('span', { className: 'wp-wl-row-text' },
                  h('span', { className: 'wp-wl-row-name' }, w.name, w.status && w.status !== 'idle' ? h(StatusDot, { status: w.status }) : null),
                  h('span', { className: 'wp-wl-row-path' }, w.path || '')),
                w.branch ? h('span', { className: 'wp-wl-row-branch' }, w.branch) : null,
                w.lastOpened ? h('span', { className: 'wp-wl-row-time' }, w.lastOpened) : null);
            })),
          h('div', { className: 'wp-wl-hint' }, 'Clique para abrir · ', h('span', { className: 'wp-kbd' }, 'espaço'), ' ou ', h('span', { className: 'wp-kbd' }, '⌘clique'), ' para selecionar vários')),
        h('div', Object.assign({ className: 'wp-wl-in wp-wl-tips' }, step(4)),
          [['⌘K', 'command palette'], ['⌘1–9', 'trocar workspace'], ['⌘L', 'falar com o Claude']].map(function (t) {
            return h('span', { key: t[0], className: 'wp-wl-tip' }, h('span', { className: 'wp-kbd' }, t[0]), t[1]);
          })))));
  }

  /* ---------------- Sidebar (activity bar + view) ---------------- */
  var SIDEBAR_VIEWS = [
    { id: 'explorer', icon: 'files', label: 'Explorador', shortcut: '⇧⌘E' },
    { id: 'search', icon: 'search', label: 'Pesquisar', shortcut: '⇧⌘F' },
    { id: 'git', icon: 'branch', label: 'Controle de código', shortcut: '⌃⇧G' },
    { id: 'containers', icon: 'box', label: 'Containers', shortcut: '⇧⌘D', takeover: true }
  ];
  function Sidebar(p) {
    var views = p.views || SIDEBAR_VIEWS;
    var active = p.activeView || views[0].id;
    var cur = views.filter(function (v) { return v.id === active; })[0] || views[0];
    /* a takeover view (Containers) replaces everything right of the bar: the consumer renders it, the sidebar shows only the column */
    var takeover = !!cur.takeover, collapsed = !!p.collapsed || takeover;
    /* like VS Code: clicking the active icon collapses/expands the view */
    var select = function (id) { if (id === cur.id) { if (!takeover && p.onToggleCollapse) p.onToggleCollapse(); } else { p.onSelectView && p.onSelectView(id); if (p.collapsed && p.onToggleCollapse) p.onToggleCollapse(); } };
    var onKey = function (e) {
      var next = 'ArrowDown', prev = 'ArrowUp';
      if (e.key !== next && e.key !== prev && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      var i = views.indexOf(cur), j = e.key === 'Home' ? 0 : e.key === 'End' ? views.length - 1 : (i + (e.key === next ? 1 : -1) + views.length) % views.length;
      p.onSelectView && p.onSelectView(views[j].id);
      var tabs = e.currentTarget.querySelectorAll('[role="tab"]'); if (tabs[j]) tabs[j].focus();
    };
    return h('aside', { className: cx('wp-sb', collapsed && 'wp-sb-collapsed', takeover && 'wp-sb-takeover', p.className), style: p.width ? { width: p.width } : undefined },
      h('div', { className: 'wp-sb-bar', role: 'tablist', 'aria-label': 'Visões da barra lateral', 'aria-orientation': 'vertical', onKeyDown: onKey },
        views.map(function (v) {
          var on = v.id === cur.id;
          return h('button', { key: v.id, role: 'tab', 'aria-selected': on, tabIndex: on ? 0 : -1, 'aria-label': v.label,
            title: v.label + (v.shortcut ? ' (' + v.shortcut + ')' : ''), className: cx('wp-sb-tab', on && 'wp-sb-tab-active'), onClick: function () { select(v.id); } },
            h(Icons[v.icon] || Icons.file),
            v.badge ? h('span', { key: 'b' + v.badge, className: 'wp-sb-badge', 'aria-label': v.badge + ' pendentes' }, v.badge > 99 ? '99+' : v.badge) : null);
        }),
        h('span', { className: 'wp-sb-flex' }),
        p.onSettings ? h('button', { className: 'wp-sb-tab wp-sb-settings', 'aria-label': 'Configurações', title: 'Configurações (⌘,)', onClick: p.onSettings }, h(Icons.gear)) : null),
      collapsed ? null : h('div', { className: 'wp-sb-view', role: 'tabpanel', 'aria-label': cur.label },
        h('div', { className: 'wp-sb-head' },
          h('span', { className: 'wp-sb-title' }, p.title || cur.label),
          p.actions ? h('div', { className: 'wp-sb-actions' }, p.actions) : null),
        h('div', { className: 'wp-sb-body', key: cur.id }, p.children)));
  }

  /* ---------------- Modal ---------------- */
  var FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  function Modal(p) {
    var lv = React.useState(false), leaving = lv[0], setLeaving = lv[1];
    var panelRef = React.useRef(null), opener = React.useRef(null);
    var idRef = React.useRef('wp-modal-' + Math.random().toString(36).slice(2, 8));
    var dismissible = p.dismissible !== false;
    var close = function () { if (!leaving) setLeaving(true); };
    React.useEffect(function () {
      opener.current = document.activeElement;
      var el = panelRef.current; if (!el) return;
      var first = el.querySelector('[data-autofocus]') || el.querySelector('.wp-modal-body ' + FOCUSABLE) || el.querySelector(FOCUSABLE);
      if (first) first.focus();
      return function () { if (opener.current && opener.current.focus) opener.current.focus(); };
    }, []);
    var onKey = function (e) {
      if (e.key === 'Escape' && dismissible) { e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      var f = panelRef.current.querySelectorAll(FOCUSABLE); if (!f.length) return;
      var a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    var tone = p.tone || 'default', size = p.size || (p.nav ? 'lg' : 'md');
    var nav = p.nav || null;
    var body = h('div', { className: 'wp-modal-body', key: p.activeNav || '_' }, p.children);
    return h('div', {
      className: cx('wp-modal-scrim', leaving && 'wp-modal-leaving', p.inline && 'wp-modal-inline'),
      onMouseDown: function (e) { if (e.target === e.currentTarget && dismissible) close(); },
      onAnimationEnd: function (e) { if (leaving && e.target === e.currentTarget) p.onClose && p.onClose(); }
    },
      h('div', { ref: panelRef, role: tone === 'danger' ? 'alertdialog' : 'dialog', 'aria-modal': true, 'aria-labelledby': idRef.current + '-t', 'aria-describedby': p.description ? idRef.current + '-d' : undefined,
        className: cx('wp-modal', 'wp-neon', 'wp-modal-' + size, 'wp-modal-' + tone, nav && 'wp-modal-nav', p.className), onKeyDown: onKey },
        h('div', { className: 'wp-modal-head' },
          p.icon && Icons[p.icon] ? h('span', { className: 'wp-modal-icon' }, h(Icons[p.icon])) : null,
          h('div', { className: 'wp-modal-titles' },
            h('h2', { className: 'wp-modal-title', id: idRef.current + '-t' }, p.title),
            p.description ? h('p', { className: 'wp-modal-desc', id: idRef.current + '-d' }, p.description) : null),
          dismissible ? h('button', { className: 'wp-x wp-modal-x', 'aria-label': 'Fechar (esc)', title: 'Fechar (esc)', onClick: close }, h(Icons.close)) : null),
        nav ? h('div', { className: 'wp-modal-split' },
          h('nav', { className: 'wp-modal-menu', 'aria-label': 'Seções' },
            nav.map(function (n) {
              var on = n.id === p.activeNav;
              return h('button', { key: n.id, className: cx('wp-modal-menu-item', on && 'wp-modal-menu-active'), 'aria-current': on ? 'page' : undefined, onClick: function () { p.onNav && p.onNav(n.id); } },
                n.icon && Icons[n.icon] ? h(Icons[n.icon]) : null, h('span', null, n.label));
            })),
          body) : (p.children != null && p.children !== false ? body : null),
        (p.footer || p.primaryLabel || p.secondaryLabel) ? h('div', { className: 'wp-modal-foot' },
          h('div', { className: 'wp-modal-foot-note' }, p.footer || null),
          p.secondaryLabel ? h(Button, { variant: 'ghost', 'data-autofocus': tone === 'danger' ? true : undefined, onClick: function () { p.onSecondary ? p.onSecondary() : close(); } }, p.secondaryLabel) : null,
          p.primaryLabel ? h(Button, { variant: tone === 'danger' ? 'danger' : 'primary', icon: p.primaryIcon, onClick: function () { p.onPrimary && p.onPrimary(); if (p.closeOnPrimary !== false) close(); } }, p.primaryLabel) : null) : null));
  }

  /* settings row: label + description on the left, control on the right */
  function SettingRow(p) {
    return h('div', { className: cx('wp-setting', p.className) },
      h('div', { className: 'wp-setting-text' },
        h('div', { className: 'wp-setting-label' }, p.label, p.badge ? h('span', { className: 'wp-setting-badge' }, p.badge) : null),
        p.description ? h('div', { className: 'wp-setting-desc' }, p.description) : null),
      h('div', { className: 'wp-setting-control' }, p.children));
  }

  function Switch(p) {
    var on = !!p.checked;
    return h('button', { type: 'button', role: 'switch', 'aria-checked': on, 'aria-label': p.label, disabled: p.disabled, id: p.id,
      className: cx('wp-switch', on && 'wp-switch-on', p.className), onClick: function () { p.onChange && p.onChange(!on); } },
      h('span', { className: 'wp-switch-thumb' }));
  }

  /* ---------------- Select: own trigger + listbox (no native <select> popup) ---------------- */
  var selSeq = 0;
  function normOpt(o) { return typeof o === 'string' ? { value: o, label: o } : o; }
  function Select(p) {
    var opts = (p.options || []).map(normOpt);
    var choices = opts.filter(function (o) { return !o.header && !o.divider; });
    var ctl = p.value !== undefined || ('value' in p && p.onChange);
    var st = React.useState(p.defaultValue !== undefined ? p.defaultValue : p.placeholder ? undefined : (choices[0] || {}).value), inner = st[0], setInner = st[1];
    var value = ctl ? p.value : inner;
    var op = React.useState(false), open = op[0], setOpen = op[1];
    var ac = React.useState(-1), active = ac[0], setActive = ac[1];
    var ps = React.useState(null), pos = ps[0], setPos = ps[1];
    var trig = React.useRef(null), list = React.useRef(null), typed = React.useRef({ s: '', t: 0 });
    var idRef = React.useRef(null); if (!idRef.current) idRef.current = 'wp-sel-' + (++selSeq);
    var cur = choices.filter(function (o) { return o.value === value; })[0];
    var place = function () {
      var r = trig.current && trig.current.getBoundingClientRect(); if (!r) return;
      var need = Math.min(300, choices.length * 34 + 12), below = window.innerHeight - r.bottom - 8, up = below < need && r.top > below;
      setPos({ left: r.left, width: r.width, top: up ? null : r.bottom + 4, bottom: up ? window.innerHeight - r.top + 4 : null, up: up, maxH: Math.max(120, (up ? r.top : below) - 8) });
    };
    var show = function (idx) {
      if (p.disabled) return;
      place(); setOpen(true);
      var i = choices.indexOf(cur); setActive(idx != null ? idx : Math.max(0, i));
    };
    var hide = function (focus) { setOpen(false); if (focus && trig.current) trig.current.focus(); };
    var pick = function (o) {
      if (!o || o.disabled) return;
      if (!ctl) setInner(o.value);
      if (p.onChange) p.onChange({ target: { value: o.value, name: p.name }, currentTarget: { value: o.value } }, o.value);
      hide(true);
    };
    React.useEffect(function () {
      if (!open) return;
      var onDoc = function (e) { if (list.current && !list.current.contains(e.target) && trig.current && !trig.current.contains(e.target)) setOpen(false); };
      var onMove = function (e) { if (list.current && list.current.contains(e.target)) return; place(); };
      document.addEventListener('mousedown', onDoc); window.addEventListener('resize', place); window.addEventListener('scroll', onMove, true);
      return function () { document.removeEventListener('mousedown', onDoc); window.removeEventListener('resize', place); window.removeEventListener('scroll', onMove, true); };
    }, [open]);
    React.useEffect(function () {
      if (!open || !list.current) return;
      var el = list.current.querySelector('[data-idx="' + active + '"]'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    }, [active, open]);
    var move = function (d) { if (!choices.length) return; var i = active, n = choices.length, k = 0; do { i = (i + d + n) % n; k++; } while (choices[i].disabled && k < n); setActive(i); };
    var typeahead = function (ch) {
      var now = Date.now(), t = typed.current; t.s = (now - t.t > 600 ? '' : t.s) + ch.toLowerCase(); t.t = now;
      var i = choices.findIndex(function (o) { return !o.disabled && String(o.label).toLowerCase().indexOf(t.s) === 0; });
      if (i >= 0) { if (open) setActive(i); else pick(choices[i]); }
    };
    var onKey = function (e) {
      if (p.disabled) return;
      var k = e.key;
      if (!open) {
        if (k === 'Enter' || k === ' ' || k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); show(); }
        else if (k.length === 1 && /\S/.test(k)) typeahead(k);
        return;
      }
      if (k === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (k === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (k === 'Home') { e.preventDefault(); setActive(0); }
      else if (k === 'End') { e.preventDefault(); setActive(choices.length - 1); }
      else if (k === 'Enter' || k === ' ') { e.preventDefault(); pick(choices[active]); }
      else if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); hide(true); }
      else if (k === 'Tab') setOpen(false);
      else if (k.length === 1 && /\S/.test(k)) typeahead(k);
    };
    var ci = -1;
    return h('div', { className: cx('wp-select', p.size === 'sm' && 'wp-select-sm', open && 'wp-select-open', p.disabled && 'wp-select-disabled', p.className), style: p.style },
      p.name ? h('input', { type: 'hidden', name: p.name, value: value == null ? '' : value }) : null,
      h('button', { ref: trig, type: 'button', id: p.id, className: 'wp-select-trigger', disabled: p.disabled, role: 'combobox', 'aria-haspopup': 'listbox', 'aria-expanded': open,
        'aria-controls': idRef.current, 'aria-label': p['aria-label'], 'aria-labelledby': p['aria-labelledby'], 'aria-activedescendant': open && active >= 0 ? idRef.current + '-' + active : undefined,
        onClick: function () { open ? hide(false) : show(); }, onKeyDown: onKey },
        cur && cur.icon && Icons[cur.icon] ? h(Icons[cur.icon], { className: 'wp-select-icon' }) : null,
        h('span', { className: cx('wp-select-value', !cur && 'wp-select-placeholder') }, cur ? cur.label : (p.placeholder || 'Selecionar')),
        h(Icons.chevron, { className: 'wp-select-chev' })),
      open && pos ? portal(h('div', { ref: list, id: idRef.current, role: 'listbox', 'aria-label': p['aria-label'], className: cx('wp-select-list', pos.up && 'wp-select-up'),
        style: { left: pos.left, top: pos.top != null ? pos.top : undefined, bottom: pos.bottom != null ? pos.bottom : undefined, minWidth: pos.width, maxHeight: Math.min(300, pos.maxH) } },
        opts.map(function (o, i) {
          if (o.divider) return h('div', { key: 'd' + i, className: 'wp-menu-sep', role: 'separator' });
          if (o.header) return h('div', { key: 'h' + i, className: 'wp-menu-head', role: 'presentation' }, o.header);
          ci++; var idx = ci, sel = o.value === value;
          return h('div', { key: o.value, id: idRef.current + '-' + idx, 'data-idx': idx, role: 'option', 'aria-selected': sel, 'aria-disabled': o.disabled || undefined,
            className: cx('wp-select-opt', sel && 'wp-select-opt-on', idx === active && 'wp-select-opt-active', o.disabled && 'wp-select-opt-off'),
            onMouseMove: function () { if (active !== idx) setActive(idx); }, onMouseDown: function (e) { e.preventDefault(); }, onClick: function () { pick(o); } },
            o.icon && Icons[o.icon] ? h(Icons[o.icon], { className: 'wp-select-opt-icon' }) : null,
            h('span', { className: 'wp-select-opt-text' }, h('span', { className: 'wp-select-opt-label' }, o.label), o.description ? h('span', { className: 'wp-select-opt-desc' }, o.description) : null),
            o.hint ? h('span', { className: 'wp-kbd' }, o.hint) : null,
            h('span', { className: 'wp-select-check', 'aria-hidden': true }, sel ? h(Icons.check) : null));
        }))) : null);
  }
  /* floating lists render at <body> so a transformed or clipped ancestor (modal, panel) never cuts them */
  function portal(el) { var RD = window.ReactDOM; return RD && RD.createPortal && typeof document !== 'undefined' ? RD.createPortal(el, document.body) : el; }

  /* ---------------- ContainersView (Docker) ---------------- */
  var CT_STATUS = {
    running: { label: 'Rodando', tone: 'ok' }, restarting: { label: 'Reiniciando', tone: 'warn' }, unhealthy: { label: 'Unhealthy', tone: 'bad' },
    exited: { label: 'Parado', tone: 'off' }, paused: { label: 'Pausado', tone: 'muted' }, created: { label: 'Criado', tone: 'off' }
  };
  var isUp = function (c) { return c.status === 'running' || c.status === 'restarting' || c.status === 'unhealthy'; };
  function Spark(p) {
    var d = p.data || []; if (d.length < 2) return null;
    var w = 56, hh = 18, max = Math.max(10, Math.max.apply(null, d));
    var pts = d.map(function (v, i) { return [(i / (d.length - 1)) * w, hh - 1 - (v / max) * (hh - 3)]; });
    var line = pts.map(function (pt, i) { return (i ? 'L' : 'M') + pt[0].toFixed(1) + ' ' + pt[1].toFixed(1); }).join(' ');
    return h('svg', { className: 'wp-spark', viewBox: '0 0 ' + w + ' ' + hh, width: w, height: hh, 'aria-hidden': true },
      h('path', { className: 'wp-spark-area', d: line + ' L' + w + ' ' + hh + ' L0 ' + hh + ' Z' }),
      h('path', { className: 'wp-spark-line', d: line }));
  }
  function Meter(p) {
    var v = Math.max(0, Math.min(100, p.value || 0));
    return h('span', { className: cx('wp-meter', v >= 85 && 'wp-meter-hot'), 'aria-hidden': true }, h('i', { style: { width: v + '%' } }));
  }
  function CtDot(p) { var s = CT_STATUS[p.status] || CT_STATUS.created; return h('span', { className: 'wp-ct-dot wp-ct-' + s.tone, role: 'img', 'aria-label': s.label }); }
  function CtAction(p) {
    return h('button', { className: cx('wp-ct-act', p.danger && 'wp-ct-act-danger'), 'aria-label': p.label, title: p.label, onClick: function (e) { e.stopPropagation(); p.onClick && p.onClick(); } }, h(Icons[p.icon]));
  }
  function ContainersView(p) {
    var projects = p.projects || [];
    var fs = React.useState('all'), filter = fs[0], setFilter = fs[1];
    var qs = React.useState(''), q = qs[0], setQ = qs[1];
    var cs = React.useState({}), closed = cs[0], setClosed = cs[1];
    var sel = useCtl(p.selectedId, null, p.onSelect), selected = sel[0], setSelected = sel[1];
    var ts = React.useState('logs'), tab = ts[0], setTab = ts[1];
    var all = []; projects.forEach(function (g) { (g.containers || []).forEach(function (c) { all.push(c); }); });
    var running = all.filter(isUp).length, stopped = all.length - running;
    var unhealthy = all.filter(function (c) { return c.status === 'unhealthy'; }).length;
    var cpu = all.reduce(function (a, c) { return a + (isUp(c) ? c.cpu || 0 : 0); }, 0);
    var act = function (a, id) { p.onAction && p.onAction(a, id); };
    var match = function (c) {
      if (filter === 'running' && !isUp(c)) return false;
      if (filter === 'stopped' && isUp(c)) return false;
      if (!q) return true;
      var s = (c.name + ' ' + c.image + ' ' + (c.ports || []).map(function (x) { return x.host; }).join(' ')).toLowerCase();
      return s.indexOf(q.toLowerCase()) >= 0;
    };
    var current = all.filter(function (c) { return c.id === selected; })[0];
    var seg = function (id, label, n) { return h('button', { key: id, role: 'radio', 'aria-checked': filter === id, className: cx('wp-ct-seg-item', filter === id && 'wp-ct-seg-on'), onClick: function () { setFilter(id); } }, label, h('span', { className: 'wp-ct-seg-n' }, n)); };
    var row = function (c) {
      var st = CT_STATUS[c.status] || CT_STATUS.created, up = isUp(c);
      return h('div', { key: c.id, role: 'row', tabIndex: 0, 'aria-selected': c.id === selected, className: cx('wp-ct-row', c.id === selected && 'wp-ct-row-on', !up && 'wp-ct-row-off'),
        onClick: function () { setSelected(c.id === selected ? null : c.id); },
        onKeyDown: function (e) { if (e.key === 'Enter') setSelected(c.id); } },
        h('div', { className: 'wp-ct-c-name', role: 'cell' }, h(CtDot, { status: c.status }),
          h('div', { className: 'wp-ct-name-text' }, h('span', { className: 'wp-ct-name' }, c.name), h('span', { className: 'wp-ct-id' }, c.id.slice(0, 12)))),
        h('div', { className: 'wp-ct-c-image', role: 'cell', title: c.image }, c.image),
        h('div', { className: 'wp-ct-c-ports', role: 'cell' }, (c.ports || []).length ? c.ports.map(function (x) {
          return h('a', { key: x.host + x.container, className: 'wp-ct-port', href: x.web ? 'http://localhost:' + x.host : undefined, onClick: function (e) { e.stopPropagation(); if (x.web) { e.preventDefault(); act('open-port', c.id); } }, title: x.web ? 'Abrir localhost:' + x.host : 'localhost:' + x.host + ' → ' + x.container },
            x.host, h('span', null, '→' + x.container), x.web ? h(Icons.external) : null);
        }) : h('span', { className: 'wp-ct-none' }, '—')),
        h('div', { className: 'wp-ct-c-cpu', role: 'cell' }, up ? [h('span', { key: 'n', className: 'wp-ct-num' }, (c.cpu || 0).toFixed(1) + '%'), h(Spark, { key: 's', data: c.cpuHistory })] : h('span', { className: 'wp-ct-none' }, '—')),
        h('div', { className: 'wp-ct-c-mem', role: 'cell' }, up ? [h('span', { key: 'n', className: 'wp-ct-num' }, c.mem), h(Meter, { key: 'm', value: c.memPct })] : h('span', { className: 'wp-ct-none' }, '—')),
        h('div', { className: 'wp-ct-c-status', role: 'cell' }, h('span', { className: 'wp-ct-pill wp-ct-' + st.tone }, st.label), h('span', { className: 'wp-ct-uptime' }, c.uptime)),
        h('div', { className: 'wp-ct-c-actions', role: 'cell' },
          h(CtAction, { icon: 'logs', label: 'Logs', onClick: function () { setSelected(c.id); setTab('logs'); } }),
          up ? h(CtAction, { icon: 'terminal', label: 'Abrir terminal no container', onClick: function () { act('exec', c.id); } }) : null,
          h(CtAction, { icon: 'restart', label: 'Reiniciar', onClick: function () { act('restart', c.id); } }),
          up ? h(CtAction, { icon: 'stop', label: 'Parar', danger: true, onClick: function () { act('stop', c.id); } }) : h(CtAction, { icon: 'play', label: 'Iniciar', onClick: function () { act('start', c.id); } })));
    };
    return h('section', { className: cx('wp-ct', current && 'wp-ct-has-detail', p.className), 'aria-label': 'Containers do Docker' },
      h('header', { className: 'wp-ct-head' },
        h('div', { className: 'wp-ct-title' },
          h('span', { className: 'wp-ct-title-icon' }, h(Icons.box)),
          h('div', null, h('h2', null, 'Containers'), h('div', { className: 'wp-ct-context' }, h(CtDot, { status: p.engineUp === false ? 'exited' : 'running' }), 'Docker · ', h('code', null, p.context || 'desktop-linux'), p.version ? ' · v' + p.version : ''))),
        h('div', { className: 'wp-ct-head-tools' },
          h(Input, { icon: 'search', placeholder: 'Filtrar por nome, imagem ou porta', value: q, onChange: function (e) { setQ(e.target.value); } }),
          h('div', { className: 'wp-ct-seg', role: 'radiogroup', 'aria-label': 'Filtro' }, seg('all', 'Todos', all.length), seg('running', 'Rodando', running), seg('stopped', 'Parados', stopped)),
          h(Button, { variant: 'ghost', icon: 'restart', 'aria-label': 'Atualizar', title: 'Atualizar (⌘R)', onClick: p.onRefresh }),
          h(Button, { variant: 'primary', icon: 'play', onClick: p.onComposeUp }, 'Compose up'))),
      h('div', { className: 'wp-ct-stats' },
        h('div', { className: 'wp-ct-stat' }, h('span', { className: 'wp-ct-stat-label' }, h(CtDot, { status: 'running' }), 'Rodando'), h('span', { className: 'wp-ct-stat-val' }, running, h('small', null, ' de ' + all.length))),
        h('div', { className: cx('wp-ct-stat', unhealthy && 'wp-ct-stat-bad') }, h('span', { className: 'wp-ct-stat-label' }, h(CtDot, { status: unhealthy ? 'unhealthy' : 'exited' }), 'Com problema'), h('span', { className: 'wp-ct-stat-val' }, unhealthy, h('small', null, unhealthy === 1 ? ' unhealthy' : ' unhealthy'))),
        h('div', { className: 'wp-ct-stat' }, h('span', { className: 'wp-ct-stat-label' }, 'CPU'), h('span', { className: 'wp-ct-stat-val' }, cpu.toFixed(1), h('small', null, '%')), h(Meter, { value: Math.min(100, cpu) })),
        h('div', { className: 'wp-ct-stat' }, h('span', { className: 'wp-ct-stat-label' }, 'Memória'), h('span', { className: 'wp-ct-stat-val' }, p.memUsed || '—', h('small', null, p.memTotal ? ' / ' + p.memTotal : '')), h(Meter, { value: p.memPct }))),
      h('div', { className: 'wp-ct-main' },
        h('div', { className: 'wp-ct-list', role: 'table', 'aria-label': 'Containers' },
          h('div', { className: 'wp-ct-row wp-ct-thead', role: 'row' }, ['Nome', 'Imagem', 'Portas', 'CPU', 'Memória', 'Status', ''].map(function (t, i) { return h('div', { key: i, role: 'columnheader', className: 'wp-ct-c-' + ['name', 'image', 'ports', 'cpu', 'mem', 'status', 'actions'][i] }, t); })),
          projects.map(function (g) {
            var list = (g.containers || []).filter(match); if (!list.length) return null;
            var gc = g.containers || [], open = !closed[g.id];
            var cnt = { ok: 0, bad: 0, warn: 0, off: 0 };
            gc.forEach(function (c) { var t = (CT_STATUS[c.status] || CT_STATUS.created).tone; cnt[t === 'muted' ? 'off' : t] += 1; });
            var health = cnt.bad ? 'bad' : cnt.warn ? 'warn' : cnt.ok === gc.length ? 'ok' : cnt.ok ? 'part' : 'off';
            var chip = function (k, n, label) { return n ? h('span', { key: k, className: 'wp-ct-gchip wp-ct-gchip-' + k }, h('i'), n + ' ' + label) : null; };
            return h('div', { key: g.id, className: cx('wp-ct-group', 'wp-ct-group-' + health, !open && 'wp-ct-group-closed'), role: 'rowgroup' },
              h('div', { className: 'wp-ct-ghead', role: 'row' },
                h('button', { className: 'wp-ct-gtoggle', 'aria-expanded': open, onClick: function () { var n = Object.assign({}, closed); n[g.id] = open; setClosed(n); } },
                  h(Icons.chevron, { className: cx('wp-ct-gchev', open && 'open') }),
                  h('span', { className: 'wp-ct-gicon' }, h(FileIcon, { name: 'docker-compose.yml', size: 16 })),
                  h('span', { className: 'wp-ct-gtext' },
                    h('span', { className: 'wp-ct-gname' }, g.name, h('span', { className: 'wp-ct-gtotal' }, gc.length + (gc.length > 1 ? ' containers' : ' container'))),
                    g.path ? h('span', { className: 'wp-ct-gpath', title: g.path }, g.path) : null)),
                h('div', { className: 'wp-ct-gsum', 'aria-label': 'Resumo do grupo' },
                  chip('ok', cnt.ok, 'rodando'), chip('bad', cnt.bad, 'com problema'), chip('warn', cnt.warn, cnt.warn > 1 ? 'reiniciando' : 'reiniciando'), chip('off', cnt.off, cnt.off > 1 ? 'parados' : 'parado')),
                h('div', { className: 'wp-ct-gactions' },
                  h(CtAction, { icon: 'play', label: 'Subir todos (compose up)', onClick: function () { p.onGroupAction && p.onGroupAction('up', g.id); } }),
                  h(CtAction, { icon: 'restart', label: 'Reiniciar todos', onClick: function () { p.onGroupAction && p.onGroupAction('restart', g.id); } }),
                  h(CtAction, { icon: 'stop', label: 'Parar todos (compose stop)', danger: true, onClick: function () { p.onGroupAction && p.onGroupAction('stop', g.id); } }))),
              open ? h('div', { className: 'wp-ct-grows' }, list.map(row)) : null);
          }),
          all.filter(match).length ? null : h('div', { className: 'wp-ct-empty' }, all.length ? 'Nenhum container com esse filtro' : 'Nenhum container. Rode "Compose up" num workspace com docker-compose.yml.')),
        current ? h('aside', { className: 'wp-ct-detail', key: current.id, 'aria-label': 'Detalhes de ' + current.name },
          h('div', { className: 'wp-ct-dhead' },
            h(CtDot, { status: current.status }),
            h('div', { className: 'wp-ct-dtitle' }, h('span', { className: 'wp-ct-name' }, current.name), h('span', { className: 'wp-ct-id' }, current.image)),
            h('button', { className: 'wp-x', style: { opacity: 1 }, 'aria-label': 'Fechar detalhes', onClick: function () { setSelected(null); } }, h(Icons.close))),
          current.status === 'unhealthy' || current.status === 'restarting' ? h('div', { className: 'wp-ct-alert wp-neon' },
            h('div', { className: 'wp-ct-alert-text' }, h(Icons.alert), h('span', null, current.healthNote || (current.status === 'restarting' ? 'Reiniciando em loop' : 'Health check falhando'))),
            p.onAskClaude ? h(Button, { size: 'sm', variant: 'primary', icon: 'spark', onClick: function () { p.onAskClaude(current.id); } }, 'Investigar com o Claude') : null) : null,
          h('div', { className: 'wp-ct-dactions' },
            isUp(current) ? h(Button, { size: 'sm', variant: 'secondary', icon: 'terminal', onClick: function () { act('exec', current.id); } }, 'Terminal') : null,
            h(Button, { size: 'sm', variant: 'secondary', icon: 'restart', onClick: function () { act('restart', current.id); } }, 'Reiniciar'),
            isUp(current) ? h(Button, { size: 'sm', variant: 'ghost', icon: 'stop', onClick: function () { act('stop', current.id); } }, 'Parar') : h(Button, { size: 'sm', variant: 'ghost', icon: 'play', onClick: function () { act('start', current.id); } }, 'Iniciar')),
          h('div', { className: 'wp-ct-tabs', role: 'tablist' }, [['logs', 'Logs'], ['details', 'Detalhes']].map(function (t) {
            return h('button', { key: t[0], role: 'tab', 'aria-selected': tab === t[0], className: cx('wp-ct-tab', tab === t[0] && 'wp-ct-tab-on'), onClick: function () { setTab(t[0]); } }, t[1]);
          })),
          tab === 'logs' ? h('div', { className: 'wp-ct-logs', role: 'log', key: 'l' + current.id }, (p.logs && p.logs[current.id] || []).map(function (l, i) {
            return h('div', { key: i, className: 'wp-ct-log wp-ct-log-' + (l.level || 'info') }, h('span', { className: 'wp-ct-log-t' }, l.time), h('span', { className: 'wp-ct-log-m' }, l.text));
          })) : h('dl', { className: 'wp-ct-dl' },
            [['ID', current.id.slice(0, 12)], ['Imagem', current.image], ['Comando', current.command || '—'], ['Criado', current.created || '—'], ['Rede', current.network || '—'], ['Volumes', (current.mounts || []).join('\n') || '—'],
             ['Portas', (current.ports || []).map(function (x) { return x.host + ' → ' + x.container; }).join('\n') || '—'], ['Variáveis', current.envCount != null ? current.envCount + ' definidas' : '—']].map(function (r) {
              return h(React.Fragment, { key: r[0] }, h('dt', null, r[0]), h('dd', null, r[1]));
            }))) : null));
  }

  window.Walph = Object.assign(window.Walph || {}, {
    WorkspaceBar: WorkspaceBar, WorkspaceTab: WorkspaceTab, Toast: Toast, Button: Button,
    Input: Input, EditorTab: EditorTab, TreeItem: TreeItem, CommandPalette: CommandPalette,
    Terminal: Terminal, ClaudePanel: ClaudePanel, Code: Code, Welcome: Welcome, NeonCard: NeonCard, Sidebar: Sidebar, Modal: Modal, SettingRow: SettingRow, Switch: Switch, Select: Select, Menu: Menu, ContainersView: ContainersView, EditorTabs: EditorTabs, ClaudeQuestion: ClaudeQuestion, StatusBar: StatusBar, Logo: Logo, FileIcon: FileIcon, fileIconFor: fileIconFor, fileIcons: FILE_ICON_DATA, StatusDot: StatusDot, Icons: Icons
  });
})();
