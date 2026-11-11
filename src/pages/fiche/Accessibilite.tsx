import { useState, type ReactNode } from 'react'
import { BUCKETS, date, fusionner } from '../../donnees'
import type { LigneElement } from '../../calculs'
import { deposerFichier, ecrire, preparerPhoto, supprimer } from '../../ecriture'
import { idDiagnostic, nouvelId } from '../../ids'
import {
  estMesurable, exigences, libelleMesure, libelleSeuil, LIBELLE_STATUT, TYPES_ELEMENTS, VERSION_REFERENTIEL,
  type Diagnostic, type Element, type Ligne, type Saisie, type Statut,
} from '../../moteur'
import { BarreConformite, EtiquetteStatut } from '../../composants/Barres'
import { Photos } from '../../composants/Photos'
import { BoutonFichier, Champ, Dialogue, ecrireNombre, executer, lireNombre, signaler } from '../../composants/Ui'
import { useFiche } from './contexte'

const LIBELLE_MOTIF: Record<string, string> = {
  impossibilite_technique: 'Impossibilité technique', patrimoine_architectural: 'Préservation du patrimoine',
  disproportion_manifeste: 'Disproportion manifeste', refus_copropriete: 'Refus des copropriétaires',
}
const LIBELLE_DEROG: Record<string, string> = {
  envisagee: 'Envisagée', redigee: 'Rédigée', deposee: 'Déposée', avis_rendu: 'Avis CCDSA rendu', accordee: 'Accordée', refusee: 'Refusée', caduque: 'Caduque',
}
const STATUTS_FORCABLES: Statut[] = ['C', 'NC', 'SO', 'AE', 'NV']
const cleSaisie = (s: { element_id: string; regle_id: string }) => `${s.element_id}|${s.regle_id}`

