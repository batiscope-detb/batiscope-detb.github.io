/** Chargement complet d'un bâtiment (pour les rapports et la notice), photos et plans compris. */
import { useEffect, useMemo, useState } from 'react'
import { useDonnees } from './App'
import { BUCKETS, chargerDetail, urlsSignees, type DetailProjet } from './donnees'
import type { Repere } from './composants/Plan'
import { couleurEtat } from './pages/fiche/contexte'
import { imagePlan, type ImagePlan } from './rendrePlan'

export function useDossier(id: string | undefined, avecPlans: 'releves' | 'accessibilite' | null) {
  const { donnees } = useDonnees()
  const p = donnees!.patrimoine
  const ind = donnees!.indicateurs.find((i) => i.projet.id === id)
  const niveaux = useMemo(() => p.niveaux.filter((n) => n.projet_id === id).sort((a, b) => a.ordre - b.ordre), [p, id])
  const locaux = useMemo(() => p.locaux.filter((l) => l.projet_id === id).sort((a, b) => a.ordre - b.ordre), [p, id])
  const constats = useMemo(() => { const ids = new Set(locaux.map((l) => l.id)); return p.constats.filter((c) => ids.has(c.local_id)).sort((a, b) => a.cree_le.localeCompare(b.cree_le)) }, [p, locaux])
  const derogations = useMemo(() => p.derogations.filter((d) => d.diagnostic_id === ind?.diagnostic?.id), [p, ind])
  const [detail, setDetail] = useState<DetailProjet | null>(null)
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const [plans, setPlans] = useState<Map<string, ImagePlan>>(new Map())
  const [pret, setPret] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    if (!ind) return
    let annule = false
    setPret(false); setPlans(new Map())
    ;(async () => {
      const d = await chargerDetail(ind.projet.id, constats.map((c) => c.id), niveaux.map((n) => n.id), ind.elements.map((e) => e.element.id), ind.diagnostic?.id ?? null)
      if (annule) return
      setDetail(d)
      const [a, b, c] = await Promise.all([
        urlsSignees(BUCKETS.photos, [...d.photosReleves.map((x) => x.storage_path ?? ''), ind.projet.photo_path ?? '']),
        urlsSignees(BUCKETS.photosAcc, d.photosAcc.map((x) => x.storage_path ?? '')),
        urlsSignees(BUCKETS.plans, d.plans.map((x) => x.storage_path ?? '')),
      ])
      if (annule) return
      const u = new Map([...a, ...b, ...c])
      setUrls(u)
      if (avecPlans) {
        const images = new Map<string, ImagePlan>()
        const localParId = new Map(locaux.map((l) => [l.id, l]))
        for (const n of niveaux) {
          const pl = d.plans.find((x) => x.niveau_id === n.id && x.storage_path)
          const url = pl?.storage_path ? u.get(pl.storage_path) : undefined
          if (!pl || !url) continue
          const reperes: Repere[] = avecPlans === 'releves'
            ? d.marqueurs.filter((m) => m.niveau_id === n.id).map((m) => ({ id: m.id, x: m.x_relatif, y: m.y_relatif, texte: String(m.numero), titre: '', couleur: couleurEtat(localParId.get(m.local_id)?.etat_general) }))
            : ind.elements.filter((e) => e.element.niveau_id === n.id && e.element.plan_x != null && e.element.plan_y != null)
              .map((e, k) => ({ id: e.element.id, x: e.element.plan_x!, y: e.element.plan_y!, texte: String(k + 1), titre: '', acc: true }))
          try { images.set(n.id, await imagePlan(url, pl.page_index, reperes, d.annotations.filter((x) => x.niveau_id === n.id))) } catch { /* plan illisible : ignoré dans le rapport */ }
          if (annule) return
        }
        setPlans(images)
      }
      setPret(true)
    })().catch((e: Error) => !annule && setErreur(e.message))
    return () => { annule = true }
  }, [ind?.projet.id, avecPlans]) // eslint-disable-line react-hooks/exhaustive-deps

  return { p, ind, niveaux, locaux, constats, derogations, detail, urls, plans, pret, erreur }
}
