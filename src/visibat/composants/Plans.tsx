import { lazy, Suspense, useEffect, useState } from 'react'
import type { Repere } from '../../composants/Plan'
import { CalqueAnnotations, IconeSymbole, type NouvelleAnnotation } from '../../composants/Annotations'
import { FicheAnnotation, Palette } from '../../pages/fiche/Plans'
import { COULEURS_ANNOTATION, FAMILLES, symboleParId, type Symbole } from '../../symboles'
import type { Annotation } from '../../donnees'
import { BoutonFichier, Champ, Dialogue, executer } from '../../composants/Ui'
import { nombrePages, preparerPlan } from '../../ecriture'
import { deposer } from '../horsligne'
import { statutDe, useVisibat } from '../contexte'
import { BUCKET, enregistrer, modifier, plansDuBatiment, supprimer, type Dossier, type Observation, type Plan as PlanVb, type PlanAnnotation } from '../donnees'
import { urlPlan } from '../useUrls'

// Le lecteur de PDF est lourd : chargé seulement quand un plan s'affiche.
const Plan = lazy(() => import('../../composants/Plan').then((m) => ({ default: m.Plan })))

/** Onglet « Plans » d'une opération : import (PDF ou image), reprise des plans du bâtiment, renommage, retrait. */
export function GestionPlans({ dossier, recharger, urls }: { dossier: Dossier; recharger: () => Promise<void>; urls: Map<string, string> }) {
  const op = dossier.operation
  const [choixPage, setChoixPage] = useState<{ fichier: Blob; nom: string; pages: number; page: number } | null>(null)
  const [batiment, setBatiment] = useState<Awaited<ReturnType<typeof plansDuBatiment>>>([])
  const [apercu, setApercu] = useState<string | null>(null)
  useEffect(() => { if (op.projet_id) plansDuBatiment(op.projet_id).then(setBatiment).catch(() => setBatiment([])) }, [op.projet_id])

  async function choisir(f: File) {
    const r = await executer(async () => { const pdf = await preparerPlan(f); return { pdf, pages: await nombrePages(pdf) } })
    if (!r) return
    const nom = f.name.replace(/\.[^.]+$/, '')
    if (r.pages > 1) setChoixPage({ fichier: r.pdf, nom, pages: r.pages, page: 1 })
    else await envoyer(r.pdf, nom, 0)
  }
  async function envoyer(pdf: Blob, libelle: string, page: number) {
    const chemin = `${op.id}/plans/${crypto.randomUUID()}.pdf`
    const ok = await executer(async () => {
      await deposer(BUCKET, chemin, pdf, 'application/pdf')
      return enregistrer('plan', { operation_id: op.id, libelle, storage_path: chemin, page_index: page, ordre: dossier.plans.length, bucket: BUCKET })
    }, 'Plan importé')
    if (ok) { setChoixPage(null); await recharger() }
  }
  async function reprendre(p: (typeof batiment)[number]) {
    const ok = await executer(() => enregistrer('plan', { operation_id: op.id, libelle: p.libelle, storage_path: p.storage_path, page_index: p.page_index, ordre: dossier.plans.length, bucket: 'plans-releves', niveau_id: p.niveau_id }), `Plan « ${p.libelle} » ajouté`)
    if (ok) await recharger()
  }
  const dejaRepris = new Set(dossier.plans.filter((p) => p.niveau_id).map((p) => p.niveau_id))
  const aReprendre = batiment.filter((p) => !dejaRepris.has(p.niveau_id))

  return <>
    <div className="vb-barre">
      <BoutonFichier className="bouton primaire" libelle="+ Importer un plan (PDF ou image)" accept="application/pdf,image/jpeg,image/png" choisir={([f]) => choisir(f)} />
      {aReprendre.length > 0 && <span className="vb-discret">Plans du bâtiment disponibles :</span>}
      {aReprendre.map((p) => <button key={p.niveau_id} type="button" className="bouton" onClick={() => reprendre(p)}>+ {p.libelle}</button>)}
    </div>
    {dossier.plans.length === 0 && <p className="vide">Aucun plan. Importez un PDF ou une image{op.projet_id ? ', ou reprenez les plans du bâtiment' : ''}. Vous pourrez ensuite poser des pastilles en réunion.</p>}
    <section className="carte tableau-conteneur">
      {dossier.plans.length > 0 && <table className="tableau">
        <thead><tr><th>Plan</th><th>Origine</th><th>Pastilles</th><th></th></tr></thead>
        <tbody>{dossier.plans.map((p) => (
          <tr key={p.id}>
            <td><input className="champ petit" style={{ width: '100%' }} defaultValue={p.libelle} aria-label="Nom du plan"
              onBlur={async (e) => { if (e.target.value.trim() && e.target.value !== p.libelle && await executer(() => modifier('plan', p.id, { libelle: e.target.value.trim() }).then(() => true))) await recharger() }} /></td>
            <td>{p.bucket === 'plans-releves' ? 'Bâtiment (Batiscope)' : 'Importé'}{p.page_index ? ` · page ${p.page_index + 1}` : ''}</td>
            <td>{dossier.positions.filter((x) => x.plan_id === p.id).length}</td>
            <td style={{ whiteSpace: 'nowrap' }}>
              <button type="button" className="bouton petit" onClick={() => setApercu(p.id)}>Voir</button>{' '}
              <button type="button" className="bouton petit danger" onClick={async () => {
                if (confirm('Retirer ce plan de l’opération ? Les pastilles posées dessus disparaîtront.') && await executer(() => supprimer('plan', p.id).then(() => true), 'Plan retiré')) await recharger()
              }}>Retirer</button>
            </td>
          </tr>))}
        </tbody>
      </table>}
    </section>
    {apercu && (() => {
      const p = dossier.plans.find((x) => x.id === apercu)!
      const u = urlPlan(urls, p)
      return <section className="carte"><div className="vb-barre" style={{ marginBottom: 8 }}><strong style={{ flex: 1 }}>{p.libelle}</strong><button type="button" className="bouton petit" onClick={() => setApercu(null)}>Fermer</button></div>
        {u ? <Suspense fallback={<div className="chargement"><span className="roue" /></div>}><Plan url={u} page={p.page_index} reperes={[]} /></Suspense> : <div className="chargement"><span className="roue" />Chargement…</div>}
      </section>
    })()}
    <Dialogue titre="Page du plan" ouvert={!!choixPage} fermer={() => setChoixPage(null)} libelleValider="Importer"
      valider={async () => { if (choixPage) await envoyer(choixPage.fichier, choixPage.nom, choixPage.page - 1) }}>
      {choixPage && <Champ libelle={`Le PDF compte ${choixPage.pages} pages : laquelle est le plan ?`}>
        <input className="champ" type="number" min={1} max={choixPage.pages} value={choixPage.page} onChange={(e) => setChoixPage({ ...choixPage, page: Math.min(choixPage.pages, Math.max(1, Number(e.target.value) || 1)) })} />
      </Champ>}
    </Dialogue>
  </>
}