export default function Accessibilite() {
  const f = useFiche()
  const { ind, derogations, detail, urls, edition, niveaux } = f
  const d = ind.diagnostic
  const [filtre, setFiltre] = useState<'tous' | 'NC' | 'reste'>('tous')
  const [dlgContexte, setDlgContexte] = useState(false)
  const [dlgElement, setDlgElement] = useState<Element | 'nouveau' | null>(null)
  const [ouverts, setOuverts] = useState<Set<string>>(new Set())

  if (!d) return (
    <div className="carte" style={{ textAlign: 'center' }}>
      <p className="vide">Pas encore de diagnostic accessibilité pour ce bâtiment.</p>
      {edition ? <button className="bouton primaire" onClick={() => setDlgContexte(true)}>Commencer le diagnostic (contexte de l'ERP)</button>
        : <p style={{ color: 'var(--encre-2)' }}>Activez le « Mode modification » pour le préparer depuis le bureau.</p>}
      <DialogueContexte ouvert={dlgContexte} fermer={() => setDlgContexte(false)} />
    </div>
  )

  const photosPar = new Map<string, { id: string; chemin: string }[]>()
  for (const ph of detail?.photosAcc ?? []) if (ph.storage_path) {
    const k = `${ph.element_id}|${ph.regle_id ?? ''}`; photosPar.set(k, [...(photosPar.get(k) ?? []), { id: ph.id, chemin: ph.storage_path }])
  }
  const derogPar = new Map(derogations.map((x) => [`${x.element_id}|${x.regle_id}`, x]))
  const garder = (l: Ligne) => filtre === 'tous' || (filtre === 'NC' ? l.statut === 'NC' : l.statut == null || l.statut === 'AE' || l.statut === 'NV')
  const parSequence = new Map<string, LigneElement[]>()
  for (const e of ind.elements) parSequence.set(e.element.sequence, [...(parSequence.get(e.element.sequence) ?? []), e])
  const nomNiveau = new Map(niveaux.map((n) => [n.id, n.libelle]))

  async function ajouterPhotos(e: Element, regleId: string | null, fichiers: File[]) {
    for (const fichier of fichiers) {
      const id = nouvelId()
      const chemin = `${ind.projet.id}/elements/${id}.jpg`
      const r = await executer(async () => {
        const jpeg = await preparerPhoto(fichier)
        await deposerFichier(BUCKETS.photosAcc, chemin, jpeg, 'image/jpeg')
        return ecrire('accessibilite', 'photo', { element_id: e.id, regle_id: regleId, storage_path: chemin, prise_le: new Date(fichier.lastModified).toISOString(), taille_octets: jpeg.size }, { cle: { id } })
      })
      if (!r) return
      await f.ajouterUrls(BUCKETS.photosAcc, [chemin])
      f.majDetail((x) => ({ ...x, photosAcc: fusionner(x.photosAcc, r, (y) => y.id) }))
    }
    signaler('Photo ajoutée')
  }
  async function supprimerPhoto(id: string) {
    const ph = detail?.photosAcc.find((x) => x.id === id)
    if (!ph || !window.confirm('Supprimer cette photo ?')) return
    const r = await executer(() => supprimer('accessibilite', 'photo', { id }, ph.maj_le ?? null), 'Photo supprimée')
    if (r) f.majDetail((x) => ({ ...x, photosAcc: x.photosAcc.filter((y) => y.id !== id) }))
  }
  const photosDe = (cle: string) => (photosPar.get(cle) ?? []).map((x) => ({ id: x.id, url: urls.get(x.chemin) }))
  const basculer = (id: string, ouvert: boolean) => setOuverts((s) => { const n = new Set(s); if (ouvert) n.add(id); else n.delete(id); return n })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="deux-col">
        <section className="carte">
          <div className="entete-bloc"><h2 style={{ margin: 0 }}>Contexte de l'ERP</h2>
            {edition && <span className="actions"><button className="bouton petit" onClick={() => setDlgContexte(true)}>Modifier</button></span>}</div>
          <dl className="infos">
            <div><dt>Type / catégorie</dt><dd>{d.type_erp ?? '—'}{d.activites_secondaires?.length ? ` (+ ${d.activites_secondaires.join(', ')})` : ''} / {d.categorie ? `${d.categorie}e` : '—'}</dd></div>
            {d.zone_ert && <div><dt>Zone de travail (ERT)</dt><dd>{d.zone_ert_description || 'Oui'}</dd></div>}
            <div><dt>Mission de service public</dt><dd>{d.mission_service_public ? 'Oui' : 'Non'}</dd></div>
            <div><dt>Effectif admis aux étages</dt><dd>{d.effectif_etages ?? '—'}</dd></div>
            <div><dt>Prestations uniquement en étage</dt><dd>{d.prestations_hors_rdc ? 'Oui' : 'Non'}</dd></div>
            <div><dt>Contrainte structurelle</dt><dd>{d.contrainte_structurelle ? 'Oui' : 'Non'}</dd></div>
            <div><dt>Stationnement / places assises</dt><dd>{d.nb_places_parking ?? '—'} / {d.nb_places_assises ?? '—'}</dd></div>
          </dl>
          {d.observations && <p style={{ whiteSpace: 'pre-wrap' }}>{d.observations}</p>}
        </section>
        <section className="carte">
          <h2>Exigences calculées</h2>
          <table className="tableau"><tbody>
            {exigences(d).map((x) => <tr key={x.regleId}><td>{x.libelle}<div style={{ color: 'var(--encre-2)', fontSize: 11 }}>{x.regleId}</div></td><td>{x.valeur}</td></tr>)}
          </tbody></table>
        </section>
      </div>

      <div className="filtres">
        <label>Afficher
          <select className="champ" value={filtre} onChange={(e) => setFiltre(e.target.value as typeof filtre)}>
            <option value="tous">Tous les points</option><option value="NC">Non-conformités</option><option value="reste">À renseigner ou à expertiser</option>
          </select>
        </label>
        {edition && <button className="bouton primaire" style={{ alignSelf: 'flex-end' }} onClick={() => setDlgElement('nouveau')}>+ Ajouter un élément</button>}
        <span style={{ color: 'var(--encre-2)', fontSize: 12, alignSelf: 'center' }}>{VERSION_REFERENTIEL}</span>
      </div>

      {ind.elements.length === 0 && <p className="vide">Aucun élément. {edition ? 'Ajoutez les éléments à contrôler (entrée, sanitaires, escalier…) : ils seront prêts sur la tablette.' : ''}</p>}
      {[...parSequence.entries()].sort().map(([seq, els]) => (
        <section key={seq}>
          <h2>{seq}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {els.map((e) => {
              const ls = e.lignes.filter(garder)
              if (!ls.length && filtre !== 'tous') return null
              const ouvert = filtre !== 'tous' || ouverts.has(e.element.id)
              return (
                <details className="bloc" key={e.element.id} open={ouvert} onToggle={(ev) => basculer(e.element.id, (ev.target as HTMLDetailsElement).open)}>
                  <summary>
                    <span>{e.element.libelle}</span>
                    <span className="etiquette e-gris">{e.element.element_type}</span>
                    {e.element.niveau_id && <span className="etiquette e-gris">{nomNiveau.get(e.element.niveau_id) ?? '?'}</span>}
                    {e.element.travaux_prevus && <span className="etiquette e-ambre">Travaux prévus</span>}
                    <span style={{ marginLeft: 'auto', minWidth: 160 }}><BarreConformite s={e.synthese} /></span>
                  </summary>
                  {ouvert && <div>
                    {edition && (
                      <div className="barre-outils">
                        <button className="bouton petit" onClick={() => setDlgElement(e.element)}>Modifier l'élément</button>
                        <BoutonFichier className="bouton petit" libelle="+ Photo de l'élément" accept="image/*" multiple choisir={(fs) => ajouterPhotos(e.element, null, fs)} />
                        <span style={{ fontSize: 12, color: 'var(--encre-2)' }}>Mesures et statuts : enregistrés dès que vous quittez le champ.</span>
                      </div>
                    )}
                    <Photos photos={photosDe(`${e.element.id}|`)} surSupprimer={edition ? supprimerPhoto : undefined} />
                    <div className="tableau-conteneur">
                      <table className="tableau tableau-acc">
                        <thead><tr><th>Règle</th><th>Point de contrôle</th><th>Exigence</th><th>Mesure</th><th>Statut</th></tr></thead>
                        <tbody>
                          {ls.map((l) => {
                            const der = derogPar.get(`${e.element.id}|${l.regle.id}`)
                            const cle = `${e.element.id}|${l.regle.id}`
                            return (
                              <tr key={l.regle.id}>
                                <td style={{ whiteSpace: 'nowrap' }}>{l.regle.id}<div style={{ color: 'var(--encre-2)', fontSize: 11 }}>{l.regle.article}</div></td>
                                <td>{l.regle.point}
                                  {l.palierRetenu && !edition && <div style={{ fontSize: 12, color: '#1F6B55' }}>Tolérance appliquée : {l.palierRetenu.point}</div>}
                                  {edition ? <>
                                    {l.questionPalier && <QuestionPalier ligne={l} element={e.element} />}
                                    <ChampTexte valeur={l.saisie?.commentaire ?? ''} placeholder="Commentaire" enregistrer={(t) => enregistrerSaisie(f, e.element, l, { commentaire: t.trim() || null })} />
                                  </> : l.saisie?.commentaire && <div style={{ fontSize: 12, color: 'var(--encre-2)', whiteSpace: 'pre-wrap' }}>{l.saisie.commentaire}</div>}
                                  {der && <div style={{ fontSize: 12, marginTop: 2 }}><span className="etiquette e-bleu">Dérogation {LIBELLE_DEROG[der.statut]?.toLowerCase()}</span> {LIBELLE_MOTIF[der.motif]}</div>}
                                  <Photos photos={photosDe(cle)} surSupprimer={edition ? supprimerPhoto : undefined} />
                                  {edition && <BoutonFichier className="lien-photo" libelle="+ photo" accept="image/*" multiple choisir={(fs) => ajouterPhotos(e.element, l.regle.id, fs)} />}
                                </td>
                                <td style={{ whiteSpace: 'nowrap' }}>{libelleSeuil(l.regle) ?? (l.regle.valeurTexte || '—')}</td>
                                <td className="num">
                                  {edition && estMesurable(l.regle)
                                    ? <ChampNombre valeur={l.saisie?.mesure ?? null} unite={l.regle.unite} enregistrer={(n) => enregistrerSaisie(f, e.element, l, { mesure: n })} />
                                    : libelleMesure(l)}
                                </td>
                                <td>
                                  {edition ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 150 }}>
                                      <select className="champ petit" value={l.saisie?.statut_force ?? ''} aria-label={`Statut de ${l.regle.id}`}
                                        onChange={(ev) => enregistrerSaisie(f, e.element, l, { statut_force: (ev.target.value || null) as Statut | null })}>
                                        <option value="">{estMesurable(l.regle) ? 'Calculé (mesure)' : '— À renseigner —'}</option>
                                        {STATUTS_FORCABLES.map((s) => <option key={s} value={s}>{LIBELLE_STATUT[s]}</option>)}
                                      </select>
                                      {(l.saisie?.statut_force == null || l.statut === 'CT') && l.statut && <EtiquetteStatut statut={l.statut} />}
                                    </div>
                                  ) : <EtiquetteStatut statut={l.statut} />}
                                  {l.regle.gravite === 'Bloquant' && l.statut === 'NC' && <div style={{ fontSize: 11, color: 'var(--rouge)' }}>Bloquant</div>}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>}
                </details>
              )
            })}
          </div>
        </section>
      ))}

      {derogations.length > 0 && (
        <section className="carte">
          <h2>Demandes de dérogation</h2>
          <div className="tableau-conteneur">
            <table className="tableau">
              <thead><tr><th>Règle</th><th>Motif</th><th>Objet</th><th>Statut</th><th>Dépôt</th><th>Décision</th></tr></thead>
              <tbody>{derogations.map((x) => (
                <tr key={x.id}><td>{x.regle_id ?? '—'}</td><td>{LIBELLE_MOTIF[x.motif] ?? x.motif}{x.sous_motif ? ` — ${x.sous_motif}` : ''}</td>
                  <td style={{ whiteSpace: 'pre-wrap' }}>{x.objet}</td><td>{LIBELLE_DEROG[x.statut] ?? x.statut}</td><td>{date(x.date_depot)}</td><td>{date(x.date_decision)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}
      <DialogueContexte ouvert={dlgContexte} fermer={() => setDlgContexte(false)} />
      <DialogueElement cible={dlgElement} fermer={() => setDlgElement(null)} />
    </div>
  )
}

/** Enregistre la saisie complète d'une règle (même ligne que la tablette : élément + règle). */
async function enregistrerSaisie(f: ReturnType<typeof useFiche>, e: Element, l: Ligne, changement: Partial<Saisie>) {
  const s: Saisie = { element_id: e.id, regle_id: l.regle.id, mesure: null, mesure_palier: null, palier_bool: null, statut_force: null, commentaire: null, ...l.saisie, ...changement }
  const r = await executer(() => ecrire('accessibilite', 'constat', {
    mesure: s.mesure, mesure_palier: s.mesure_palier, palier_bool: s.palier_bool, statut_force: s.statut_force, commentaire: s.commentaire, supprime_le: null,
  }, { cle: { element_id: e.id, regle_id: l.regle.id } }))
  if (r) f.modifier((p) => ({ ...p, saisies: fusionner(p.saisies, r, cleSaisie) }))
}

function QuestionPalier({ ligne, element }: { ligne: Ligne; element: Element }) {
  const f = useFiche()
  const q = ligne.questionPalier!
  const c = q.palierCondition
  if (!c || (c.param !== 'mesure_palier' && c.param !== 'palier_bool')) return null
  return (
    <div className="palier">
      <div style={{ fontWeight: 500 }}>Tolérance ERP existant : {libelleSeuil(q) ? `${libelleSeuil(q)} — ` : ''}{q.point}</div>
      {c.param === 'mesure_palier' ? (
        <label className="case">{q.palierParametre ?? 'Valeur'} :
          <ChampNombre valeur={ligne.saisie?.mesure_palier ?? null} unite={c.unite} enregistrer={(n) => enregistrerSaisie(f, element, ligne, { mesure_palier: n })} />
        </label>
      ) : (
        <div className="case">{q.palierParametre ?? 'Condition remplie ?'}
          {[true, false].map((v) => (
            <button key={String(v)} type="button" className={`bouton petit${ligne.saisie?.palier_bool === v ? ' primaire' : ''}`}
              onClick={() => enregistrerSaisie(f, element, ligne, { palier_bool: ligne.saisie?.palier_bool === v ? null : v })}>{v ? 'Oui' : 'Non'}</button>
          ))}
        </div>
      )}
      {ligne.palierRetenu && <div style={{ color: '#1F6B55', fontWeight: 600 }}>Conforme dans la limite de la tolérance ({ligne.palierRetenu.article})</div>}
    </div>
  )
}

/** Champ numérique enregistré à la sortie du champ (ou Entrée), seulement s'il a changé. */
function ChampNombre({ valeur, unite, enregistrer }: { valeur: number | null; unite?: string | null; enregistrer: (n: number | null) => void }) {
  const [texte, setTexte] = useState<string | null>(null)
  const affiche = texte ?? ecrireNombre(valeur)
  function valider() {
    if (texte == null) return
    const n = lireNombre(texte)
    if (texte.trim() && n == null) { signaler('Mesure invalide : saisissez un nombre (ex. 0,85).', 'erreur'); return }
    setTexte(null)
    if (n !== valeur) enregistrer(n)
  }
  return (
    <span className="champ-mesure">
      <input className="champ petit" inputMode="decimal" value={affiche} onChange={(e) => setTexte(e.target.value)} onBlur={valider}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
      {unite && <span>{unite}</span>}
    </span>
  )
}

function ChampTexte({ valeur, placeholder, enregistrer }: { valeur: string; placeholder: string; enregistrer: (t: string) => void }) {
  const [texte, setTexte] = useState<string | null>(null)
  return (
    <input className="champ petit commentaire" placeholder={placeholder} value={texte ?? valeur} onChange={(e) => setTexte(e.target.value)}
      onBlur={() => { if (texte != null && texte !== valeur) enregistrer(texte); setTexte(null) }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
  )
}

// --- Contexte de l'ERP ---------------------------------------------------------------------------------
function DialogueContexte({ ouvert, fermer }: { ouvert: boolean; fermer: () => void }) {
  const f = useFiche()
  const d = f.ind.diagnostic
  const [v, setV] = useState<Record<string, string | boolean>>({})
  const lire = (k: keyof Diagnostic, defaut: string | boolean) => (k in v ? v[k] : d ? (typeof defaut === 'boolean' ? !!d[k] : d[k] == null ? '' : String(d[k])) : defaut)
  const [activites, setActivites] = useState<string[] | null>(null)
  const listeActivites = activites ?? d?.activites_secondaires ?? []
  const [nouvelleActivite, setNouvelleActivite] = useState('')
  const fin = () => { setV({}); setActivites(null); setNouvelleActivite(''); fermer() }
  // Effectif des étages calculé à partir des effectifs saisis par niveau (onglet « Niveaux et locaux »).
  const accParNiveau = new Map(f.p.accNiveaux.map((a) => [a.niveau_id, a]))
  const etages = f.niveaux.map((n) => accParNiveau.get(n.id)).filter((a) => a && !a.niveau_acces && (a.effectif_public != null || a.effectif_personnel != null))
  const niveauAccesConnu = f.niveaux.some((n) => accParNiveau.get(n.id)?.niveau_acces)
  const totalPublic = etages.reduce((t, a) => t + (a!.effectif_public ?? 0), 0)
  const totalTous = etages.reduce((t, a) => t + (a!.effectif_public ?? 0) + (a!.effectif_personnel ?? 0), 0)
  const ajouterActivite = () => {
    const t = nouvelleActivite.trim().toUpperCase()
    if (!t || listeActivites.includes(t) || t === String(lire('type_erp', '')).toUpperCase()) { setNouvelleActivite(''); return }
    setActivites([...listeActivites, t]); setNouvelleActivite('')
  }
  const entier = (k: keyof Diagnostic) => { const t = String(lire(k, '')).trim(); return t ? Math.max(0, Math.round(Number(t))) || 0 : null }

  async function valider() {
    const cat = entier('categorie')
    if (cat != null && (cat < 1 || cat > 5)) return signaler('La catégorie va de 1 à 5.', 'erreur')
    const ligne = {
      type_erp: String(lire('type_erp', '')).trim().toUpperCase() || null, categorie: cat,
      mission_service_public: !!lire('mission_service_public', true), enseignement: !!lire('enseignement', false), restaurant: !!lire('restaurant', false),
      contrainte_structurelle: !!lire('contrainte_structurelle', false), prestations_hors_rdc: !!lire('prestations_hors_rdc', false),
      effectif_etages: entier('effectif_etages'), nb_places_parking: entier('nb_places_parking'), nb_places_assises: entier('nb_places_assises'),
      observations: String(lire('observations', '')).trim() || null,
      activites_secondaires: listeActivites, zone_ert: !!lire('zone_ert', false),
      zone_ert_description: lire('zone_ert', false) ? String(lire('zone_ert_description', '')).trim() || null : null,
    }
    const r = await executer(() => d
      ? ecrire('accessibilite', 'diagnostic', ligne, { cle: { id: d.id }, majLeConnue: d.maj_le ?? null })
      : ecrire('accessibilite', 'diagnostic', { ...ligne, projet_id: f.ind.projet.id, supprime_le: null }, { cle: { id: idDiagnostic(f.ind.projet.id) } }),
    d ? 'Contexte enregistré' : 'Diagnostic créé')
    if (!r) return
    f.modifier((p) => ({ ...p, diagnostics: fusionner(p.diagnostics, r, (x) => x.id) }))
    fin()
  }
  const caseA = (k: keyof Diagnostic, libelle: string, defaut: boolean): ReactNode => (
    <label className="case"><input type="checkbox" checked={!!lire(k, defaut)} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.checked }))} /> {libelle}</label>
  )
  const nombre = (k: keyof Diagnostic, libelle: string) => (
    <Champ libelle={libelle}><input className="champ" inputMode="numeric" value={String(lire(k, ''))} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value.replace(/\D/g, '') }))} /></Champ>
  )
  return (
    <Dialogue titre="Contexte de l'ERP" ouvert={ouvert} fermer={fin} valider={valider} libelleValider={d ? 'Enregistrer' : 'Créer le diagnostic'}>
      <div className="grille-2">
        <Champ libelle="Type (W, R, L…)"><input className="champ" maxLength={3} value={String(lire('type_erp', ''))} onChange={(e) => setV((x) => ({ ...x, type_erp: e.target.value.toUpperCase() }))} /></Champ>
        {nombre('categorie', 'Catégorie (1 à 5)')}
      </div>
      <div className="champ-form"><span>Activités secondaires (autres types)</span>
        <div className="boutons-ligne">
          {listeActivites.map((a) => (
            <span key={a} className="etiquette e-bleu puce">{a}
              <button type="button" aria-label={`Retirer l'activité ${a}`} onClick={() => setActivites(listeActivites.filter((x) => x !== a))}>×</button></span>
          ))}
          <input className="champ petit" style={{ width: 90 }} maxLength={4} placeholder="ex. N" value={nouvelleActivite} aria-label="Ajouter une activité secondaire"
            onChange={(e) => setNouvelleActivite(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ajouterActivite() } }} onBlur={ajouterActivite} />
        </div>
        <small>Le type principal fixe les règles ; la catégorie dépend de l'effectif total de toutes les activités.</small>
      </div>
      {caseA('mission_service_public', 'Mission de service public', true)}
      {caseA('enseignement', "Établissement d'enseignement", false)}
      {caseA('restaurant', 'Restaurant / débit de boissons', false)}
      {caseA('contrainte_structurelle', 'Contrainte structurelle (éléments porteurs)', false)}
      {caseA('prestations_hors_rdc', 'Prestations offertes uniquement en étage', false)}
      {caseA('zone_ert', 'Le bâtiment comporte aussi une zone de travail (ERT) non ouverte au public', false)}
      {lire('zone_ert', false) && (
        <Champ libelle="Parties réservées au personnel" aide="Ces parties relèvent du Code du travail et non des règles ERP ; elles sont exclues du diagnostic et signalées dans la notice.">
          <input className="champ" value={String(lire('zone_ert_description', ''))} placeholder="ex. bureaux administratifs du 1er étage, ateliers"
            onChange={(e) => setV((x) => ({ ...x, zone_ert_description: e.target.value }))} />
        </Champ>
      )}
      <div className="grille-3">
        {nombre('effectif_etages', 'Effectif admis aux étages')}
        {nombre('nb_places_parking', 'Places de stationnement public')}
        {nombre('nb_places_assises', 'Places assises (public assis)')}
      </div>
      {etages.length > 0 && (
        <div className="aide-prep" style={{ fontSize: 12 }}>
          Effectifs saisis sur les niveaux{niveauAccesConnu ? ' (hors niveau d’accès)' : ' — indiquez le niveau d’accès dans « Niveaux et locaux »'} :
          public <b>{totalPublic}</b>, public + personnel <b>{totalTous}</b>.{' '}
          <button type="button" className="lien-photo" onClick={() => setV((x) => ({ ...x, effectif_etages: String(totalPublic) }))}>Retenir le public seul</button>{' · '}
          <button type="button" className="lien-photo" onClick={() => setV((x) => ({ ...x, effectif_etages: String(totalTous) }))}>Retenir public + personnel</button>
          <div style={{ marginTop: 4 }}>Le texte (« effectif admis aux étages ») ne tranche pas : les guides départementaux diffèrent. À vous de retenir l'effectif applicable.</div>
        </div>
      )}
      <Champ libelle="Observations"><textarea className="champ" rows={3} value={String(lire('observations', ''))} onChange={(e) => setV((x) => ({ ...x, observations: e.target.value }))} /></Champ>
    </Dialogue>
  )
}

