// Optional browser smoke check. Does not install dependencies or modify the application.
const {chromium} = require(process.env.PROTOTYPE_PLAYWRIGHT_MODULE || 'playwright');
const {strict: assert} = require('node:assert');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
    const errors=[],network=[],passed=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{if(/^https?:/.test(request.url()))network.push(request.url());});
    const target=pathToFileURL(path.join(__dirname,'index.html')).href;
    const output=path.join(__dirname,'screenshots');await fs.mkdir(output,{recursive:true});
    const screenshot=async name=>{await page.locator('#toast').evaluate(el=>el.classList.remove('visible'));return page.screenshot({path:path.join(output,name),fullPage:true});};
    const reset=async()=>{await page.goto(target);await page.locator('#selected-clause').waitFor();};
    await reset();
    assert.equal(await page.locator('.sidebar').isVisible(),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await screenshot('01-workspace.png');passed.push('Desktop layout and initial scenario');

    await page.locator('[data-action="run-review"]').click();
    await page.getByText('Замечание · демонстрация',{exact:true}).waitFor();
    await screenshot('02-review.png');
    await page.locator('.clause-actions [data-action="source"]').click();
    await page.getByRole('heading',{name:'Проверяем связь с нормой'}).waitFor();
    await screenshot('03-evidence.png');
    passed.push('Reviewer and evidence navigation');

    await page.locator('.file-row[data-file="pdf"]').click();
    await page.locator('[data-page="2"]').click();
    assert.match(await page.locator('.pdf-counter').textContent(),/2 из 2/);
    await page.locator('[data-page="1"]').click();
    await screenshot('04-pdf.png');
    await page.locator('.pdf-mark').click();
    assert.match(await page.locator('#context-label').textContent(),/фрагмент ТЗ/);
    assert.equal(await page.getByText('Замечание · демонстрация',{exact:true}).count(),0);
    passed.push('PDF pages, context addition and review invalidation');

    await page.locator('.rail [data-view="skills"]').click();
    await page.locator('[data-action="create-skill"]').click();
    await page.locator('#skill-name').fill('Проверка приемки');
    await page.locator('[data-action="generate-skill"]').click();
    assert.equal(await page.locator('[data-action="save-skill"]').isDisabled(),true);
    await page.locator('[data-action="test-skill"]').click();
    await page.locator('[data-action="save-skill"]').click();
    assert.equal(await page.locator('.skill-card').count(),4);
    await screenshot('05-skills.png');passed.push('Skill creation, trial and session-only save');

    await page.locator('.rail [data-action="privacy"]').click();
    assert.match(await page.locator('#dialog-body').textContent(),/ORG_A/);
    await screenshot('06-privacy.png');await page.keyboard.press('Escape');
    await page.locator('.rail [data-action="settings"]').click();
    assert.equal(await page.getByPlaceholder('Не вводите настоящие ключи в макет').isDisabled(),true);
    await page.locator('#model-name').fill('test-model');
    await screenshot('07-settings.png');
    await page.locator('[data-action="save-settings"]').click();
    passed.push('Privacy preview and key entry disabled');

    await reset();
    await page.locator('[data-action="accept"]').click();
    await page.getByRole('textbox',{name:'Редактировать пункт 7.2',exact:true}).fill('7.2. Ручная правка пользователя.');
    await page.locator('.clause-actions [data-action="undo"]').click();
    assert.match(await page.locator('#selected-clause').textContent(),/Ручная правка пользователя/);
    assert.match(await page.locator('#agent-content').textContent(),/Текущий текст не анализируется/);
    passed.push('Undo preserves subsequent manual text and reviewer does not claim analysis');

    await page.getByRole('textbox',{name:'Редактировать пункт 1.1',exact:true}).fill('1.1. Измененный предмет.');
    await page.getByRole('textbox',{name:'Редактировать пункт 7.3',exact:true}).fill('');
    const downloadPromise=page.waitForEvent('download');
    await page.locator('[data-action="export"]').click();
    const download=await downloadPromise;
    const exported=await fs.readFile(await download.path(),'utf8');
    assert.match(exported,/Измененный предмет/);assert.match(exported,/Ручная правка пользователя/);
    assert.equal(exported.includes('Уплата неустойки не освобождает'),false);
    passed.push('TXT export contains manual changes and respects intentionally empty text');

    await reset();await page.locator('[data-action="reject"]').click();
    assert.match(await page.locator('#selected-clause').textContent(),/Предложение отклонено/);
    await page.locator('.clause-actions [data-action="undo"]').click();
    assert.equal(await page.locator('[data-action="accept"]').count(),1);
    await page.getByRole('textbox',{name:'Редактировать пункт 4.2',exact:true}).fill('4.2. Срок — 10 рабочих дней.');
    assert.equal(await page.locator('#agent-content').getByText('Срок приемки в договоре: 5 дней. В ТЗ: 10 дней.').count(),0);
    passed.push('Reject, undo and suppression of stale canned claims');

    await page.locator('.rail [data-view="sources"]').click();
    await page.getByRole('textbox',{name:'Поиск правового источника'}).fill('несуществующая норма');
    await page.getByRole('button',{name:'Найти в макете'}).click();
    assert.match(await page.locator('#source-results').textContent(),/не означает отсутствия нормы/);
    passed.push('Search empty result does not imply absence of law');

    await reset();await page.locator('#chat-input').fill('<img src="https://example.invalid/x" onerror="alert(1)">');
    await page.locator('.send').click();
    assert.equal(await page.locator('#agent-content img').count(),0);
    const csp=await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    assert.match(csp,/connect-src 'none'/);
    passed.push('User text rendered literally and outbound connections blocked by CSP');

    for(const width of [1280,960,390]){
      await page.setViewportSize({width,height:900});await reset();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow at ${width}`);
    }
    passed.push('No horizontal overflow at 1280, 960 and 390 pixels');
    assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
    const report={checkedAt:new Date().toISOString(),browser:'Chromium / Playwright on macOS',passed,pageErrors:errors,externalRequests:network,limitations:['Synthetic HTML only; no native DOCX/PDF engine, law API or LLM','No Windows execution test']};
    await fs.writeFile(path.join(output,'validation.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report,null,2));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
