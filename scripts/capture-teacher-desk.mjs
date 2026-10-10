import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, access, writeFile } from 'node:fs/promises';
import path from 'node:path';
const base='http://127.0.0.1:3000', dir=path.resolve('.data/previews'), state=path.join(dir,'teacher-session.json');
await mkdir(dir,{recursive:true});
const browser=await chromium.launch();
try {
  const exists=await access(state).then(()=>true).catch(()=>false);
  const context=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce',...(exists?{storageState:state}:{})});
  let auth=await context.request.get(`${base}/api/bootstrap`);
  if (!auth.ok()) {const login=await context.request.post(`${base}/api/auth/login`,{headers:{origin:base},data:{email:'akademisyen@pusula.local',password:'PusulaDemo2026!'}}); if(!login.ok()) throw new Error(`Login ${login.status()}`); await context.storageState({path:state});auth=await context.request.get(`${base}/api/bootstrap`);}
  const bootstrap=await auth.json();
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().includes('/api/')&&r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
  await page.goto(`${base}/app`); await page.locator('.desk-course-register').waitFor();
  const dark=await page.locator('.teacher-dashboard').getAttribute('data-theme');
  if(dark==='dark')await page.getByRole('button',{name:'Açık temaya geç',exact:true}).click();
  const reports=[];
  async function audit(name,shot=true){await page.getByRole('status').filter({hasText:'Yükleniyor'}).waitFor({state:'hidden'});if(shot)await page.screenshot({path:path.join(dir,`${name}.png`),fullPage:true,animations:'disabled'});const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();reports.push({name,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),violations:result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});}
  await audit('teacher-desk-light');
  await page.getByRole('button',{name:'Karanlık temaya geç',exact:true}).click();await audit('teacher-desk-dark');
  const course=bootstrap.courses.find(c=>c.title==='Programlamaya Giriş') || bootstrap.courses[0];
  if(course){for(const tab of ['activities','curriculum','assignments','students','analytics','documents','gradebook']){await page.goto(`${base}/app?page=courses&course=${course.id}&tab=${tab}`);await page.getByRole('tabpanel').waitFor();await audit(`teacher-dark-${tab}`,['activities','gradebook'].includes(tab));}}
  await page.goto(`${base}/app?page=profile`);await page.getByRole('heading',{name:'Hesap ayarları',exact:true}).waitFor();await audit('teacher-dark-account',false);
  await page.goto(`${base}/app`);await page.locator('.desk-course-register').waitFor();await page.getByRole('button',{name:'Yeni ders',exact:true}).click();await audit('teacher-dark-dialog',false);await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});await audit('teacher-desk-mobile');
  await writeFile(path.join(dir,'teacher-desk-audit.json'),JSON.stringify({errors,reports},null,2));
  console.log(JSON.stringify({errors,reports},null,2));
  await context.close();
}finally{await browser.close();}
