/** Éditeur de la notice d'accessibilité (AT) : en-tête, paragraphes générés depuis le diagnostic puis modifiables. */
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useDonnees } from '../App'
import { date, supabase } from '../donnees'
import { ecrire, supprimer } from '../ecriture'
import { nouvelId } from '../ids'
import { genererNotice, introduction, RUBRIQUES } from '../notice'
import { Champ, executer, signaler } from '../composants/Ui'

interface Entete { diagnostic_id: string; activite: string | null; numero_dossier: string | null; parties_ouvertes: string | null; description_travaux: string | null; maitre_ouvrage: string | null; maitre_oeuvre: string | null; date_notice: string | null; maj_le?: string }
interface Paragraphe { id: string; rubrique: string; element_id: string | null; regle_id: string | null; ordre: number; texte_auto: string | null; texte_modifie: string | null; genere_le: string | null; maj_le?: string }
const CHAMPS: { cle: keyof Entete; libelle: string; aide?: string; long?: boolean }[] = [
  { cle: 'activite', libelle: 'Activité de l’établissement', aide: 'ex. salle polyvalente, mairie annexe' },
  { cle: 'numero_dossier', libelle: 'N° du dossier d’AT' },
  { cle: 'maitre_ouvrage', libelle: 'Maître d’ouvrage', aide: 'Par défaut : Ville de Cherbourg-en-Cotentin' },
  { cle: 'maitre_oeuvre', libelle: 'Maître d’œuvre', aide: 'Par défaut : Direction Études et Travaux Bâtiments' },
  { cle: 'parties_ouvertes', libelle: 'Parties ouvertes au public', long: true },
  { cle: 'description_travaux', libelle: 'Nature des travaux projetés', long: true },
]

