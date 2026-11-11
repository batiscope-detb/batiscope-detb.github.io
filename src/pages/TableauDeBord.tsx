import { useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useDonnees } from '../App'
import { LIBELLE_STATUT_ERP, euros, date, octets } from '../donnees'
import { alertes, travauxParLot, type StatutAffiche, type IndicateursErp } from '../calculs'
import { BarreConformite } from '../composants/Barres'
import { DialogueProjet } from './fiche/DialogueProjet'

const ORDRE_STATUTS: StatutAffiche[] = ['a_diagnostiquer', 'diagnostic', 'programme', 'travaux', 'atteste', 'archive']
const COULEUR_STATUT: Record<StatutAffiche, string> = {
  a_diagnostiquer: '#9C99B3', diagnostic: '#1F5FA8', programme: '#C88A12', travaux: '#7A57C2', atteste: '#2E7D32', archive: '#6B6B6B',
}
type Tri = 'nom' | 'statut' | 'constats' | 'urgents' | 'estimation' | 'taux' | 'maj'
const LIMITE_GRATUITE_OCTETS = 1e9

export default function TableauDeBord() {
  const { donnees } = useDonnees()
  const nav = useNavigate()
  const [recherche, setRecherche] = useState('')
  const [commune, setCommune] = useState('')
  const [statut, setStatut] = useState('')
  const [typeErp, setTypeErp] = useState('')
  const [tri, setTri] = useState<{ col: Tri; desc: boolean }>({ col: 'nom', desc: false })
  const [exportEnCours, setExportEnCours] = useState(false)
  const [creation, setCreation] = useState(false)

  const ind = donnees!.indicateurs
  const p = donnees!.patrimoine
  const communes = useMemo(() => [...new Set(ind.map((i) => i.projet.commune_deleguee).filter(Boolean))].sort() as string[], [ind])
  const types = useMemo(() => [...new Set(ind.map((i) => i.diagnostic?.type_erp).filter(Boolean))].sort() as string[], [ind])

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    const l = ind.filter((i) =>
      (!q || [i.projet.nom, i.projet.adresse, i.projet.code].some((v) => v?.toLowerCase().includes(q))) &&
      (!commune || i.projet.commune_deleguee === commune) &&
      (!statut || i.statut === statut) &&
      (!typeErp || i.diagnostic?.type_erp === typeErp))
    const val = (i: IndicateursErp): string | number => {
      switch (tri.col) {
        case 'nom': return i.projet.nom.toLowerCase()
        case 'statut': return ORDRE_STATUTS.indexOf(i.statut)
        case 'constats': return i.nbConstats
        case 'urgents': return i.nbUrgents
        case 'estimation': return i.estimation
        case 'taux': return i.taux ?? -1
        case 'maj': return i.derniereMaj
      }
    }
    return l.sort((a, b) => { const x = val(a), y = val(b); const c = x < y ? -1 : x > y ? 1 : 0; return tri.desc ? -c : c })
  }, [ind, recherche, commune, statut, typeErp, tri])

  const ids = new Set(filtres.map((i) => i.projet.id))
  const projetDuLocal = new Map(p.locaux.map((l) => [l.id, l.projet_id]))
  const constatsFiltres = p.constats.filter((c) => ids.has(projetDuLocal.get(c.local_id) ?? ''))
  const lots = travauxParLot(constatsFiltres, p.lots)
  const maxLot = Math.max(1, ...lots.map((l) => l.montant))
  const lesAlertes = alertes(filtres)
  const total = filtres.reduce((s, i) => s + i.estimation, 0)
  const tauxMoyen = (() => { const t = filtres.map((i) => i.taux).filter((v): v is number => v != null); return t.length ? Math.round(t.reduce((a, b) => a + b, 0) / t.length) : null })()
  const parStatut = ORDRE_STATUTS.map((s) => ({ s, n: filtres.filter((i) => i.statut === s).length }))
  const espace = p.stockage.reduce((s, x) => s + Number(x.octets), 0)

  const entete = (col: Tri, libelle: string, num = false) => (
    <th className={num ? 'num' : ''} aria-sort={tri.col === col ? (tri.desc ? 'descending' : 'ascending') : undefined}>
      <button onClick={() => setTri({ col, desc: tri.col === col ? !tri.desc : col !== 'nom' && col !== 'statut' })}>
        {libelle}{tri.col === col ? (tri.desc ? ' ▼' : ' ▲') : ''}
      </button>
    </th>
  )

  async function exporter() {
    setExportEnCours(true)
    try { const { exporterPatrimoine } = await import('../export'); await exporterPatrimoine(filtres, p) }
    finally { setExportEnCours(false) }
  }

  return (
    <main className="page">
      <div className="titre-page">
        <div>
          <h1>Patrimoine bâti — accessibilité et état des bâtiments</h1>
          <p className="sous-titre">{ind.length} bâtiment{ind.length > 1 ? 's' : ''} suivi{ind.length > 1 ? 's' : ''}{filtres.length !== ind.length ? ` — ${filtres.length} affiché${filtres.length > 1 ? 's' : ''}` : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="bouton" onClick={exporter} disabled={exportEnCours || !filtres.length}>
            {exportEnCours ? 'Préparation…' : 'Exporter vers Excel'}
          </button>
          <button className="bouton primaire" onClick={() => setCreation(true)}>+ Nouveau bâtiment</button>
        </div>
      </div>

      <div className="filtres">
        <label>Rechercher<input className="champ" type="search" placeholder="Nom, adresse, code" value={recherche} onChange={(e) => setRecherche(e.target.value)} /></label>
        <label>Commune déléguée
          <select className="champ" value={commune} onChange={(e) => setCommune(e.target.value)}>
            <option value="">Toutes</option>{communes.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label>Avancement
          <select className="champ" value={statut} onChange={(e) => setStatut(e.target.value)}>
            <option value="">Tous</option>{ORDRE_STATUTS.map((s) => <option key={s} value={s}>{LIBELLE_STATUT_ERP[s]}</option>)}
          </select>
        </label>
        <label>Type d'ERP
          <select className="champ" value={typeErp} onChange={(e) => setTypeErp(e.target.value)}>
            <option value="">Tous</option>{types.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
      </div>

      <section className="grille-kpi" aria-label="Indicateurs clés">
        <div className="kpi"><span>Bâtiments</span><b>{filtres.length}</b><small>{parStatut.find((x) => x.s === 'atteste')?.n ?? 0} attesté(s)</small></div>
        <div className="kpi"><span>Constats relevés</span><b>{constatsFiltres.length}</b><small>{filtres.reduce((s, i) => s + i.nbUrgents, 0)} urgent(s)</small></div>
        <div className="kpi"><span>Travaux estimés</span><b>{euros(total)}</b><small>HT, constats chiffrés</small></div>
        <div className="kpi"><span>Conformité accessibilité</span><b>{tauxMoyen == null ? '—' : `${tauxMoyen} %`}</b><small>moyenne des ERP diagnostiqués</small></div>
        <div className="kpi"><span>Espace serveur</span><b>{octets(espace)}</b><small>sur 1 Go (offre gratuite)</small>
          <div className="barre" style={{ marginTop: 6 }}><i style={{ width: `${Math.min(100, (100 * espace) / LIMITE_GRATUITE_OCTETS)}%`, background: espace > 0.8 * LIMITE_GRATUITE_OCTETS ? 'var(--rouge)' : 'var(--violet-2)' }} /></div>
        </div>
      </section>

      <div className="deux-col">
        <section className="carte">
          <h2>Bâtiments</h2>
          {filtres.length === 0 ? <p className="vide">Aucun bâtiment ne correspond aux filtres.</p> : (
            <div className="tableau-conteneur">
              <table className="tableau">
                <thead><tr>
                  {entete('nom', 'Bâtiment')}{entete('statut', 'Avancement')}{entete('constats', 'Constats', true)}
                  {entete('urgents', 'Urgents', true)}{entete('estimation', 'Estimation', true)}{entete('taux', 'Accessibilité')}{entete('maj', 'Mis à jour')}
                </tr></thead>
                <tbody>
                  {filtres.map((i) => (
                    <tr key={i.projet.id} className="cliquable" onClick={() => nav(`/erp/${i.projet.id}`)}>
                      <td><Link to={`/erp/${i.projet.id}`} onClick={(e) => e.stopPropagation()}><b>{i.projet.nom}</b></Link>
                        <div style={{ color: 'var(--encre-2)', fontSize: 12 }}>{[i.projet.code, i.diagnostic?.type_erp && `type ${i.diagnostic.type_erp}${i.diagnostic.categorie ? ` — ${i.diagnostic.categorie}e cat.` : ''}`, i.projet.commune_deleguee].filter(Boolean).join(' · ')}</div></td>
                      <td><span className={`etiquette e-${i.statut}`}>{LIBELLE_STATUT_ERP[i.statut]}</span></td>
                      <td className="num">{i.nbConstats}</td>
                      <td className="num" style={{ color: i.nbUrgents ? 'var(--rouge)' : undefined, fontWeight: i.nbUrgents ? 600 : undefined }}>{i.nbUrgents || '—'}</td>
                      <td className="num">{i.estimation ? euros(i.estimation) : '—'}</td>
                      <td style={{ minWidth: 130 }}>{i.diagnostic ? <BarreConformite s={i.acc} /> : <span style={{ color: 'var(--encre-2)' }}>Pas de diagnostic</span>}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{date(i.derniereMaj)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section className="carte">
            <h2>Avancement</h2>
            <div className="avancement">
              {parStatut.map(({ s, n }) => (
                <div className="ligne" key={s}>
                  <span>{LIBELLE_STATUT_ERP[s]}</span>
                  <div className="barre"><i style={{ width: `${filtres.length ? (100 * n) / filtres.length : 0}%`, background: COULEUR_STATUT[s] }} /></div>
                  <span className="num">{n}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="carte">
            <h2>À traiter</h2>
            {lesAlertes.length === 0 ? <p className="vide" style={{ padding: 8 }}>Rien à signaler.</p> : (
              <ul className="alertes">
                {lesAlertes.slice(0, 12).map((a, k) => (
                  <li key={k}><span className={`point ${a.niveau}`} /><span><Link to={`/erp/${a.projetId}`}>{a.nom}</Link> — {a.texte}</span></li>
                ))}
                {lesAlertes.length > 12 && <li style={{ color: 'var(--encre-2)' }}>… et {lesAlertes.length - 12} autre(s)</li>}
              </ul>
            )}
          </section>

          <section className="carte">
            <h2>Travaux par corps d'état</h2>
            {lots.length === 0 ? <p className="vide" style={{ padding: 8 }}>Aucun constat à chiffrer.</p> : (
              <div className="avancement">
                {lots.slice(0, 12).map((l) => (
                  <div key={l.lot} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span>{l.lot} <span style={{ color: 'var(--encre-2)' }}>({l.nb}{l.urgents ? `, dont ${l.urgents} urgent${l.urgents > 1 ? 's' : ''}` : ''})</span></span>
                      <b className="num">{l.montant ? euros(l.montant) : 'non chiffré'}</b>
                    </div>
                    <div className="barre"><i style={{ width: `${(100 * l.montant) / maxLot}%`, background: 'var(--violet-2)' }} /></div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
      <DialogueProjet ouvert={creation} fermer={() => setCreation(false)} />
    </main>
  )
}
