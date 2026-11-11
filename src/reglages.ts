/** Préférences d'affichage propres à ce poste (navigateur), comme les réglages de la tablette. */
export type Theme = 'systeme' | 'clair' | 'sombre'
export type Taille = 'normal' | 'grand' | 'tres-grand'

const lire = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d } catch { return d } }
const ecrire = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* stockage indisponible */ } }

export const reglages = {
  get theme() { return lire('detb-theme', 'systeme') as Theme },
  get taille() { return lire('detb-taille', 'normal') as Taille },
  get editionParDefaut() { return lire('detb-edition', '0') === '1' },
  definirTheme(t: Theme) { ecrire('detb-theme', t); appliquer() },
  definirTaille(t: Taille) { ecrire('detb-taille', t); appliquer() },
  definirEdition(v: boolean) { ecrire('detb-edition', v ? '1' : '0') },
}

export function appliquer() {
  const r = document.documentElement
  const t = reglages.theme
  if (t === 'systeme') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', t === 'sombre' ? 'dark' : 'light')
  const z = reglages.taille
  if (z === 'normal') r.removeAttribute('data-taille'); else r.setAttribute('data-taille', z)
}

/** Mot de passe provisoire lisible à dicter : deux mots, quatre chiffres, un signe (≥ 14 caractères). */
const MOTS = ['Rade', 'Digue', 'Phare', 'Granit', 'Hague', 'Bocage', 'Manche', 'Falaise', 'Ardoise', 'Marée', 'Brume', 'Goéland',
  'Chaume', 'Ressac', 'Embrun', 'Pommier', 'Lande', 'Havre', 'Quai', 'Balise', 'Cormoran', 'Varech', 'Ecume', 'Bourrasque']
export function motDePasseProvisoire(): string {
  const a = new Uint32Array(4); crypto.getRandomValues(a)
  const mot = (n: number) => MOTS[n % MOTS.length].normalize('NFD').replace(/[̀-ͯ]/g, '')
  return `${mot(a[0])}-${mot(a[1])}-${String(a[2] % 10000).padStart(4, '0')}${'!?#+'[a[3] % 4]}`
}
