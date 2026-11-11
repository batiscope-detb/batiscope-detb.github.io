import { useState, type FormEvent } from 'react'
import { BUCKETS, fusionner, type AccNiveau, type Local, type Niveau } from '../../donnees'
import { deposerFichier, ecrire, nombrePages, preparerPlan, supprimer } from '../../ecriture'
import { nouvelId } from '../../ids'
import { BoutonFichier, Champ, Dialogue, executer, signaler } from '../../composants/Ui'
import { couleurEtat, useFiche } from './contexte'

const NIVEAUX_TYPES = ['Sous-sol', 'Rez-de-chaussée', 'R+1', 'R+2', 'R+3', 'Combles', 'Extérieurs']

export default function Batiment() {
  const f = useFiche()
  const { ind, niveaux, locaux, constats, detail, edition, modifier, p } = f
  const [dlgNiveau, setDlgNiveau] = useState<Niveau | 'nouveau' | null>(null)
  const [dlgLocal, setDlgLocal] = useState<Local | null>(null)
  const [choixPage, setChoixPage] = useState<{ niveau: Niveau; fichier: Blob; pages: number } | null>(null)
  const projetId = ind.projet.id
  const fauteuil = new Map(p.accNiveaux.map((a) => [a.niveau_id, a.accessible_fauteuil]))
  const elementsParNiveau = new Map<string, number>()
  for (const e of ind.elements) if (e.element.niveau_id) elementsParNiveau.set(e.element.niveau_id, (elementsParNiveau.get(e.element.niveau_id) ?? 0) + 1)
  const nbConstats = (localId: string) => constats.filter((c) => c.local_id === localId).length

  // --- Niveaux --------------------------------------------------------------------------------
  async function deplacerNiveau(n: Niveau, sens: -1 | 1) {
    const i = niveaux.indexOf(n), autre = niveaux[i + sens]
    if (!autre) return
    // Renumérote proprement (les ordres peuvent être identiques après des créations sur deux appareils).
    const liste = niveaux.slice(); liste[i] = autre; liste[i + sens] = n
    for (const [k, x] of liste.entries()) {
      if (x.ordre === k) continue
      const r = await executer(() => ecrire('releves', 'niveau', { ordre: k }, { cle: { id: x.id }, majLeConnue: x.maj_le ?? null }))
      if (!r) return
      modifier((pp) => ({ ...pp, niveaux: fusionner(pp.niveaux, r, (y) => y.id) }))
    }
  }

  async function supprimerNiveau(n: Niveau) {
    const nbL = locaux.filter((l) => l.niveau_id === n.id).length
    if (nbL || elementsParNiveau.get(n.id)) return signaler('Ce niveau contient des locaux ou des éléments d’accessibilité : déplacez-les ou supprimez-les d’abord.', 'erreur')
    if (!window.confirm(`Supprimer le niveau « ${n.libelle} » ?`)) return
    const r = await executer(() => supprimer('releves', 'niveau', { id: n.id }, n.maj_le ?? null), 'Niveau supprimé')
    if (!r) return
    if (detail?.plans.some((x) => x.niveau_id === n.id)) await executer(() => supprimer('releves', 'plan_niveau', { niveau_id: n.id }))
    modifier((pp) => ({ ...pp, niveaux: pp.niveaux.filter((x) => x.id !== n.id) }))
    setDlgNiveau(null)
  }

  /** Données accessibilité du niveau (fauteuil, effectifs, niveau d'accès) : une seule ligne par niveau. */
  async function majAccNiveau(n: Niveau, patch: Partial<AccNiveau>) {
    const actuel = p.accNiveaux.find((a) => a.niveau_id === n.id)
    const r = await executer(() => ecrire('accessibilite', 'acc_niveau', { accessible_fauteuil: actuel?.accessible_fauteuil ?? false, ...patch, supprime_le: null }, { cle: { niveau_id: n.id } }))
    if (r) modifier((pp) => ({ ...pp, accNiveaux: fusionner(pp.accNiveaux, r, (y) => y.niveau_id) }))
  }
  const basculerFauteuil = (n: Niveau, v: boolean) => majAccNiveau(n, { accessible_fauteuil: v })

  // --- Plans ------------------------------------------------------------------------------------
  async function choisirPlan(n: Niveau, fichier: File) {
    const r = await executer(async () => {
      const pdf = await preparerPlan(fichier)
      return { pdf, pages: await nombrePages(pdf) }
    })
    if (!r) return
    if (r.pages > 1) setChoixPage({ niveau: n, fichier: r.pdf, pages: r.pages })
    else await envoyerPlan(n, r.pdf, 0)
  }

  async function envoyerPlan(n: Niveau, pdf: Blob, page: number) {
    const ancien = detail?.plans.find((x) => x.niveau_id === n.id)
    const chemin = `${projetId}/plans/${n.id}-${Date.now()}.pdf`
    const r = await executer(async () => {
      await deposerFichier(BUCKETS.plans, chemin, pdf, 'application/pdf')
      return ecrire('releves', 'plan_niveau', { storage_path: chemin, page_index: page, supprime_le: null },
        ancien ? { cle: { niveau_id: n.id }, majLeConnue: ancien.maj_le ?? null } : { cle: { niveau_id: n.id } })
    }, ancien ? 'Plan remplacé : vérifiez la position des repères' : 'Plan importé')
    if (!r) return
    await f.ajouterUrls(BUCKETS.plans, [chemin])
    f.majDetail((d) => ({ ...d, plans: fusionner(d.plans, r, (x) => x.niveau_id) }))
    setChoixPage(null)
  }

  async function retirerPlan(n: Niveau) {
    const pl = detail?.plans.find((x) => x.niveau_id === n.id)
    if (!pl || !window.confirm(`Retirer le plan du niveau « ${n.libelle} » ? Les repères posés seront conservés.`)) return
    const r = await executer(() => supprimer('releves', 'plan_niveau', { niveau_id: n.id }, pl.maj_le ?? null), 'Plan retiré')
    if (r) f.majDetail((d) => ({ ...d, plans: d.plans.filter((x) => x.niveau_id !== n.id) }))
  }

  // --- Locaux ---------------------------------------------------------------------------------------
  async function ajouterLocal(niveauId: string | null, libelle: string, type: string | null) {
    const ordre = Math.max(-1, ...locaux.map((l) => l.ordre)) + 1
    const id = nouvelId()
    const r = await executer(() => ecrire('releves', 'local', { projet_id: projetId, niveau_id: niveauId, libelle, type, ordre, parties_communes: false }, { cle: { id } }))
    if (r) modifier((pp) => ({ ...pp, locaux: fusionner(pp.locaux, r, (y) => y.id) }))
    return !!r
  }

  const groupes = [...niveaux.map((n) => ({ niveau: n as Niveau | null, id: n.id })), { niveau: null, id: '' }]
    .map((g) => ({ ...g, locaux: locaux.filter((l) => (l.niveau_id ?? '') === g.id || (!g.id && l.niveau_id && !niveaux.some((n) => n.id === l.niveau_id))) }))
    .filter((g) => g.niveau || g.locaux.length)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!edition && niveaux.length === 0 && <p className="vide">Aucun niveau. Activez le « Mode modification » pour préparer le relevé (niveaux, locaux, plans).</p>}
      {edition && (
        <div className="aide-prep">
          <b>Préparer le relevé :</b> créez les niveaux, importez un plan par niveau (PDF, ou image convertie automatiquement), saisissez les locaux,
          puis placez les repères dans l'onglet « Plans et repères ». Le contexte ERP et les éléments à contrôler se préparent dans l'onglet « Accessibilité ».
        </div>
      )}
      {groupes.map(({ niveau: n, locaux: ls, id }) => {
        const plan = n ? detail?.plans.find((x) => x.niveau_id === n.id && x.storage_path) : undefined
        const i = n ? niveaux.indexOf(n) : -1
        return (
          <section className="carte" key={id || 'sans'}>
            <div className="entete-bloc">
              <h2 style={{ margin: 0 }}>{n ? n.libelle : 'Locaux sans niveau'}</h2>
              {n && <span className="etiquette e-gris">{ls.length} {ls.length > 1 ? 'locaux' : 'local'}</span>}
              {n && <span className={`etiquette ${plan ? 'e-vert' : 'e-ambre'}`}>{plan ? `Plan importé${plan.page_index ? ` (page ${plan.page_index + 1})` : ''}` : 'Pas de plan'}</span>}
              {n && (edition ? (
                <label className="case"><input type="checkbox" checked={fauteuil.get(n.id) ?? false} onChange={(e) => basculerFauteuil(n, e.target.checked)} /> Accessible en fauteuil</label>
              ) : fauteuil.get(n.id) ? <span className="etiquette e-bleu">Accessible en fauteuil</span> : null)}
              {n && edition && (
                <span className="actions">
                  <button className="bouton petit" disabled={i === 0} onClick={() => deplacerNiveau(n, -1)} aria-label="Monter le niveau">↑</button>
                  <button className="bouton petit" disabled={i === niveaux.length - 1} onClick={() => deplacerNiveau(n, 1)} aria-label="Descendre le niveau">↓</button>
                  <BoutonFichier className="bouton petit" libelle={plan ? 'Remplacer le plan' : 'Importer un plan'} accept="application/pdf,image/jpeg,image/png" choisir={([x]) => choisirPlan(n, x)} />
                  {plan && <button className="bouton petit" onClick={() => retirerPlan(n)}>Retirer le plan</button>}
                  <button className="bouton petit" onClick={() => setDlgNiveau(n)}>Renommer</button>
                </span>
              )}
            </div>
            {n && <EffectifsNiveau acc={p.accNiveaux.find((a) => a.niveau_id === n.id)} edition={edition} enregistrer={(patch) => majAccNiveau(n, patch)} />}
            {ls.length > 0 && (
              <table className="tableau" style={{ marginTop: 10 }}>
                <thead><tr><th>Local</th><th>Type</th><th>État général</th><th className="num">Constats</th>{edition && <th />}</tr></thead>
                <tbody>{ls.map((l) => (
                  <tr key={l.id}>
                    <td>{l.libelle}{l.reserve_personnel && <span className="etiquette e-gris" style={{ marginLeft: 6 }} title="Réservé au personnel : hors parties ouvertes au public">ERT</span>}</td><td>{l.type ?? '—'}</td>
                    <td>{l.etat_general != null ? <span className="etiquette" style={{ background: couleurEtat(l.etat_general), color: '#fff' }}>{l.etat_general}/10</span> : '—'}</td>
                    <td className="num">{nbConstats(l.id) || '—'}</td>
                    {edition && <td style={{ textAlign: 'right' }}><button className="bouton petit" onClick={() => setDlgLocal(l)}>Modifier</button></td>}
                  </tr>
                ))}</tbody>
              </table>
            )}
            {edition && n && <AjoutRapide types={p.typesLocaux.map((t) => t.libelle)} ajouter={(lib, type) => ajouterLocal(n.id, lib, type)} />}
          </section>
        )
      })}
      {edition && (
        <div><button className="bouton primaire" onClick={() => setDlgNiveau('nouveau')}>+ Ajouter un niveau</button></div>
      )}

      <DialogueNiveau cible={dlgNiveau} fermer={() => setDlgNiveau(null)} supprimerNiveau={supprimerNiveau} />
      <DialogueLocal local={dlgLocal} fermer={() => setDlgLocal(null)} />
      <Dialogue titre="Page du plan" ouvert={!!choixPage} fermer={() => setChoixPage(null)}
        valider={async () => { if (choixPage) await envoyerPlan(choixPage.niveau, choixPage.fichier, Number((document.getElementById('page-plan') as HTMLSelectElement).value)) }}
        libelleValider="Importer">
        <p>Ce PDF contient {choixPage?.pages} pages. Quelle page correspond au niveau « {choixPage?.niveau.libelle} » ?</p>
        <Champ libelle="Page"><select id="page-plan" className="champ">{Array.from({ length: choixPage?.pages ?? 0 }, (_, k) => <option key={k} value={k}>Page {k + 1}</option>)}</select></Champ>
      </Dialogue>
    </div>
  )
}

