import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';
const browser=await chromium.launch(), base='http://127.0.0.1:3000';
try {
  const context=await browser.newContext({storageState:'.data/previews/teacher-session.json',viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const bootstrap=await (await context.request.get(`${base}/api/bootstrap`)).json();
  const course=bootstrap.courses.find(c=>c.title==='Programlamaya Giriş');
  const page=await context.newPage(),reports=[];
  await page.goto(`${base}/app?page=courses&course=${course.id}&tab=activities`);
  await page.locator('.activity-row').first().waitFor();
  if(await page.locator('.teacher-dashboard').getAttribute('data-theme')!=='dark') await page.getByRole('button',{name:'Karanlık temaya geç',exact:true}).click();
  async function audit(name){const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();reports.push({name,violations:result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});}
  await page.getByRole('button',{name:'Ders ayarları',exact:true}).click();await audit('course-settings');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Etkinlik hazırla',exact:true}).click();await audit('activity-editor');await page.keyboard.press('Escape');
  await page.getByRole('tab',{name:'Müfredat',exact:true}).click();await page.getByRole('button',{name:'Takvimi düzenle',exact:true}).click();await audit('curriculum-calendar');await page.keyboard.press('Escape');
  await page.getByRole('tab',{name:'Öğrenciler',exact:true}).click();await page.getByRole('button',{name:'İncele',exact:true}).first().click();await page.getByRole('button',{name:'Özel çalışma ata',exact:true}).waitFor();await audit('student-detail');await page.keyboard.press('Escape');
  await page.getByRole('tab',{name:'Ödevler',exact:true}).click();await page.getByRole('button',{name:'Ödev oluştur',exact:true}).click();await audit('assignment-editor');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Ödevi aç',exact:true}).first().click();await page.getByRole('dialog').waitFor();await audit('assignment-detail');await page.keyboard.press('Escape');
  await writeFile('.data/previews/teacher-dialog-audit.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports,null,2));
}finally{await browser.close();}
