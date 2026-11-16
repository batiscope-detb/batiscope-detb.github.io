// Gestion des comptes agents (réservée aux administrateurs actifs).
// Appelée par l'appli bureau avec la session de l'agent connecté ; la clé secrète du projet
// n'existe que dans l'environnement de la fonction, jamais dans le code des applis.
import { createClient } from 'npm:@supabase/supabase-js@2.50.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const repondre = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...CORS, 'Content-Type': 'application/json' } })

function cleSecrete(): string {
  try {
    const k = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}')?.default
    if (k) return k
  } catch { /* variable absente : clé historique */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
}

const ROLES = ['agent', 'admin', 'tablette']
const emailValide = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return repondre({ erreur: 'Méthode non autorisée' }, 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, cleSecrete(), { auth: { persistSession: false, autoRefreshToken: false } })
  const jeton = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: u, error: eu } = await admin.auth.getUser(jeton)
  if (eu || !u?.user) return repondre({ erreur: 'Session invalide : reconnectez-vous.' }, 401)
  const moi = u.user.id
  // Nouvelle requête à chaque appel : un même objet de requête accumulerait les filtres.
  const agents = () => admin.schema('releves').from('agent')
  const { data: profil } = await agents().select('role,actif').eq('id', moi).maybeSingle()
  if (!profil?.actif || profil.role !== 'admin') return repondre({ erreur: 'Réservé aux administrateurs.' }, 403)

  let corps: Record<string, unknown>
  try { corps = await req.json() } catch { return repondre({ erreur: 'Requête illisible' }, 400) }
  const action = String(corps.action ?? '')

  try {
    if (action === 'lister') {
      const [{ data: lignes, error }, { data: comptes, error: ec }] = await Promise.all([
        agents().select('id,nom,email,role,actif,cree_le').order('nom'),
        admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      ])
      if (error) throw error
      if (ec) throw ec
      const parId = new Map(comptes.users.map((c) => [c.id, c]))
      return repondre({ agents: (lignes ?? []).map((a) => {
        const c = parId.get(a.id)
        return { ...a, derniere_connexion: c?.last_sign_in_at ?? null, mdp_provisoire: !!c?.user_metadata?.mdp_provisoire }
      }) })
    }

    if (action === 'creer') {
      const email = String(corps.email ?? '').trim().toLowerCase()
      const nom = String(corps.nom ?? '').trim()
      const role = String(corps.role ?? 'agent')
      const motDePasse = String(corps.motDePasse ?? '')
      if (!emailValide(email)) return repondre({ erreur: 'Adresse électronique invalide.' }, 400)
      if (!nom) return repondre({ erreur: 'Le nom est obligatoire.' }, 400)
      if (!ROLES.includes(role)) return repondre({ erreur: 'Rôle inconnu.' }, 400)
      if (motDePasse.length < 10) return repondre({ erreur: 'Mot de passe provisoire trop court (10 caractères minimum).' }, 400)
      const { data: cree, error } = await admin.auth.admin.createUser({
        // Compte de tablette partagée : mot de passe saisi une fois sur la tablette, pas de changement imposé.
        email, password: motDePasse, email_confirm: true, user_metadata: { nom, mdp_provisoire: role !== 'tablette' },
      })
      if (error) {
        if (/already|registered|exists/i.test(error.message)) return repondre({ erreur: 'Un compte existe déjà avec cette adresse.' }, 409)
        throw error
      }
      const { error: ea } = await agents().upsert({ id: cree.user.id, nom, email, role, actif: true }, { onConflict: 'id' })
      if (ea) throw ea
      return repondre({ ok: true, id: cree.user.id })
    }

    if (action === 'modifier') {
      const id = String(corps.id ?? '')
      const maj: Record<string, unknown> = {}
      if (typeof corps.nom === 'string' && corps.nom.trim()) maj.nom = corps.nom.trim()
      if (typeof corps.role === 'string') { if (!ROLES.includes(corps.role)) return repondre({ erreur: 'Rôle inconnu.' }, 400); maj.role = corps.role }
      if (typeof corps.actif === 'boolean') maj.actif = corps.actif
      if (id === moi && ((maj.role && maj.role !== 'admin') || maj.actif === false)) return repondre({ erreur: 'Vous ne pouvez pas retirer vos propres droits d’administrateur.' }, 400)
      if (!Object.keys(maj).length) return repondre({ erreur: 'Rien à modifier.' }, 400)
      const { data: modifies, error } = await agents().update(maj).eq('id', id).select('id')
      if (error) throw error
      if (!modifies?.length) return repondre({ erreur: 'Agent introuvable.' }, 404)
      if (typeof maj.actif === 'boolean') {
        // Compte désactivé : connexion bloquée en plus de la perte d'accès aux données.
        const { error: eb } = await admin.auth.admin.updateUserById(id, { ban_duration: maj.actif ? 'none' : '876000h' })
        if (eb) throw eb
      }
      if (maj.nom) await admin.auth.admin.updateUserById(id, { user_metadata: { nom: maj.nom } })
      return repondre({ ok: true })
    }

    if (action === 'reinitialiser') {
      const id = String(corps.id ?? '')
      const motDePasse = String(corps.motDePasse ?? '')
      if (id === moi) return repondre({ erreur: 'Changez votre propre mot de passe dans « Mon compte ».' }, 400)
      if (motDePasse.length < 10) return repondre({ erreur: 'Mot de passe provisoire trop court (10 caractères minimum).' }, 400)
      const { error } = await admin.auth.admin.updateUserById(id, { password: motDePasse, user_metadata: { mdp_provisoire: true } })
      if (error) throw error
      return repondre({ ok: true })
    }

    return repondre({ erreur: 'Action inconnue' }, 400)
  } catch (e) {
    return repondre({ erreur: e instanceof Error ? e.message : String(e) }, 500)
  }
})
