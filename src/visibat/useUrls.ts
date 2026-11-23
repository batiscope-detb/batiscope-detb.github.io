import { useEffect, useState } from 'react'
import { urlsSignees } from '../donnees'
import { BUCKET, lireBatiments, type Dossier } from './donnees'

/** Adresses temporaires (1 h) des plans et photos d'une opération : clé « bucket:chemin ». */
export function useUrls(dossier: Dossier | null) {
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const cle = dossier ? [...dossier.plans.map((p) => `${p.bucket}:${p.storage_path}`), ...dossier.photos.map((p) => `visibat:${p.storage_path}`)].sort().join('|') : ''
  useEffect(() => {
    if (!dossier) return
    let annule = false
    const parBucket = new Map<string, string[]>()
    for (const p of dossier.plans) parBucket.set(p.bucket, [...(parBucket.get(p.bucket) ?? []), p.storage_path])
    parBucket.set('visibat', [...(parBucket.get('visibat') ?? []), ...dossier.photos.map((p) => p.storage_path)])
    Promise.all([...parBucket].map(async ([b, chemins]) => {
      const m = await urlsSignees(b, chemins)
      return [...m].map(([k, v]) => [`${b}:${k}`, v] as [string, string])
    })).then((l) => { if (!annule) setUrls(new Map(l.flat())) }).catch(() => {})
    return () => { annule = true }
  }, [cle]) // eslint-disable-line react-hooks/exhaustive-deps
  return urls
}
export const urlPlan = (urls: Map<string, string>, p: { bucket: string; storage_path: string }) => urls.get(`${p.bucket}:${p.storage_path}`)
export const urlPhoto = (urls: Map<string, string>, chemin: string) => urls.get(`visibat:${chemin}`)

/** Photo de couverture du chantier : celle de l'opération, sinon celle du bâtiment dans Batiscope. */
export async function urlPhotoChantier(op: { photo_path: string | null; projet_id: string | null }, batiments?: { id: string; photo_path: string | null }[]) {
  if (op.photo_path) return (await urlsSignees(BUCKET, [op.photo_path])).get(op.photo_path) ?? null
  const b = op.projet_id ? (batiments ?? await lireBatiments()).find((x) => x.id === op.projet_id) : undefined
  return b?.photo_path ? (await urlsSignees('photos-releves', [b.photo_path])).get(b.photo_path) ?? null : null
}

