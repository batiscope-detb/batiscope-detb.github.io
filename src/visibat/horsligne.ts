/**
 * Visibat hors ligne.
 * - Chaque lecture réussie est copiée sur l'appareil (IndexedDB) ; sans réseau, on relit cette copie.
 * - Chaque écriture part directement au serveur quand c'est possible ; sinon elle rejoint une file d'attente,
 *   rejouée dans l'ordre dès que le réseau revient. Les écritures en attente sont superposées aux lectures,
 *   si bien que l'écran montre toujours l'état local le plus récent.
 * - Les plans et photos sont copiés sur l'appareil pour s'afficher (et partir dans le PDF) sans réseau.
 */
import { supabase } from '../donnees'

export type Genre = 'enregistrer' | 'modifier' | 'supprimer' | 'fichier'
export interface Entree {
  seq?: number; genre: Genre; le: string
  table?: string; id?: string; ligne?: Record<string, unknown>
  bucket?: string; chemin?: string; type?: string
  erreur?: string
}

// --- IndexedDB ---------------------------------------------------------------------------------
let bd: Promise<IDBDatabase | null> | null = null
function base(): Promise<IDBDatabase | null> {
  bd ??= new Promise((ok) => {
    try {
      const r = indexedDB.open('visibat-horsligne', 1)
      r.onupgradeneeded = () => {
        const d = r.result
        d.createObjectStore('cache')
        d.createObjectStore('file', { keyPath: 'seq', autoIncrement: true })
        d.createObjectStore('fichiers')
      }
      r.onsuccess = () => ok(r.result)
      r.onerror = () => ok(null)
    } catch { ok(null) }
  })
  return bd
}
async function req<T>(magasin: string, mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  const d = await base()
  if (!d) return undefined
  return new Promise((ok, ko) => {
    const r = f(d.transaction(magasin, mode).objectStore(magasin))
    r.onsuccess = () => ok(r.result as T)
    r.onerror = () => ko(r.error)
  })
}
const lireCle = <T>(m: string, k: string) => req<T>(m, 'readonly', (s) => s.get(k))
const poser = (m: string, k: string, v: unknown) => req(m, 'readwrite', (s) => s.put(v, k)).catch(() => undefined)

// --- État (pour l'indicateur à l'écran) ------------------------------------------------------------
export interface Etat { enLigne: boolean; attente: number; erreurs: Entree[]; enCours: boolean }
let etat: Etat = { enLigne: typeof navigator === 'undefined' ? true : navigator.onLine, attente: 0, erreurs: [], enCours: false }
const abonnes = new Set<(e: Etat) => void>()
export const etatSynchro = () => etat
export function abonner(f: (e: Etat) => void) { abonnes.add(f); return () => { abonnes.delete(f) } }
function publier(m: Partial<Etat>) { etat = { ...etat, ...m }; abonnes.forEach((f) => f(etat)) }
const apresSynchro = new Set<() => void>()
/** Prévenu quand des écritures en attente viennent d'arriver au serveur. */
export function quandSynchronise(f: () => void) { apresSynchro.add(f); return () => { apresSynchro.delete(f) } }

/** Erreur due au réseau (et non refus du serveur) ? */
export function estReseau(e: unknown) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const m = e instanceof Error ? e.message : String(e)
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed|err_internet|err_network/i.test(m)
}

// --- File d'attente --------------------------------------------------------------------------------
export const lireFile = async () => (await req<Entree[]>('file', 'readonly', (s) => s.getAll()).catch(() => undefined)) ?? []
async function rafraichirCompteur() {
  const f = await lireFile()
  publier({ attente: f.length, erreurs: f.filter((e) => e.erreur) })
}

/** Écrit tout de suite si possible ; sinon (ou s'il reste des écritures en attente, pour garder l'ordre) met en file. */
export async function ecrireOuDiffere<T>(e: Omit<Entree, 'le'>, direct: () => Promise<T>): Promise<T | undefined> {
  const d = await base()
  if (!d) return direct()
  if (navigator.onLine && (await lireFile()).length === 0) {
    try { const r = await direct(); publier({ enLigne: true }); return r } catch (err) { if (!estReseau(err)) throw err }
  }
  await req('file', 'readwrite', (s) => s.add({ ...e, le: new Date().toISOString() }))
  publier({ enLigne: navigator.onLine && etat.enLigne })
  await rafraichirCompteur()
  planifier(500)
  return undefined
}

/**
 * Insertion ou mise à jour. Une ligne existante peut être enregistrée avec seulement les champs modifiés :
 * Postgres contrôle alors les champs obligatoires avant de constater que la ligne existe (erreur 23502) ;
 * dans ce cas, simple mise à jour de la ligne.
 */
export async function upsertOuMaj(table: string, ligne: Record<string, unknown>, rendre = false): Promise<Record<string, unknown> | null> {
  const vb = supabase.schema('visibat')
  const r = rendre ? await vb.from(table).upsert(ligne).select().single() : await vb.from(table).upsert(ligne)
  if (!r.error) return (r.data as Record<string, unknown> | null) ?? null
  if (r.error.code !== '23502' || !ligne.id) throw new Error(r.error.message)
  const { id, ...champs } = ligne
  const m = await vb.from(table).update(champs).eq('id', id as string).select()
  if (m.error) throw new Error(m.error.message)
  if (!m.data?.length) throw new Error(r.error.message)
  return m.data[0] as Record<string, unknown>
}