export default function Notice() {
  const { id } = useParams()
  const { donnees, edition } = useDonnees()
  const ind = donnees!.indicateurs.find((i) => i.projet.id === id)
  const diag = ind?.diagnostic
  const derogations = useMemo(() => donnees!.patrimoine.derogations.filter((d) => d.diagnostic_id === diag?.id), [donnees, diag])
  const [entete, setEntete] = useState<Entete | null>(null)
  const [paras, setParas] = useState<Paragraphe[] | null>(null)
  const [brouillons, setBrouillons] = useState<Record<string, string>>({})
  const [enCours, setEnCours] = useState(false)

  useEffect(() => {
    if (!diag) return
    Promise.all([
      supabase.schema('accessibilite').from('notice_entete').select('*').eq('diagnostic_id', diag.id).is('supprime_le', null).maybeSingle(),
      supabase.schema('accessibilite').from('notice_paragraphe').select('*').eq('diagnostic_id', diag.id).is('supprime_le', null),
    ]).then(([e, p]) => { setEntete((e.data as Entete | null) ?? { diagnostic_id: diag.id, activite: null, numero_dossier: null, parties_ouvertes: null, description_travaux: null, maitre_ouvrage: null, maitre_oeuvre: null, date_notice: null }); setParas((p.data as Paragraphe[] | null) ?? []) })
  }, [diag?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ind) return <main className="page"><p>Bâtiment introuvable. <Link to="/">Retour</Link></p></main>
  if (!diag) return <main className="page"><p>Ce bâtiment n'a pas de diagnostic d'accessibilité : commencez-le dans l'onglet Accessibilité. <Link to={`/erp/${ind.projet.id}?onglet=accessibilite`}>Ouvrir la fiche</Link></p></main>
  if (!entete || !paras) return <div className="chargement"><span className="roue" />Chargement de la notice…</div>
  const nomElement = new Map(ind.elements.map((e) => [e.element.id, e.element.libelle]))

  async function enregistrerEntete(cle: keyof Entete, valeur: string) {
    const v = valeur.trim() || null
    if (v === (entete![cle] ?? null)) return
    const existe = !!entete!.maj_le
    const r = await executer(() => ecrire('accessibilite', 'notice_entete', existe ? { [cle]: v } : { ...entete, [cle]: v, supprime_le: null },
      existe ? { cle: { diagnostic_id: diag!.id }, majLeConnue: entete!.maj_le ?? null } : { cle: { diagnostic_id: diag!.id } }))
    if (r) setEntete(r as unknown as Entete)
  }

  /** (Re)génère les paragraphes : textes générés mis à jour, textes modifiés à la main conservés. */
  async function generer() {
    setEnCours(true)
    try {
      const gen = genererNotice(ind!.elements, derogations)
      const existants = new Map(paras!.map((x) => [`${x.rubrique}|${x.element_id ?? ''}`, x]))
      const maintenant = new Date().toISOString()
      let liste = [...paras!]
      for (const g of gen) {
        const ex = existants.get(`${g.rubrique}|${g.element_id ?? ''}`)
        if (ex && ex.texte_auto === g.texte_auto && ex.ordre === g.ordre) continue
        const r = await executer(() => ex
          ? ecrire('accessibilite', 'notice_paragraphe', { texte_auto: g.texte_auto, ordre: g.ordre, genere_le: maintenant }, { cle: { id: ex.id }, majLeConnue: null })
          : ecrire('accessibilite', 'notice_paragraphe', { diagnostic_id: diag!.id, rubrique: g.rubrique, element_id: g.element_id, regle_id: null, ordre: g.ordre, texte_auto: g.texte_auto, texte_modifie: null, genere_le: maintenant, supprime_le: null }, { cle: { id: nouvelId() } }))
        if (!r) return
        liste = [...liste.filter((x) => x.id !== r.id), r as unknown as Paragraphe]
      }
      // Éléments retirés du diagnostic : paragraphe générés supprimés, sauf s'ils ont été retouchés.
      const gardes = new Set(gen.map((g) => `${g.rubrique}|${g.element_id ?? ''}`))
      for (const x of paras!) if (x.element_id && !gardes.has(`${x.rubrique}|${x.element_id}`) && !x.texte_modifie) {
        if (await executer(() => supprimer('accessibilite', 'notice_paragraphe', { id: x.id }))) liste = liste.filter((y) => y.id !== x.id)
      }
      setParas(liste)
      signaler(paras!.length ? 'Notice mise à jour depuis le diagnostic' : 'Notice générée depuis le diagnostic')
    } finally { setEnCours(false) }
  }

  async function enregistrerTexte(x: Paragraphe, texte: string) {
    const t = texte.trim()
    const valeur = !t || t === (x.texte_auto ?? '').trim() ? null : t
    if (valeur === x.texte_modifie) return
    const r = await executer(() => ecrire('accessibilite', 'notice_paragraphe', { texte_modifie: valeur }, { cle: { id: x.id }, majLeConnue: x.maj_le ?? null }))
    if (r) setParas((l) => l!.map((y) => (y.id === x.id ? (r as unknown as Paragraphe) : y)))
  }
  async function ajouterParagraphe(rubrique: string) {
    const r = await executer(() => ecrire('accessibilite', 'notice_paragraphe', { diagnostic_id: diag!.id, rubrique, element_id: null, regle_id: null, ordre: 9999, texte_auto: null, texte_modifie: 'Nouveau paragraphe', supprime_le: null }, { cle: { id: nouvelId() } }))
    if (r) setParas((l) => [...l!, r as unknown as Paragraphe])
  }
  async function retirer(x: Paragraphe) {
    if (!window.confirm('Retirer ce paragraphe de la notice ?')) return
    if (await executer(() => supprimer('accessibilite', 'notice_paragraphe', { id: x.id }, x.maj_le ?? null))) setParas((l) => l!.filter((y) => y.id !== x.id))
  }

  const dernier = paras.reduce<string | null>((m, x) => (x.genere_le && (!m || x.genere_le > m) ? x.genere_le : m), null)
  return (
    <main className="page">
      <div className="titre-page">
        <div>
          <Link to={`/erp/${ind.projet.id}?onglet=accessibilite`}>← {ind.projet.nom}</Link>
          <h1 style={{ marginTop: 8 }}>Notice d'accessibilité</h1>
          <p className="sous-titre">À joindre à la demande d'autorisation de travaux (Cerfa n° 13824) — rubriques de l'arrêté du 8 décembre 2014{dernier ? ` — générée le ${date(dernier)}` : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {edition && <button className="bouton" disabled={enCours} onClick={generer}>{enCours ? 'Génération…' : paras.length ? 'Mettre à jour depuis le diagnostic' : 'Générer depuis le diagnostic'}</button>}
          <Link className="bouton primaire" to={`/rapport/${ind.projet.id}/notice`}>Aperçu et PDF</Link>
        </div>
      </div>
      {!edition && <p className="bandeau-edition">Activez « Modification » dans la barre du haut pour générer et rédiger la notice.</p>}

      <section className="carte">
        <h2>Identification du projet</h2>
        <div className="grille-2">
          {CHAMPS.map((c) => (
            <Champ key={c.cle} libelle={c.libelle} aide={c.aide}>
              {c.long
                ? <textarea className="champ" rows={2} disabled={!edition} defaultValue={entete[c.cle] ?? ''} onBlur={(e) => enregistrerEntete(c.cle, e.target.value)} />
                : <input className="champ" disabled={!edition} defaultValue={entete[c.cle] ?? ''} onBlur={(e) => enregistrerEntete(c.cle, e.target.value)} />}
            </Champ>
          ))}
          <Champ libelle="Date de la notice"><input className="champ" type="date" disabled={!edition} defaultValue={entete.date_notice ?? ''} onBlur={(e) => enregistrerEntete('date_notice', e.target.value)} /></Champ>
        </div>
        <p className="note-param" style={{ marginTop: 12 }}>Introduction générée : {introduction(diag, ind.projet.nom)}</p>
      </section>

      {paras.length === 0 && <p className="vide">La notice n'est pas encore générée.{edition ? ' Cliquez sur « Générer depuis le diagnostic ».' : ''}</p>}
      {paras.length > 0 && RUBRIQUES.map((r) => {
        const ps = paras.filter((x) => x.rubrique === r.code).sort((a, b) => a.ordre - b.ordre)
        return (
          <section key={r.code} className="carte">
            <div className="entete-bloc"><h2 style={{ margin: 0 }}>{r.code}. {r.titre}</h2>
              {edition && <span className="actions"><button className="bouton petit" onClick={() => ajouterParagraphe(r.code)}>+ Paragraphe libre</button></span>}</div>
            {ps.length === 0 && <p className="note-param" style={{ marginTop: 8 }}>Sans objet ou non concerné par le projet (texte imprimé tel quel).</p>}
            {ps.map((x) => {
              const texte = brouillons[x.id] ?? x.texte_modifie ?? x.texte_auto ?? ''
              return (
                <div key={x.id} className="para-edition">
                  <div className="para-meta">
                    {x.element_id && <span className="etiquette e-gris">{nomElement.get(x.element_id) ?? 'Élément retiré du diagnostic'}</span>}
                    {x.texte_modifie != null && <span className="etiquette e-ambre">Modifié</span>}
                    {edition && x.texte_modifie != null && x.texte_auto && <button className="lien-photo" onClick={() => { setBrouillons((b) => { const n = { ...b }; delete n[x.id]; return n }); enregistrerTexte(x, x.texte_auto ?? '') }}>Revenir au texte généré</button>}
                    {edition && <button className="lien-photo" onClick={() => retirer(x)}>Retirer</button>}
                  </div>
                  <textarea className="champ" rows={Math.min(14, Math.max(3, texte.split('\n').length + 1))} disabled={!edition} value={texte}
                    onChange={(e) => setBrouillons((b) => ({ ...b, [x.id]: e.target.value }))}
                    onBlur={() => { if (brouillons[x.id] != null) enregistrerTexte(x, brouillons[x.id]) }} />
                </div>
              )
            })}
          </section>
        )
      })}
    </main>
  )
}
