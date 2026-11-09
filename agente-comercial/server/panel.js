import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const publicDir = fileURLToPath(new URL('../dist/', import.meta.url));
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.svg':'image/svg+xml'};
export async function servePanel(req, res, pathname) {
  if (req.method !== 'GET') return false;
  if (pathname !== '/' && pathname !== '/logo.jpg' && !/^\/assets\/[a-zA-Z0-9_.-]+$/.test(pathname)) return false;
  const file = pathname === '/logo.jpg' ? fileURLToPath(new URL('../logo-command-comercial.jpg', import.meta.url)) : path.join(publicDir, pathname === '/' ? 'index.html' : pathname);
  let body;
  try {body = await fs.readFile(file);} catch {return false;}
  res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});
  res.end(body);
  return true;
}
