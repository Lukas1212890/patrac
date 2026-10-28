export class AdminError extends Error {
  constructor(message, status = 400, code = 'ADMIN_ERROR') { super(message); this.status = status; this.code = code; }
}
const FIELDS = 'id, name, email, emailVerified, createdAt, updatedAt';
const FRESH_MS = 15 * 60 * 1000;
const safeUser = u => ({ ...u, emailVerified: !!u.emailVerified });
export function createAdminService({ db, getSession, sendReset, sendVerification, now = Date.now }) {
  async function requireAdmin(request, write = false) {
    const session = await getSession(request);
    if (!session?.user?.emailVerified) throw new AdminError('Přihlaste se ke správcovskému účtu.', 401, 'ADMIN_LOGIN_REQUIRED');
    let role;
    try { role = await db.prepare('SELECT user_id FROM patrac_admin_accounts WHERE user_id = ?').bind(session.user.id).first(); }
    catch { throw new AdminError('Administrace zatím není nastavená.', 503, 'ADMIN_NOT_CONFIGURED'); }
    if (!role) throw new AdminError('Tento účet nemá oprávnění správce.', 403, 'ADMIN_FORBIDDEN');
    if (write && (!Number.isFinite(new Date(session.session.createdAt).getTime()) || now() - new Date(session.session.createdAt).getTime() > FRESH_MS)) throw new AdminError('Pro tuto změnu znovu potvrďte své heslo.', 428, 'ADMIN_REAUTH_REQUIRED');
    return session.user;
  }
  async function target(id) {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new AdminError('Neplatný účet.');
    const user = await db.prepare(`SELECT ${FIELDS} FROM patrac_auth_user WHERE id = ?`).bind(id).first();
    if (!user) throw new AdminError('Účet nebyl nalezen.', 404);
    return user;
  }
  async function reserve(actor, user, action, details) {
    const id = crypto.randomUUID(), stamp = now(), mail = ['reset', 'verify'].includes(action);
    const result = await db.prepare(`INSERT INTO patrac_admin_audit (id, actor_id, target_id, action, details, status, created_at)
      SELECT ?, ?, ?, ?, ?, 'pending', ?
      WHERE (SELECT COUNT(*) FROM patrac_admin_audit WHERE actor_id = ? AND created_at > ?) < 30
      AND (? = 0 OR (SELECT COUNT(*) FROM patrac_admin_audit WHERE target_id = ? AND action = ? AND created_at > ?) < 3)`)
      .bind(id, actor.id, user.id, action, JSON.stringify(details), stamp, actor.id, stamp - 60000, mail ? 1 : 0, user.id, action, stamp - 3600000).run();
    if (!result.meta.changes) throw new AdminError('Příliš časté opakování. Zkuste to později.', 429, 'ADMIN_RATE_LIMIT');
    return id;
  }
  async function finish(id, status) { await db.prepare('UPDATE patrac_admin_audit SET status = ? WHERE id = ?').bind(status, id).run(); }
  return {
    async session(request) { return { user: await requireAdmin(request) }; },
    async list(request, query = {}) {
      await requireAdmin(request);
      const q = String(query.q || '').trim().slice(0, 120), page = Number(query.page || 0);
      if (!Number.isSafeInteger(page) || page < 0 || page > 100000) throw new AdminError('Neplatná stránka.');
      const pattern = '%' + q.replace(/[\\%_]/g, c => '\\' + c) + '%';
      const where = "WHERE u.email LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\'";
      const count = await db.prepare(`SELECT COUNT(*) AS total FROM patrac_auth_user u ${where}`).bind(pattern, pattern).first();
      const stats = await db.prepare('SELECT COUNT(*) AS total, COALESCE(SUM(emailVerified),0) AS verified FROM patrac_auth_user').first();
      const rows = await db.prepare(`SELECT u.id,u.name,u.email,u.emailVerified,u.createdAt,u.updatedAt,
        (SELECT COUNT(*) FROM patrac_creator_games g WHERE g.creator_id = u.id) AS games
        FROM patrac_auth_user u ${where} ORDER BY u.createdAt DESC,u.id ASC LIMIT 20 OFFSET ?`).bind(pattern, pattern, page * 20).all();
      return { users: rows.results.map(safeUser), total: count.total, page, pageSize: 20, stats };
    },
    async detail(request, id) {
      await requireAdmin(request); const user = await target(id);
      const games = await db.prepare(`SELECT e.code,json_extract(e.payload,'$.name') AS name,json_extract(e.payload,'$.status') AS status
        FROM patrac_creator_games g JOIN patrac_expeditions e ON e.code = g.code WHERE g.creator_id = ? ORDER BY g.linked_at DESC LIMIT 100`).bind(id).all();
      const audit = await db.prepare(`SELECT a.action,a.status,a.created_at,a.details,u.email AS actor FROM patrac_admin_audit a
        LEFT JOIN patrac_auth_user u ON u.id = a.actor_id WHERE a.target_id = ? ORDER BY a.created_at DESC LIMIT 20`).bind(id).all();
      return { user: safeUser(user), games: games.results, audit: audit.results };
    },
    async change(request, input) {
      const actor = await requireAdmin(request, true), user = await target(input.id), action = input.action;
      if (!['update','reset','verify','revoke'].includes(action)) throw new AdminError('Neznámá akce.');
      let name = user.name, email = user.email, emailChanged = false;
      if (action === 'update') {
        if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 60) throw new AdminError('Přezdívka musí mít 1 až 60 znaků.');
        if (typeof input.email !== 'string' || input.email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(input.email.trim())) throw new AdminError('Zadejte platný e-mail.');
        name = input.name.trim(); email = input.email.trim().toLowerCase(); emailChanged = email !== user.email.toLowerCase();
        if (String(input.updatedAt) !== String(user.updatedAt)) throw new AdminError('Účet mezitím změnilo jiné okno. Obnovte detail.',409,'ADMIN_CONFLICT');
        if (emailChanged && await db.prepare('SELECT id FROM patrac_auth_user WHERE lower(email) = ? AND id != ?').bind(email,user.id).first()) throw new AdminError('Tento e-mail už používá jiný účet.',409,'ADMIN_EMAIL_TAKEN');
        if (name === user.name && !emailChanged) return { ok: true, message: 'Údaje už jsou aktuální.' };
      }
      const details = action === 'update' ? { oldName:user.name, name, ...(emailChanged ? {oldEmail:user.email,email} : {}) } : {};
      const auditId = await reserve(actor,user,action,details);
      try {
        if (action === 'update') {
          const revision = Math.max(now(),(new Date(user.updatedAt).getTime() || 0)+1);
          const update = db.prepare('UPDATE patrac_auth_user SET name = ?, email = ?, emailVerified = ?, updatedAt = ? WHERE id = ? AND updatedAt = ?')
            .bind(name,email,emailChanged ? 0 : user.emailVerified,revision,user.id,user.updatedAt);
          // In one transaction, changing the address invalidates both sessions and old recovery links.
          const guard = 'EXISTS (SELECT 1 FROM patrac_auth_user WHERE id = ? AND email = ? AND updatedAt = ?)';
          const changed = emailChanged ? (await db.batch([
            update,
            db.prepare('DELETE FROM patrac_auth_session WHERE userId = ? AND '+guard).bind(user.id,user.id,email,revision),
            db.prepare("DELETE FROM patrac_auth_verification WHERE value = ? AND identifier LIKE 'reset-password:%' AND "+guard).bind(user.id,user.id,email,revision),
          ]))[0] : await update.run();
          if (!changed.meta.changes) throw new AdminError('Účet mezitím změnilo jiné okno. Obnovte detail.',409,'ADMIN_CONFLICT');
          if (emailChanged) {
            try { await sendVerification(email,request); }
            catch { await finish(auditId,'saved_mail_failed'); return {ok:true,selfSignedOut:actor.id===user.id,message:'E-mail byl změněn a účet odhlášen. Ověřovací zprávu se nepodařilo odeslat; použijte Poslat ověření.',warning:true}; }
          }
        } else if (action === 'reset') await sendReset(user.email,request);
        else if (action === 'verify') {
          if (user.emailVerified) throw new AdminError('E-mail už je ověřený.');
          await sendVerification(user.email,request);
        } else await db.prepare('DELETE FROM patrac_auth_session WHERE userId = ?').bind(user.id).run();
        await finish(auditId,'success');
        return {ok:true,selfSignedOut:actor.id===user.id && (emailChanged || action==='revoke'),message:action==='reset'?'Odkaz pro obnovu hesla byl odeslán.':action==='verify'?'Ověřovací odkaz byl odeslán.':action==='revoke'?'Všechna přihlášení účtu byla ukončena.':emailChanged?'Údaje byly uloženy. Nový e-mail čeká na ověření.':'Údaje byly uloženy.'};
      } catch (error) {
        await finish(auditId,'failed');
        if (error instanceof AdminError) throw error;
        if (String(error?.message || '').includes('UNIQUE constraint')) throw new AdminError('Tento e-mail už používá jiný účet.',409,'ADMIN_EMAIL_TAKEN');
        throw new AdminError('Akci se nepodařilo dokončit. Zkuste obnovit detail účtu.',503,'ADMIN_ACTION_FAILED');
      }
    },
  };
}
