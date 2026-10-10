import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:3000';
const browser=await chromium.launch();
const findings=[];
try {
 const context=await browser.newContext();
 const login=await context.request.post(`${base}/api/auth/login`,{headers:{origin:base},data:{email:'ogrenci@pusula.local',password:'PusulaDemo2026!'}});if(!login.ok())throw new Error(`Login ${login.status()}`);
 const page=await context.newPage();
 for(const width of [390,1440]) {
  await page.setViewportSize({width,height:900});
  for(const panel of ['learn','tasks','match','shop','profile']) {
   await page.goto(`${base}/app?page=${panel}`);await page.locator('.dp-main h1').first().waitFor();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('[role="status"]')).some(e=>e.textContent?.includes('Yükleniyor')));
   const result=await new AxeBuilder({page}).analyze();const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
   findings.push({width,panel,overflow,violations:result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
  }
 }
 await mkdir('.data/previews',{recursive:true});await writeFile('.data/previews/dopamin-accessibility.json',JSON.stringify(findings,null,2));
 console.log(JSON.stringify(findings.filter(f=>f.overflow||f.violations.length),null,2));
}finally{await browser.close()}
