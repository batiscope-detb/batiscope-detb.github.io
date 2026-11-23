import { useCallback, useEffect, useState } from 'react'
import { chargerDossier, type Dossier } from './donnees'

/** Charge une opération et tout son contenu ; recharger() relit après une écriture. */
export function useDossier(id: string | undefined) {
  const [dossier, setDossier] = useState<Dossier | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const recharger = useCallback(async () => {
    if (!id) return
    try { setDossier(await chargerDossier(id)); setErreur(null) } catch (e) { setErreur((e as Error).message) }
  }, [id])
  useEffect(() => { setDossier(null); recharger() }, [recharger])
  return { dossier, erreur, recharger }
}
