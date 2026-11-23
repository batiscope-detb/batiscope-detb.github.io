import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { fusionner, type Annotation } from '../../donnees'
import { ecrire, supprimer } from '../../ecriture'
import { nouvelId } from '../../ids'
import { executer, signaler } from '../../composants/Ui'
import type { Repere } from '../../composants/Plan'
import { CalqueAnnotations, IconeSymbole, type NouvelleAnnotation } from '../../composants/Annotations'
import { COULEURS_ANNOTATION, FAMILLES, largeurUP, SYMBOLES, symboleParId, type Symbole } from '../../symboles'
import { couleurEtat, useFiche } from './contexte'

const Plan = lazy(() => import('../../composants/Plan').then((m) => ({ default: m.Plan })))

type Cible = { genre: 'local' | 'element'; id: string; libelle: string }
const CALQUES = [...FAMILLES.map((f) => ({ id: f.id, nom: f.nom, couleur: f.couleur })), { id: 'reperes', nom: 'Repères des locaux', couleur: '#5D5A82' }, { id: 'elements', nom: 'Éléments accessibilité', couleur: '#C88A12' }]
const lireCalques = (): Set<string> => {
  try { const v = localStorage.getItem('detb-calques'); if (v) return new Set(JSON.parse(v)) } catch { /* rien */ }
  return new Set(CALQUES.map((c) => c.id))
}
/** Outils qui demandent une valeur juste après la pose : on rend la main pour la saisir. */
const SAISIE_IMMEDIATE = new Set(['texte', 'cote'])

