/* global document, localStorage */
// Classic script loaded in the <head> before the CSS and the modules: applies the colors of the last configured theme
// (stored by `themes/cache.ts`) so the first paint already comes out in the right theme. No inline because of the CSP
// (`script-src 'self'`).
;(function () {
  try {
    var cached = JSON.parse(localStorage.getItem('walph.themeColors.v2') || 'null')
    if (!cached || typeof cached.colors !== 'object' || cached.colors === null) return
    var root = document.documentElement
    for (var token in cached.colors) {
      if (typeof cached.colors[token] === 'string') root.style.setProperty('--' + token, cached.colors[token])
    }
    if (cached.kind === 'dark' || cached.kind === 'light') root.style.colorScheme = cached.kind
  } catch {
    // no cache or unreadable: the default (dark) CSS holds until appearance.ts applies the theme
  }
})()
