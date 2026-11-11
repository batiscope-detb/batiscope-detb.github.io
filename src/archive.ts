/**
 * Archivage d'un bâtiment clôturé (stockage sur OneDrive, seule solution disponible) :
 * 1. préparer l'archive : un .zip avec toutes les données et tous les fichiers, et son empreinte SHA-256 ;
 * 2. l'agent la dépose sur le dossier OneDrive partagé ;
 * 3. libérer l'espace : l'agent redonne le fichier, l'empreinte est vérifiée, puis les photos et plans sont
 *    supprimés du serveur (les données restent pour le tableau de bord) ;
 * 4. rouvrir : à partir du même .zip, les fichiers sont remis en place.
 */
import JSZip from 'jszip'
import { supabase, type Projet } from './donnees'
import { ecrire } from './ecriture'

export const FORMAT_ARCHIVE = 'releves-detb-archive/1'
const BUCKETS_PROJET = ['photos-releves', 'plans-releves', 'photos-accessibilite', 'documents', 'rapports'] as const

type Ligne = Record<string, unknown>
const rel = () => supabase.schema('releves')
const acc = () => supabase.schema('accessibilite')

async function lire(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Ligne[]> {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as Ligne[]
}
const ids = (l: Ligne[], cle = 'id') => l.map((x) => String(x[cle]))
async function parPaquets(valeurs: string[], f: (lot: string[]) => Promise<Ligne[]>): Promise<Ligne[]> {
  const res: Ligne[] = []
  for (let i = 0; i < valeurs.length; i += 150) res.push(...(await f(valeurs.slice(i, i + 150))))
  return res
}

/** Toutes les lignes du bâtiment, table par table (sans les lignes supprimées). */
export async function collecterDonnees(projetId: string): Promise<Record<string, Ligne[]>> {
  const projet = await lire(rel().from('projet').select('*').eq('id', projetId))
  const niveaux = await lire(rel().from('niveau').select('*').eq('projet_id', projetId).is('supprime_le', null))
  const locaux = await lire(rel().from('local').select('*').eq('projet_id', projetId).is('supprime_le', null))
  const constats = await parPaquets(ids(locaux), (l) => lire(rel().from('constat').select('*').in('local_id', l).is('supprime_le', null)))
  const nIds = ids(niveaux), cIds = ids(constats)
  const diag = await lire(acc().from('diagnostic').select('*').eq('projet_id', projetId).is('supprime_le', null))
  const dIds = ids(diag)
  const elements = dIds.length ? await lire(acc().from('element').select('*').in('diagnostic_id', dIds).is('supprime_le', null)) : []
  const eIds = ids(elements)
  const parDiag = async (t: string) => (dIds.length ? lire(acc().from(t).select('*').in('diagnostic_id', dIds).is('supprime_le', null)) : [])
  return {
    'releves.projet': projet, 'releves.niveau': niveaux, 'releves.local': locaux, 'releves.constat': constats,
    'releves.constat_point_controle': await parPaquets(cIds, (l) => lire(rel().from('constat_point_controle').select('*').in('constat_id', l).is('supprime_le', null))),
    'releves.constat_interaction': await parPaquets(cIds, (l) => lire(rel().from('constat_interaction').select('*').in('constat_id', l).is('supprime_le', null))),
    'releves.photo': await parPaquets(cIds, (l) => lire(rel().from('photo').select('*').in('constat_id', l).is('supprime_le', null))),
    'releves.plan_niveau': await parPaquets(nIds, (l) => lire(rel().from('plan_niveau').select('*').in('niveau_id', l).is('supprime_le', null))),
    'releves.marqueur_local': await parPaquets(nIds, (l) => lire(rel().from('marqueur_local').select('*').in('niveau_id', l).is('supprime_le', null))),
    'releves.annotation': await parPaquets(nIds, (l) => lire(rel().from('annotation').select('*').in('niveau_id', l).is('supprime_le', null))),
    'releves.document': await lire(rel().from('document').select('*').eq('projet_id', projetId).is('supprime_le', null)),
    'releves.verification_periodique': await lire(rel().from('verification_periodique').select('*').eq('projet_id', projetId).is('supprime_le', null)),
    'accessibilite.diagnostic': diag,
    'accessibilite.acc_niveau': await parPaquets(nIds, (l) => lire(acc().from('acc_niveau').select('*').in('niveau_id', l).is('supprime_le', null))),
    'accessibilite.element': elements,
    'accessibilite.constat': await parPaquets(eIds, (l) => lire(acc().from('constat').select('*').in('element_id', l).is('supprime_le', null))),
    'accessibilite.photo': await parPaquets(eIds, (l) => lire(acc().from('photo').select('*').in('element_id', l).is('supprime_le', null))),
    'accessibilite.derogation': await parDiag('derogation'),
    'accessibilite.solution_effet_equivalent': await parDiag('solution_effet_equivalent'),
    'accessibilite.avis_commission': await parDiag('avis_commission'),
    'accessibilite.notice_entete': await parDiag('notice_entete'),
    'accessibilite.notice_paragraphe': await parDiag('notice_paragraphe'),
  }
}

/** Tous les fichiers du bâtiment dans le stockage (dossier <projet>/ de chaque bucket, sous-dossiers compris). */
export async function listerFichiers(projetId: string): Promise<{ bucket: string; chemin: string; taille: number }[]> {
  const res: { bucket: string; chemin: string; taille: number }[] = []
  async function parcourir(bucket: string, dossier: string) {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.storage.from(bucket).list(dossier, { limit: 1000, offset })
      if (error) throw new Error(`${bucket} : ${error.message}`)
      for (const o of data ?? []) {
        const chemin = `${dossier}/${o.name}`
        if (o.id == null) await parcourir(bucket, chemin) // sous-dossier
        else res.push({ bucket, chemin, taille: Number((o.metadata as { size?: number } | null)?.size ?? 0) })
      }
      if (!data || data.length < 1000) break
    }
  }
  for (const b of BUCKETS_PROJET) await parcourir(b, projetId)
  return res
}

