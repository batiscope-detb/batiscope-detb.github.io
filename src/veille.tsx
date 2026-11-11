/** Veille réglementaire : comptes rendus mensuels (table accessibilite.veille). */
import { useEffect, useState } from 'react'
import { supabase, date } from './donnees'
import { executer } from './composants/Ui'

export interface Veille {
  id: string; verifie_le: string; statut: 'a_jour' | 'nouveautes' | 'erreur'; resume: string
  details: { code: string; court: string; version_referentiel: string; version_constatee: string; url: string; changements: string[] }[]
  traite_le: string | null; traite_par: string | null; commentaire: string | null
}

export async function chargerVeille(n = 12): Promise<Veille[]> {
  const { data, error } = await supabase.schema('accessibilite').from('veille').select('*').order('verifie_le', { ascending: false }).limit(n)
  if (error) throw new Error(error.message)
  return (data ?? []) as Veille[]
}

export function useVeille(n = 12) {
  const [liste, setListe] = useState<Veille[] | null>(null)
  const recharger = () => { chargerVeille(n).then(setListe).catch(() => setListe([])) }
  useEffect(recharger, [n]) // eslint-disable-line react-hooks/exhaustive-deps
  return { liste, recharger }
}

const LIBELLE = { a_jour: 'Référentiel à jour', nouveautes: 'Nouveaux textes à examiner', erreur: 'Vérification impossible' }
const CLASSE = { a_jour: 'e-vert', nouveautes: 'e-rouge', erreur: 'e-ambre' }

/** Bandeau du tableau de bord : seulement s'il y a des nouveautés non prises en compte. */
export function BandeauVeille() {
  const { liste } = useVeille(1)
  const v = liste?.[0]
  if (!v || v.statut !== 'nouveautes' || v.traite_le) return null
  return (
    <div className="bandeau-veille" role="status">
      <b>Veille réglementaire du {date(v.verifie_le)} : nouveaux textes d'accessibilité.</b> {v.resume}
      <span> Détails et suivi : logo en haut à gauche → Paramètres → Veille réglementaire.</span>
    </div>
  )
}

/** Historique et suivi (onglet des Paramètres). */
export function HistoriqueVeille({ admin }: { admin: boolean }) {
  const { liste, recharger } = useVeille(24)
  if (!liste) return <div className="chargement"><span className="roue" />Chargement…</div>
  async function traiter(v: Veille) {
    const commentaire = window.prompt('Suite donnée (ex. « mise à jour du référentiel programmée en janvier ») :', v.commentaire ?? '')
    if (commentaire == null) return
    const { data: u } = await supabase.auth.getUser()
    const r = await executer(async () => {
      const { error } = await supabase.schema('accessibilite').from('veille').update({ traite_le: new Date().toISOString(), traite_par: u.user?.id, commentaire: commentaire.trim() || null }).eq('id', v.id)
      if (error) throw new Error(error.message)
      return true
    }, 'Compte rendu marqué comme pris en compte')
    if (r) recharger()
  }
  return (
    <div className="pile">
      <p className="note-param">Chaque mois, les textes du référentiel (arrêtés du 8 décembre 2014 et du 20 avril 2017, articles L. et R. 164 du CCH)
        sont comparés à leur version en vigueur sur Légifrance, et le Journal officiel est consulté pour repérer les nouveaux textes.
        Le référentiel n'est jamais modifié automatiquement : sa mise à jour reste votre décision.</p>
      {liste.length === 0 && <p className="vide">Aucune vérification enregistrée.</p>}
      {liste.map((v) => (
        <details key={v.id} className="bloc" open={v === liste[0]}>
          <summary>
            <span>{date(v.verifie_le)}</span>
            <span className={`etiquette ${CLASSE[v.statut]}`}>{LIBELLE[v.statut]}</span>
            {v.traite_le && <span className="etiquette e-gris">Pris en compte le {date(v.traite_le)}</span>}
          </summary>
          <div className="pile" style={{ gap: 8 }}>
            <p style={{ margin: 0 }}>{v.resume}</p>
            {v.details.length > 0 && (
              <table className="tableau"><thead><tr><th>Texte</th><th>Version du référentiel</th><th>Version constatée</th><th>Changements</th></tr></thead>
                <tbody>{v.details.map((d) => (
                  <tr key={d.code}><td><a href={d.url} target="_blank" rel="noreferrer">{d.court}</a></td><td>{d.version_referentiel}</td><td>{d.version_constatee}</td>
                    <td>{d.changements?.length ? <ul style={{ margin: 0, paddingLeft: 16 }}>{d.changements.map((c, i) => <li key={i}>{c}</li>)}</ul> : '—'}</td></tr>
                ))}</tbody></table>
            )}
            {v.commentaire && <p style={{ margin: 0 }}><b>Suite donnée :</b> {v.commentaire}</p>}
            {admin && v.statut === 'nouveautes' && !v.traite_le && <div><button className="bouton petit" onClick={() => traiter(v)}>Marquer comme pris en compte</button></div>}
          </div>
        </details>
      ))}
    </div>
  )
}