// --- Élément à contrôler ----------------------------------------------------------------------------------
function DialogueElement({ cible, fermer }: { cible: Element | 'nouveau' | null; fermer: () => void }) {
  const f = useFiche()
  const e = cible && cible !== 'nouveau' ? cible : null
  const [v, setV] = useState<Partial<Element>>({})
  const val = { travaux_prevus: false, contrainte_structurelle: false, plusieurs_vantaux: false, ...e, ...v } as Partial<Element>
  const fin = () => { setV({}); fermer() }
  const sequences = [...new Set(TYPES_ELEMENTS.map((t) => t.sequence))]

  async function valider() {
    const type = TYPES_ELEMENTS.find((t) => t.type === val.element_type)
    if (!type) return signaler("Choisissez le type d'élément.", 'erreur')
    const libelle = val.libelle?.trim() || type.type
    const ligne = {
      element_type: type.type, sequence: e?.element_type === type.type ? e.sequence : type.sequence, libelle, niveau_id: val.niveau_id || null,
      effectif_local: val.effectif_local ?? null, travaux_prevus: !!val.travaux_prevus, contrainte_structurelle: !!val.contrainte_structurelle, plusieurs_vantaux: !!val.plusieurs_vantaux,
    }
    const diagId = f.ind.diagnostic!.id
    // Changement de niveau : la position sur l'ancien plan est effacée.
    const position = e && (val.niveau_id || null) !== (e.niveau_id || null) ? { plan_x: null, plan_y: null } : {}
    const r = await executer(() => e
      ? ecrire('accessibilite', 'element', { ...ligne, ...position }, { cle: { id: e.id }, majLeConnue: e.maj_le ?? null })
      : ecrire('accessibilite', 'element', { ...ligne, diagnostic_id: diagId }, { cle: { id: nouvelId() } }), e ? 'Élément enregistré' : 'Élément ajouté')
    if (!r) return
    f.modifier((p) => ({ ...p, elements: fusionner(p.elements, r, (x) => x.id) }))
    fin()
  }
  async function supprimerElement() {
    if (!e || !window.confirm(`Supprimer l'élément « ${e.libelle} » et ses saisies ?`)) return
    const r = await executer(() => supprimer('accessibilite', 'element', { id: e.id }, e.maj_le ?? null), 'Élément supprimé')
    if (r) f.modifier((p) => ({ ...p, elements: p.elements.filter((x) => x.id !== e.id) }))
    fin()
  }
  return (
    <Dialogue titre={e ? "Modifier l'élément" : 'Nouvel élément à contrôler'} ouvert={!!cible} fermer={fin} valider={valider}
      danger={e ? { libelle: 'Supprimer', action: supprimerElement } : undefined}>
      <Champ libelle="Type d'élément" aide={e ? 'Changer de type change la liste des points de contrôle.' : undefined}>
        <select className="champ" autoFocus value={val.element_type ?? ''} onChange={(ev) => setV((x) => ({ ...x, element_type: ev.target.value }))}>
          <option value="">Choisir…</option>
          {sequences.map((s) => <optgroup key={s} label={s}>{TYPES_ELEMENTS.filter((t) => t.sequence === s).map((t) => <option key={t.type} value={t.type}>{t.type}</option>)}</optgroup>)}
        </select>
      </Champ>
      <Champ libelle="Libellé" aide="Ex. « Entrée principale », « Sanitaire RDC hommes ». Par défaut : le type.">
        <input className="champ" value={val.libelle ?? ''} onChange={(ev) => setV((x) => ({ ...x, libelle: ev.target.value }))} />
      </Champ>
      <div className="grille-2">
        <Champ libelle="Niveau">
          <select className="champ" value={val.niveau_id ?? ''} onChange={(ev) => setV((x) => ({ ...x, niveau_id: ev.target.value || null }))}>
            <option value="">—</option>{f.niveaux.map((n) => <option key={n.id} value={n.id}>{n.libelle}</option>)}
          </select>
        </Champ>
        <Champ libelle="Effectif du local (si utile)">
          <input className="champ" inputMode="numeric" value={val.effectif_local ?? ''} onChange={(ev) => setV((x) => ({ ...x, effectif_local: ev.target.value ? Number(ev.target.value.replace(/\D/g, '')) : null }))} />
        </Champ>
      </div>
      <label className="case"><input type="checkbox" checked={!!val.travaux_prevus} onChange={(ev) => setV((x) => ({ ...x, travaux_prevus: ev.target.checked }))} /> Travaux prévus sur cet élément (ajoute les règles « travaux / création »)</label>
      <label className="case"><input type="checkbox" checked={!!val.contrainte_structurelle} onChange={(ev) => setV((x) => ({ ...x, contrainte_structurelle: ev.target.checked }))} /> Contrainte structurelle sur cet élément</label>
      <label className="case"><input type="checkbox" checked={!!val.plusieurs_vantaux} onChange={(ev) => setV((x) => ({ ...x, plusieurs_vantaux: ev.target.checked }))} /> Porte à plusieurs vantaux</label>
    </Dialogue>
  )
}
