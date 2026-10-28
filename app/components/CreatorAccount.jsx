'use client';
import { useEffect, useState } from 'react';
import CreatorBilling from './CreatorBilling';
import { ArrowLeft, UserRound, LogOut, Flag, ChevronRight, RefreshCw, KeyRound } from 'lucide-react';
import { creatorClient, creatorRequest, clearAccount, notifyAccount } from '../lib/creator-client';
function authMessage(error) {
  const code = error?.code?.toLowerCase();
  if (typeof code === 'string' && /^(smtp_|mail_|relay_)/.test(code)) return 'E-mail se nepodařilo odeslat. Kód: ' + code.toUpperCase() + '.';
  if (['invalid_credentials', 'invalid_email_or_password', 'invalid_password'].includes(code)) return 'E-mail nebo heslo nesouhlasí.';
  if (['email_not_confirmed', 'email_not_verified'].includes(code)) return 'Nejprve ověřte e-mail pomocí odkazu ve zprávě.';
  if (['over_email_send_rate_limit', 'over_request_rate_limit'].includes(code)) return 'Příliš mnoho pokusů. Počkejte chvíli a zkuste to znovu.';
  if (code === 'email_address_not_authorized') return 'Odesílání registračních e-mailů ještě není připravené. Zkuste to později.';
  if (['weak_password', 'password_too_short', 'password_too_long'].includes(code)) return 'Zvolte silnější heslo, alespoň 12 znaků.';
  if (code === 'same_password') return 'Nové heslo se musí lišit od původního.';
  if (code === 'invalid_token') return 'Odkaz vypršel nebo už byl použit. Vyžádejte si nový.';
  return 'Požadavek se nepodařilo dokončit. Zkuste to znovu.';
}
export default function CreatorAccount({ user, recovery = false, onBack, onSignedIn, onSignedOut, onRecoveryDone, savedOwners, onEnter }) {
  const [mode, setMode] = useState(recovery ? 'password' : 'login'), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [repeat, setRepeat] = useState(''), [currentPassword, setCurrentPassword] = useState(''), [name, setName] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [games, setGames] = useState([]), [ready, setReady] = useState(null), [refreshId, setRefreshId] = useState(0), [expeditionLimit,setExpeditionLimit]=useState(3);
  useEffect(() => { creatorClient().then(c => setReady(c.registrationReady)).catch(e => setError(e.message)); }, []);
  useEffect(() => { if (recovery) setMode('password'); }, [recovery]);
  useEffect(() => { if (!user) return; let live = true; setBusy(true); creatorRequest().then(result => { if (live) { setGames(result.games); setExpeditionLimit(result.expeditionLimit || 3); } }).catch(e => { if (live) setError(e.message); }).finally(() => { if (live) setBusy(false); }); return () => { live = false; }; }, [user?.id, refreshId]);
  function switchMode(next) { setMode(next); setError(''); setMessage(''); setPassword(''); setRepeat(''); }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const { client, registrationReady } = await creatorClient();
      if (mode === 'signup' || mode === 'reset') { if (!registrationReady) throw Error('Odesílání ověřovacích e-mailů a obnovy hesla se připravuje.'); }
      if (mode === 'signup' || mode === 'password') { if (password !== repeat) throw Error('Hesla se neshodují.'); }
      let result;
      if (mode === 'login') result = await client.signIn.email({ email: email.trim().toLowerCase(), password });
      else if (mode === 'signup') result = await client.signUp.email({ email: email.trim().toLowerCase(), password, name: name.trim(), callbackURL: location.origin + '/?account=verified' });
      else if (mode === 'reset') result = await client.requestPasswordReset({ email: email.trim().toLowerCase(), redirectTo: location.origin + '/?account=recovery' });
      else if (recovery) result = await client.resetPassword({ newPassword: password, token: new URLSearchParams(location.search).get('token') || '' });
      else result = await client.changePassword({ newPassword: password, currentPassword, revokeOtherSessions: true });
      if (result.error) { setError(authMessage(result.error)); return; }
      setPassword(''); setRepeat('');
      if (mode === 'login') { notifyAccount(); onSignedIn(); }
      else if (mode === 'signup') setMessage('Zkontrolujte svou e-mailovou schránku a potvrďte registraci.');
      else if (mode === 'reset') setMessage('Pokud je tento e-mail registrovaný, přijde vám zpráva pro obnovu hesla.');
      else { setCurrentPassword(''); setMessage('Heslo bylo změněno.'); if (recovery) onRecoveryDone?.(); setMode('login'); }
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function resendVerification() {
    setBusy(true); setError(''); setMessage('');
    try {
      if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw Error('Nejprve vyplňte e-mail účtu do formuláře.');
      const { client, registrationReady } = await creatorClient();
      if (!registrationReady) throw Error('Odesílání e-mailů se připravuje.');
      const result = await client.sendVerificationEmail({ email: email.trim().toLowerCase(), callbackURL: location.origin + '/?account=verified' });
      if (result.error) throw Error(authMessage(result.error));
      setMessage('Pokud účet existuje a čeká na ověření, poslali jsme nový potvrzovací odkaz.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError('');
    try { const { client } = await creatorClient(); const { error } = await client.signOut(); if (error) throw Error(authMessage(error)); clearAccount(); onSignedOut(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function claim() {
    setBusy(true); setError(''); setMessage('');
    try { const result = await creatorRequest({ action: 'claim', games: savedOwners.map(s => ({ code: s.code, token: s.token })) }); setMessage(result.limitReached ? `Přiřazeno výprav: ${result.linked}. Na účtu mohou být nejvýše 3 uložené výpravy; před přidáním dalších některou smažte.` : result.linked ? `K účtu přiřazeno výprav: ${result.linked}.` : 'Dostupné výpravy už jsou přiřazené nebo jejich záloha není platná.'); setRefreshId(v => v + 1); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const profile = user && mode !== 'password';
  return <main className="p-narrow p-account"><button className="p-back" onClick={onBack}><ArrowLeft size={18}/> Zpět</button><section className="p-panel"><UserRound className="p-big-icon"/><span className="p-kicker">ÚČET TVŮRCE</span><h1>{profile ? 'Můj profil' : mode === 'signup' ? 'Vytvořit účet' : mode === 'reset' ? 'Obnova hesla' : mode === 'password' ? 'Nové heslo' : 'Přihlášení'}</h1>{error && <p className="p-alert" role="alert">{error}</p>}{message && <p className="p-account-message" role="status">{message}</p>}
    {profile ? <><p className="p-account-email">{user.email}</p><CreatorBilling userId={user.id}/><h2>Moje výpravy ({games.length} / {expeditionLimit})</h2><p className="p-small">Limit zahrnuje i dokončené výpravy. Před přidáním čtvrté některou otevřete a zvolte Smazat celou výpravu; odstraní se i její fotografie a výsledky.</p>{busy && <p className="p-small" role="status">Načítám…</p>}<div className="p-account-games">{games.map(game => <button className="p-saved-game" key={game.code} onClick={() => onEnter(game)}><Flag size={22}/><span><strong>{game.name}</strong><small>{game.totalStations} stanovišť · {game.status === 'deleting' ? 'Dokončit mazání výpravy' : game.status === 'waiting' ? 'Připravená výprava' : 'Otevřená pro další týmy'}</small></span><ChevronRight size={18}/></button>)}</div>{!busy && !games.length && <p className="p-small">Zatím nemáte žádnou výpravu. Vytvořte ji z úvodní obrazovky.</p>}{savedOwners.length > 0 && <button className="p-secondary" disabled={busy} onClick={claim}><RefreshCw size={17}/> Přiřadit dříve uložené výpravy</button>}<button className="p-secondary" onClick={() => switchMode('password')}><KeyRound size={17}/> Změnit heslo</button><button className="p-secondary" disabled={busy} onClick={logout}><LogOut size={17}/> Odhlásit se</button></> : <><p className="p-small">{mode === 'signup' ? 'Účet potřebuje pouze tvůrce výpravy. Hráči se připojují kódem bez registrace.' : mode === 'login' ? 'Přihlaste se svým e-mailem a heslem k účtu Pátrače.' : mode === 'reset' ? 'Pošleme vám zprávu pro nastavení nového hesla.' : 'Zadejte nové heslo k účtu Pátrače.'}</p>{ready === false && ['signup','reset'].includes(mode) && <p className="p-note">Odesílání ověřovacích e-mailů se připravuje. Registrace a obnova hesla budou dostupné po jeho dokončení.</p>}<form onSubmit={submit}>{mode === 'password' && !recovery && <label className="p-label">Současné heslo<input type="password" required maxLength={128} autoComplete="current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}/></label>}{mode === 'signup' && <label className="p-label">Přezdívka<input required maxLength={60} autoComplete="nickname" value={name} onChange={e => setName(e.target.value)}/></label>}{mode !== 'password' && <label className="p-label">E-mail<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}/></label>}{mode !== 'reset' && <label className="p-label">Heslo<input type="password" required minLength={mode === 'login' ? 1 : 12} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)}/></label>}{['signup','password'].includes(mode) && <label className="p-label">Heslo znovu<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={repeat} onChange={e => setRepeat(e.target.value)}/></label>}<button className="p-primary" disabled={busy || ready === null || (ready === false && ['signup','reset'].includes(mode))}>{busy ? 'Zpracovávám…' : mode === 'login' ? 'Přihlásit se' : mode === 'signup' ? 'Vytvořit účet' : mode === 'reset' ? 'Poslat obnovu hesla' : 'Uložit nové heslo'}</button></form>{mode === 'login' ? <div className="p-account-links"><button disabled={busy} className="p-text-button" onClick={resendVerification}>Poslat ověření znovu</button><button className="p-text-button" onClick={() => switchMode('signup')}>Vytvořit účet</button><button className="p-text-button" onClick={() => switchMode('reset')}>Zapomenuté heslo</button></div> : !recovery && <button className="p-text-button" onClick={() => switchMode('login')}>Zpět na přihlášení</button>}</>}
    </section></main>;
}
