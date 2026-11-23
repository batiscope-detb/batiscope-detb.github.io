import { useEffect, useState } from 'react'
import { urlsSignees } from '../donnees'
import { BUCKET, chargerDossier, lireBatiments, type Dossier } from './donnees'
import { copierFichiers, fichierLocal } from './horsligne'

interface Ref { bucket: string; chemin: string }
const cleDe = (r: Ref) => `${r.bucket}:${r.chemin}`

/**
 * Adresses des fichiers (clé « bucket:chemin ») : copie sur l'appareil si elle existe, sinon adresse temporaire
 * du serveur — et le fichier est alors copié en tâche de fond pour la prochaine réunion hors ligne.
 */
export async function adresses(refs: Ref[], creees: string[]): Promise<Map<string, string>> {
  const res = new Map<string, string>()
  const manquants: Ref[] = []
  for (const r of refs) {
    const b = await fichierLocal(r.bucket, r.chemin)
    if (b) { const u = URL.createObjectURL(b); creees.push(u); res.set(cleDe(r), u) } else manquants.push(r)
  }
  if (manquants.length && navigator.onLine) {
    const parBucket = new Map<string, string[]>()
    for (const r of manquants) parBucket.set(r.bucket, [...(parBucket.get(r.bucket) ?? []), r.chemin])
    const copies: (Ref & { url: string })[] = []
    for (const [b, chemins] of parBucket) {
      const m = await urlsSignees(b, chemins).catch(() => new Map<string, string>())
      for (const [k, v] of m) { res.set(`${b}:${k}`, v); copies.push({ bucket: b, chemin: k, url: v }) }
    }
    void copierFichiers(copies)
  }
  return res
}

export const refsDossier = (d: Dossier): Ref[] => [
  ...d.plans.map((p) => ({ bucket: p.bucket, chemin: p.storage_path })),
  ...d.photos.map((p) => ({ bucket: BUCKET, chemin: p.storage_path })),
]

/** Adresses des plans et photos d'une opération. */
export function useUrls(dossier: Dossier | null) {
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const refs = dossier ? refsDossier(dossier) : []
  const cle = refs.map(cleDe).sort().join('|')
  useEffect(() => {
    if (!dossier) return
    let annule = false
    const creees: string[] = []
    adresses(refs, creees).then((m) => { if (!annule) setUrls(m) }).catch(() => {})
    return () => { annule = true; setTimeout(() => creees.forEach((u) => URL.revokeObjectURL(u)), 60000) }
  }, [cle]) // eslint-disable-line react-hooks/exhaustive-deps
  return urls
}
export const urlPlan = (urls: Map<string, string>, p: { bucket: string; storage_path: string }) => urls.get(`${p.bucket}:${p.storage_path}`)
export const urlPhoto = (urls: Map<string, string>, chemin: string) => urls.get(`visibat:${chemin}`)

/** Photo de couverture du chantier : rattaché à un bâtiment, c'est la photo du bâtiment dans Batiscope (une seule photo
 *  pour les deux applications) ; hors patrimoine, celle de l'opération. */
export async function urlPhotoChantier(op: { photo_path: string | null; projet_id: string | null }, batiments?: { id: string; photo_path: string | null }[]) {
  let ref: Ref | null = null
  if (op.projet_id) {
    const b = (batiments ?? await lireBatiments()).find((x) => x.id === op.projet_id)
    if (b?.photo_path) ref = { bucket: 'photos-releves', chemin: b.photo_path }
  } else if (op.photo_path) ref = { bucket: BUCKET, chemin: op.photo_path }
  if (!ref) return null
  return (await adresses([ref], [])).get(cleDe(ref)) ?? null
}

/**
 * Prépare la saisie hors ligne : copie sur l'appareil le contenu des opérations en cours de l'agent
 * (données, plans, photos). Lancé en tâche de fond à l'accueil, au plus une fois par quart d'heure.
 */
export async function preparerHorsLigne(ids: string[]) {
  try {
    const dernier = Number(sessionStorage.getItem('visibat-preparation') ?? 0)
    if (Date.now() - dernier < 15 * 60000 || !navigator.onLine) return
    sessionStorage.setItem('visibat-preparation', String(Date.now()))
  } catch { /* stockage indisponible */ }
  for (const id of ids) {
    if (!navigator.onLine) return
    try {
      const d = await chargerDossier(id)
      const manquants: Ref[] = []
      for (const r of refsDossier(d)) if (!(await fichierLocal(r.bucket, r.chemin))) manquants.push(r)
      if (!manquants.length) continue
      const parBucket = new Map<string, string[]>()
      for (const r of manquants) parBucket.set(r.bucket, [...(parBucket.get(r.bucket) ?? []), r.chemin])
      for (const [b, chemins] of parBucket) {
        const m = await urlsSignees(b, chemins)
        await copierFichiers([...m].map(([chemin, url]) => ({ bucket: b, chemin, url })))
      }
    } catch { /* on passe à la suivante */ }
  }
}
