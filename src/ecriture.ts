/**
 * Écritures depuis le bureau, compatibles avec la synchronisation de la tablette :
 * - chaque ligne écrite porte maj_le (heure de la modification) ; le serveur renseigne maj_par
 *   et recu_le, et ignore une écriture plus ancienne que la version qu'il détient ;
 * - les suppressions sont « douces » (supprime_le), comme sur la tablette, pour se propager ;
 * - avant de modifier une ligne existante, on vérifie qu'elle n'a pas changé depuis son chargement
 *   (relevé synchronisé entre-temps par la tablette) ; sinon on demande avant d'écraser.
 */
import { supabase } from './donnees'

type Schema = 'releves' | 'accessibilite'
export type Ligne = Record<string, unknown>

export class Conflit extends Error {
  constructor(public majLe: string, public majPar: string | null) { super('Modifiée entre-temps') }
}

const maintenant = () => new Date().toISOString()
const plusRecent = (a: string | null | undefined, b: string | null | undefined) => !!a && (!b || Date.parse(a) > Date.parse(b))

/** Nom des agents, pour les messages de conflit. */
let nomsAgents = new Map<string, string>()
export const definirNomsAgents = (m: Map<string, string>) => { nomsAgents = m }

export interface Options {
  /** Clé primaire de la ligne (pour le contrôle de conflit). */
  cle: Record<string, string>
  /** Ligne existante : maj_le de la version affichée (null = pas de contrôle). Absent = création. */
  majLeConnue?: string | null
  /** Écraser sans contrôle (après confirmation). */
  forcer?: boolean
}

async function ecrireUneFois(schema: Schema, table: string, ligne: Ligne, o: Options): Promise<Ligne> {
  const t = supabase.schema(schema).from(table)
  let majLe = maintenant()
  const existante = 'majLeConnue' in o || !!o.forcer
  if (existante) {
    let q = supabase.schema(schema).from(table).select('maj_le,maj_par')
    for (const [k, v] of Object.entries(o.cle)) q = q.eq(k, v)
    const { data, error } = await q.maybeSingle()
    if (error) throw new Error(error.message)
    const serveur = data as { maj_le: string | null; maj_par: string | null } | null
    if (serveur?.maj_le) {
      if (!o.forcer && typeof o.majLeConnue === 'string' && plusRecent(serveur.maj_le, o.majLeConnue)) throw new Conflit(serveur.maj_le, serveur.maj_par)
      // Horloge de la tablette en avance : on se place juste après la version du serveur.
      if (!plusRecent(majLe, serveur.maj_le)) majLe = new Date(Date.parse(serveur.maj_le) + 1).toISOString()
    }
  }
  const { data, error } = existante
    ? await t.update({ ...ligne, maj_le: majLe }).match(o.cle).select().single()
    : await t.upsert({ ...ligne, ...o.cle, maj_le: majLe }, { onConflict: Object.keys(o.cle).join(',') }).select().single()
  if (error) throw new Error(traduire(error.message))
  const res = data as Ligne
  if (res.maj_le && Date.parse(String(res.maj_le)) !== Date.parse(majLe)) throw new Conflit(String(res.maj_le), (res.maj_par as string) ?? null)
  return res
}

/** Écrit une ligne ; en cas de conflit, demande confirmation avant d'écraser. Renvoie null si l'agent renonce. */
export async function ecrire(schema: Schema, table: string, ligne: Ligne, o: Options): Promise<Ligne | null> {
  try {
    return await ecrireUneFois(schema, table, ligne, o)
  } catch (e) {
    if (!(e instanceof Conflit)) throw e
    const qui = e.majPar ? nomsAgents.get(e.majPar) ?? 'un autre agent' : 'la tablette'
    const quand = new Date(e.majLe).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
    const ok = window.confirm(`Cette donnée a été modifiée par ${qui} le ${quand}, après son affichage ici.\n\nRemplacer par votre saisie ?\n(Annuler : rien n'est enregistré ; cliquez ensuite sur « Actualiser » pour voir la dernière version.)`)
    if (!ok) return null
    return ecrireUneFois(schema, table, ligne, { ...o, forcer: true })
  }
}

/** Suppression douce (propagée aux tablettes à la prochaine synchronisation). */
export const supprimer = (schema: Schema, table: string, cle: Record<string, string>, majLeConnue: string | null = null) =>
  ecrire(schema, table, { supprime_le: maintenant() }, { cle, majLeConnue })

function traduire(m: string): string {
  if (m.includes('row-level security')) return "Droits insuffisants : votre compte n'est pas (ou plus) un agent actif."
  if (m.includes('duplicate key') && m.includes('diagnostic_projet_id_key')) return 'Un diagnostic existe déjà pour ce bâtiment (créé sur la tablette) : cliquez sur « Actualiser ».'
  if (m.includes('violates foreign key')) return 'Élément lié introuvable (supprimé entre-temps ?) : cliquez sur « Actualiser ».'
  return m
}

// --- Fichiers ---------------------------------------------------------------------------------

/** Réduit une photo comme la tablette (1600 px de grand côté, JPEG 85 %). */
export async function preparerPhoto(f: File): Promise<Blob> {
  const img = await createImageBitmap(f)
  const k = Math.min(1, 1600 / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return new Promise((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('Photo illisible'))), 'image/jpeg', 0.85))
}

/** Plan : PDF tel quel ; une image (scan, capture) est convertie en PDF d'une page. */
export async function preparerPlan(f: File): Promise<Blob> {
  if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) return f
  if (!f.type.startsWith('image/')) throw new Error('Format non pris en charge : choisissez un PDF, un JPEG ou un PNG.')
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const jpeg = await preparerImagePlan(f)
  const image = await doc.embedJpg(jpeg)
  const page = doc.addPage([image.width, image.height])
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
  return new Blob([await doc.save()], { type: 'application/pdf' })
}

async function preparerImagePlan(f: File): Promise<ArrayBuffer> {
  const img = await createImageBitmap(f)
  const k = Math.min(1, 4000 / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(img, 0, 0, c.width, c.height)
  const b = await new Promise<Blob>((ok, ko) => c.toBlob((x) => (x ? ok(x) : ko(new Error('Image illisible'))), 'image/jpeg', 0.9))
  return b.arrayBuffer()
}

export async function deposerFichier(bucket: string, chemin: string, contenu: Blob, type: string) {
  const { error } = await supabase.storage.from(bucket).upload(chemin, contenu, { contentType: type, upsert: true })
  if (error) throw new Error(`Envoi du fichier impossible : ${error.message}`)
}

export async function nombrePages(contenu: Blob): Promise<number> {
  const pdfjs = await import('pdfjs-dist')
  const { default: travailleur } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = travailleur
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await contenu.arrayBuffer()) }).promise
  const n = pdf.numPages
  await pdf.destroy()
  return n
}
