import { useCallback, useEffect, useState } from 'react'
import { BoutonFichier, executer, signaler } from '../../composants/Ui'
import { BUCKET, enregistrer, lireModelesExe, supprimer, type ModeleExe } from '../donnees'
import { deposer } from '../horsligne'
import { CODES, TITRES, specExe, type CodeExe, type Identite } from '../reception/exe'
import { verifierModele } from '../reception/remplir'
import { telecharger } from '../diffusion'
import { chargerModele } from '../reception/documents'
import { dateFr } from '../ui'

const VIDE: Identite = {
  titulaire: { raison: '', adresse1: '', adresse2: '', tel: '', mail: '', siret: '' }, direction: { nom: '', pole: '', adresse: '', codePostal: '' },
  agent: { nom: '', tel: '', mail: '' }, moe: '', objet: '', lieu: '', lot: '', lotCode: '', marche: '', prestations: '', partielle: false,
}

/**
 * Modèles des formulaires EXE : formulaires DAJ intégrés, remplaçables par un administrateur quand la DAJ publie une
 * nouvelle version (.docx). Chaque modèle importé est contrôlé : les zones attendues doivent y être retrouvées.
 */
export function ModelesExe({ admin }: { admin: boolean }) {
  const [modeles, setModeles] = useState<ModeleExe[]>([])
  const charger = useCallback(async () => setModeles(await lireModelesExe().catch(() => [])), [])
  useEffect(() => { void charger() }, [charger])

  async function importer(code: CodeExe, f: File) {
    if (!/\.docx$/i.test(f.name)) return signaler('Importez un fichier Word au format .docx (dans Word : Fichier › Enregistrer sous › .docx).', 'erreur')
    const ok = await executer(async () => {
      const { cases, manquantes } = await verifierModele(f, specExe(code, VIDE, {}, []))
      if (code !== 'EXE7' && cases === 0) throw new Error('Aucune case à cocher Word dans ce document : ce n’est pas le formulaire attendu.')
      if (manquantes.length && !confirm(`${manquantes.length} zone(s) du formulaire ${code} ne sont pas retrouvées dans ce modèle (le texte de la DAJ a peut-être changé) :\n\n• ${manquantes.slice(0, 8).join('\n• ')}\n\nElles resteront à compléter à la main dans Word. Importer quand même ?`)) return false
      const chemin = `modeles-exe/${code}-${Date.now()}.docx`
      await deposer(BUCKET, chemin, f, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      for (const m of modeles.filter((x) => x.code === code)) await supprimer('modele_exe', m.id)
      await enregistrer('modele_exe', { code, chemin, nom_fichier: f.name })
      return true
    }, `Modèle ${code} importé`)
    if (ok) await charger()
  }

  return <>
    <h3 style={{ margin: '8px 0 0' }}>Modèles des formulaires EXE (module Réception)</h3>
    <p className="note-param">Les formulaires de la DAJ sont intégrés. Quand la DAJ publie une nouvelle version, importez-la ici au format .docx : les zones à remplir sont contrôlées à l’import.{!admin && ' Import réservé aux administrateurs.'}</p>
    <div className="tableau-conteneur"><table className="tableau">
      <thead><tr><th>Formulaire</th><th>Modèle utilisé</th><th /></tr></thead>
      <tbody>{CODES.map((code) => {
        const m = modeles.find((x) => x.code === code)
        return <tr key={code}>
          <td><b>{code}</b> — {TITRES[code]}</td>
          <td>{m ? <>Importé{m.cree_le ? ` le ${dateFr(m.cree_le)}` : ''}<br /><span className="note-param">{m.nom_fichier}</span></> : 'Formulaire DAJ intégré'}</td>
          <td style={{ whiteSpace: 'nowrap' }}>
            <button type="button" className="bouton petit" onClick={async () => { const r = await executer(() => chargerModele(code)); if (r) telecharger(`${code}.docx`, new Blob([r.contenu])) }}>Télécharger</button>{' '}
            {admin && <BoutonFichier className="bouton petit" libelle="Importer…" accept=".docx" choisir={([f]) => f && importer(code, f)} />}{' '}
            {admin && m && <button type="button" className="bouton petit" onClick={async () => {
              if (confirm(`Revenir au formulaire DAJ intégré pour ${code} ?`) && await executer(() => supprimer('modele_exe', m.id).then(() => true), 'Modèle intégré rétabli')) await charger()
            }}>Rétablir l’intégré</button>}
          </td>
        </tr>
      })}</tbody>
    </table></div>
  </>
}
