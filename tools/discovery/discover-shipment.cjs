const path = require('node:path');
const fs = require('node:fs');
const readline = require('node:readline/promises');
const { chromium } = require('@playwright/test');
const sensitive = /password|secret|token|authorization|cookie|api[-_]?key|regcode/i;
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, sensitive.test(k) ? '[REDACTED]' : clean(v)]));
  return value;
}
function urlSafe(raw) { const u = new URL(raw); u.username=''; u.password=''; u.hash=''; for (const k of [...u.searchParams.keys()]) if (sensitive.test(k)) u.searchParams.set(k,'[REDACTED]'); return u.href; }
function body(raw) { try { return clean(JSON.parse(raw)); } catch { return '[non-JSON omitted]'; } }
async function inspect(page) {
  return page.locator('button,input,select,textarea,a,[role]').evaluateAll(els => els.map(e => ({tag:e.tagName,role:e.getAttribute('role'),name:e.getAttribute('aria-label') || e.getAttribute('title') || (e.labels && [...e.labels].map(l=>l.textContent).join(' ')) || e.textContent?.trim(),type:e.getAttribute('type')})));
}
async function act(page, action) {
  const elements=await inspect(page);
  if (!['click','check','uncheck'].includes(action.kind) || !action.role || !action.name || /freight|unfreight/i.test(action.name)) throw Error('Unsupported or prohibited action');
  if (!elements.some(e=>e.name===action.name)) throw Error('Control not observed');
  const locator=page.getByRole(action.role,{name:action.name,exact:true});
  if(await locator.count()!==1 || !await locator.isVisible() || !await locator.isEnabled()) throw Error('Missing, ambiguous or unavailable control');
  await locator[action.kind]();
}
async function main() {
  if (process.argv.includes('--smoke')) { const b=await chromium.launch(); try { const p=await b.newPage(); await p.goto('about:blank'); console.log('Chromium blank-page smoke PASS'); } finally { await b.close(); } return; }
  if (!process.argv[2]) throw Error('Usage: node tools/discovery/discover-shipment.cjs <ignored config.local.json> login|inspect|action | --smoke');
  const mode=process.argv[3];
  if (!['login','inspect','action'].includes(mode)) throw Error('Explicit login, inspect or action mode required');
  const c=JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  if (!Array.isArray(c.origins) || !c.origins.length || !Array.isArray(c.apiPrefixes) || !c.apiPrefixes.length || c.apiPrefixes.some(p=>!p.startsWith('/'))) throw Error('Explicit origins and API prefixes required');
  const origins=new Set(c.origins.map(x=>new URL(x).origin));
  if (!origins.has(new URL(c.url).origin)) throw Error('Navigation origin not approved');
  const dir='captures/'+new Date().toISOString().replace(/[:.]/g,'-'); fs.mkdirSync(dir,{recursive:true});
  const events=[], pending=new Set(); let step='navigation';
  const browser=await chromium.launch({headless:false});
  const context=await browser.newContext(c.storageState ? {storageState:c.storageState} : {});
  const allowed=raw=>{const u=new URL(raw); return origins.has(u.origin)&&c.apiPrefixes.some(p=>u.pathname.startsWith(p));};
  await context.route('**/*', route=>origins.has(new URL(route.request().url()).origin)?route.continue():route.abort());
  const requests=new WeakMap();
  context.on('request', r=>{if(allowed(r.url())) { const e={step,method:r.method(),url:urlSafe(r.url()),request:r.postData()?body(r.postData()):null}; requests.set(r,e); events.push(e); }});
  context.on('requestfailed', r=>{ const e=requests.get(r); if(e) e.failure='requestfailed'; });
  context.on('response', r=>{ const e=requests.get(r.request()); if(!e)return; const task=(async()=>{ e.status=r.status(); e.contentType=r.headers()['content-type']||''; if(!e.contentType.includes('json')) {e.response='[non-JSON omitted]';return;} const raw=await r.body(); e.response=raw.length>2000000?'[over limit omitted]':body(raw.toString()); })().catch(()=>{e.response='[unavailable]';}); pending.add(task); task.finally(()=>pending.delete(task)); });
  const terminal=readline.createInterface({input:process.stdin,output:process.stdout});
  try {
    const page=await context.newPage();
    const ready=c.readyResponsePath ? page.waitForResponse(r=>new URL(r.url()).pathname===c.readyResponsePath,{timeout:30000}) : null;
    await page.goto(c.url); if(ready) await ready;
    if(mode==='login') {
      const answer=await terminal.question('Complete login in browser, then type save to retain local state: ');
      if(answer==='save') { fs.mkdirSync('.auth',{recursive:true}); await context.storageState({path:path.resolve('.auth/shipment.json'),indexedDB:true}); }
    } else {
      await page.waitForFunction(() => [...document.querySelectorAll('button,input,select,textarea')].some(e => e.getClientRects().length), {timeout:15000});
      fs.writeFileSync(dir+'/elements.json',JSON.stringify(await inspect(page),null,2));
      if(mode==='action') { if(c.actionApproved!==true)throw Error('Action scope not approved'); step=c.action.name; if(!c.action.responsePath || !c.apiPrefixes.some(p=>c.action.responsePath.startsWith(p)))throw Error('Expected API response path required');
        await Promise.all([page.waitForResponse(r=>allowed(r.url()) && new URL(r.url()).pathname===c.action.responsePath,{timeout:15000}),act(page,c.action)]); }
    }
  }
  finally { terminal.close(); await Promise.allSettled([...pending]); await context.close(); await Promise.allSettled([...pending]); fs.writeFileSync(dir+'/pairs.json',JSON.stringify(events,null,2)); await browser.close(); }
}
if(require.main===module) main().catch(e=>{console.error('Discovery failed:', String(e.message).match(/net::[A-Z_]+/)?.[0] || 'local runtime/navigation error; no sensitive details displayed.');process.exitCode=1;});
module.exports={clean,urlSafe,body,inspect,act,main};
