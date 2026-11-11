// The Walph mark (design system, Logo component): two overlapping Vs forming a W (the front one in `accent-3` →
// `accent`, the back one in `accent` → `accent-2`, separated by a gap) and the word "walph" in curves. Geometry
// copied from the design system; never animate, recolor or separate the Vs.
import { useId } from 'react'

export const V1 = 'M5.00 14H14.20L23.00 31.60L29.30 19H38.50L23.00 50Z'
export const V2 = 'M27.70 23.4H36.90L41.00 31.60L49.80 14H59.00L41.00 50Z'
const WORDMARK =
  'M22 -534H153L256 -145L364 -534H475L583 -145L687 -534H818L657 0H525L419 -358L314 0H182Z M860.0 -134Q860.0 -202 902.5 -241.5Q945.0 -281 1034.0 -298L1211.0 -333Q1211.0 -389 1185.0 -418.0Q1159.0 -447 1109.0 -447Q1018.0 -447 1000.0 -364L869.0 -370Q885.0 -454 947.0 -500.0Q1009.0 -546 1109.0 -546Q1222.0 -546 1280.5 -488.5Q1339.0 -431 1339.0 -324V-130Q1339.0 -109 1346.0 -101.0Q1353.0 -93 1369.0 -93H1386.0V0Q1370.0 4 1340.0 4Q1293.0 4 1264.5 -16.0Q1236.0 -36 1228.0 -83Q1208.0 -40 1159.5 -14.0Q1111.0 12 1046.0 12Q961.0 12 910.5 -26.5Q860.0 -65 860.0 -134ZM1211.0 -216V-246L1073.0 -218Q1031.0 -210 1012.0 -192.0Q993.0 -174 993.0 -146Q993.0 -115 1013.5 -98.0Q1034.0 -81 1072.0 -81Q1135.0 -81 1173.0 -118.0Q1211.0 -155 1211.0 -216Z M1467.0 -126 1468.0 -710H1596.0V-139Q1596.0 -99 1636.0 -99H1675.0V0H1596.0Q1534.0 0 1500.5 -30.5Q1467.0 -61 1467.0 -126Z M1761.0 -534H1884.0L1886.0 -455Q1909.0 -499 1951.0 -522.5Q1993.0 -546 2046.0 -546Q2119.0 -546 2170.5 -509.0Q2222.0 -472 2247.5 -409.0Q2273.0 -346 2273.0 -267Q2273.0 -188 2247.0 -125.0Q2221.0 -62 2170.0 -25.0Q2119.0 12 2045.0 12Q1994.0 12 1952.5 -11.0Q1911.0 -34 1889.0 -73V150H1761.0ZM2140.0 -267Q2140.0 -349 2107.0 -395.5Q2074.0 -442 2015.0 -442Q1955.0 -442 1922.0 -397.5Q1889.0 -353 1889.0 -267Q1889.0 -181 1922.0 -136.5Q1955.0 -92 2015.0 -92Q2074.0 -92 2107.0 -138.5Q2140.0 -185 2140.0 -267Z M2364.0 -710H2492.0V-462Q2512.0 -504 2552.0 -525.0Q2592.0 -546 2644.0 -546Q2730.0 -546 2777.5 -490.5Q2825.0 -435 2825.0 -343V0H2697.0V-312Q2697.0 -378 2674.5 -410.0Q2652.0 -442 2606.0 -442Q2553.0 -442 2522.5 -407.5Q2492.0 -373 2492.0 -309V0H2364.0Z'
const FULL_VIEWBOX = [0, 0, 190.44, 46.34] as const
const SYMBOL_VIEWBOX = [5, 14, 54, 36] as const

function Symbol({ id }: { id: string }) {
  return (
    <>
      <linearGradient id={`${id}a`} x1="0" y1="14" x2="0" y2="50" gradientUnits="userSpaceOnUse">
        <stop offset="0" className="logo-front-1" />
        <stop offset="1" className="logo-front-2" />
      </linearGradient>
      <linearGradient id={`${id}b`} x1="0" y1="14" x2="0" y2="50" gradientUnits="userSpaceOnUse">
        <stop offset="0" className="logo-back-1" />
        <stop offset="1" className="logo-back-2" />
      </linearGradient>
      {/* the gap between the Vs: the front one, thickened, cuts out the back one */}
      <mask id={`${id}k`} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
        <rect width="64" height="64" fill="#fff" />
        <path d={V1} fill="#000" stroke="#000" strokeWidth={2.2} strokeLinejoin="round" />
      </mask>
      <path d={V2} fill={`url(#${id}b)`} mask={`url(#${id}k)`} />
      <path d={V1} fill={`url(#${id}a)`} />
    </>
  )
}

/** Full logo (symbol + "walph") or the symbol only; `size` is the height in px. */
export function Logo({ variant = 'full', size = 28 }: { variant?: 'full' | 'symbol'; size?: number }) {
  const id = `logo-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}-`
  const full = variant === 'full'
  const vb = full ? FULL_VIEWBOX : SYMBOL_VIEWBOX
  return (
    <svg
      className="logo"
      viewBox={vb.join(' ')}
      width={(size * vb[2]) / vb[3]}
      height={size}
      role="img"
      aria-label="Walph"
    >
      {full ? (
        <>
          <g transform="translate(-5.556 -15.556) scale(1.1111)">
            <Symbol id={id} />
          </g>
          <path className="logo-word" transform="translate(71.070 40.000) scale(0.04225)" d={WORDMARK} />
        </>
      ) : (
        <Symbol id={id} />
      )}
    </svg>
  )
}
