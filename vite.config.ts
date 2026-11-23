import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, relative } from 'node:path'
import type { Plugin } from 'vite'

/** Écrit dans dist/sw.js la liste de tous les fichiers de la version, pour un fonctionnement complet hors ligne. */
function precache(): Plugin {
  let sortie = 'dist'
  return {
    name: 'precache-hors-ligne',
    apply: 'build',
    configResolved(c) { sortie = c.build.outDir },
    closeBundle() {
      const sw = join(sortie, 'sw.js')
      if (!existsSync(sw)) return
      const liste: string[] = []
      const parcourir = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) parcourir(p); else liste.push(relative(sortie, p).split('\\').join('/')) } }
      parcourir(sortie)
      const fichiers = ['./', ...liste.filter((f) => f !== 'sw.js' && !f.endsWith('.map')).map((f) => `./${f}`)]
      const empreinte = createHash('sha256').update(fichiers.join('|')).digest('hex').slice(0, 12)
      writeFileSync(sw, readFileSync(sw, 'utf8').replace('__VERSION_PRECACHE__', empreinte).replace('__LISTE_PRECACHE__', JSON.stringify(fichiers)))
    },
  }
}

const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version

export default defineConfig({
  base: '/',
  plugins: [react(), precache()],
  define: { __VERSION__: JSON.stringify(version) },
  build: { chunkSizeWarningLimit: 1500 },
})
