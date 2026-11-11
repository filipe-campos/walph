// What the preview sanitizer lets through from the KaTeX HTML (`output: 'html'`): known classes and numeric `style`.
// The untrusted document cannot forge app classes, so outside `.katex` none of this applies.
const KATEX_CLASSES: ReadonlySet<string> = new Set(
  (
    'accent accent-body accent-full amsrm angl anglpad arraycolsep base boldsymbol boxpad brace-center brace-left ' +
    'brace-right cancel-lap cancel-pad cd-arrow-pad cd-label-left cd-label-right cd-vert-arrow clap col-align-c ' +
    'col-align-l col-align-r com delim-size1 delim-size4 delimcenter delimsizing eqn-num fbox fcolorbox fleqn ' +
    'fontsize-ensurer frac-line halfarrow-left halfarrow-right hide-tail large-op leqno llap mainrm mathbb mathbf ' +
    'mathboldfrak mathboldsf mathcal mathfrak mathit mathitsf mathnormal mathrm mathscr mathsf mathsfit mathtt ' +
    'mfrac mml-eqn-num mover mspace msupsub mtable mtr-glue mult munder nulldelimiter op-limits op-symbol ' +
    'overline-line pstrut reflectbox rlap small-op sqrt textbb textbf textboldfrak textboldsf textfrak textit ' +
    'textitsf textrm textscr textsf texttt underline-line vertical-separator vlist vlist-r vlist-s vlist-t ' +
    'vlist-t2 x-arrow x-arrow-pad mord mop mbin mrel mopen mclose mpunct minner mtight mathdefault mathsfit ' +
    'overline underline stretchy svg-align text'
  ).split(' ')
)

const KATEX_PREFIXED = /^(katex(-[a-z]+)?|reset-size\d+|size\d+)$/

/** Class that KaTeX generates (used inside `.katex`). */
export function isKatexClass(name: string): boolean {
  return KATEX_CLASSES.has(name) || KATEX_PREFIXED.test(name)
}

const STYLE_PROPS =
  'height|width|min-width|top|bottom|left|right|margin-left|margin-right|margin-top|margin-bottom|vertical-align|' +
  'border-bottom-width|border-top-width|border-right-width|border-left-width|padding-left|padding-right|' +
  'padding-top|padding-bottom|font-size'
const STYLE = new RegExp(`^(?:\\s*(?:${STYLE_PROPS})\\s*:\\s*-?\\d*\\.?\\d+(?:em|px|%)?\\s*;?)+\\s*$`)

/** KaTeX `style`: only numeric measures of the properties it uses (no `url()`, `position` or colors). */
export function isKatexStyle(value: string): boolean {
  return STYLE.test(value)
}
