import { useMemo, useState } from 'react'
import { REGLES, VERSION_REFERENTIEL, libelleSeuil, paliersDe } from '../moteur'
import { SCHEMAS, SchemaRegle, schemaDe, urlSchema } from '../composants/Schema'

/** Consultation du référentiel de contrôle (mêmes règles que la tablette). */
export default function Referentiel() {
  const [q, setQ] = useState('')
  const [theme, setTheme] = useState('')
  const [schema, setSchema] = useState('')
  const themes = useMemo(() => [...new Set(REGLES.map((r) => r.theme))].sort(), [])
  const liste = useMemo(() => {
    const t = q.trim().toLowerCase()
    return REGLES.filter((r) => !r.parent && (!theme || r.theme === theme) && (!schema || schemaDe(r.id) === schema) &&
      (!t || [r.id, r.point, r.element, r.article].some((v) => v?.toLowerCase().includes(t))))
  }, [q, theme, schema])
  return (
    <main className="page">
      <div className="titre-page"><div><h1>Référentiel accessibilité</h1><p className="sous-titre">{VERSION_REFERENTIEL} — {REGLES.length} règles dont {REGLES.filter((r) => r.parent).length} tolérances ERP existants</p></div></div>
      <div className="filtres">
        <label>Rechercher<input className="champ" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code, point, article" /></label>
        <label>Thème<select className="champ" value={theme} onChange={(e) => setTheme(e.target.value)}><option value="">Tous</option>{themes.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label>Schéma<select className="champ" value={schema} onChange={(e) => setSchema(e.target.value)}><option value="">Tous</option>{SCHEMAS.map((s) => <option key={s.nom} value={s.nom}>{s.titre}</option>)}</select></label>
      </div>
      <details className="carte galerie-schemas">
        <summary>Schémas cotés ({SCHEMAS.length}) — cliquez sur un schéma pour voir les règles qu'il illustre</summary>
        <div className="grille-schemas">
          {SCHEMAS.map((s) => (
            <button key={s.nom} type="button" className={`carte-schema${schema === s.nom ? ' choisi' : ''}`} onClick={() => { setSchema(schema === s.nom ? '' : s.nom); setTheme('') }}>
              <img src={urlSchema(s.nom)} alt="" loading="lazy" />
              <b>{s.titre}</b>
              <small>{s.regles.filter((r) => !REGLES.find((x) => x.id === r)?.parent).length} règle(s)</small>
            </button>
          ))}
        </div>
      </details>
      <section className="carte tableau-conteneur">
        <table className="tableau">
          <thead><tr><th>Code</th><th>Élément</th><th>Point de contrôle</th><th>Exigence</th><th>Gravité</th><th>Article</th><th>Schéma</th></tr></thead>
          <tbody>{liste.map((r, k) => (
            <tr key={r.id} style={r.obsoleteDepuis ? { opacity: 0.55 } : undefined}>
              <td style={{ whiteSpace: 'nowrap' }}>{r.id}</td><td>{r.element}</td>
              <td>{r.point}{r.obsoleteDepuis && <div style={{ fontSize: 12 }}>Sans effet depuis le {new Date(r.obsoleteDepuis).toLocaleDateString('fr-FR')}</div>}
                {paliersDe(r.id).map((p) => <div key={p.id} style={{ fontSize: 12, color: '#1F6B55' }}>Tolérance {p.id} : {p.point}{libelleSeuil(p) ? ` (${libelleSeuil(p)})` : ''}</div>)}
                {r.declencheur !== 'Permanent' && <div style={{ fontSize: 12, color: 'var(--encre-2)' }}>Applicable en cas de {r.declencheur.toLowerCase()}</div>}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{libelleSeuil(r) ?? r.valeurTexte ?? '—'}</td>
              <td><span className={`etiquette ${r.gravite === 'Bloquant' ? 'e-rouge' : r.gravite === 'Majeur' ? 'e-ambre' : 'e-gris'}`}>{r.gravite}</span></td>
              <td style={{ fontSize: 12 }}>{r.article}</td>
              <td><SchemaRegle regleId={r.id} compact={k > 0 && schemaDe(liste[k - 1].id) === schemaDe(r.id)} /></td>
            </tr>
          ))}</tbody>
        </table>
      </section>
    </main>
  )
}