/** Annotation Visibat → format Batiscope (le plan tient lieu de niveau). */
export function versAnnotation(a: PlanAnnotation): Annotation {
  const d = a.donnees as Partial<Annotation>
  return {
    id: a.id, niveau_id: a.plan_id, type: String(d.type ?? 'texte'), x: Number(d.x ?? 0), y: Number(d.y ?? 0), points: d.points ?? null,
    rotation: Number(d.rotation ?? 0), taille: d.taille ?? 'm', valeur: d.valeur ?? null, commentaire: d.commentaire ?? null, couleur: d.couleur ?? null,
    lien_type: null, lien_id: null, maj_le: a.maj_le,
  }
}
const donneesDe = (a: Annotation) => ({ type: a.type, x: a.x, y: a.y, points: a.points, rotation: a.rotation, taille: a.taille, valeur: a.valeur, commentaire: a.commentaire, couleur: a.couleur })
const TOUS_CALQUES = new Set([...FAMILLES.map((f) => f.id), 'pastilles'])
const SAISIE_IMMEDIATE = new Set(['texte', 'cote'])

/** Plan d'une réunion : pastilles des observations visibles, pose d'une remarque positionnée, symboles et annotations. */
export function PlanReunion({ dossier, observations, urls, poser, ouvrir, recharger }: {
  dossier: Dossier; observations: Observation[]; urls: Map<string, string>
  poser: (planId: string, x: number, y: number) => void; ouvrir: (o: Observation) => void; recharger: () => Promise<void>
}) {
  const { statuts } = useVisibat()
  const [planId, setPlanId] = useState<string | null>(() => { try { return localStorage.getItem(`visibat-plan-${dossier.operation.id}`) } catch { return null } })
  const [mode, setMode] = useState<'consulter' | 'poser' | 'deplacer' | 'dessiner'>('consulter')
  const [outil, setOutil] = useState<Symbole | null>(null)
  const [famille, setFamille] = useState(FAMILLES[0].id)
  const [annSel, setAnnSel] = useState<string | null>(null)
  const [visibles, setVisibles] = useState<Set<string>>(TOUS_CALQUES)
  // Annotations gardées en mémoire et enregistrées à chaque geste (pas de rechargement complet à chaque trait).
  const [locales, setLocales] = useState<Annotation[]>([])
  const plan: PlanVb | undefined = dossier.plans.find((p) => p.id === planId) ?? dossier.plans[0]
  useEffect(() => { setLocales(dossier.annotations.map(versAnnotation)) }, [dossier.annotations])
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const saisie = (e.target as HTMLElement)?.closest?.('input, textarea, select')
      if (e.key === 'Escape') setOutil(null)
      if (e.key === 'Delete' && annSel && mode === 'dessiner' && !saisie) retirer(annSel)
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  })
  if (!plan) return <p className="vide">Aucun plan pour cette opération : importez-en un dans l’onglet « Plans » de l’opération.</p>

  const choisirPlan = (id: string) => { setPlanId(id); setAnnSel(null); try { localStorage.setItem(`visibat-plan-${dossier.operation.id}`, id) } catch { /* rien */ } }
  const changerMode = (m: typeof mode) => { setMode(m); setOutil(null); setAnnSel(null) }
  const parId = new Map(observations.map((o) => [o.id, o]))
  const positions = dossier.positions.filter((p) => p.plan_id === plan.id && parId.has(p.observation_id))
  const reperes: Repere[] = !visibles.has('pastilles') || outil ? [] : positions.map((p) => {
    const o = parId.get(p.observation_id)!
    const s = statutDe(statuts, o.statut_code)
    return { id: p.id, x: p.x, y: p.y, texte: o.numero, titre: `${o.numero} — ${s?.libelle ?? ''} — ${o.texte.slice(0, 80)}`, couleur: s?.couleur }
  })
  const annotations = locales.filter((a) => a.niveau_id === plan.id)
  const choisie = annotations.find((a) => a.id === annSel) ?? null
  const url = urlPlan(urls, plan)
  const basculer = (id: string) => { const n = new Set(visibles); if (n.has(id)) n.delete(id); else n.add(id); setVisibles(n) }

  async function creer(n: NouvelleAnnotation) {
    const s = symboleParId.get(n.type)!
    const a: Annotation = { id: crypto.randomUUID(), niveau_id: plan!.id, type: n.type, x: n.x, y: n.y, points: n.points, rotation: 0, taille: 'm',
      valeur: s.defaut ?? null, commentaire: null, couleur: s.famille === 'annot' ? COULEURS_ANNOTATION[0] : null, lien_type: null, lien_id: null }
    setLocales((l) => [...l, a])
    const ok = await executer(() => enregistrer('plan_annotation', { id: a.id, plan_id: plan!.id, donnees: donneesDe(a) }))
    if (!ok) { setLocales((l) => l.filter((x) => x.id !== a.id)); return }
    setAnnSel(a.id)
    if (SAISIE_IMMEDIATE.has(s.id)) setOutil(null)
  }
  async function changer(a: Annotation, patch: Partial<Annotation>) {
    const n = { ...a, ...patch }
    setLocales((l) => l.map((x) => (x.id === a.id ? n : x)))
    await executer(() => modifier('plan_annotation', a.id, { donnees: donneesDe(n) }))
  }
  async function deplacer(id: string, dx: number, dy: number) {
    const a = annotations.find((z) => z.id === id)
    if (!a) return
    const b = (v: number) => Math.min(1, Math.max(0, v))
    await changer(a, { x: b(a.x + dx), y: b(a.y + dy), points: a.points?.map(([px, py]) => [b(px + dx), b(py + dy)] as [number, number]) ?? null })
    setAnnSel(id)
  }
  async function retirer(id: string) {
    setLocales((l) => l.filter((x) => x.id !== id)); setAnnSel(null)
    if (!await executer(() => supprimer('plan_annotation', id).then(() => true), 'Supprimé du plan')) await recharger()
  }

  const dessin = mode === 'dessiner'
  return <>
    <div className="vb-barre">
      <select className="champ" value={plan.id} onChange={(e) => choisirPlan(e.target.value)} aria-label="Plan affiché">
        {dossier.plans.map((p) => <option key={p.id} value={p.id}>{p.libelle}</option>)}
      </select>
      <div className="vb-puces" role="group" aria-label="Mode">
        <button type="button" className="vb-puce" aria-pressed={mode === 'consulter'} onClick={() => changerMode('consulter')}>Consulter</button>
        <button type="button" className="vb-puce" aria-pressed={mode === 'poser'} onClick={() => changerMode('poser')}>● Poser une remarque</button>
        <button type="button" className="vb-puce" aria-pressed={mode === 'deplacer'} onClick={() => changerMode('deplacer')}>Déplacer les pastilles</button>
        <button type="button" className="vb-puce" aria-pressed={dessin} onClick={() => changerMode('dessiner')}>Symboles et annotations</button>
      </div>
    </div>
    <div className="calques" role="group" aria-label="Calques affichés">
      <span>Calques :</span>
      {[{ id: 'pastilles', nom: 'Pastilles des observations', couleur: '#430742' }, ...FAMILLES].map((c) => (
        <label key={c.id} className={`calque${visibles.has(c.id) ? ' actif' : ''}`}>
          <input type="checkbox" checked={visibles.has(c.id)} onChange={() => basculer(c.id)} />
          <span className="pastille-calque" style={{ background: c.couleur }} />{c.nom}
        </label>))}
    </div>
    <div className={dessin ? 'plan-edition' : undefined}>
      <div>
        {mode === 'poser' && <p className="bandeau-placement">Touchez le plan : la saisie de la remarque s’ouvre, déjà positionnée. <button type="button" className="bouton petit" onClick={() => changerMode('consulter')}>Terminer</button></p>}
        {mode === 'deplacer' && <p className="bandeau-placement">Faites glisser une pastille pour la déplacer. <button type="button" className="bouton petit" onClick={() => changerMode('consulter')}>Terminer</button></p>}
        {dessin && outil && <p className="bandeau-placement"><IconeSymbole s={outil} taille={22} />
          {outil.geometrie === 'symbole' || outil.geometrie === 'point' ? `Cliquez sur le plan pour poser « ${outil.nom} ».`
            : outil.geometrie === 'libre' ? 'Dessinez en maintenant le bouton enfoncé.' : 'Cliquez-glissez du point de départ au point d’arrivée.'}
          <button type="button" className="bouton petit" onClick={() => setOutil(null)}>Terminer (Échap)</button></p>}
        <section className="carte" style={{ padding: 8 }}>
          {url ? <Suspense fallback={<div className="chargement"><span className="roue" />Chargement du plan…</div>}>
            <Plan url={url} page={plan.page_index} reperes={reperes} viseur={mode === 'poser'}
              surClic={mode === 'poser' ? (x, y) => poser(plan.id, x, y) : undefined}
              surChoix={(id) => { const p = positions.find((z) => z.id === id); const o = p && parId.get(p.observation_id); if (o) ouvrir(o) }}
              surDeplacement={mode === 'deplacer' ? async (id, x, y) => { if (await executer(() => modifier('observation_position', id, { x, y }).then(() => true))) await recharger() } : undefined}
              superposition={(ratio) => (
                <CalqueAnnotations ratio={ratio} annotations={annotations} visibles={visibles} outil={dessin ? outil : null} edition={dessin}
                  selection={annSel} creer={creer} deplacer={deplacer} choisir={(id) => dessin && setAnnSel(id)} />
              )} />
          </Suspense> : <div className="chargement"><span className="roue" />Chargement du plan…</div>}
        </section>
        {positions.length === 0 && <p className="vb-discret">Aucune pastille sur ce plan pour cette réunion.</p>}
      </div>
      {dessin && <aside className="carte panneau-plan">
        {choisie
          ? <FicheAnnotation key={choisie.id} a={choisie} edition fermer={() => setAnnSel(null)} modifier={(p) => changer(choisie, p)} supprimer={() => retirer(choisie.id)} liens={[]} />
          : <Palette famille={famille} setFamille={setFamille} outil={outil} choisir={(s) => { setOutil(outil?.id === s.id ? null : s); setAnnSel(null) }} />}
      </aside>}
    </div>
  </>
}