export default function Plans() {
  const { ind, niveaux, locaux, constats, detail, urls, edition, majDetail, modifier } = useFiche()
  const [choix, setChoix] = useState<string | null>(null)
  const [aPlacer, setAPlacer] = useState<Cible | null>(null)
  const [selection, setSelection] = useState<string | null>(null)
  const [annSel, setAnnSel] = useState<string | null>(null)
  const [outil, setOutil] = useState<Symbole | null>(null)
  const [panneau, setPanneau] = useState<'symboles' | 'reperes'>('symboles')
  const [ongletFamille, setOngletFamille] = useState(FAMILLES[0].id)
  const [visibles, setVisibles] = useState<Set<string>>(lireCalques)
  const [replie, setReplie] = useState(() => { try { return localStorage.getItem('detb-panneau-replie') === '1' } catch { return false } })
  const replier = (v: boolean) => { setReplie(v); try { localStorage.setItem('detb-panneau-replie', v ? '1' : '0') } catch { /* rien */ } }
  const rendu = useRef<HTMLCanvasElement | null>(null)

  // Échap : abandonne l'outil ; Suppr : retire l'annotation sélectionnée.
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const saisie = (e.target as HTMLElement)?.closest?.('input, textarea, select')
      if (e.key === 'Escape') { setOutil(null); setAPlacer(null) }
      if ((e.key === 'Delete') && annSel && edition && !saisie) supprimerAnnotation(annSel)
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  })

  if (!detail) return <div className="chargement"><span className="roue" />Chargement des plans…</div>
  if (!niveaux.length) return <p className="vide">Aucun niveau. Créez-les dans l'onglet <Link to="?onglet=batiment">Niveaux et locaux</Link>.</p>

  const niv = niveaux.find((n) => n.id === choix) ?? niveaux.find((n) => detail.plans.some((p) => p.niveau_id === n.id && p.storage_path)) ?? niveaux[0]
  const plan = detail.plans.find((pl) => pl.niveau_id === niv.id && pl.storage_path)
  const url = plan?.storage_path ? urls.get(plan.storage_path) : undefined
  const marqueurs = detail.marqueurs.filter((m) => m.niveau_id === niv.id)
  const annotations = detail.annotations.filter((a) => a.niveau_id === niv.id)
  const locauxNiveau = locaux.filter((l) => l.niveau_id === niv.id)
  const elementsNiveau = ind.elements.filter((e) => e.element.niveau_id === niv.id)
  const localParId = new Map(locaux.map((l) => [l.id, l]))
  const annotationChoisie = annotations.find((a) => a.id === annSel) ?? null

  const reperes: Repere[] = [
    ...(visibles.has('reperes') ? marqueurs.map((m) => {
      const l = localParId.get(m.local_id)
      return { id: m.id, x: m.x_relatif, y: m.y_relatif, texte: String(m.numero), titre: l?.libelle ?? 'Local', couleur: couleurEtat(l?.etat_general) }
    }) : []),
    ...(visibles.has('elements') ? elementsNiveau.filter((e) => e.element.plan_x != null && e.element.plan_y != null).map((e) => ({
      id: e.element.id, x: e.element.plan_x!, y: e.element.plan_y!, acc: true,
      texte: e.synthese.nonConformes ? `${e.synthese.nonConformes}` : '✓', titre: `${e.element.libelle} — ${e.synthese.nonConformes} non-conformité(s)`,
    })) : []),
  ]

  function basculerCalque(id: string) {
    const n = new Set(visibles); if (n.has(id)) n.delete(id); else n.add(id)
    setVisibles(n)
    try { localStorage.setItem('detb-calques', JSON.stringify([...n])) } catch { /* rien */ }
  }

  // --- Repères des locaux et éléments (v0.2) -------------------------------------------------------
  async function placer(x: number, y: number) {
    if (!aPlacer) return
    if (aPlacer.genre === 'local') {
      const numero = Math.max(0, ...marqueurs.map((m) => m.numero)) + 1
      const r = await executer(() => ecrire('releves', 'marqueur_local', { niveau_id: niv.id, local_id: aPlacer.id, x_relatif: x, y_relatif: y, numero }, { cle: { id: nouvelId() } }), `Repère ${numero} posé`)
      if (r) majDetail((d) => ({ ...d, marqueurs: fusionner(d.marqueurs, r, (m) => m.id) }))
    } else await placerElement(aPlacer.id, x, y)
    setAPlacer(null)
  }
  async function placerElement(id: string, x: number | null, y: number | null) {
    const e = ind.elements.find((z) => z.element.id === id)?.element
    if (!e) return
    const r = await executer(() => ecrire('accessibilite', 'element', { plan_x: x, plan_y: y }, { cle: { id }, majLeConnue: e.maj_le ?? null }))
    if (r) modifier((p) => ({ ...p, elements: fusionner(p.elements, r, (z) => z.id) }))
  }
  async function deplacerRepere(id: string, x: number, y: number) {
    const m = marqueurs.find((z) => z.id === id)
    if (m) {
      const r = await executer(() => ecrire('releves', 'marqueur_local', { x_relatif: x, y_relatif: y }, { cle: { id }, majLeConnue: m.maj_le ?? null }))
      if (r) majDetail((d) => ({ ...d, marqueurs: fusionner(d.marqueurs, r, (z) => z.id) }))
    } else await placerElement(id, x, y)
  }
  async function retirerRepere(id: string) {
    const m = marqueurs.find((z) => z.id === id)
    if (m) {
      const r = await executer(() => supprimer('releves', 'marqueur_local', { id }, m.maj_le ?? null), 'Repère retiré')
      if (r) majDetail((d) => ({ ...d, marqueurs: d.marqueurs.filter((z) => z.id !== id) }))
    } else await placerElement(id, null, null)
    setSelection(null)
  }

  // --- Annotations -----------------------------------------------------------------------------------
  const enregistrerAnnotation = (r: Record<string, unknown> | null) => {
    if (r) majDetail((d) => ({ ...d, annotations: fusionner(d.annotations, r, (z) => z.id) }))
    return r
  }
  async function creerAnnotation(n: NouvelleAnnotation) {
    const s = symboleParId.get(n.type)!
    const id = nouvelId()
    const r = enregistrerAnnotation(await executer(() => ecrire('releves', 'annotation', {
      niveau_id: niv.id, type: n.type, x: n.x, y: n.y, points: n.points, rotation: 0, taille: 'm', valeur: s.defaut,
      couleur: s.famille === 'annot' ? COULEURS_ANNOTATION[0] : null, supprime_le: null,
    }, { cle: { id } })))
    if (!r) return
    setAnnSel(id)
    if (SAISIE_IMMEDIATE.has(s.id)) setOutil(null)
    if (!visibles.has(s.famille)) basculerCalque(s.famille)
  }
  async function modifierAnnotation(a: Annotation, patch: Partial<Annotation>) {
    enregistrerAnnotation(await executer(() => ecrire('releves', 'annotation', patch, { cle: { id: a.id }, majLeConnue: a.maj_le ?? null })))
  }
  async function deplacerAnnotation(id: string, dx: number, dy: number) {
    const a = annotations.find((z) => z.id === id)
    if (!a) return
    const borne = (v: number) => Math.min(1, Math.max(0, v))
    await modifierAnnotation(a, { x: borne(a.x + dx), y: borne(a.y + dy), points: a.points?.map(([px, py]) => [borne(px + dx), borne(py + dy)]) ?? null })
    setAnnSel(id)
  }
  async function supprimerAnnotation(id: string) {
    const a = annotations.find((z) => z.id === id)
    if (!a) return
    const r = await executer(() => supprimer('releves', 'annotation', { id }, a.maj_le ?? null), 'Supprimé du plan')
    if (r) { majDetail((d) => ({ ...d, annotations: d.annotations.filter((z) => z.id !== id) })); setAnnSel(null) }
  }

  async function exporterImage() {
    const c = rendu.current
    const calque = document.querySelector<SVGSVGElement>('.calque-annotations')
    if (!c) return signaler("Le plan n'est pas encore affiché.", 'erreur')
    const r = await executer(async () => {
      const sortie = document.createElement('canvas')
      sortie.width = c.width; sortie.height = c.height
      const ctx = sortie.getContext('2d')!
      ctx.drawImage(c, 0, 0)
      if (calque) {
        const copie = calque.cloneNode(true) as SVGSVGElement
        copie.querySelectorAll('.halo, .halo-trait, .zone-saisie').forEach((n) => n.remove())
        copie.setAttribute('width', String(c.width)); copie.setAttribute('height', String(c.height))
        copie.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
        const img = new Image()
        const u = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copie)], { type: 'image/svg+xml' }))
        await new Promise<void>((ok, ko) => { img.onload = () => ok(); img.onerror = () => ko(new Error('Calque illisible')); img.src = u })
        ctx.drawImage(img, 0, 0, c.width, c.height)
        URL.revokeObjectURL(u)
      }
      const rayon = Math.max(12, c.width / 90)
      for (const rp of reperes) {
        const x = rp.x * c.width, y = rp.y * c.height
        ctx.beginPath()
        if (rp.acc) ctx.rect(x - rayon, y - rayon, rayon * 2, rayon * 2); else ctx.arc(x, y, rayon, 0, Math.PI * 2)
        ctx.fillStyle = rp.acc ? '#C88A12' : rp.couleur ?? '#2E2B57'; ctx.fill()
        ctx.lineWidth = rayon / 5; ctx.strokeStyle = '#fff'; ctx.stroke()
        ctx.fillStyle = rp.acc ? '#1B1B3D' : '#fff'; ctx.font = `700 ${rayon}px Inter, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(rp.texte, x, y + 1)
      }
      const png = await new Promise<Blob>((ok, ko) => sortie.toBlob((b) => (b ? ok(b) : ko(new Error('Export impossible'))), 'image/png'))
      const { exporterPlanPdf } = await import('../../exportPlan')
      const pdf = await exporterPlanPdf({
        image: png, largeur: sortie.width, hauteur: sortie.height,
        titre: ind.projet.nom, sousTitre: [niv.libelle, ind.projet.adresse].filter(Boolean).join(' — '),
        symboles: utilises.map((sy) => ({ symbole: sy, nombre: annotations.filter((x) => x.type === sy.id).length })),
        reperes: visibles.has('reperes') ? marqueurs.slice().sort((m1, m2) => m1.numero - m2.numero).map((m) => ({ numero: m.numero, libelle: localParId.get(m.local_id)?.libelle ?? '—', couleur: couleurEtat(localParId.get(m.local_id)?.etat_general) })) : [],
      })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(pdf)
      a.download = `Plan_${ind.projet.nom}_${niv.libelle}.pdf`.replace(/[\\/:*?"<>|]/g, '-')
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
      return true
    }, 'Plan annoté enregistré en PDF dans vos téléchargements')
    void r
  }

  const libelleSelection = selection && (marqueurs.find((m) => m.id === selection)
    ? `Repère ${marqueurs.find((m) => m.id === selection)!.numero} — ${localParId.get(marqueurs.find((m) => m.id === selection)!.local_id)?.libelle ?? ''}`
    : elementsNiveau.find((e) => e.element.id === selection)?.element.libelle)
  const utilises = [...new Set(annotations.map((a) => a.type))].map((t) => symboleParId.get(t)).filter((s): s is Symbole => !!s && s.famille !== 'annot')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="filtres">
        <label>Niveau
          <select className="champ" value={niv.id} onChange={(e) => { setChoix(e.target.value); setAPlacer(null); setSelection(null); setAnnSel(null) }}>
            {niveaux.map((n) => <option key={n.id} value={n.id}>{n.libelle}{detail.plans.some((p) => p.niveau_id === n.id && p.storage_path) ? '' : ' (sans plan)'}</option>)}
          </select>
        </label>
        {plan && <button className="bouton" style={{ alignSelf: 'flex-end' }} onClick={exporterImage}>Exporter le plan annoté (PDF)</button>}
      </div>
      {plan && (
        <div className="calques" role="group" aria-label="Calques affichés">
          <span>Calques :</span>
          {CALQUES.map((c) => (
            <label key={c.id} className={`calque${visibles.has(c.id) ? ' actif' : ''}`}>
              <input type="checkbox" checked={visibles.has(c.id)} onChange={() => basculerCalque(c.id)} />
              <span className="pastille-calque" style={{ background: c.couleur }} />{c.nom}
            </label>
          ))}
        </div>
      )}

      {!plan ? <p className="vide">Pas de plan pour ce niveau. Importez-le dans l'onglet <Link to="?onglet=batiment">Niveaux et locaux</Link>.</p> : (
        <div className={`plan-edition${replie && !annSel ? ' replie' : ''}`}>
          <div>
            {outil && <p className="bandeau-placement"><IconeSymbole s={outil} taille={22} />
              {outil.geometrie === 'symbole' || outil.geometrie === 'point' ? `Cliquez sur le plan pour poser « ${outil.nom} » (autant de fois que nécessaire).`
                : outil.geometrie === 'libre' ? 'Dessinez en maintenant le bouton de la souris enfoncé.' : 'Cliquez-glissez du point de départ au point d’arrivée.'}
              <button className="bouton petit" onClick={() => setOutil(null)}>Terminer (Échap)</button></p>}
            {aPlacer && <p className="bandeau-placement">Cliquez sur le plan à l'emplacement de « {aPlacer.libelle} ». <button className="bouton petit" onClick={() => setAPlacer(null)}>Annuler</button></p>}
            {selection && edition && !aPlacer && !outil && (
              <p className="bandeau-placement">Sélection : {libelleSelection}
                <button className="bouton petit" onClick={() => retirerRepere(selection)}>Retirer du plan</button>
                <button className="bouton petit" onClick={() => setSelection(null)}>Fermer</button></p>
            )}
            {url ? (
              <Suspense fallback={<div className="chargement"><span className="roue" />Chargement de la visionneuse…</div>}>
                <Plan url={url} page={plan.page_index} reperes={outil ? [] : reperes} viseur={!!aPlacer} selection={selection}
                  surRendu={(c) => { rendu.current = c }}
                  surClic={aPlacer ? placer : undefined} surDeplacement={edition && !aPlacer ? deplacerRepere : undefined} surChoix={edition ? setSelection : undefined}
                  superposition={(ratio) => (
                    <CalqueAnnotations ratio={ratio} annotations={annotations} visibles={visibles} outil={edition ? outil : null} edition={edition}
                      selection={annSel} creer={creerAnnotation} deplacer={deplacerAnnotation} choisir={(id) => { setAnnSel(id); if (id) setSelection(null) }} />
                  )} />
              </Suspense>
            ) : <div className="chargement"><span className="roue" />Préparation du plan…</div>}
          </div>

          {replie && !annSel ? (
            <button type="button" className="panneau-replie" onClick={() => replier(false)} title="Afficher le panneau" aria-label="Afficher le panneau des symboles et repères">
              <span aria-hidden="true">‹</span><span className="vertical">{edition ? 'Symboles et repères' : 'Légende'}</span>
            </button>
          ) : (
          <aside className="carte panneau-plan">
            {!annotationChoisie && <button type="button" className="replier" onClick={() => replier(true)} title="Réduire le panneau" aria-label="Réduire le panneau">›</button>}
            {annotationChoisie ? (
              <FicheAnnotation key={annotationChoisie.id} a={annotationChoisie} edition={edition} fermer={() => setAnnSel(null)} modifier={(p) => modifierAnnotation(annotationChoisie, p)}
                supprimer={() => supprimerAnnotation(annotationChoisie.id)}
                liens={[...locauxNiveau.map((l) => ({ type: 'local' as const, id: l.id, libelle: `Local — ${l.libelle}` })),
                  ...elementsNiveau.map((e) => ({ type: 'element' as const, id: e.element.id, libelle: `Élément — ${e.element.libelle}` }))]} />
            ) : edition ? (
              <>
                <div className="onglets petits" role="tablist">
                  <button role="tab" aria-selected={panneau === 'symboles'} onClick={() => setPanneau('symboles')}>Symboles</button>
                  <button role="tab" aria-selected={panneau === 'reperes'} onClick={() => { setPanneau('reperes'); setOutil(null) }}>Repères</button>
                </div>
                {panneau === 'symboles' ? (
                  <Palette famille={ongletFamille} setFamille={setOngletFamille} outil={outil} choisir={(s) => { setOutil(outil?.id === s.id ? null : s); setAPlacer(null); setAnnSel(null) }} />
                ) : (
                  <Reperes locaux={locauxNiveau} marqueurs={marqueurs} elements={elementsNiveau.map((e) => e.element)}
                    voir={setSelection} placer={(c) => { setAPlacer(c); setOutil(null) }} />
                )}
              </>
            ) : (
              <div className="pile">
                <h3>Légende</h3>
                {utilises.length === 0 && marqueurs.length === 0 && <p className="vide" style={{ padding: 6 }}>Aucun symbole sur ce plan.</p>}
                <ul className="legende-plan">{utilises.map((s) => <li key={s.id}><IconeSymbole s={s} taille={22} />{s.nom} <small>× {annotations.filter((a) => a.type === s.id).length}</small></li>)}</ul>
                <p className="note-param">Activez le « Mode modification » pour poser des symboles.</p>
              </div>
            )}
          </aside>
          )}
        </div>
      )}

      {plan && (marqueurs.length > 0 || utilises.length > 0) && (
        <section className="carte">
          <h2>Légende</h2>
          {utilises.length > 0 && <ul className="legende-plan colonnes">{utilises.map((s) => <li key={s.id}><IconeSymbole s={s} taille={22} />{s.nom} <small>× {annotations.filter((a) => a.type === s.id).length}</small></li>)}</ul>}
          {marqueurs.length > 0 && (
            <table className="tableau" style={{ marginTop: 10 }}><tbody>
              {marqueurs.slice().sort((a, b) => a.numero - b.numero).map((m) => {
                const l = localParId.get(m.local_id)
                return <tr key={m.id}><td className="num" style={{ width: 40 }}>{m.numero}</td><td>{l?.libelle ?? '—'}</td><td>{l?.type ?? ''}</td>
                  <td>{constats.filter((c) => c.local_id === m.local_id).length} constat(s)</td></tr>
              })}
            </tbody></table>
          )}
        </section>
      )}
    </div>
  )
}

export function Palette({ famille, setFamille, outil, choisir }: { famille: string; setFamille: (f: string) => void; outil: Symbole | null; choisir: (s: Symbole) => void }) {
  const [q, setQ] = useState('')
  const t = q.trim().toLowerCase()
  const liste = t ? SYMBOLES.filter((s) => `${s.nom} ${s.usage}`.toLowerCase().includes(t)) : SYMBOLES.filter((s) => s.famille === famille)
  return (
    <div className="pile">
      <input className="champ petit" type="search" placeholder="Rechercher un symbole" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un symbole" />
      {!t && (
        <div className="familles">
          {FAMILLES.map((f) => (
            <button key={f.id} type="button" className={famille === f.id ? 'actif' : ''} onClick={() => setFamille(f.id)} title={f.nom}>
              <span className="pastille-calque" style={{ background: f.couleur }} />{f.nom}
            </button>
          ))}
        </div>
      )}
      <div className="palette">
        {liste.map((s) => (
          <button key={s.id} type="button" className={`outil-symbole${outil?.id === s.id ? ' actif' : ''}`} onClick={() => choisir(s)} title={s.usage} aria-pressed={outil?.id === s.id}>
            <IconeSymbole s={s} taille={30} /><span>{s.nom}</span>
          </button>
        ))}
        {liste.length === 0 && <p className="vide" style={{ padding: 6 }}>Aucun symbole.</p>}
      </div>
    </div>
  )
}

function Reperes({ locaux, marqueurs, elements, voir, placer }: {
  locaux: { id: string; libelle: string }[]; marqueurs: { id: string; local_id: string; numero: number }[]
  elements: { id: string; libelle: string; element_type: string; plan_x: number | null }[]; voir: (id: string) => void; placer: (c: Cible) => void
}) {
  return (
    <div className="pile">
      <h3>Locaux du niveau</h3>
      {locaux.length === 0 && <p className="vide" style={{ padding: 6 }}>Aucun local sur ce niveau.</p>}
      <ul className="liste-placement">
        {locaux.map((l) => {
          const m = marqueurs.find((z) => z.local_id === l.id)
          return (
            <li key={l.id}>
              <span>{m ? <b className="pastille-num">{m.numero}</b> : <span className="pastille-num vide">–</span>} {l.libelle}</span>
              {m ? <button className="bouton petit" onClick={() => voir(m.id)}>Voir</button>
                : <button className="bouton petit primaire" onClick={() => placer({ genre: 'local', id: l.id, libelle: l.libelle })}>Placer</button>}
            </li>
          )
        })}
      </ul>
      {elements.length > 0 && <>
        <h3>Éléments accessibilité</h3>
        <ul className="liste-placement">
          {elements.map((e) => (
            <li key={e.id}>
              <span>{e.libelle} <small style={{ color: 'var(--encre-2)' }}>{e.element_type}</small></span>
              {e.plan_x != null ? <button className="bouton petit" onClick={() => voir(e.id)}>Voir</button>
                : <button className="bouton petit primaire" onClick={() => placer({ genre: 'element', id: e.id, libelle: e.libelle })}>Placer</button>}
            </li>
          ))}
        </ul>
      </>}
    </div>
  )
}

export function FicheAnnotation({ a, edition, fermer, modifier, supprimer, liens }: {
  a: Annotation; edition: boolean; fermer: () => void; modifier: (p: Partial<Annotation>) => void; supprimer: () => void
  liens: { type: 'local' | 'element'; id: string; libelle: string }[]
}) {
  const s = symboleParId.get(a.type)!
  const [valeur, setValeur] = useState<string | null>(null)
  const [commentaire, setCommentaire] = useState<string | null>(null)
  const v = valeur ?? a.valeur ?? ''
  const valider = () => { if (valeur != null && valeur !== (a.valeur ?? '')) modifier({ valeur: valeur.trim() || null }); setValeur(null) }
  const libelleValeur = s.geometrie === 'point' ? 'Texte' : s.id === 'cote' ? 'Mesure (m)' : s.parametre && s.parametre !== 'rotation' && s.parametre !== 'tracé' ? `Valeur (${s.parametre})` : null
  const n = Number(v.replace(',', '.'))
  return (
    <div className="pile" key={a.id}>
      <div className="entete-bloc"><IconeSymbole s={s} taille={32} /><h3 style={{ margin: 0 }}>{s.nom}</h3>
        <span className="actions"><button className="bouton petit" onClick={fermer} aria-label="Fermer la fiche">Fermer</button></span></div>
      <p className="note-param" style={{ margin: 0 }}>{s.usage}</p>
      {libelleValeur && (edition ? (
        <label className="champ-form"><span>{libelleValeur}</span>
          {s.geometrie === 'point'
            ? <textarea className="champ" rows={2} autoFocus={!a.valeur} value={v} onChange={(e) => setValeur(e.target.value)} onBlur={valider} />
            : <input className="champ" autoFocus={!a.valeur && s.id === 'cote'} value={v} onChange={(e) => setValeur(e.target.value)} onBlur={valider} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />}
          {s.id === 'up' && largeurUP(n) && <small>Largeur minimale : {largeurUP(n)}</small>}
        </label>
      ) : a.valeur && <p><b>{libelleValeur}</b> : {a.valeur}</p>)}
      {edition && <>
        {s.orientable && (
          <div className="champ-form"><span>Orientation : {Math.round(a.rotation)}°</span>
            <div className="boutons-ligne">
              <button className="bouton petit" onClick={() => modifier({ rotation: (a.rotation + 345) % 360 })} aria-label="Tourner de 15° à gauche">↺ 15°</button>
              <button className="bouton petit" onClick={() => modifier({ rotation: (a.rotation + 15) % 360 })} aria-label="Tourner de 15° à droite">↻ 15°</button>
              {[0, 90, 180, 270].map((d) => <button key={d} className={`bouton petit${Math.round(a.rotation) === d ? ' primaire' : ''}`} onClick={() => modifier({ rotation: d })}>{d === 0 ? '→' : d === 90 ? '↓' : d === 180 ? '←' : '↑'}</button>)}
            </div>
          </div>
        )}
        <div className="champ-form"><span>Taille</span>
          <div className="segments">
            {(['s', 'm', 'l'] as const).map((t) => (
              <label key={t} className={a.taille === t ? 'actif' : ''}><input type="radio" name="taille-annotation" checked={a.taille === t} onChange={() => modifier({ taille: t })} />{t === 's' ? 'Petite' : t === 'm' ? 'Moyenne' : 'Grande'}</label>
            ))}
          </div>
        </div>
        {s.famille === 'annot' && (
          <div className="champ-form"><span>Couleur</span>
            <div className="boutons-ligne">
              {COULEURS_ANNOTATION.map((c) => <button key={c} type="button" className={`nuancier${(a.couleur ?? COULEURS_ANNOTATION[0]) === c ? ' actif' : ''}`} style={{ background: c }} onClick={() => modifier({ couleur: c })} aria-label={`Couleur ${c}`} />)}
            </div>
          </div>
        )}
        {liens.length > 0 && (
          <label className="champ-form"><span>Rattacher à</span>
            <select className="champ" value={a.lien_id ? `${a.lien_type}|${a.lien_id}` : ''} onChange={(e) => {
              const [t, id] = e.target.value.split('|'); modifier({ lien_type: (t || null) as Annotation['lien_type'], lien_id: id || null })
            }}>
              <option value="">—</option>{liens.map((l) => <option key={l.id} value={`${l.type}|${l.id}`}>{l.libelle}</option>)}
            </select>
          </label>
        )}
        <label className="champ-form"><span>Commentaire</span>
          <textarea className="champ" rows={2} value={commentaire ?? a.commentaire ?? ''} onChange={(e) => setCommentaire(e.target.value)}
            onBlur={() => { if (commentaire != null && commentaire !== (a.commentaire ?? '')) modifier({ commentaire: commentaire.trim() || null }); setCommentaire(null) }} />
        </label>
        <p className="note-param" style={{ margin: 0 }}>Glissez l'élément sur le plan pour le déplacer.</p>
        <div><button className="bouton danger" onClick={supprimer}>Supprimer du plan</button></div>
      </>}
      {!edition && a.commentaire && <p style={{ whiteSpace: 'pre-wrap' }}>{a.commentaire}</p>}
    </div>
  )
}
