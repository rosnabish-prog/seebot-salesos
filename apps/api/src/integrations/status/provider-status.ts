/** One place to inspect integration readiness. Never serialize secrets or tokens. */
export type ProviderMode='DEMO'|'DISABLED'|'CONFIGURED_NOT_VERIFIED';
export function providerReadiness(env:NodeJS.ProcessEnv){
 const configured={
  openai:Boolean(env.OPENAI_API_KEY),
  apollo:Boolean(env.APOLLO_API_KEY),
  gmail:Boolean(env.GOOGLE_GMAIL_CLIENT_ID&&env.GOOGLE_GMAIL_CLIENT_SECRET&&env.APP_ENCRYPTION_KEY),
  googleLogin:Boolean(env.GOOGLE_LOGIN_CLIENT_ID),
  signing:Boolean(env.GOOGLE_SIGNING_CLIENT_ID&&env.SIGNING_AUDIT_KEY&&env.SIGNING_PUBLIC_BASE_URL),
 };
 return {
  openai:{mode:'DEMO' as ProviderMode,configured:configured.openai,endpoint:'/api/intelligence/accounts/:id/research',notice:'Demo provider. API key alone does not enable live AI calls.'},
  apollo:{mode:'DEMO' as ProviderMode,configured:configured.apollo,endpoint:'/api/intelligence/accounts/:id/discover',notice:'Demo candidate data. Live enrichment is not enabled.'},
  gmail:{mode:(configured.gmail&&env.GMAIL_SENDING_ENABLED==='true'?'CONFIGURED_NOT_VERIFIED':'DISABLED') as ProviderMode,configured:configured.gmail,endpoint:'/api/integrations/google',notice:'Mailbox OAuth and end-to-end send/reply tests are required.'},
  googleLogin:{mode:(configured.googleLogin?'CONFIGURED_NOT_VERIFIED':'DISABLED') as ProviderMode,configured:configured.googleLogin,endpoint:'/api/auth/google',notice:'Verify OAuth audiences and authorized identities before rollout.'},
  signing:{mode:(env.SIGNING_ENABLED==='true'&&configured.signing?'CONFIGURED_NOT_VERIFIED':'DISABLED') as ProviderMode,configured:configured.signing,endpoint:'/api/signing',notice:'Do not use for actual contracts before signer-identity and legal evidence review.'},
  surveys:{mode:(env.SURVEYS_ENABLED==='true'?'CONFIGURED_NOT_VERIFIED':'DEMO') as ProviderMode,configured:env.SURVEYS_ENABLED==='true',endpoint:'/api/surveys/:token',notice:'Demo client surveys work locally. Real invitations require verified Gmail.'}
 };
}
