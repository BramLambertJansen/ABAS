const fs=require('node:fs'), path=require('node:path'), readline=require('node:readline'), Module=require('node:module');
const root=process.env.ABAS_AUDIT_CHECKOUT || '/tmp/abas-platform-fixes';
const out=process.env.ABAS_AUDIT_OUTPUT || '/tmp/abas-screen-audit-output';
const appOrigin=process.env.ABAS_AUDIT_ORIGIN || 'http://127.0.0.1:3100';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(appOrigin).hostname)) throw Error('Audit supports local apps only');
const ts=require(root+'/node_modules/typescript');
const helperFile=root+'/e2e/helpers/supabaseMock.ts';
const compiled=ts.transpileModule(fs.readFileSync(helperFile,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const helperModule=new Module(helperFile,module);helperModule.filename=helperFile;helperModule.paths=Module._nodeModulePaths(path.dirname(helperFile));helperModule._compile(compiled,helperFile);
const {USER,fakeSession,json,mockBarSessie}=helperModule.exports;
const {chromium}=require(root+'/node_modules/playwright');
const PRODUCT={id:'00000000-0000-4000-8000-000000000021',name:'Pils',category:'Bier',price_cents:250,archived:false,image_url:null};
const LID={id:'00000000-0000-4000-8000-000000000022',name:'Joris de Vries',role:'lid',balance_cents:1500,archived:false,has_pin:false,has_account:false,email:null,invited_at:null};
let browser,context,page,mode='admin',memberError=false,release,calls=0,images=[],errors=[];
fs.mkdirSync(out+'/screenshots',{recursive:true});fs.mkdirSync(out+'/screen-evidence',{recursive:true});
async function state(){return {url:page.url(),snapshot:await page.locator('body').ariaSnapshot(),focus:await page.evaluate(()=>({tag:document.activeElement?.tagName,text:document.activeElement?.textContent?.trim().slice(0,100),label:document.activeElement?.getAttribute('aria-label')}))};}
async function action(locator,method,...args){await page.locator('body').ariaSnapshot();await locator[method](...args);}
async function init(which,viewport={width:390,height:844}){mode=which;if(context)await context.close();context=await browser.newContext({viewport:viewport,reducedMotion:'reduce',serviceWorkers:'block'});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 // No unmocked external requests. Local requests may reach only the app itself.
 await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===appOrigin)return r.continue();return r.abort('blockedbyclient');});
 await page.route(/\/auth\/v1\/token(\?|$)/,r=>json(r,200,fakeSession()));
 await page.route(/\/auth\/v1\/user(\?|$)/,r=>json(r,200,USER));
 await page.route(/\/rest\/v1\//,r=>json(r,200,(r.request().headers()['accept']??'').includes('vnd.pgrst.object')?null:[]));
 await page.route(/\/rest\/v1\/members(\?|$)/,r=>{if(memberError)return json(r,500,{message:'fixture read error'});const own=r.request().url().includes('auth_user_id=eq.');const row=own?{name:ownName,role:'beheerder',archived:false,has_pin:false,balance_cents:1500}:null;return json(r,200,(r.request().headers()['accept']??'').includes('vnd.pgrst.object')?row:row?[row]:[]);});
 await page.route(/\/rest\/v1\/app_settings(\?|$)/,r=>json(r,200,{id:1,negative_limit_cents:1000,low_balance_threshold_cents:1000}));
 await page.route(/\/rest\/v1\/products(\?|$)/,r=>json(r,200,PRODUCTS));
 await page.route(/\/rest\/v1\/rpc\/list_members_admin(\?|$)/,r=>json(r,200,[LID]));
 await page.route(/\/rest\/v1\/rpc\/list_own_transactions(\?|$)/,r=>json(r,200,TRANSACTIONS));
 await page.route(/\/rest\/v1\/order_lines(\?|$)/,r=>json(r,200,TRANSACTIONS.filter(t=>t.kind==='bestelling').map(t=>({order_id:t.id,qty:2,products:{name:PRODUCTS[2].name}}))));
 await page.route(/\/rest\/v1\/activity_types(\?|$)/,r=>json(r,200,[{id:'00000000-0000-4000-8000-000000000031',name:'Repetitie',archived:false}]));
 if(which==='admin')await mockBarSessie(page);
 else if(which==='bar'){await mockBarSessie(page,{voorgeregistreerd:'bar',bevestigd:true,shift:{id:SHIFT_ID,startedAt:new Date(Date.now()-20*60*1000).toISOString(),startedByName:'Femke Bos',activityTypeName:'Repetitie'}});await page.route(/\/rest\/v1\/members(\?|$)/,r=>json(r,200,[LID]));await page.route(/\/rest\/v1\/shift_members(\?|$)/,r=>json(r,200,[{member_id:LID.id,members:{id:LID.id,name:LID.name}}]));}
 else await page.route(/\/auth\/v1\/logout/,r=>r.fulfill({status:204,body:''}));
 await page.goto(appOrigin+'/'+(which==='portal'?'portal':'beheer'));
 await page.locator('input[type=email]').waitFor({state:'visible'});
 // Server verification before credentials: meaningful body, no framework error, visible controls.
 if(!await page.locator('body').innerText()||await page.locator('[data-nextjs-dialog]').count())throw Error('server failed visual verification');
 await action(page.locator('label:has(input[value="password"])'),'click');await action(page.locator('input[type=email]'),'fill','femke@example.test');await action(page.locator('input[type=password]'),'fill','fixture-only-password');await action(page.getByRole('button',{name:'Inloggen',exact:true}),'click');
 if(which==='admin'){await page.getByRole('button',{name:/^Beheer /}).waitFor();await action(page.getByRole('button',{name:/^Beheer /}),'click');await page.getByRole('tab',{name:'Assortiment',exact:true}).waitFor();}
 else if(which==='portal')await page.getByRole('tab',{name:'Account',exact:true}).waitFor();
 else await page.getByRole('tab',{name:'Verkoop',exact:true}).waitFor();
}

