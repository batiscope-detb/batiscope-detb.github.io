import type { Statut } from './donnees'

/** Couleur pâle dérivée d'une couleur de statut (fond des étiquettes). */
export function pale(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const m = (c: number) => Math.round(c + (255 - c) * 0.86)
  return `rgb(${m((n >> 16) & 255)}, ${m((n >> 8) & 255)}, ${m(n & 255)})`
}
/** Couleur assombrie pour un texte sur fond pâle (contraste suffisant). */
export function fonce(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const m = (c: number) => Math.round(c * 0.72)
  return `rgb(${m((n >> 16) & 255)}, ${m((n >> 8) & 255)}, ${m(n & 255)})`
}

export function EtiquetteStatut({ statut }: { statut?: Statut }) {
  if (!statut) return null
  return <span className="etiquette" style={{ background: pale(statut.couleur), color: fonce(statut.couleur), fontWeight: 700 }}>{statut.libelle}</span>
}

export const dateFr = (iso: string | null | undefined) => iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('fr-FR') : ''
export const dateHeureFr = (iso: string | null | undefined) => iso
  ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
export const aujourdhui = () => new Date().toISOString().slice(0, 10)

/** Date ISO → valeur d'un <input type="datetime-local"> (heure locale), et retour. */
export function versSaisie(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
export const depuisSaisie = (v: string) => v ? new Date(v).toISOString() : null

/** Loupe Visibat : blanche sur le bandeau sombre, prune sur la page. */
export const Logo = ({ taille = 22, blanc = false }: { taille?: number; blanc?: boolean }) =>
  <img src={`${import.meta.env.BASE_URL}${blanc ? 'visibat-blanc' : 'visibat'}.svg`} alt="" width={taille} height={taille} style={{ verticalAlign: 'middle' }} />
