#!/usr/bin/env bash
# GitHub Codespaces only: start a disposable, private SalesOS development preview.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${CODESPACE_NAME:-}" ]]; then
  echo "This helper is for GitHub Codespaces. CODESPACE_NAME is not set." >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "Docker is not running inside this Codespace. Start Docker support before continuing." >&2
  exit 1
fi

echo "Configuring SalesOS for a private Codespaces development preview..."
node <<'NODE'
const fs=require('node:fs');
const crypto=require('node:crypto');
const name=process.env.CODESPACE_NAME;
const domain=process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN||'app.github.dev';
if(!/^[a-zA-Z0-9-]+$/.test(name)||!/^[a-zA-Z0-9.-]+$/.test(domain))throw Error('Invalid Codespaces hostname.');
const origin='https://'+name+'-3000.'+domain;
const fresh=!fs.existsSync('.env');
if(fresh)fs.copyFileSync('.env.example','.env');
let body=fs.readFileSync('.env','utf8');
function set(name,value){
 const line=name+'='+JSON.stringify(value);
 const rx=new RegExp('^'+name+'=.*$','m');
 if(rx.test(body))body=body.replace(rx,()=>line);
 else body+='\n'+line;
}
set('CORS_ORIGIN',origin);
set('NEXT_PUBLIC_API_URL','');
set('TENANT_SCOPED_CRM_PREVIEW','true');
set('GOOGLE_SELF_SIGNUP_ENABLED','false');
set('DEV_EMAIL_SIGNUP_ENABLED','true');
set('DEV_MAIL_CAPTURE_ENABLED','true');
set('SMTP_HOST','127.0.0.1');
set('SMTP_PORT','1025');
set('SMTP_USER','');
set('SMTP_PASSWORD','');
set('SMTP_FROM','SalesOS Preview <no-reply@seebot.example>');
set('EMAIL_SIGNUP_ENABLED','false');
set('GMAIL_SENDING_ENABLED','false');
set('SIGNING_ENABLED','false');
if(!/^.{32,}$/.test((body.match(/^MFA_CODE_SECRET=(.*)$/m)||[])[1]?.replace(/^["']|["']$/g,'')||''))set('MFA_CODE_SECRET',crypto.randomBytes(32).toString('hex'));
if(!/^.{43,}$/.test((body.match(/^APP_ENCRYPTION_KEY=(.*)$/m)||[])[1]?.replace(/^["']|["']$/g,'')||''))set('APP_ENCRYPTION_KEY',crypto.randomBytes(32).toString('base64'));
set('SEED_DEMO_DATA','false');
if(fresh){
 const password=crypto.randomBytes(24).toString('base64url');
 set('JWT_SECRET',crypto.randomBytes(48).toString('hex'));
 set('ADMIN_EMAIL','admin@seebot.example');
 set('ADMIN_PASSWORD',password);
 set('ADMIN_NAME','SalesOS Preview Admin');
 console.log('\nYour local preview login (keep the password private):');
 console.log('Email: admin@seebot.example');
 console.log('Password: '+password);
}else{
 console.log('Preserved existing admin credentials and JWT secret in .env.');
}
fs.writeFileSync('.env',body,{mode:0o600});
const values=Object.fromEntries([...body.matchAll(/^([A-Z_]+)=(.*)$/gm)].map(m=>[m[1],m[2].replace(/^["']|["']$/g,'')]));
if(!values.JWT_SECRET||values.JWT_SECRET.length<32||values.JWT_SECRET.includes('REPLACE_')||!values.ADMIN_PASSWORD||values.ADMIN_PASSWORD.includes('REPLACE_'))throw Error('Existing .env has placeholder secrets. Update JWT_SECRET and ADMIN_PASSWORD before rerunning.');
console.log('Web preview URL: '+origin);
console.log('API requests will use the private /api proxy on port 3000.');
NODE

echo "Starting local PostgreSQL and Redis containers..."
docker compose up -d --wait postgres redis mailpit
echo "Installing dependencies and preparing local preview schema..."
npm install --no-audit --no-fund
echo "Verifying Prisma CLI dependencies before database generation..."
node <<'NODE'
for (const name of ['fast-check', 'effect']) {
  try {
    const resolved = require.resolve(name);
    require(name);
    console.log(name + ' OK: ' + resolved);
  } catch (error) {
    console.error('Broken or missing dependency: ' + name);
    console.error(error && error.stack ? error.stack : String(error));
    console.error('Try: npm install --include=dev --no-audit --no-fund');
    process.exitCode = 1;
    break;
  }
}
NODE
npm run db:generate
# Local disposable development database only. Never use db push against customer data.
npx prisma db push --schema packages/database/prisma/schema.prisma
npm run db:seed

echo
echo "Starting API and web development servers. Keep this terminal open."
echo "Open PRIVATE port 3000 for SalesOS and PRIVATE port 8025 for test reset emails."
npm run dev