async function rejouer(e: Entree) {
  const vb = supabase.schema('visibat')
  if (e.genre === 'fichier') {
    const blob = await lireCle<Blob>('fichiers', `${e.bucket}:${e.chemin}`)
    if (!blob) return // fichier perdu localement : on n'insiste pas
    const { error } = await supabase.storage.from(e.bucket!).upload(e.chemin!, blob, { contentType: e.type, upsert: true })
    if (error) throw new Error(error.message)
    return
  }
  if (e.genre === 'enregistrer') { await upsertOuMaj(e.table!, e.ligne!); return }
  const { error } = await vb.from(e.table!).update(e.ligne!).eq('id', e.id!)
  if (error) throw new Error(error.message)
}

let enCours = false
let minuterie: ReturnType<typeof setTimeout> | null = null
function planifier(delai: number) {
  if (minuterie) clearTimeout(minuterie)
  minuterie = setTimeout(() => { minuterie = null; void synchroniser() }, delai)
}

/** Envoie au serveur les écritures en attente, dans l'ordre. */
export async function synchroniser() {
  if (enCours || !navigator.onLine) return
  enCours = true
  publier({ enCours: true })
  const essayees = new Set<number>()
  let envoyees = 0
  try {
    for (;;) {
      const e = (await lireFile()).find((x) => !essayees.has(x.seq!))
      if (!e) break
      essayees.add(e.seq!)
      try {
        await rejouer(e)
        await req('file', 'readwrite', (s) => s.delete(e.seq!))
        envoyees++
        publier({ enLigne: true })
      } catch (err) {
        if (estReseau(err)) { publier({ enLigne: false }); break }
        await req('file', 'readwrite', (s) => s.put({ ...e, erreur: (err as Error).message }))
      }
    }
  } finally {
    enCours = false
    publier({ enCours: false })
    await rafraichirCompteur()
    if (envoyees) apresSynchro.forEach((f) => f())
  }
}

/** Abandonne une écriture refusée par le serveur. */
export async function abandonner(seq: number) {
  await req('file', 'readwrite', (s) => s.delete(seq))
  await rafraichirCompteur()
}

/** À appeler une fois : relance la synchronisation au retour du réseau et périodiquement. */
let demarre = false
export function demarrerSynchro() {
  if (demarre) return
  demarre = true
  window.addEventListener('online', () => { publier({ enLigne: true }); planifier(1000) })
  window.addEventListener('offline', () => publier({ enLigne: false }))
  setInterval(() => { if (etat.attente) void synchroniser() }, 30000)
  navigator.storage?.persist?.().catch(() => undefined)
  void rafraichirCompteur().then(() => planifier(1500))
}

// --- Lectures --------------------------------------------------------------------------------------
/** Lit au serveur et garde une copie ; sans réseau, rend la dernière copie. */
export async function lireAvecCopie<T>(cle: string, f: () => Promise<T>): Promise<T> {
  try {
    const v = await f()
    void poser('cache', cle, v)
    return v
  } catch (e) {
    if (!estReseau(e)) throw e
    publier({ enLigne: false })
    const v = await lireCle<T>('cache', cle).catch(() => undefined)
    if (v === undefined) throw new Error('Hors connexion : ces données n\'ont pas encore été ouvertes sur cet appareil.')
    return v
  }
}

type Ligne = { id: string; supprime_le?: string | null } & Record<string, unknown>
/** Applique à une liste les écritures en attente sur cette table. */
export function superposer<T extends { id: string }>(file: Entree[], table: string, liste: T[], appartient: (l: Record<string, unknown>) => boolean = () => true): T[] {
  let res = liste as unknown as Ligne[]
  for (const e of file) {
    if (e.table !== table || e.genre === 'fichier') continue
    const id = (e.id ?? e.ligne?.id) as string
    const i = res.findIndex((x) => x.id === id)
    if (e.genre === 'supprimer') { if (i >= 0) res = res.filter((x) => x.id !== id); continue }
    if (i >= 0) { res = [...res]; res[i] = { ...res[i], ...e.ligne } as Ligne }
    else if (e.genre === 'enregistrer' && appartient(e.ligne!)) res = [...res, { ...(e.ligne as Ligne) }]
  }
  return res.filter((x) => !x.supprime_le) as unknown as T[]
}

// --- Fichiers ---------------------------------------------------------------------------------------
export const fichierLocal = (bucket: string, chemin: string) => lireCle<Blob>('fichiers', `${bucket}:${chemin}`).catch(() => undefined)
export const garderFichier = (bucket: string, chemin: string, b: Blob) => poser('fichiers', `${bucket}:${chemin}`, b)

/** Dépose un fichier : copie locale immédiate, envoi au serveur dès que possible. */
export async function deposer(bucket: string, chemin: string, contenu: Blob, type: string) {
  await garderFichier(bucket, chemin, contenu)
  await ecrireOuDiffere({ genre: 'fichier', bucket, chemin, type }, async () => {
    const { error } = await supabase.storage.from(bucket).upload(chemin, contenu, { contentType: type, upsert: true })
    if (error) throw new Error(`Envoi du fichier impossible : ${error.message}`)
  })
}

/** Copie sur l'appareil les fichiers qui n'y sont pas encore (adresses signées fournies). */
export async function copierFichiers(fichiers: { bucket: string; chemin: string; url: string }[]) {
  for (const f of fichiers) {
    if (await fichierLocal(f.bucket, f.chemin)) continue
    try {
      const r = await fetch(f.url)
      if (r.ok) await garderFichier(f.bucket, f.chemin, await r.blob())
    } catch { return } // réseau perdu : on reprendra plus tard
  }
}
