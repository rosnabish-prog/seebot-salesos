import type { NextConfig } from 'next';
const config:NextConfig = { transpilePackages: ['@seebot/shared'], async headers(){return [{source:'/sign/:path*',headers:[{key:'Referrer-Policy',value:'no-referrer'},{key:'Cache-Control',value:'no-store'},{key:'X-Robots-Tag',value:'noindex, nofollow'},{key:'Content-Security-Policy',value:"frame-ancestors 'none'"}]}];} };
export default config;
