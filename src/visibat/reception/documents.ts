/** Génération des formulaires EXE d'une réception : modèle (importé ou intégré), identités, fichier Word, brouillon Outlook. */
import { urlsSignees } from '../../donnees'
import { BUCKET, lireModelesExe, type Affectation, type Agent, type Contact, type Direction, type Dossier, type Reception } from '../donnees'
import { construireEml, nomFichier, telecharger } from '../diffusion'
import { fichierLocal, garderFichier } from '../horsligne'
import { CATEGORIES, TITRES, specExe, type CodeExe, type Identite, type Reserve } from './exe'
import { remplirDocx } from './remplir'

/** Modèle Word : le dernier importé par un administrateur, sinon le formulaire DAJ intégré à l'application. */
export async function chargerModele(code: CodeExe): Promise<{ contenu: ArrayBuffer; importe: boolean }> {
  const importes = await lireModelesExe().catch(() => [])
  const m = importes.find((x) => x.code === code)
  if (m) {
    let b = await fichierLocal(BUCKET, m.chemin)
    if (!b) {
      const url = (await urlsSignees(BUCKET, [m.chemin])).get(m.chemin)
      if (url) { b = await (await fetch(url)).blob(); void garderFichier(BUCKET, m.chemin, b) }
    }
    if (b) return { contenu: await b.arrayBuffer(), importe: true }
  }
  const r = await fetch(`./exe/${code}.docx`)
  if (!r.ok) throw new Error(`Modèle ${code} introuvable.`)
  return { contenu: await r.arrayBuffer(), importe: false }
}

export interface Contexte {
  dossier: Dossier; reception: Reception; contacts: Contact[]; agents: Agent[]; directions: Direction[]; affectations: Affectation[]
}

/** Réserves d'une réception, au format des formulaires (localisation = plan où la pastille est posée). */
export function reservesDe(dossier: Dossier, receptionId: string): Reserve[] {
  return dossier.reserves.filter((r) => r.reception_id === receptionId).map((r) => {
    const pos = dossier.positions.find((p) => p.observation_id === r.id)
    const plan = pos && dossier.plans.find((p) => p.id === pos.plan_id)
    return { id: r.id, numero: r.numero, texte: r.texte, categorie_reserve: r.categorie_reserve ?? 'malfacon', echeance: r.echeance, soldee_le: r.soldee_le, localisation: plan ? `plan ${plan.libelle}` : undefined }
  })
}

/** Zones [entre crochets] des formulaires, tirées de la fiche marché, du carnet d'adresses et des paramètres. */
export function identite({ dossier, reception: r, contacts, agents, directions, affectations }: Contexte): Identite {
  const op = dossier.operation
  const lot = dossier.lots.find((l) => l.id === r.lot_id)
  const tit = contacts.find((c) => c.id === r.titulaire_contact_id)
  const lignes = (tit?.adresse ?? '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
  const dir = directions.find((d) => d.id === op.direction_id) ?? directions[0]
  const agent = agents.find((a) => a.id === r.moe_agent_id)
  const aff = affectations.find((a) => a.agent_id === agent?.id)
  return {
    titulaire: {
      raison: tit?.societe || [tit?.prenom, tit?.nom].filter(Boolean).join(' ') || '',
      adresse1: lignes[0] ?? '', adresse2: lignes.slice(1).join(', '), tel: tit?.telephone || tit?.mobile || '', mail: tit?.email ?? '', siret: tit?.siret ?? '',
    },
    direction: { nom: dir?.nom ?? 'Direction Études et Travaux Bâtiments', pole: dir?.pole ?? '', adresse: dir?.adresse ?? '', codePostal: dir?.code_postal ?? '' },
    agent: { nom: agent?.nom ?? r.moe_nom ?? '', tel: aff?.telephone ?? '', mail: agent?.email ?? '' },
    moe: r.moe_nom || agent?.nom || '',
    objet: r.objet_marche || op.objet || op.nom, lieu: String(r.donnees.lieu ?? op.adresse ?? ''),
    lot: lot ? `Lot ${lot.code} – ${lot.libelle}` : '', lotCode: lot?.code ?? '', marche: r.numero_marche || lot?.marche || '',
    prestations: r.prestations ?? '', partielle: r.partielle,
  }
}

export const nomDocument = (code: CodeExe, ctx: Contexte) => {
  const lot = ctx.dossier.lots.find((l) => l.id === ctx.reception.lot_id)
  return `${code} - ${lot ? `Lot ${lot.code} - ` : ''}${TITRES[code]} - ${nomFichier(ctx.dossier.operation.nom)}.docx`.replace(/[\\/:*?"<>|’]/g, '-')
}

/** Produit le formulaire Word rempli. `manquantes` : zones du modèle importé qui n'ont pas été retrouvées. */
export async function genererExe(code: CodeExe, ctx: Contexte) {
  const { contenu, importe } = await chargerModele(code)
  const lieu = String(ctx.reception.donnees.lieu_signature ?? 'Cherbourg-en-Cotentin')
  const r = await remplirDocx(contenu, specExe(code, identite(ctx), ctx.reception.donnees, reservesDe(ctx.dossier, ctx.reception.id), lieu))
  return { ...r, importe, nom: nomDocument(code, ctx) }
}

/** Brouillon Outlook au titulaire, formulaire joint. */
export async function envoyerExe(code: CodeExe, ctx: Contexte, signature: string) {
  const g = await genererExe(code, ctx)
  const tit = ctx.contacts.find((c) => c.id === ctx.reception.titulaire_contact_id)
  const id = identite(ctx)
  const objet = `${ctx.dossier.operation.nom} – ${id.lot || 'Marché'} – ${TITRES[code]} (${code})`
  const corps = `Madame, Monsieur,\n\nVeuillez trouver ci-joint le document « ${TITRES[code]} » (formulaire ${code}) relatif au marché ${id.marche || ''}${id.lot ? `, ${id.lot}` : ''}.\n\nCordialement,\n\n${signature}`
  const eml = construireEml(tit?.email ? [tit.email] : [], objet, corps, [{ nom: g.nom, contenu: new Uint8Array(await g.fichier.arrayBuffer()), type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }])
  telecharger(g.nom.replace(/\.docx$/, '.eml'), new Blob([eml], { type: 'message/rfc822' }))
  return g
}

export const libelleCategorie = (c: string | null | undefined) => CATEGORIES.find((x) => x.code === c)?.court ?? 'Malfaçon'
