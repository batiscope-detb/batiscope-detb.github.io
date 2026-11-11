/** Saisie du registre public d'accessibilité d'un établissement. */
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useDonnees } from '../App'
import { ecrire } from '../ecriture'
import { chargerRegistre, niveauAccessibilite, propositions, registreVide, type Registre } from '../registre'
import { Champ, executer } from '../composants/Ui'

const CHAMPS: { cle: keyof Registre; libelle: string; aide: string; type?: 'date' | 'court' }[] = [
  { cle: 'prestations', libelle: 'Prestations offertes', aide: 'Les services rendus au public, de façon simple (ex. « accueil et démarches d’état civil, salle des mariages, permanences »).' },
  { cle: 'prestations_non_accessibles', libelle: 'Prestations non accessibles et solutions proposées', aide: 'Ce qui n’est pas accessible et comment le service est rendu autrement (ex. « salle du 1er étage : réunion déplacée au rez-de-chaussée sur demande »).' },
  { cle: 'materiel_adapte', libelle: 'Matériel adapté à disposition', aide: 'Boucle magnétique, loupe, fauteuil roulant de prêt…' },
  { cle: 'maintenance', libelle: 'Maintenance des équipements d’accessibilité', aide: 'Ascenseur, élévateur, rampe amovible, porte automatique : modalités d’entretien et de dépannage.' },
  { cle: 'formation_personnel', libelle: 'Formation du personnel d’accueil', aide: 'Actions de sensibilisation ou de formation à l’accueil des personnes handicapées.' },
  { cle: 'attestation_formation_le', libelle: 'Attestation annuelle de formation (employeur)', aide: 'Obligatoire pour les ERP de 1re à 4e catégorie, à renouveler chaque année.', type: 'date' },
  { cle: 'attestation_accessibilite_le', libelle: 'Attestation d’accessibilité ou d’achèvement de l’agenda', aide: 'Date de l’attestation transmise en préfecture.', type: 'date' },
  { cle: 'agenda_reference', libelle: 'Agenda d’accessibilité programmée (Ad’AP)', aide: 'Référence et calendrier, si l’établissement est encore sous agenda.', type: 'court' },
  { cle: 'contact', libelle: 'Contact accessibilité', aide: 'Service ou personne à contacter, téléphone, courriel.', type: 'court' },
  { cle: 'lieu_consultation', libelle: 'Lieu de consultation du registre', aide: 'Point d’accueil principal accessible, ou adresse du site internet.', type: 'court' },
]

export default function RegistreEdition() {
  const { id } = useParams()
  const { donnees, edition } = useDonnees()
  const ind = donnees!.indicateurs.find((i) => i.projet.id === id)
  const derogations = useMemo(() => donnees!.patrimoine.derogations.filter((d) => d.diagnostic_id === ind?.diagnostic?.id), [donnees, ind])
  const [r, setR] = useState<Registre | null>(null)
  useEffect(() => { if (id) chargerRegistre(id).then((x) => setR(x ?? registreVide(id))).catch(() => setR(registreVide(id))) }, [id])
  if (!ind) return <main className="page"><p>Bâtiment introuvable. <Link to="/">Retour</Link></p></main>
  if (!r) return <div className="chargement"><span className="roue" />Chargement du registre…</div>
  const prop = propositions(ind)
  const niv = niveauAccessibilite(ind, derogations)

  async function enregistrer(cle: keyof Registre, valeur: string | boolean) {
    const v = typeof valeur === 'string' ? valeur.trim() || null : valeur
    if (v === (r![cle] ?? null)) return
    const existe = !!r!.maj_le
    const res = await executer(() => ecrire('accessibilite', 'registre', existe ? { [cle]: v } : { ...r, [cle]: v, supprime_le: null },
      existe ? { cle: { projet_id: r!.projet_id }, majLeConnue: r!.maj_le ?? null } : { cle: { projet_id: r!.projet_id } }))
    if (res) setR(res as unknown as Registre)
  }

  return (
    <main className="page">
      <div className="titre-page">
        <div>
          <Link to={`/erp/${ind.projet.id}`}>← {ind.projet.nom}</Link>
          <h1 style={{ marginTop: 8 }}>Registre public d'accessibilité</h1>
          <p className="sous-titre">Arrêté du 19 avril 2017 — consultable au point d'accueil principal ou en ligne</p>
        </div>
        <Link className="bouton primaire" to={`/rapport/${ind.projet.id}/registre`}>Aperçu et PDF</Link>
      </div>
      {!edition && <p className="bandeau-edition">Activez « Modification » dans la barre du haut pour compléter le registre.</p>}
      <section className="carte">
        <h2>Tiré du diagnostic</h2>
        <p style={{ margin: '4px 0' }}><b>Parties accessibles :</b> {niv.accessible.length ? niv.accessible.join(', ') : '—'}</p>
        <p style={{ margin: '4px 0' }}><b>Parties non accessibles à ce jour :</b> {niv.nonAccessible.length ? niv.nonAccessible.join(', ') : 'aucune relevée'}</p>
        {niv.derogations.length > 0 && <p style={{ margin: '4px 0' }}><b>Dérogations accordées :</b> {niv.derogations.join(' ; ')}</p>}
        <p className="note-param">Ces informations se mettent à jour avec le diagnostic. La notice d'accessibilité est jointe si elle a été établie.</p>
      </section>
      <section className="carte">
        <h2>Informations de l'établissement</h2>
        <div className="pile">
          {CHAMPS.map((c) => {
            const suggestion = (c.cle === 'maintenance' || c.cle === 'materiel_adapte') && !r[c.cle] ? prop[c.cle] : null
            return (
              <Champ key={c.cle} libelle={c.libelle} aide={c.aide}>
                {c.type === 'date' ? <input className="champ" type="date" style={{ maxWidth: 220 }} disabled={!edition} defaultValue={String(r[c.cle] ?? '')} onBlur={(e) => enregistrer(c.cle, e.target.value)} />
                  : c.type === 'court' ? <input className="champ" disabled={!edition} defaultValue={String(r[c.cle] ?? '')} onBlur={(e) => enregistrer(c.cle, e.target.value)} />
                  : <textarea className="champ" rows={3} disabled={!edition} defaultValue={String(r[c.cle] ?? suggestion ?? '')} onBlur={(e) => enregistrer(c.cle, e.target.value)} />}
                {suggestion && edition && <small>Proposition tirée du diagnostic : enregistrée dès que vous quittez le champ.</small>}
              </Champ>
            )
          })}
          <label className="case"><input type="checkbox" disabled={!edition} checked={r.document_accueil} onChange={(e) => enregistrer('document_accueil', e.target.checked)} />
            Le document d’aide à l’accueil des personnes handicapées (destiné au personnel) est joint au registre</label>
        </div>
      </section>
    </main>
  )
}
