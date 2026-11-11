import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDonnees } from '../../App'
import { fusionner, LIBELLE_STATUT_ERP, type Projet, type StatutErp } from '../../donnees'
import { ecrire, supprimer } from '../../ecriture'
import { nouvelId } from '../../ids'
import { Champ, Dialogue, executer, signaler } from '../../composants/Ui'

const COMMUNES = ['Cherbourg-Octeville', 'Équeurdreville-Hainneville', 'La Glacerie', 'Querqueville', 'Tourlaville']
const STATUTS: StatutErp[] = ['diagnostic', 'programme', 'travaux', 'atteste', 'archive']

/** Création (projet absent) ou modification d'une fiche bâtiment. */
export function DialogueProjet({ ouvert, fermer, projet }: { ouvert: boolean; fermer: () => void; projet?: Projet }) {
  const { donnees, modifier } = useDonnees()
  const nav = useNavigate()
  const [v, setV] = useState<Partial<Projet>>({})
  const val = { ...projet, ...v }
  const maj = (k: keyof Projet) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }))
  const fin = () => { setV({}); fermer() }
  const vide = (t: string | null | undefined) => (t?.trim() ? t.trim() : null)

  async function valider() {
    if (!val.nom?.trim()) return signaler('Le nom du bâtiment est obligatoire.', 'erreur')
    const ligne = {
      nom: val.nom.trim(), adresse: vide(val.adresse), contact: vide(val.contact), code: vide(val.code), commune_deleguee: vide(val.commune_deleguee),
      ...(projet ? { statut: val.statut, date_statut: val.statut !== projet.statut ? new Date().toISOString().slice(0, 10) : projet.date_statut } : { statut: 'diagnostic' }),
    }
    const id = projet?.id ?? nouvelId()
    const r = await executer(() => ecrire('releves', 'projet', ligne, projet ? { cle: { id }, majLeConnue: projet.maj_le } : { cle: { id } }),
      projet ? 'Fiche enregistrée' : 'Bâtiment créé')
    if (!r) return
    modifier((p) => ({ ...p, projets: fusionner(p.projets, r, (x) => x.id) }))
    fin()
    if (!projet) {
      try { localStorage.setItem('detb-edition', '1') } catch { /* rien */ }
      nav(`/erp/${id}?onglet=batiment`)
    }
  }

  async function supprimerProjet() {
    if (!projet) return
    const nbLocaux = donnees!.patrimoine.locaux.filter((l) => l.projet_id === projet.id).length
    const diag = donnees!.patrimoine.diagnostics.find((d) => d.projet_id === projet.id)
    if (nbLocaux || diag) return signaler('Ce bâtiment contient des locaux ou un diagnostic : supprimez-les d’abord (ou passez-le en « Archivé »).', 'erreur')
    if (!window.confirm(`Supprimer le bâtiment « ${projet.nom} » ?`)) return
    const r = await executer(() => supprimer('releves', 'projet', { id: projet.id }, projet.maj_le), 'Bâtiment supprimé')
    if (!r) return
    modifier((p) => ({ ...p, projets: p.projets.filter((x) => x.id !== projet.id) }))
    fin(); nav('/')
  }

  return (
    <Dialogue titre={projet ? 'Modifier la fiche du bâtiment' : 'Nouveau bâtiment'} ouvert={ouvert} fermer={fin} valider={valider}
      libelleValider={projet ? 'Enregistrer' : 'Créer'} danger={projet ? { libelle: 'Supprimer', action: supprimerProjet } : undefined}>
      <Champ libelle="Nom du bâtiment *"><input className="champ" required autoFocus value={val.nom ?? ''} onChange={maj('nom')} /></Champ>
      <Champ libelle="Adresse"><input className="champ" value={val.adresse ?? ''} onChange={maj('adresse')} /></Champ>
      <div className="grille-2">
        <Champ libelle="Commune déléguée">
          <input className="champ" list="communes" value={val.commune_deleguee ?? ''} onChange={maj('commune_deleguee')} />
          <datalist id="communes">{COMMUNES.map((c) => <option key={c} value={c} />)}</datalist>
        </Champ>
        <Champ libelle="Code patrimoine"><input className="champ" value={val.code ?? ''} onChange={maj('code')} /></Champ>
      </div>
      <Champ libelle="Contact sur place"><input className="champ" value={val.contact ?? ''} onChange={maj('contact')} placeholder="Nom, téléphone" /></Champ>
      {projet && (
        <Champ libelle="Avancement">
          <select className="champ" value={val.statut} onChange={maj('statut')}>
            {STATUTS.map((s) => <option key={s} value={s}>{LIBELLE_STATUT_ERP[s]}</option>)}
          </select>
        </Champ>
      )}
    </Dialogue>
  )
}
