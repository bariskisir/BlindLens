/** Renders the source SVG to deterministic PNG and Windows ICO application assets. */

import { readFile, writeFile } from 'node:fs/promises'
import { Resvg } from '@resvg/resvg-js'
import pngToIco from 'png-to-ico'

const source = await readFile(new URL('../build/icon.svg', import.meta.url), 'utf8')
const renderings = [256, 128, 64, 48, 32, 16].map((width) =>
  new Resvg(source, { fitTo: { mode: 'width', value: width } }).render().asPng(),
)
await writeFile(new URL('../build/icon.png', import.meta.url), new Resvg(source).render().asPng())
await writeFile(new URL('../build/icon.ico', import.meta.url), await pngToIco(renderings))
