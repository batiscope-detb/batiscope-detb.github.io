import { useCallback, useEffect, useState } from 'react'
import { chargerDossier, type Dossier } from './donnees'
import { quandSynchronise } from './horsligne'

/** Charge une opération et tout son contenu ; recharger() relit après une écriture. */
export function useDossier(id: string | undefined) {
  const [dossier, setDossier] = useState<Dossier | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const recharger = useCallback(async () => {
    if (!id) return
    try { setDossier(await chargerDossier(id)); setErreur(null) } catch (e) { setErreur((e as Error).message) }
  }, [id])
  useEffect(() => { setDossier(null); recharger() }, [recharger])
  // Les écritures faites hors ligne viennent d'arriver au serveur : on relit la version de référence.
  useEffect(() => quandSynchronise(() => { void recharger() }), [recharger])
  return { dossier, erreur, recharger }
}
