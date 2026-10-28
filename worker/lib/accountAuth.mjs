import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins/bearer';
export function createAccountAuth(settings) { return betterAuth({
    appName: 'Pátrač',
    baseURL: settings.PATRAC_AUTH_BASE_URL,
    basePath: '/api/auth',
    secret: settings.PATRAC_AUTH_SECRET,
    database: settings.DB,
    trustedOrigins: settings.PATRAC_ALLOWED_ORIGINS.split(',').map(x => x.trim()).filter(Boolean),
    user: { modelName: 'patrac_auth_user' },
    session: { modelName: 'patrac_auth_session', expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
    account: { modelName: 'patrac_auth_account' },
    verification: { modelName: 'patrac_auth_verification' },
    emailAndPassword: {
      enabled: true, requireEmailVerification: true, minPasswordLength: 12, maxPasswordLength: 128,
      autoSignIn: false, revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 1800,
      sendResetPassword: async ({ user, url }) => { await settings.sendMail(user.email, 'Obnova hesla – Pátrač', `Pro nastavení nového hesla otevřete tento odkaz:\n\n${url}\n\nPokud jste o obnovu nežádali, zprávu ignorujte. Odkaz platí 30 minut.`); },
    },
    emailVerification: {
      sendOnSignUp: true, sendOnSignIn: true, autoSignInAfterVerification: false, expiresIn: 3600,
      sendVerificationEmail: async ({ user, url }) => { await settings.sendMail(user.email, 'Potvrzení účtu – Pátrač', `Vítejte v Pátrači! Svůj e-mail potvrďte otevřením odkazu:\n\n${url}\n\nOdkaz platí jednu hodinu. Pokud jste účet nevytvářeli, zprávu ignorujte.`); },
    },
    rateLimit: { enabled: true, storage: 'database', modelName: 'patrac_auth_rate_limit', window: 60, max: 60,
      customRules: { '/sign-in/email': { window: 60, max: 5 }, '/sign-up/email': { window: 300, max: 3 }, '/request-password-reset': { window: 300, max: 3 }, '/send-verification-email': { window: 300, max: 3 } } },
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    plugins: [bearer({ requireSignature: true })],
    logger: { disabled: true },
  }); }
