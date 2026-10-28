'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft, UserRound, LogOut, Flag, ChevronRight, RefreshCw, KeyRound } from 'lucide-react';
import { creatorClient, creatorRequest } from '../lib/creator-client';
function authMessage(error) {
  const code = error?.code;
  if (code === 'invalid_credentials') return 'E-mail nebo heslo nesouhlasí.';
  if (code === 'email_not_confirmed') return 'Nejprve ověřte e-mail pomocí odkazu ve zprávě.';
  if (['over_email_send_rate_limit', 'over_request_rate_limit'].includes(code)) return 'Příliš mnoho pokusů. Počkejte chvíli a zkuste to znovu.';
  if (code === 'email_address_not_authorized') return 'Odesílání registračních e-mailů ještě není připravené. Zkuste to později.';
  if (code === 'weak_password') return 'Zvolte silnější heslo, alespoň 10 znaků.';
  if (code === 'same_password') return 'Nové heslo se musí lišit od původního.';
  return 'Požadavek se nepodařilo dokončit. Zkuste to znovu.';
}
export default function CreatorAccount({ user, recovery = false, onBack, onSignedIn, onSignedOut, onRecoveryDone, savedOwners, onEnter }) {
  const [mode, setMode] = useState(recovery ? 'password' : 'login'), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [repeat, setRepeat] = useState(''), [name, setName] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [games, setGames] = useState([]), [ready, setReady] = useState(null), [refreshId, setRefreshId] = useState(0);
  useEffect(() => { creatorClient().then(c => setReady(c.registrationReady)).catch(e => setError(e.message)); }, []);
  useEffect(() => { if (recovery) setMode('password'); }, [recovery]);
  useEffect(() => { if (!user) return; let live = true; setBusy(true); creatorRequest().then(result => { if (live) setGames(result.games); }).catch(e => { if (live) setError(e.message); }).finally(() => { if (live) setBusy(false); }); return () => { live = false; }; }, [user?.id, refreshId]);
  function switchMode(next) { setMode(next); setError(''); setMessage(''); setPassword(''); setRepeat(''); }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const { client, registrationReady } = await creatorClient();
      if (mode === 'signup' || mode === 'reset') { if (!registrationReady) throw Error('Odesílání ověřovacích e-mailů a obnovy hesla se připravuje.'); }
      if (mode === 'signup' || mode === 'password') { if (password !== repeat) throw Error('Hesla se neshodují.'); }
      let result;
      if (mode === 'login') result = await client.auth.signInWithPassword({ email: email.trim(), password });
      else if (mode === 'signup') result = await client.auth.signUp({ email: email.trim(), password, options: { data: { nickname: name.trim() }, emailRedirectTo: location.origin + '/' } });
      else if (mode === 'reset') result = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + '/?account=recovery' });
      else result = await client.auth.updateUser({ password });
      if (result.error) { setError(authMessage(result.error)); return; }
      setPassword(''); setRepeat('');
      if (mode === 'login') onSignedIn();
      else if (mode === 'signup') setMessage('Zkontrolujte svou e-mailovou schránku a potvrďte registraci.');
      else if (mode === 'reset') setMessage('Pokud je tento e-mail registrovaný, přijde vám zpráva pro obnovu hesla.');
      else { setMessage('Heslo bylo změněno.'); onRecoveryDone?.(); setMode('login'); }
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError('');
    try { const { client } = await creatorClient(); const { error } = await client.auth.signOut({ scope: 'local' }); if (error) throw Error(authMessage(error)); onSignedOut(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function claim() {
    setBusy(true); setError(''); setMessage('');
    try { const result = await creatorRequest({ action: 'claim', games: savedOwners.map(s => ({ code: s.code, token: s.token })) }); setMessage(result.linked ? `K účtu přiřazeno výprav: ${result.linked}.` : 'Dostupné výpravy už jsou přiřazené nebo jejich záloha není platná.'); setRefreshId(v => v + 1); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const profile = user && mode !== 'password';
  return <main className="p-narrow p-account"><button className="p-back" onClick={onBack}><ArrowLeft size={18}/> Zpět</button><section className="p-panel"><UserRound className="p-big-icon"/><span className="p-kicker">ÚČET TVŮRCE</span><h1>{profile ? 'Můj profil' : mode === 'signup' ? 'Vytvořit účet' : mode === 'reset' ? 'Obnova hesla' : mode === 'password' ? 'Nové heslo' : 'Přihlášení'}</h1>{error && <p className="p-alert" role="alert">{error}</p>}{message && <p className="p-account-message" role="status">{message}</p>}
    {profile ? <><p className="p-account-email">{user.email}</p><h2>Moje výpravy</h2>{busy && <p className="p-small" role="status">Načítám…</p>}<div className="p-account-games">{games.map(game => <button className="p-saved-game" key={game.code} onClick={() => onEnter(game)}><Flag size={22}/><span><strong>{game.name}</strong><small>{game.totalStations} stanovišť · {game.status === 'waiting' ? 'Připravená výprava' : 'Spuštěná výprava'}</small></span><ChevronRight size={18}/></button>)}</div>{!busy && !games.length && <p className="p-small">Zatím nemáte žádnou výpravu. Vytvořte ji z úvodní obrazovky.</p>}{savedOwners.length > 0 && <button className="p-secondary" disabled={busy} onClick={claim}><RefreshCw size={17}/> Přiřadit dříve uložené výpravy</button>}<button className="p-secondary" onClick={() => switchMode('password')}><KeyRound size={17}/> Změnit heslo</button><button className="p-secondary" disabled={busy} onClick={logout}><LogOut size={17}/> Odhlásit se</button></> : <><p className="p-small">{mode === 'signup' ? 'Účet potřebuje pouze tvůrce výpravy. Hráči se připojují kódem bez registrace.' : mode === 'login' ? 'Přihlaste se svým e-mailem a heslem k účtu Pátrače.' : mode === 'reset' ? 'Pošleme vám zprávu pro nastavení nového hesla.' : 'Zadejte nové heslo k účtu Pátrače.'}</p>{ready === false && ['signup','reset'].includes(mode) && <p className="p-note">Odesílání ověřovacích e-mailů se připravuje. Registrace a obnova hesla budou dostupné po jeho dokončení.</p>}<form onSubmit={submit}>{mode === 'signup' && <label className="p-label">Přezdívka<input required maxLength={60} autoComplete="nickname" value={name} onChange={e => setName(e.target.value)}/></label>}{mode !== 'password' && <label className="p-label">E-mail<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}/></label>}{mode !== 'reset' && <label className="p-label">Heslo<input type="password" required minLength={mode === 'login' ? 1 : 10} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)}/></label>}{['signup','password'].includes(mode) && <label className="p-label">Heslo znovu<input type="password" required minLength={10} maxLength={128} autoComplete="new-password" value={repeat} onChange={e => setRepeat(e.target.value)}/></label>}<button className="p-primary" disabled={busy || ready === null || (ready === false && ['signup','reset'].includes(mode))}>{busy ? 'Zpracovávám…' : mode === 'login' ? 'Přihlásit se' : mode === 'signup' ? 'Vytvořit účet' : mode === 'reset' ? 'Poslat obnovu hesla' : 'Uložit nové heslo'}</button></form>{mode === 'login' ? <div className="p-account-links"><button className="p-text-button" onClick={() => switchMode('signup')}>Vytvořit účet</button><button className="p-text-button" onClick={() => switchMode('reset')}>Zapomenuté heslo</button></div> : !recovery && <button className="p-text-button" onClick={() => switchMode('login')}>Zpět na přihlášení</button>}</>}
    </section></main>;
}
