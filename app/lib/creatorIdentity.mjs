// Authorization relies on the identity verified by Auth, never user-editable metadata.
export function verifiedCreator(user) {
  if (!user || !/^[a-f0-9-]{36}$/i.test(user.id || '') || typeof user.email !== 'string' || !user.email_confirmed_at || user.is_anonymous) return null;
  return { id: user.id, email: user.email, name: typeof user.user_metadata?.nickname === 'string' ? user.user_metadata.nickname.slice(0, 60) : user.email.split('@')[0] };
}
