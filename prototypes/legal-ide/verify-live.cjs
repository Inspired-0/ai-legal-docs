// Run the loopback server first. LIVE_API_SMOKE=1 opts into two real synthetic model calls.
const {chromium}=require(process.env.PROTOTYPE_PLAYWRIGHT_MODULE || 'playwright');
const {strict:assert}=require('node:assert');
const real=process.env.LIVE_API_SMOKE==='1';

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    page.setDefaultTimeout(real?105000:10000);
    const errors=[],requests=[],passed=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{requests.push(r.url());if(r.url().endsWith('/api/run'))runCount++;});
    let preview,runCount=0,delayPreview=false,releasePreview;
    await page.route('**/api/preview',async route=>{
      const response=await route.fetch();preview=await response.json();
      if(delayPreview)await new Promise(resolve=>{releasePreview=resolve;});
      await route.fulfill({response});
    });
    if(!real)await page.route('**/api/run',async route=>{
      const context=JSON.parse(preview.payload.messages[1].content);
      const edits=context.mode==='review'?[]:['4.2','7.3'].map(id=>({id,before:context.clauses[id],after:context.clauses[id]+' Дополнение для примера.'}));
      await route.fulfill({json:{answer:context.mode==='review'?'Проверяющий: источники не получены.':'Ответ для примера <img src="https://example.invalid/leak">',edits,legal_verified:false,model:'reported-model'}});
    });
    await page.goto('http://127.0.0.1:8765');
    await page.waitForFunction(()=>!document.querySelector('.send').disabled);
    assert.equal(await page.locator('.clause-actions').count(),0);
    assert.equal(await page.locator('[data-action="run-review"]').count(),0);
    const ask=async()=>{
      await page.locator('#chat-input').fill('Мы заказчик Альта. Для синтетического теста предложи только одну правку пункта 4.2: измени 5 рабочих дней на 10 рабочих дней. Не ссылайся на законы.');
      await page.locator('.send').click();
      await page.locator('[data-live="send"]').waitFor();
      assert.equal(JSON.stringify(preview.payload).includes('Альта'),false);
      assert.equal(JSON.stringify(preview.payload).includes('Вектор Систем'),false);
      assert.equal(preview.payload.model,'o4-mini-2025-04-16');
      await page.locator('[data-live="send"]').click();
      await page.waitForFunction(()=>!document.querySelector('.send').disabled);
      assert.ok(await page.locator('[data-live="apply"]').count()>0,await page.locator('#agent-content').textContent());
    };
    await ask();passed.push('Preview masks context; structured response offers edits');
    assert.equal(await page.locator('#agent-content img').count(),0);
    await page.locator('[data-live="review"]').click();
    await page.locator('[data-live="send"]').waitFor();
    assert.equal(JSON.parse(preview.payload.messages[1].content).history.length,0);
    await page.locator('[data-live="send"]').click();
    await page.waitForFunction(()=>!document.querySelector('.send').disabled);
    assert.match(await page.locator('#agent-content').textContent(),/Повторный анализ выполнен/);
    passed.push('Separate reviewer call, no legal-verification claim');
    await page.locator('[data-live="apply"]').first().click();
    assert.match(await page.locator('[data-edit="4.2"]').textContent(),real?/10 рабочих дней/:/Дополнение/);
    assert.match(await page.locator('#agent-content').textContent(),/устарел/);
    if(!real){
      await page.locator('[data-live="apply"]').nth(1).click();
      assert.match(await page.locator('[data-edit="7.3"]').textContent(),/Дополнение/);
      await page.locator('[data-live="undo"]').click();
      assert.equal((await page.locator('[data-edit="7.3"]').textContent()).includes('Дополнение'),false);
    }
    await page.locator('[data-live="undo"]').click();
    assert.match(await page.locator('[data-edit="4.2"]').textContent(),/5 рабочих дней/);
    assert.match(await page.locator('[data-live="apply"]').first().textContent(),/Отменено/);
    passed.push('Apply, invalidate review and undo without file writes');
    if(!real){
      await page.locator('[data-action="new-task"]').click();await ask();
      await page.locator('[data-edit="1.1"]').fill('1.1. Изменен другой пункт.');
      assert.equal(await page.locator('[data-live="apply"]').first().isDisabled(),true);
      passed.push('Changing sibling clause blocks stale batch');
      await page.locator('[data-action="new-task"]').click();await ask();
      await page.locator('[data-live="apply"]').first().click();
      await page.locator('[data-edit="4.2"]').fill('4.2. Моя ручная правка.');
      await page.locator('[data-live="undo"]').click();
      assert.equal(await page.locator('[data-edit="4.2"]').textContent(),'4.2. Моя ручная правка.');
      passed.push('Undo preserves subsequent manual edits');
      delayPreview=true;
      await page.locator('#chat-input').fill('Проверь текст');await page.locator('.send').click();
      while(!releasePreview)await new Promise(resolve=>setTimeout(resolve,10));
      await page.locator('.rail [data-action="privacy"]').click();
      await page.locator('#redaction-values').fill('Альта\nновое имя');
      await page.locator('[data-live="save-privacy"]').click();
      releasePreview();
      await page.waitForFunction(()=>!document.querySelector('.send').disabled);
      assert.equal(await page.locator('[data-live="send"]').count(),0);
      assert.match(await page.locator('#agent-content').textContent(),/список замен изменен/);
      passed.push('Privacy change during pending preview invalidates ticket in UI');
    }
    for(const width of [1280,960,390]){
      await page.setViewportSize({width,height:900});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    }
    assert.deepEqual(errors,[]);
    assert.equal(requests.some(url=>!url.startsWith('http://127.0.0.1:8765/')),false);
    await page.setViewportSize({width:1440,height:1000});
    await page.screenshot({path:real?'/tmp/legal-ide-live-api.png':'/tmp/legal-ide-live-test.png',fullPage:true});
    console.log(JSON.stringify({mode:real?'real API, two calls':'stubbed browser responses',passed,errors,runCount},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
