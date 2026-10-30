import {registerBonusEligibility,grantRegistrationBonus} from './registrationBonus.mjs';
import {validSignupAcceptance,recordAcceptance} from './legalAcceptance.mjs';
import { betterAuth } from 'better-auth';
import {APIError,createAuthMiddleware} from 'better-auth/api';
import {nickname} from './nicknames.mjs';
import { bearer } from 'better-auth/plugins/bearer';
async function nicknameUsers(adapter){const all=[];for(let offset=0;;offset+=1000){const page=await adapter.findMany({model:'user',limit:1000,offset});all.push(...page);if(page.length<1000)return all;}}
export function createAccountAuth(settings) { return betterAuth({
    appName: 'Pátrač',
    baseURL: settings.PATRAC_AUTH_BASE_URL,
    basePath: '/api/auth',
    secret: settings.PATRAC_AUTH_SECRET,
    database: settings.DB,
    trustedOrigins: settings.PATRAC_ALLOWED_ORIGINS.split(',').map(x => x.trim()).filter(Boolean),
    user: { modelName: 'patrac_auth_user', additionalFields:{nicknameKey:{type:'string',required:false,input:false,returned:false,unique:true}} },
    hooks:{before:createAuthMiddleware(async ctx=>{
      if(ctx.path!=='/sign-up/email')return;
      if(!validSignupAcceptance(ctx.body))throw new APIError('BAD_REQUEST',{code:'LEGAL_ACCEPTANCE_REQUIRED',message:'Potvrďte věk alespoň 18 let a obchodní podmínky.'});
      try{const data=nickname(ctx.body.name),users=await nicknameUsers(ctx.context.adapter);if(users.some(u=>nickname(u.name).nicknameKey===data.nicknameKey))throw Error('Tato přezdívka je už obsazená.');ctx.body.name=data.name;}catch(e){throw new APIError('BAD_REQUEST',{code:'NICKNAME_TAKEN',message:e.message});}
    })},
    databaseHooks:{user:{create:{before:async user=>({data:{...user,...nickname(user.name)}}),after:async(user,ctx)=>{if(ctx?.path==='/sign-up/email'){await recordAcceptance(settings.DB,user.id,'signup','account');await registerBonusEligibility(settings.DB,user.id,settings.registrationMode?.()??settings.PATRAC_STRIPE_MODE);}}},update:{before:async user=>user.name===undefined?undefined:{data:{...user,...nickname(user.name)}}}}},
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
      afterEmailVerification: async user=>{await grantRegistrationBonus(settings.DB,user.id);},
      sendOnSignUp: true, sendOnSignIn: true, autoSignInAfterVerification: false, expiresIn: 3600,
      sendVerificationEmail: async ({ user, url }) => { await settings.sendMail(user.email, 'Potvrzení účtu – Pátrač', `Vítejte v Pátrači! Svůj e-mail potvrďte otevřením odkazu:\n\n${url}\n\nOdkaz platí jednu hodinu. Pokud jste účet nevytvářeli, zprávu ignorujte.\n\nObchodní podmínky: https://patrac.stopik.cz/podminky\n\nOchrana osobních údajů: https://patrac.stopik.cz/soukromi`); },
    },
    rateLimit: { enabled: true, storage: 'database', modelName: 'patrac_auth_rate_limit', window: 60, max: 60,
      customRules: { '/sign-in/email': { window: 60, max: 5 }, '/sign-up/email': { window: 300, max: 3 }, '/request-password-reset': { window: 300, max: 3 }, '/send-verification-email': { window: 300, max: 3 } } },
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    plugins: [bearer({ requireSignature: true })],
    logger: { disabled: true },
  }); }
