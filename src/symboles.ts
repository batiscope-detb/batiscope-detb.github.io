/** Bibliothèque des symboles et outils d'annotation de plan (validée le 11/11/2026). */
import brut from './data/symboles_plan.json'

export type Geometrie = 'symbole' | 'point' | 'segment' | 'rectangle' | 'libre'
export interface Famille { id: string; nom: string; couleur: string }
export interface Symbole {
  id: string; famille: string; nom: string; usage: string; parametre: string | null; defaut: string | null
  valeurDansSymbole: boolean; orientable: boolean; geometrie: Geometrie; svg: string
}

const doc = brut as unknown as { version: string; tailles: Record<'s' | 'm' | 'l', number>; familles: Famille[]; symboles: Symbole[] }
export const VERSION_SYMBOLES = doc.version
export const FAMILLES = doc.familles
export const SYMBOLES = doc.symboles
export const TAILLES = doc.tailles
export const symboleParId = new Map(SYMBOLES.map((s) => [s.id, s]))
export const famille = (id: string) => FAMILLES.find((f) => f.id === id)

const echapper = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

/** Contenu SVG (repère 48 × 48) du symbole, avec sa valeur insérée si besoin. */
export function svgSymbole(s: Symbole, valeur: string | null): string {
  const v = (valeur ?? s.defaut ?? '').trim().slice(0, 4)
  return s.svg.replace(/\{\{valeur\}\}/g, echapper(v))
}

/** Largeur réglementaire correspondant à un nombre d'unités de passage. */
export function largeurUP(n: number): string | null {
  if (!Number.isFinite(n) || n < 1 || n > 30) return null
  const m = n === 1 ? 0.9 : n === 2 ? 1.4 : n * 0.6
  return `${m.toFixed(2).replace('.', ',')} m`
}

/** Libellé affiché sous un symbole posé (la valeur, sauf si elle est déjà dans le dessin). */
export function legendeSymbole(s: Symbole, valeur: string | null): string | null {
  if (s.id === 'up') { const n = Number((valeur ?? s.defaut ?? '').replace(',', '.')); return largeurUP(n) }
  if (s.valeurDansSymbole) return null
  return valeur?.trim() || null
}

export const COULEURS_ANNOTATION = ['#2E2B57', '#1B7F3B', '#C8102E', '#1F5FA8', '#C76A00', '#1B1B3D']
