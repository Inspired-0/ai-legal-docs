// Session-history regression. Run the loopback IDE server first; model replies are fixtures.
const {chromium}=require(process.env.PROTOTYPE_PLAYWRIGHT_MODULE || 'playwright');
const {strict:assert}=require('node:assert');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

(async()=>{
  const browser=await chromium.launch({headless:true});
  const passed=[];
  try{
    for(const mode of ['offline','live']){
      const page=await browser.newPage({viewport:{width:1440,height:1000}});
      page.setDefaultTimeout(10000);
      const errors=[],requests=[];
      let preview,holdRun=false,releaseRun,failRun=false;
      page.on('pageerror',e=>errors.push(e.message));
      page.on('request',r=>requests.push(r.url()));
      if(mode==='live'){
        await page.route('**/api/preview',async route=>{
          const response=await route.fetch();preview=await response.json();await route.fulfill({response});
        });
        await page.route('**/api/run',async route=>{
          if(holdRun)await new Promise(resolve=>{releaseRun=resolve;});
          if(failRun){await route.fulfill({status:502,json:{error:'Тестовая ошибка соединения'}});return;}
          const context=JSON.parse(preview.payload.messages[1].content);
          const edits=context.mode!=='review' && context.clauses['4.2']?[{id:'4.2',before:context.clauses['4.2'],after:context.clauses['4.2'].replace('5 рабочих','10 рабочих')}]:[];
          await route.fulfill({json:{answer:'Ответ: '+context.task,edits,model:'o4-mini-2025-04-16',legal_verified:false}});
        });
      }
      await page.goto(mode==='live'?'http://127.0.0.1:8765':pathToFileURL(path.join(__dirname,'index.html')).href);
      if(mode==='live')await page.waitForFunction(()=>!document.querySelector('.send').disabled);
      const history=()=>page.locator('.rail [data-view="dialogues"]').click();
      const newChat=()=>page.locator('.agent-heading [data-action="new-task"]').click();
      const ask=async text=>{
        await page.locator('#chat-input').fill(text);await page.locator('.send').click();
        if(mode==='live'){
          await page.locator('[data-live="send"]').waitFor();
          await page.locator('[data-live="send"]').click();
          if(!holdRun)await page.waitForFunction(()=>!document.querySelector('.send').disabled);
        }
      };
      const open=title=>page.locator('.dialogue-row').filter({has:page.locator('strong',{hasText:title})}).click();
      await ask('Согласовать срок приемки');
      if(mode==='live'){
        await page.locator('[data-live="review"]').click();
        await page.locator('[data-live="send"]').click();
        await page.waitForFunction(()=>!document.querySelector('.send').disabled);
      }
      await page.locator('#chat-input').fill('Черновик продолжения');
      await newChat();
      assert.equal(await page.locator('#chat-input').inputValue(),'');
      assert.doesNotMatch(await page.locator('#agent-content').textContent(),/Повторный анализ выполнен/);
      await ask('Проверить ответственность исполнителя');
      if(mode==='live')assert.deepEqual(JSON.parse(preview.payload.messages[1].content).history,[]);
      await history();
      assert.equal(await page.locator('.dialogue-row').count(),2);
      assert.equal(await page.locator('.agent-panel').isVisible(),false);
      await page.locator('#dialogue-search').fill('Согласовать срок');
      assert.equal(await page.locator('.dialogue-row').count(),1);
      await open(mode==='live'?'Согласовать срок':'Проверь приемку');
      assert.equal(await page.locator('#chat-input').inputValue(),'Черновик продолжения');
      if(mode==='live')assert.match(await page.locator('#agent-content').textContent(),/Повторный анализ выполнен/);
      assert.match(await page.locator('#agent-content').textContent(),/Согласовать срок/);
      assert.doesNotMatch(await page.locator('#agent-content').textContent(),/Проверить ответственность исполнителя/);
      passed.push(mode+': new dialogue preserves transcript and draft; search and reopening');

      await page.locator('.file-row[data-file="pdf"]').click();
      assert.doesNotMatch(await page.locator('#agent-content').textContent(),/Согласовать срок/);
      await page.locator('[data-page="2"]').click();
      await ask('Составить список результатов работ');
      if(mode==='live'){
        const body=JSON.parse(preview.payload.messages[1].content);
        assert.deepEqual(body.history,[]);
        assert.match(body.document,/3. Требования к результату/);
        assert.deepEqual(body.clauses,{});
      }
      await page.locator('.file-row[data-file="contract"]').click();
      await history();await page.locator('#dialogue-search').fill('Техническое задание');
      assert.equal(await page.locator('.dialogue-row').count(),1);
      await open('Составить список');
      assert.match(await page.locator('.pdf-counter').textContent(),/2 из 2/);
      assert.match(await page.locator('#context-label').textContent(),/Техническое задание/);
      assert.match(await page.locator('#agent-content').textContent(),/Составить список/);
      passed.push(mode+': document context and PDF page restored without mixing histories');

      await history();await page.locator('#dialogue-search').fill('');
      if(mode==='live')await page.screenshot({path:path.join(__dirname,'screenshots/08-dialogues.png'),fullPage:true});
      for(const width of [1440,1280,960,390]){
        await page.setViewportSize({width,height:1000});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        assert.equal(await page.locator('#dialogue-search').isVisible(),true);
      }
      if(mode==='live')await page.screenshot({path:path.join(__dirname,'screenshots/09-dialogues-mobile.png'),fullPage:true});
      await page.setViewportSize({width:1440,height:1000});
      await page.locator('#dialogue-search').fill('нет такого диалога');
      assert.equal(await page.locator('.dialogue-row').count(),0);
      assert.match(await page.locator('#dialogue-list').textContent(),/Ничего не найдено/);
      await page.locator('#dialogue-search').fill('');
      await open('Проверить ответственность');

      if(mode==='live'){
        await page.locator('[data-live="apply"]').click();
        await history();await open('Согласовать срок');
        assert.equal(await page.locator('[data-live="apply"]').isDisabled(),true);
        await history();await open('Проверить ответственность');
        await page.locator('[data-live="undo"]').click();
        assert.match(await page.locator('[data-edit="4.2"]').textContent(),/5 рабочих дней/);
        passed.push('live: stored proposals become stale across conversations; undo remains scoped');

        // A preview belongs to a conversation even when the document text is identical.
        await page.locator('#chat-input').fill('Предпросмотр старого диалога');
        await page.locator('.send').click();await page.locator('[data-live="send"]').waitFor();
        await page.keyboard.press('Escape');await newChat();
        await page.evaluate(()=>{
          const b=document.createElement('button');b.dataset.live='send';document.body.append(b);b.click();b.remove();
        });
        assert.equal(await page.locator('#agent-content .new-message').count(),0);

        holdRun=true;await ask('Задержанный ответ');
        await page.waitForFunction(()=>document.querySelector('.send').disabled);
        await page.locator('.file-row[data-file="pdf"]').click();
        assert.match(await page.locator('#context-label').textContent(),/Договор внедрения/);
        await newChat();await history();await open('Составить список');
        assert.equal(await page.locator('.dialogues-view').isVisible(),true);
        // Run route is reached asynchronously; wait for its explicit release callback.
        while(!releaseRun)await new Promise(resolve=>setTimeout(resolve,10));
        await page.locator('#dialogue-search').fill('Задержанный');
        releaseRun();holdRun=false;
        await page.waitForFunction(()=>!document.querySelector('.send').disabled);
        assert.equal(await page.locator('#dialogue-search').inputValue(),'Задержанный');
        assert.equal(await page.locator('#dialogue-search').evaluate(el=>el===document.activeElement),true);
        await page.locator('#dialogue-search').fill('');
        await open('Задержанный ответ');
        assert.match(await page.locator('#agent-content').textContent(),/Ответ: Задержанный ответ/);
        passed.push('live: switching during requests is blocked; old previews cannot send in another dialogue');

        failRun=true;await ask('Неудачный запрос');failRun=false;
        assert.match(await page.locator('#agent-content').textContent(),/Тестовая ошибка соединения/);
        await newChat();assert.doesNotMatch(await page.locator('#agent-content').textContent(),/Тестовая ошибка/);
        await history();await open('Задержанный ответ');
        assert.match(await page.locator('#agent-content').textContent(),/Тестовая ошибка соединения/);
        passed.push('live: request errors are retained in the originating dialogue');
      }
      await page.locator('.file-row[data-file="pdf"]').click();
      await page.locator('[data-page="1"]').click();await page.locator('.pdf-mark').click();
      assert.match(await page.locator('#context-label').textContent(),/Договор внедрения.*фрагмент ТЗ/);
      await ask('Сравнить договор с приложением');
      const attachedTitle=await page.locator('#conversation-title').textContent();
      if(mode==='live'){
        await page.locator('#chat-input').fill('Проверить приложенный фрагмент');
        await page.locator('.send').click();await page.locator('[data-live="send"]').waitFor();
        assert.match(JSON.parse(preview.payload.messages[1].content).document,/Приложение, п. 2.3/);
        await page.keyboard.press('Escape');
      }
      await newChat();assert.doesNotMatch(await page.locator('#context-label').textContent(),/фрагмент ТЗ/);
      await history();await page.locator('#dialogue-search').fill('');await open(attachedTitle);
      assert.match(await page.locator('#context-label').textContent(),/фрагмент ТЗ/);
      passed.push(mode+': explicit PDF attachment stays with its contract dialogue');
      await newChat();await ask('<img src="https://example.invalid/x" onerror="alert(1)">');
      await history();await page.locator('#dialogue-search').fill('<img');
      assert.equal(await page.locator('.dialogue-row').count(),1);
      assert.equal(await page.locator('.dialogues-view img').count(),0);
      assert.deepEqual(errors,[]);
      assert.equal(requests.some(url=>/^https?:/.test(url) && !url.startsWith('http://127.0.0.1:8765/')),false);
      await page.reload();
      if(mode==='live')await page.waitForFunction(()=>!document.querySelector('.send').disabled);
      await history();assert.equal(await page.locator('.dialogue-row').count(),1);
      passed.push(mode+': responsive history, empty search, literal text, session-only state; no page errors or external requests');
      await page.close();
    }
    console.log(JSON.stringify({passed},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