const AxeBuilder=require(root+'/node_modules/@axe-core/playwright').default;
const SHIFT_ID='00000000-0000-4000-8000-000000000041';
let ownName='Femke Bos';
const PRODUCTS=[PRODUCT,{...PRODUCT,id:'00000000-0000-4000-8000-000000000023',name:'Rode wijn',category:'Wijn',price_cents:350},{...PRODUCT,id:'00000000-0000-4000-8000-000000000024',name:'Alcoholvrij speciaalbier van de Aurora-brouwerij',price_cents:450},{...PRODUCT,id:'00000000-0000-4000-8000-000000000025',name:'Spa rood',category:'Fris',price_cents:150}];
const TRANSACTIONS=[1,2,3,4,5,6].map((n)=>({id:'00000000-0000-4000-8000-'+String(100+n).padStart(12,'0'),kind:n===2?'opwaardering':'bestelling',created_at:new Date(Date.now()-n*24*60*60*1000).toISOString(),amount_cents:n===2?3000:900,method:n===2?'cash':null,server_name:'Joris de Vries',reversed:n===3,reversal_reason:n===3?'Verkeerd product gekozen':null,reversed_via:n===3?'beheer':null,reversed_by_name:n===3?'Femke Bos':null}));
async function metrics(){return await page.evaluate(()=>{const visible=e=>{const b=e.getBoundingClientRect(),s=getComputedStyle(e);return b.width>0&&b.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&!e.closest('[aria-hidden=true]')};const describe=e=>{const b=e.getBoundingClientRect(),s=getComputedStyle(e);return {tag:e.tagName,role:e.getAttribute('role'),label:e.getAttribute('aria-label'),text:(e.innerText||e.textContent||'').trim().slice(0,120),x:+b.x.toFixed(2),y:+b.y.toFixed(2),width:+b.width.toFixed(2),height:+b.height.toFixed(2),fontSize:s.fontSize,color:s.color,bg:s.backgroundColor,outline:s.outline,overflowX:s.overflowX}};const controls=[...document.querySelectorAll('button,input,select,a,[role=tab],[role=combobox]')].filter(visible).map(describe);return {viewport:{width:innerWidth,height:innerHeight},document:{scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,scrollHeight:document.documentElement.scrollHeight},horizontalOverflow:[...document.querySelectorAll('main *,[role=dialog] *')].filter(visible).map(describe).filter(x=>x.x< -1||x.x+x.width>innerWidth+1).slice(0,35),controls,smallControls:controls.filter(x=>x.width<44||x.height<44),headings:[...document.querySelectorAll('h1,h2,h3,[role=heading]')].filter(visible).map(describe),focus:{tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute('aria-label'),text:document.activeElement?.innerText?.slice(0,80)},dialogScroll:[...document.querySelectorAll('[role=dialog]')].filter(visible).map(e=>({...describe(e),scrollHeight:e.scrollHeight,clientHeight:e.clientHeight})),reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches};});}
async function snap(id,note){await page.evaluate(()=>document.fonts.ready);await page.locator('body').ariaSnapshot();const file=out+'/screenshots/'+id+'.png';await page.screenshot({path:file,fullPage:true});const s=await state();const m=await metrics();const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();const d={id,file:'screenshots/'+id+'.png',note,...s,metrics:m,axe:{violations:axe.violations,incomplete:axe.incomplete,passes:axe.passes.map(x=>x.id),inapplicable:axe.inapplicable.map(x=>x.id),testEngine:axe.testEngine}};images.push(d);fs.writeFileSync(out+'/screen-evidence/'+id+'.json',JSON.stringify(d,null,2)+'\n');fs.writeFileSync(out+'/screen-evidence/captures.json',JSON.stringify(images,null,2)+'\n');console.log(JSON.stringify({id,file,note,viewport:m.viewport,document:m.document,focus:m.focus,overflow:m.horizontalOverflow.slice(0,5),smallControls:m.smallControls.length,axeViolations:axe.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary})).slice(0,6)})),snapshot:s.snapshot.slice(-4500)}));}
async function keys(key,times=1){await page.locator('body').ariaSnapshot();const samples=[];for(let i=0;i<times;i++){await page.keyboard.press(key);samples.push((await metrics()).focus);}console.log(JSON.stringify({key,samples}));return samples;}
(async()=>{browser=await chromium.launch({executablePath:process.env.ABAS_AUDIT_CHROMIUM||'/tmp/abas-browser-bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});console.log('READY');const rl=readline.createInterface({input:process.stdin});for await(const line of rl){try{const command=JSON.parse(line);if(command.done){fs.writeFileSync(out+'/screen-evidence/browser-errors.json',JSON.stringify(errors,null,2)+'\n');await browser.close();console.log('DONE');process.exit(0);}else if(command.code)await eval('(async()=>{'+command.code+'})()');}catch(e){console.log(JSON.stringify({error:e.message,step:line}));}}await browser.close();})().catch(e=>{console.error(e.message);process.exit(1)});
