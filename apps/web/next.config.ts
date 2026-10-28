import type { NextConfig } from 'next';
const config:NextConfig = { transpilePackages: ['@seebot/shared'], // Allow the browser to call the API on the SAME forwarded web origin in Codespaces.
 // Next.js proxies API traffic to the private local NestJS port; no public API port is needed.
 async rewrites(){return [{source:'/api/:path*',destination:(process.env.API_INTERNAL_URL||'http://127.0.0.1:4000').replace(/\/$/,'')+'/api/:path*'}];}, async headers(){return [{source:'/sign/:path*',headers:[{key:'Referrer-Policy',value:'no-referrer'},{key:'Cache-Control',value:'no-store'},{key:'X-Robots-Tag',value:'noindex, nofollow'},{key:'Content-Security-Policy',value:"frame-ancestors 'none'"}]}];} };
export default config;
