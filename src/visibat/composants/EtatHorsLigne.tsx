import { useEffect, useState } from 'react'
import { Dialogue } from '../../composants/Ui'
import { abandonner, abonner, etatSynchro, synchroniser } from '../horsligne'
import { dateHeureFr } from '../ui'

const LIBELLES_TABLE: Record<string, string> = {
  observation: 'Observation', observation_photo: 'Photo', observation_position: 'Pastille sur plan', observation_lot: 'Lot d’une observation',
  observation_intervenant: 'Intervenant d’une observation', observation_suivi: 'Suivi', observation_checklist: 'Point de contrôle',
  observation_commentaire: 'Commentaire', presence: 'Présence', reunion: 'Réunion', intervenant: 'Intervenant', lot: 'Lot', plan: 'Plan',
  plan_annotation: 'Annotation de plan', operation: 'Opération', contact: 'Contact', modele_export: 'Modèle d’export',
}

/** Pastille discrète : hors ligne, modifications en attente, erreurs de synchronisation. */
export default function EtatHorsLigne() {
  const [e, setE] = useState(etatSynchro)
  const [detail, setDetail] = useState(false)
  useEffect(() => abonner(setE), [])
  if (e.enLigne && !e.attente && !e.enCours) return null
  const enErreur = e.erreurs.length > 0
  const texte = enErreur ? `${e.erreurs.length} modification${e.erreurs.length > 1 ? 's' : ''} refusée${e.erreurs.length > 1 ? 's' : ''} par le serveur`
    : e.enCours ? 'Synchronisation…'
      : !e.enLigne ? `Hors ligne${e.attente ? ` · ${e.attente} modification${e.attente > 1 ? 's' : ''} en attente` : ' · saisie conservée sur l’appareil'}`
        : `${e.attente} modification${e.attente > 1 ? 's' : ''} en attente d’envoi`
  return (
    <>
      <button type="button" className={`vb-horsligne${enErreur ? ' erreur' : !e.enLigne ? ' coupe' : ''}`} onClick={() => setDetail(true)}
        title="Les modifications faites sans réseau partent automatiquement au serveur dès que la connexion revient.">
        <span className="vb-horsligne-point" aria-hidden="true" />{texte}
      </button>
      <Dialogue titre="Saisie hors ligne" ouvert={detail} fermer={() => setDetail(false)}>
        <p style={{ marginTop: 0 }}>
          {e.enLigne ? 'Connexion disponible.' : 'Pas de connexion : vous pouvez continuer à saisir, tout est conservé sur cet appareil.'}
          {' '}{e.attente ? `${e.attente} modification${e.attente > 1 ? 's' : ''} en attente d’envoi.` : 'Aucune modification en attente.'}
        </p>
        <p className="aide" style={{ fontSize: 13, color: 'var(--encre-2)' }}>
          L’envoi se fait seul au retour du réseau. Ne videz pas les données du navigateur tant que des modifications sont en attente.
        </p>
        {enErreur && (
          <div className="pile" style={{ gap: 8 }}>
            <strong>Refusées par le serveur</strong>
            {e.erreurs.map((x) => (
              <div key={x.seq} className="carte" style={{ padding: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ flex: 1, fontSize: 13 }}>
                  <b>{x.genre === 'fichier' ? 'Fichier' : LIBELLES_TABLE[x.table ?? ''] ?? x.table}</b> · {dateHeureFr(x.le)}
                  {typeof x.ligne?.texte === 'string' && <div style={{ color: 'var(--encre-2)' }}>« {String(x.ligne.texte).slice(0, 80)} »</div>}
                  <div className="erreur" style={{ margin: 0 }}>{x.erreur}</div>
                </div>
                <button type="button" className="bouton petit danger" onClick={() => window.confirm('Abandonner définitivement cette modification ?') && abandonner(x.seq!)}>Abandonner</button>
              </div>))}
          </div>)}
        <div><button type="button" className="bouton" disabled={!e.enLigne || e.enCours} onClick={() => synchroniser()}>Synchroniser maintenant</button></div>
      </Dialogue>
    </>
  )
}