export async function empreinte(fichier: Blob): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', await fichier.arrayBuffer())
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

const nomFichier = (p: Projet) => `Archive_${(p.code ? `${p.code}_` : '') + p.nom}_${new Date().toISOString().slice(0, 10)}.zip`.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, '_')

/** Prépare l'archive (.zip) et enregistre son nom et son empreinte sur la fiche. */
export async function preparerArchive(p: Projet, agent: string, progression: (texte: string) => void): Promise<{ fichier: Blob; nom: string; empreinte: string; nbFichiers: number }> {
  progression('Lecture des données…')
  const donnees = await collecterDonnees(p.id)
  progression('Inventaire des photos et plans…')
  const fichiers = await listerFichiers(p.id)
  const zip = new JSZip()
  let n = 0
  for (const f of fichiers) {
    progression(`Téléchargement des fichiers : ${++n} / ${fichiers.length}`)
    const { data, error } = await supabase.storage.from(f.bucket).download(f.chemin)
    if (error || !data) throw new Error(`Fichier ${f.chemin} illisible : ${error?.message ?? 'inconnu'}`)
    zip.file(`fichiers/${f.bucket}/${f.chemin}`, data)
  }
  const manifeste = {
    format: FORMAT_ARCHIVE, cree_le: new Date().toISOString(), cree_par: agent,
    projet: { id: p.id, nom: p.nom, code: p.code, adresse: p.adresse, commune_deleguee: p.commune_deleguee },
    statut_avant: p.statut, fichiers: fichiers.map((f) => ({ bucket: f.bucket, chemin: f.chemin, taille: f.taille })),
    lignes: Object.fromEntries(Object.entries(donnees).map(([t, l]) => [t, l.length])),
  }
  zip.file('manifeste.json', JSON.stringify(manifeste, null, 2))
  zip.file('donnees.json', JSON.stringify(donnees, null, 2))
  zip.file('LISEZMOI.txt', [
    `Archive du bâtiment « ${p.nom} » — Relevés DETB, Ville de Cherbourg-en-Cotentin.`,
    `Créée le ${new Date().toLocaleString('fr-FR')} par ${agent}.`, '',
    'Contenu : donnees.json (toutes les données du relevé et du diagnostic), fichiers/ (photos et plans), manifeste.json (inventaire).',
    'Ne pas modifier ni renommer ce fichier : son empreinte est vérifiée avant de libérer l’espace serveur et lors de la réouverture.',
    'Pour rouvrir le bâtiment : appli bureau → fiche du bâtiment → Synthèse → « Rouvrir depuis l’archive ».',
  ].join('\r\n'))
  progression('Compression…')
  const fichier = await zip.generateAsync({ type: 'blob', compression: 'STORE' }) // photos et PDF déjà compressés
  const h = await empreinte(fichier)
  const nom = nomFichier(p)
  const { data: u } = await supabase.auth.getUser()
  await ecrire('releves', 'projet', { archive_nom: nom, archive_sha256: h, archive_le: new Date().toISOString(), archive_par: u.user?.id ?? null }, { cle: { id: p.id }, majLeConnue: null })
  return { fichier, nom, empreinte: h, nbFichiers: fichiers.length }
}

/** Vérifie l'archive redonnée par l'agent (même empreinte que celle enregistrée, même bâtiment). */
export async function verifierArchive(p: Projet & { archive_sha256?: string | null }, fichier: File): Promise<{ zip: JSZip; manifeste: { projet: { id: string }; statut_avant: string; fichiers: { bucket: string; chemin: string }[] }; conforme: boolean }> {
  const h = await empreinte(fichier)
  const zip = await JSZip.loadAsync(fichier)
  const m = zip.file('manifeste.json')
  if (!m) throw new Error("Ce fichier n'est pas une archive Relevés DETB (manifeste absent).")
  const manifeste = JSON.parse(await m.async('string'))
  if (manifeste.format !== FORMAT_ARCHIVE) throw new Error('Format d’archive inconnu.')
  if (manifeste.projet?.id !== p.id) throw new Error(`Cette archive concerne un autre bâtiment (« ${manifeste.projet?.nom ?? '?'} »).`)
  return { zip, manifeste, conforme: !!p.archive_sha256 && h === p.archive_sha256 }
}

