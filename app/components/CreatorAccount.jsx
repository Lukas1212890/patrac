'use client';
import { useEffect, useRef, useState } from 'react';
import LegalLinks from './LegalLinks';
import {LEGAL_VERSION} from '../../shared/legal.mjs';
import AccountNotifications from './AccountNotifications';
import CreatorBilling from './CreatorBilling';
import { ArrowLeft, UserRound, LogOut, KeyRound } from 'lucide-react';
import { creatorClient, clearAccount, notifyAccount, creatorRequest } from '../lib/creator-client';
function authMessage(error) {
  const code = error?.code?.toLowerCase();
  if(code==='legal_acceptance_required')return 'Potvrďte věk alespoň 18 let a aktuální obchodní podmínky. Případně obnovte aplikaci.';
  if(code==='nickname_taken')return 'Přezdívka je obsazená nebo neplatná. Zvolte jinou.';
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
export default function CreatorAccount({ notificationState={}, user, recovery = false, onBack, onSignedIn, onSignedOut, onRecoveryDone }) {
  const registrationNotice=useRef(null);
  const [registrationBonusMonths,setRegistrationBonusMonths]=useState(0);

  const [adultConfirmed,setAdultConfirmed]=useState(false),[termsAccepted,setTermsAccepted]=useState(false);
  const [mode, setMode] = useState(recovery ? 'password' : 'login'), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [repeat, setRepeat] = useState(''), [currentPassword, setCurrentPassword] = useState(''), [name, setName] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [ready, setReady] = useState(null), [nickname,setNickname]=useState(''),[nicknamePassword,setNicknamePassword]=useState(''),[nicknameAck,setNicknameAck]=useState(false),[nicknameOpen,setNicknameOpen]=useState(false);
  useEffect(()=>{if(mode==='signup-sent'){registrationNotice.current?.focus({preventScroll:true});registrationNotice.current?.scrollIntoView({block:'start',behavior:'instant'});}},[mode]);
  useEffect(() => { creatorClient().then(c => {setReady(c.registrationReady);setRegistrationBonusMonths(c.registrationBonusMonths||0);}).catch(e => setError(e.message)); }, []);
  useEffect(() => { if (recovery) setMode('password'); }, [recovery]);
  useEffect(()=>{setNickname(user?.name||'');},[user?.name]);
  async function saveNickname(event){event.preventDefault();setBusy(true);setError('');setMessage('');try{await creatorRequest({action:'nickname',name:nickname,password:nicknamePassword,acknowledge:nicknameAck,oldName:user.name});setNicknamePassword('');setNicknameAck(false);setNicknameOpen(false);notifyAccount();setMessage('Přezdívka byla uložena. Použije se i ve veřejných žebříčcích.');}catch(e){setError(e.message);}finally{setBusy(false);}}
  function switchMode(next) { setMode(next); setError(''); setMessage(''); setPassword(''); setRepeat(''); }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const { client, registrationReady } = await creatorClient();
      if (mode === 'signup' || mode === 'reset') { if (!registrationReady) throw Error('Odesílání ověřovacích e-mailů a obnovy hesla se připravuje.'); }
      if(mode==='signup'&&(!adultConfirmed||!termsAccepted))throw Error('Potvrďte věk alespoň 18 let a přijetí podmínek.');
      if (mode === 'signup' || mode === 'password') { if (password !== repeat) throw Error('Hesla se neshodují.'); }
      let result;
      if (mode === 'login') result = await client.signIn.email({ email: email.trim().toLowerCase(), password });
      else if (mode === 'signup') result = await client.signUp.email({ email: email.trim().toLowerCase(), password, name: name.trim(), adultConfirmed, termsVersion:LEGAL_VERSION, callbackURL: location.origin + '/?account=verified' });
      else if (mode === 'reset') result = await client.requestPasswordReset({ email: email.trim().toLowerCase(), redirectTo: location.origin + '/?account=recovery' });
      else if (recovery) result = await client.resetPassword({ newPassword: password, token: new URLSearchParams(location.search).get('token') || '' });
      else result = await client.changePassword({ newPassword: password, currentPassword, revokeOtherSessions: true });
      if (result.error) { setError(authMessage(result.error)); return; }
      setPassword(''); setRepeat('');
      if (mode === 'login') { notifyAccount(); onSignedIn(); }
      else if (mode === 'signup') { setMessage(''); setMode('signup-sent'); }
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
  if(mode==='signup-sent'&&!user)return <main className="p-narrow p-account"><section className="p-panel p-registration-success"><span className="p-kicker">JEŠTĚ JEDEN KROK</span><h1 ref={registrationNotice} tabIndex={-1}>Zkontrolujte svůj e-mail</h1><p role="status">Žádost o registraci byla přijata. Pro dokončení otevřete ověřovací zprávu na <strong>{email.trim().toLowerCase()}</strong> a klikněte na odkaz.</p><p>Odkaz platí jednu hodinu. Pokud zprávu nevidíte, podívejte se také do spamu nebo hromadné pošty.</p>{error&&<p className="p-alert" role="alert">{error}</p>}{message&&<p className="p-account-message" role="status">{message}</p>}<button type="button" className="p-primary" onClick={()=>switchMode('login')}>Přejít na přihlášení</button><button type="button" className="p-secondary" disabled={busy} onClick={resendVerification}>{busy?'Odesílám…':'Poslat ověřovací e-mail znovu'}</button><button type="button" className="p-text-button" onClick={onBack}>Zpět do hry</button><LegalLinks/></section></main>;
  const profile = user && mode !== 'password';
  return <main className="p-narrow p-account"><button className="p-back" onClick={onBack}><ArrowLeft size={18}/> Zpět</button><section className="p-panel"><UserRound className="p-big-icon"/><span className="p-kicker">ÚČET PÁTRAČE</span><h1>{profile ? 'Můj profil' : mode === 'signup' ? 'Vytvořit účet' : mode === 'reset' ? 'Obnova hesla' : mode === 'password' ? 'Nové heslo' : 'Přihlášení'}</h1>{error && <p className="p-alert" role="alert">{error}</p>}{message && <p className="p-account-message" role="status">{message}</p>}
    {profile ? <><p className="p-account-email">{user.email}</p><p><strong>{user.name}</strong></p>{!nicknameOpen?<button className="p-secondary" onClick={()=>setNicknameOpen(true)}>Změnit přezdívku</button>:<form className="p-profile-nickname" onSubmit={saveNickname}><label className="p-label">Nová přezdívka<input required minLength={1} maxLength={60} autoComplete="nickname" value={nickname} onChange={e=>setNickname(e.target.value)}/></label><label className="p-label">Potvrďte přihlášení svým heslem<input type="password" required maxLength={128} autoComplete="current-password" value={nicknamePassword} onChange={e=>setNicknamePassword(e.target.value)}/></label><label className="p-small"><input type="checkbox" required checked={nicknameAck} onChange={e=>setNicknameAck(e.target.checked)}/> Rozumím, že moje stará přezdívka „{user.name}“ se uvolní pro jiné hráče. Nová přezdívka může být obsazená; změna proběhne pouze tehdy, pokud je dostupná.</label><button className="p-primary" disabled={busy||!nicknameAck||!nicknamePassword||!nickname.trim()||nickname.trim()===user.name}>Potvrdit změnu přezdívky</button><button type="button" className="p-secondary" onClick={()=>{setNicknameOpen(false);setNicknamePassword('');setNicknameAck(false);}}>Zrušit</button></form>}<AccountNotifications key={user.id} {...notificationState} onRefresh={notificationState.refresh}/><CreatorBilling userId={user.id}/><button className="p-secondary" onClick={() => switchMode('password')}><KeyRound size={17}/> Změnit heslo</button><button className="p-secondary" disabled={busy} onClick={logout}><LogOut size={17}/> Odhlásit se</button></> : <><p className="p-small">{mode === 'signup' ? 'Soukromé výpravy můžete s ověřeným účtem hrát bez předplatného. Předplatné odemkne veřejné výpravy a tvorbu vlastních. Ve hře vystupujete pod svou jedinečnou přezdívkou.' : mode === 'login' ? 'Přihlaste se svým e-mailem a heslem k účtu Pátrače.' : mode === 'reset' ? 'Pošleme vám zprávu pro nastavení nového hesla.' : 'Zadejte nové heslo k účtu Pátrače.'}</p>{ready === false && ['signup','reset'].includes(mode) && <p className="p-note">Odesílání ověřovacích e-mailů se připravuje. Registrace a obnova hesla budou dostupné po jeho dokončení.</p>}<form onSubmit={submit}>{mode === 'password' && !recovery && <label className="p-label">Současné heslo<input type="password" required maxLength={128} autoComplete="current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}/></label>}{mode === 'signup' && <label className="p-label">Přezdívka<input required maxLength={60} autoComplete="nickname" value={name} onChange={e => setName(e.target.value)}/></label>}{mode !== 'password' && <label className="p-label">E-mail<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}/></label>}{mode !== 'reset' && <label className="p-label">Heslo<input type="password" required minLength={mode === 'login' ? 1 : 12} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)}/></label>}{['signup','password'].includes(mode) && <label className="p-label">Heslo znovu<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={repeat} onChange={e => setRepeat(e.target.value)}/></label>}{mode==='signup'&&<>{registrationBonusMonths===3&&<p className="p-message"><strong>3 měsíce zdarma za registraci</strong><br/>Po ověření e-mailu získáte přístup ke hraní veřejných výprav i tvorbě vlastních v testovacím režimu. Bez platby a automatického obnovení.</p>}<label className="p-legal-check"><input type="checkbox" required checked={adultConfirmed} onChange={e=>setAdultConfirmed(e.target.checked)}/><span>Je mi alespoň 18 let. Děti mohou hrát pod mým účtem a dohledem.</span></label><label className="p-legal-check"><input type="checkbox" required checked={termsAccepted} onChange={e=>setTermsAccepted(e.target.checked)}/><span>Souhlasím s <a href="/podminky" target="_blank" rel="noopener">obchodními podmínkami</a>.</span></label><p className="p-small">Jak používáme vaše údaje popisuje <a href="/soukromi" target="_blank" rel="noopener">ochrana osobních údajů</a>.</p></>}<button className="p-primary" disabled={busy || ready === null || (ready === false && ['signup','reset'].includes(mode))}>{busy ? 'Zpracovávám…' : mode === 'login' ? 'Přihlásit se' : mode === 'signup' ? 'Vytvořit účet' : mode === 'reset' ? 'Poslat obnovu hesla' : 'Uložit nové heslo'}</button></form>{mode === 'login' ? <div className="p-account-links"><button disabled={busy} className="p-text-button" onClick={resendVerification}>Poslat ověření znovu</button><button className="p-text-button" onClick={() => switchMode('signup')}>Vytvořit účet</button><button className="p-text-button" onClick={() => switchMode('reset')}>Zapomenuté heslo</button></div> : !recovery && <button className="p-text-button" onClick={() => switchMode('login')}>Zpět na přihlášení</button>}</>}
    <LegalLinks/></section></main>;
}