/** Saisie enchaînée des locaux d'un niveau (Entrée pour valider et passer au suivant). */
function AjoutRapide({ types, ajouter }: { types: string[]; ajouter: (libelle: string, type: string | null) => Promise<boolean> }) {
  const [lib, setLib] = useState('')
  const [type, setType] = useState('')
  const [enCours, setEnCours] = useState(false)
  async function soumettre(e: FormEvent) {
    e.preventDefault()
    if (!lib.trim()) return
    setEnCours(true)
    const ok = await ajouter(lib.trim(), type || null)
    setEnCours(false)
    if (ok) { setLib(''); (e.target as HTMLFormElement).querySelector('input')?.focus() }
  }
  return (
    <form className="ajout-rapide" onSubmit={soumettre}>
      <input className="champ" placeholder="Nouveau local (ex. Bureau 1)" value={lib} onChange={(e) => setLib(e.target.value)} aria-label="Nom du nouveau local" />
      <select className="champ" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type du nouveau local">
        <option value="">Type…</option>{types.map((t) => <option key={t}>{t}</option>)}
      </select>
      <button className="bouton" disabled={enCours || !lib.trim()}>Ajouter</button>
    </form>
  )
}

function DialogueNiveau({ cible, fermer, supprimerNiveau }: { cible: Niveau | 'nouveau' | null; fermer: () => void; supprimerNiveau: (n: Niveau) => Promise<void> }) {
  const { ind, niveaux, modifier } = useFiche()
  const [lib, setLib] = useState<string | null>(null)
  const existant = cible && cible !== 'nouveau' ? cible : null
  const valeur = lib ?? existant?.libelle ?? ''
  const fin = () => { setLib(null); fermer() }
  async function valider() {
    if (!valeur.trim()) return signaler('Indiquez le nom du niveau.', 'erreur')
    const r = existant
      ? await executer(() => ecrire('releves', 'niveau', { libelle: valeur.trim() }, { cle: { id: existant.id }, majLeConnue: existant.maj_le ?? null }), 'Niveau renommé')
      : await executer(() => ecrire('releves', 'niveau', { projet_id: ind.projet.id, libelle: valeur.trim(), ordre: Math.max(-1, ...niveaux.map((n) => n.ordre)) + 1 }, { cle: { id: nouvelId() } }), 'Niveau ajouté')
    if (!r) return
    modifier((pp) => ({ ...pp, niveaux: fusionner(pp.niveaux, r, (y) => y.id) }))
    fin()
  }
  return (
    <Dialogue titre={existant ? 'Renommer le niveau' : 'Nouveau niveau'} ouvert={!!cible} fermer={fin} valider={valider}
      danger={existant ? { libelle: 'Supprimer le niveau', action: () => supprimerNiveau(existant) } : undefined}>
      <Champ libelle="Nom du niveau">
        <input className="champ" autoFocus list="niveaux-types" value={valeur} onChange={(e) => setLib(e.target.value)} />
        <datalist id="niveaux-types">{NIVEAUX_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
      </Champ>
    </Dialogue>
  )
}

function DialogueLocal({ local, fermer }: { local: Local | null; fermer: () => void }) {
  const { niveaux, constats, p, modifier, detail, majDetail } = useFiche()
  const [v, setV] = useState<Partial<Local>>({})
  const val = { ...local, ...v } as Local
  const fin = () => { setV({}); fermer() }
  async function valider() {
    if (!local || !val.libelle?.trim()) return signaler('Indiquez le nom du local.', 'erreur')
    const r = await executer(() => ecrire('releves', 'local', {
      libelle: val.libelle.trim(), type: val.type || null, niveau_id: val.niveau_id || null, etat_general: val.etat_general ?? null, reserve_personnel: !!val.reserve_personnel,
    }, { cle: { id: local.id }, majLeConnue: local.maj_le ?? null }), 'Local enregistré')
    if (!r) return
    // Changement de niveau : le repère posé sur l'ancien plan n'a plus de sens.
    if ((val.niveau_id || null) !== (local.niveau_id || null)) {
      for (const m of detail?.marqueurs.filter((x) => x.local_id === local.id) ?? []) {
        if (await executer(() => supprimer('releves', 'marqueur_local', { id: m.id }))) majDetail((d) => ({ ...d, marqueurs: d.marqueurs.filter((x) => x.id !== m.id) }))
      }
    }
    modifier((pp) => ({ ...pp, locaux: fusionner(pp.locaux, r, (y) => y.id) }))
    fin()
  }
  async function supprimerLocal() {
    if (!local) return
    const cs = constats.filter((c) => c.local_id === local.id)
    const photos = detail?.photosReleves.filter((x) => cs.some((c) => c.id === x.constat_id)) ?? []
    const detailTexte = cs.length ? `\n\nSeront aussi supprimés : ${cs.length} constat${cs.length > 1 ? 's' : ''}${photos.length ? ` et ${photos.length} photo${photos.length > 1 ? 's' : ''}` : ''}.` : ''
    if (!window.confirm(`Supprimer le local « ${local.libelle} » ?${detailTexte}\n\nLa suppression sera aussi faite sur les tablettes à leur prochaine synchronisation.`)) return
    // Les constats d'abord (avec leurs photos), puis le repère, puis le local : rien ne reste orphelin.
    for (const c of cs) {
      for (const ph of photos.filter((x) => x.constat_id === c.id)) await executer(() => supprimer('releves', 'photo', { id: ph.id }))
      if (!(await executer(() => supprimer('releves', 'constat', { id: c.id }, c.maj_le)))) return
    }
    for (const m of detail?.marqueurs.filter((x) => x.local_id === local.id) ?? []) await executer(() => supprimer('releves', 'marqueur_local', { id: m.id }))
    const r = await executer(() => supprimer('releves', 'local', { id: local.id }, local.maj_le ?? null), 'Local supprimé')
    if (!r) return
    const idsConstats = new Set(cs.map((c) => c.id))
    majDetail((d) => ({ ...d, marqueurs: d.marqueurs.filter((x) => x.local_id !== local.id), photosReleves: d.photosReleves.filter((x) => !idsConstats.has(x.constat_id)) }))
    modifier((pp) => ({ ...pp, locaux: pp.locaux.filter((x) => x.id !== local.id), constats: pp.constats.filter((x) => !idsConstats.has(x.id)) }))
    fin()
  }
  const types = p.typesLocaux.map((t) => t.libelle)
  return (
    <Dialogue titre="Modifier le local" ouvert={!!local} fermer={fin} valider={valider} danger={{ libelle: 'Supprimer le local', action: supprimerLocal }}>
      <Champ libelle="Nom du local"><input className="champ" autoFocus value={val.libelle ?? ''} onChange={(e) => setV((x) => ({ ...x, libelle: e.target.value }))} /></Champ>
      <div className="grille-2">
        <Champ libelle="Type">
          <select className="champ" value={val.type ?? ''} onChange={(e) => setV((x) => ({ ...x, type: e.target.value || null }))}>
            <option value="">—</option>{[...new Set([...types, ...(val.type ? [val.type] : [])])].map((t) => <option key={t}>{t}</option>)}
          </select>
        </Champ>
        <Champ libelle="Niveau">
          <select className="champ" value={val.niveau_id ?? ''} onChange={(e) => setV((x) => ({ ...x, niveau_id: e.target.value || null }))}>
            <option value="">Sans niveau</option>{niveaux.map((n) => <option key={n.id} value={n.id}>{n.libelle}</option>)}
          </select>
        </Champ>
      </div>
      <label className="case"><input type="checkbox" checked={!!val.reserve_personnel} onChange={(e) => setV((x) => ({ ...x, reserve_personnel: e.target.checked }))} />
        Réservé au personnel (zone de travail, ERT) : hors des parties ouvertes au public</label>
      <Champ libelle="État général" aide="Note de 1 (très mauvais) à 10 (très bon), comme sur la tablette.">
        <select className="champ" value={val.etat_general ?? ''} onChange={(e) => setV((x) => ({ ...x, etat_general: e.target.value ? Number(e.target.value) : null }))}>
          <option value="">Non évalué</option>{Array.from({ length: 10 }, (_, k) => <option key={k + 1} value={k + 1}>{k + 1}/10</option>)}
        </select>
      </Champ>
    </Dialogue>
  )
}

/** Effectifs admis sur le niveau (public et personnel séparés) et niveau d'accès au bâtiment. */
function EffectifsNiveau({ acc, edition, enregistrer }: { acc?: AccNiveau; edition: boolean; enregistrer: (p: Partial<AccNiveau>) => void }) {
  const [pub, setPub] = useState<string | null>(null)
  const [pers, setPers] = useState<string | null>(null)
  const lire = (t: string) => (t.trim() ? Math.max(0, Math.round(Number(t.replace(/\D/g, '')))) : null)
  if (!edition) {
    if (acc?.effectif_public == null && acc?.effectif_personnel == null && !acc?.niveau_acces) return null
    return (
      <p className="effectifs">
        {acc?.niveau_acces && <span className="etiquette e-bleu">Niveau d'accès</span>}
        {acc?.effectif_public != null && <span>Public : <b>{acc.effectif_public}</b></span>}
        {acc?.effectif_personnel != null && <span>Personnel : <b>{acc.effectif_personnel}</b></span>}
      </p>
    )
  }
  const valider = (texte: string | null, cle: 'effectif_public' | 'effectif_personnel', reset: () => void) => {
    if (texte == null) return
    const v = lire(texte)
    reset()
    if (v !== (acc?.[cle] ?? null)) enregistrer({ [cle]: v })
  }
  return (
    <div className="effectifs">
      <label className="case"><input type="checkbox" checked={!!acc?.niveau_acces} onChange={(e) => enregistrer({ niveau_acces: e.target.checked })} /> Niveau d'accès (rez-de-chaussée)</label>
      <label className="case">Effectif public
        <input className="champ petit" inputMode="numeric" style={{ width: 80 }} value={pub ?? acc?.effectif_public ?? ''} onChange={(e) => setPub(e.target.value)}
          onBlur={() => valider(pub, 'effectif_public', () => setPub(null))} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} /></label>
      <label className="case">Effectif personnel
        <input className="champ petit" inputMode="numeric" style={{ width: 80 }} value={pers ?? acc?.effectif_personnel ?? ''} onChange={(e) => setPers(e.target.value)}
          onBlur={() => valider(pers, 'effectif_personnel', () => setPers(null))} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} /></label>
    </div>
  )
}