/** Supprime du serveur les photos et plans du bâtiment, après vérification de l'archive. Réservé aux administrateurs. */
export async function libererEspace(p: Projet, progression: (t: string) => void): Promise<number> {
  const fichiers = await listerFichiers(p.id)
  const donnees = await collecterDonnees(p.id)
  // 1. Les fiches ne pointent plus vers les fichiers (les tablettes cessent de les réclamer).
  const vider: [string, string, string, string][] = [
    ...donnees['releves.photo'].filter((x) => x.storage_path).map((x) => ['releves', 'photo', 'id', String(x.id)] as [string, string, string, string]),
    ...donnees['accessibilite.photo'].filter((x) => x.storage_path).map((x) => ['accessibilite', 'photo', 'id', String(x.id)] as [string, string, string, string]),
    ...donnees['releves.plan_niveau'].filter((x) => x.storage_path).map((x) => ['releves', 'plan_niveau', 'niveau_id', String(x.niveau_id)] as [string, string, string, string]),
  ]
  let n = 0
  for (const [schema, table, cle, id] of vider) {
    progression(`Mise à jour des fiches : ${++n} / ${vider.length}`)
    await ecrire(schema as 'releves', table, { storage_path: null }, { cle: { [cle]: id }, majLeConnue: null })
  }
  // 2. Suppression des fichiers, par lots.
  const parBucket = new Map<string, string[]>()
  for (const f of fichiers) parBucket.set(f.bucket, [...(parBucket.get(f.bucket) ?? []), f.chemin])
  let supprimes = 0
  for (const [bucket, chemins] of parBucket) {
    for (let i = 0; i < chemins.length; i += 100) {
      progression(`Suppression des fichiers : ${supprimes} / ${fichiers.length}`)
      const { data, error } = await supabase.storage.from(bucket).remove(chemins.slice(i, i + 100))
      if (error) throw new Error(`Suppression impossible (${bucket}) : ${error.message}`)
      supprimes += data?.length ?? 0
    }
  }
  await ecrire('releves', 'projet', { photo_path: null, statut: 'archive', date_statut: new Date().toISOString().slice(0, 10) }, { cle: { id: p.id }, majLeConnue: null })
  return supprimes
}

/** Remet en place les fichiers d'une archive et rétablit les liens et le statut d'avant l'archivage. */
export async function rouvrir(p: Projet, zip: JSZip, manifeste: { statut_avant: string; fichiers: { bucket: string; chemin: string }[] }, progression: (t: string) => void): Promise<number> {
  const donnees = JSON.parse(await zip.file('donnees.json')!.async('string')) as Record<string, Ligne[]>
  let n = 0
  for (const f of manifeste.fichiers) {
    progression(`Envoi des fichiers : ${++n} / ${manifeste.fichiers.length}`)
    const entree = zip.file(`fichiers/${f.bucket}/${f.chemin}`)
    if (!entree) continue
    const blob = await entree.async('blob')
    const type = f.chemin.endsWith('.pdf') ? 'application/pdf' : f.chemin.endsWith('.png') ? 'image/png' : 'image/jpeg'
    const { error } = await supabase.storage.from(f.bucket).upload(f.chemin, blob, { upsert: true, contentType: type })
    if (error) throw new Error(`Envoi de ${f.chemin} impossible : ${error.message}`)
  }
  const retablir: [string, string, string, Ligne][] = [
    ...(donnees['releves.photo'] ?? []).filter((x) => x.storage_path).map((x) => ['releves', 'photo', 'id', x] as [string, string, string, Ligne]),
    ...(donnees['accessibilite.photo'] ?? []).filter((x) => x.storage_path).map((x) => ['accessibilite', 'photo', 'id', x] as [string, string, string, Ligne]),
    ...(donnees['releves.plan_niveau'] ?? []).filter((x) => x.storage_path).map((x) => ['releves', 'plan_niveau', 'niveau_id', x] as [string, string, string, Ligne]),
  ]
  n = 0
  for (const [schema, table, cle, x] of retablir) {
    progression(`Rétablissement des fiches : ${++n} / ${retablir.length}`)
    try { await ecrire(schema as 'releves', table, { storage_path: x.storage_path }, { cle: { [cle]: String(x[cle]) }, majLeConnue: null }) } catch { /* ligne supprimée depuis : ignorée */ }
  }
  const photoBat = (donnees['releves.projet'] ?? [])[0]?.photo_path ?? null
  await ecrire('releves', 'projet', { statut: manifeste.statut_avant === 'archive' ? 'atteste' : manifeste.statut_avant, photo_path: photoBat, date_statut: new Date().toISOString().slice(0, 10) }, { cle: { id: p.id }, majLeConnue: null })
  return manifeste.fichiers.length
}
