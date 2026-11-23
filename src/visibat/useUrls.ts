import { useEffect, useState } from 'react'
import { urlsSignees } from '../donnees'
import type { Dossier } from './donnees'

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
