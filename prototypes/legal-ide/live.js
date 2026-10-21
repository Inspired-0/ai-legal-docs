"use strict";

// Served mode only. file:// remains the original offline interface mock.
if (location.protocol === 'http:' || location.protocol === 'https:') {
  const live = {
    config:null, busy:false, error:'', messages:[], latest:null, reviewed:null,
    pending:null, undo:[], redactions:['Альта','АЛЬТА','Вектор Систем','Анна Примерова','АЛТ-24/26'],
    revision:0,
  };

  function context() {
    const container = document.createElement('div');
    container.innerHTML = state.file === 'contract' ? contractPage() : state.file === 'pdf' ? pdfPage() : additionalPage();
    container.querySelectorAll('button,.clause-actions,.clause-marker,.paper-meta,.paper-footer').forEach(el=>{
      if(el.classList.contains('pdf-mark'))el.replaceWith(document.createTextNode(el.textContent));
      else el.remove();
    });
    const selected=container.querySelector('#selected-clause p');
    if(selected)selected.textContent=state.edits['7.2'] ?? (state.change==='accepted'?proposedClause:initialClause);
    const clauses={};
    if(state.file==='contract'){
      for(const el of container.querySelectorAll('[data-edit]'))clauses[el.dataset.edit]=el.textContent;
      clauses['7.2']=selected.textContent;
    }
    let documentText=[...container.querySelectorAll('h1,h2,p,li,td,th')].map(el=>el.textContent).join('\n');
    if(state.pdfContext && state.file!=='pdf')documentText+='\nПриложение, п. 2.3: Срок приемочных испытаний составляет 10 рабочих дней после передачи результата этапа.';
    return {document:documentText,clauses,file:state.file,pdfPage:state.pdfPage,pdfContext:state.pdfContext};
  }
  function fingerprint(){return JSON.stringify(context());}
  function updateControls(){
    document.querySelector('.send').disabled=live.busy || !live.config;
    document.querySelector('.send').setAttribute('aria-label','Подготовить запрос агенту');
    document.querySelector('.model-select').textContent=live.config ? `${live.config.model} ⌄` : 'Подключение сервера…';
  }
  function renderLive(){
    syncConversation();
    if(state.view==='dialogues')document.querySelector('#dialogue-list').innerHTML=dialogueRows();
    updateControls();
    document.querySelectorAll('[data-agent-tab]').forEach(el=>el.classList.toggle('active',el.dataset.agentTab===state.agentTab));
    let html='<p class="agent-disclaimer">Синтетический пример · правовая база не подключена. Выводы требуют проверки.</p>';
    if(!live.messages.length)html+='<p class="agent-intro">Задайте вопрос по открытому документу. Например: «Мы заказчик. Оцени приемку и предложи новую редакцию пункта 4.2». Перед отправкой можно проверить весь контекст.</p>';
    for(const message of live.messages){
      html+=`<div class="new-message"><strong>${message.role==='user'?'Вы':message.review?'Второй агент':'Ассистент'}</strong><p class="live-text">${escapeHTML(message.content)}</p></div>`;
    }
    if(live.latest){
      const stale=live.latest.fingerprint!==fingerprint();
      html+=`<p class="agent-footnote">${stale?'Документ или контекст изменен после ответа. Нужен новый анализ.':'Ответ относится к текущему контексту.'}</p>`;
      const editsStale=live.latest.applyFingerprint!==fingerprint();
      for(const [index,edit] of live.latest.edits.entries()){
        html+=`<article class="suggestion"><h3>Пункт ${escapeHTML(edit.id)}</h3><p class="live-before">${escapeHTML(edit.before)}</p><p class="live-text">${escapeHTML(edit.after)}</p><div class="suggestion-footer"><button data-live="apply" data-index="${index}" ${edit.decided || live.busy || editsStale?'disabled':''}>${edit.decided || (editsStale?'Контекст изменен':'Принять правку')}</button><button data-live="reject" data-index="${index}" ${edit.decided || live.busy?'disabled':''}>Отклонить</button></div></article>`;
      }
      html+=`<button class="run-review" data-live="review" ${live.busy || stale?'disabled':''}>Проверить ответ вторым агентом</button>`;
    }
    if(live.reviewed){html+=`<p class="info-box">${live.reviewed.fingerprint===fingerprint()?'Повторный анализ выполнен. Достоверность законов не проверена.':'Результат второго анализа устарел после изменения контекста.'}</p>`;}
    if(live.undo.length)html+='<button class="secondary-btn" data-live="undo">Отменить последнюю AI-правку</button>';
    if(live.busy)html+='<p class="agent-intro" role="status">Модель обрабатывает запрос…</p>';
    if(live.error)html+=`<div class="info-box" role="alert">${escapeHTML(live.error)}</div>`;
    agentContent.innerHTML=html;
  }
  async function api(path,body){
    const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-IDE-Token':live.config.csrf},body:JSON.stringify(body),signal:AbortSignal.timeout(105000)});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error || 'Ошибка локального сервера.');
    return result;
  }
  function safeError(error){return error.name==='TimeoutError'?'Время ожидания истекло. Сервер мог продолжить запрос; автоматического повтора нет.':error.message || 'Не удалось выполнить запрос.';}
  async function preview(task,mode='chat'){
    if(live.busy || !live.config)return;
    live.error='';live.busy=true;renderLive();
    try{
      const snapshot=context(), fp=JSON.stringify(snapshot), revision=live.revision;
      if(mode==='review' && (!live.latest || live.latest.fingerprint!==fp))throw new Error('Контекст изменился. Сначала получите новый ответ.');
      const data={mode,task,document:snapshot.document,clauses:snapshot.clauses,
        redactions:[...live.redactions],history:live.messages.filter(m=>!m.review).map(({role,content})=>({role,content})),
        candidate:mode==='review'?JSON.stringify({answer:live.latest.answer,edits:live.latest.edits}):''};
      const result=await api('/api/preview',data);
      if(revision!==live.revision || fp!==fingerprint())throw new Error('Контекст или список замен изменен. Подготовьте запрос заново.');
      live.pending={...result,task,mode,fingerprint:fp,revision};
      showDialog('Контекст перед отправкой',`<p class="dialog-description">Получатель: ${escapeHTML(live.config.endpoint)}<br>Заменены только значения из списка защиты — с точным совпадением, без распознавания новых имен. HTTP не шифрует передачу. Используйте синтетические данные.</p><details><summary>Полный запрос модели</summary><pre class="payload-preview">${escapeHTML(JSON.stringify(result.payload,null,2))}</pre></details><p class="dialog-description">Таблица обратной подстановки остается на локальном сервере. Проверьте текст перед отправкой.</p><div class="dialog-actions"><button class="secondary-btn" data-action="close-dialog">Отмена</button><button class="primary-btn" data-live="send">Отправить модели</button></div>`);
    }catch(error){live.error=safeError(error);}
    finally{live.busy=false;renderLive();}
  }
  async function send(){
    const pending=live.pending;
    if(!pending || live.busy)return;
    if(pending.fingerprint!==fingerprint() || pending.revision!==live.revision){dialog.close();live.error='Контекст изменился. Подготовьте запрос заново.';renderLive();return;}
    live.pending=null;dialog.close();live.busy=true;live.error='';renderLive();
    if(pending.mode==='chat'){
      live.messages.push({role:'user',content:pending.task});
      syncConversation(true);
      live.latest=null;live.reviewed=null;
      document.querySelector('#chat-input').value='';
    }
    renderLive();
    try{
      const result=await api('/api/run',{ticket:pending.ticket});
      live.messages.push({role:'assistant',content:result.answer,review:pending.mode==='review'});
      syncConversation(true);
      if(pending.mode==='chat')live.latest={...result,task:pending.task,fingerprint:pending.fingerprint,applyFingerprint:pending.fingerprint};
      else live.reviewed={fingerprint:pending.fingerprint};
      if(result.model!==live.config.model){live.error=`Запрошена ${live.config.model}; сервер сообщил ${result.model}. Проверьте маршрутизацию прокси.`;}
    }catch(error){live.error=safeError(error);}
    finally{live.busy=false;renderLive();agentContent.scrollTop=agentContent.scrollHeight;}
  }
  function review(){if(live.latest)preview(live.latest.task,'review');else notify('Сначала задайте вопрос основному агенту.');}
  function settingsLive(){
    showDialog('Подключение модели',`<p class="dialog-description">Адрес и модель задаются на локальном сервере. Ключ не передается браузеру.</p><label class="form-field"><span>Endpoint</span><input readonly value="${escapeHTML(live.config?.endpoint || '')}"></label><label class="form-field"><span>Запрошенная модель</span><input readonly value="${escapeHTML(live.config?.model || '')}"></label><p class="dialog-description">API-ключ: ${live.config?.has_key?'настроен в окружении сервера':'не задан'}. При необходимости используйте LEGAL_IDE_API_KEY и перезапустите сервер. Возвращенное API имя модели отображается при расхождении.</p><div class="dialog-actions"><button class="primary-btn" data-action="close-dialog">Закрыть</button></div>`);
  }
  function privacyLive(){
    showDialog('Локальная замена значений',`<p class="dialog-description">По одному значению на строку. Заменяем точные совпадения во всем запросе, включая чат и ответ для проверки; склонения и другие написания нужно добавить отдельно. Это не автоматический анонимизатор.</p><label class="form-field"><span>Значения, скрываемые от модели</span><textarea id="redaction-values" rows="7">${escapeHTML(live.redactions.join('\n'))}</textarea></label><div class="dialog-actions"><button class="primary-btn" data-live="save-privacy">Сохранить в этой сессии</button></div>`);
  }
  function applyEdit(index){
    const edit=live.latest?.edits[index];
    if(!edit || edit.decided || live.busy)return;
    if(state.file!=='contract' || live.latest.applyFingerprint!==fingerprint() || context().clauses[edit.id]!==edit.before){live.error='Контекст изменился после запроса. Правка не применена: получите новое предложение.';renderLive();return;}
    live.undo.push({...edit,proposal:edit});state.edits[edit.id]=edit.after;
    if(edit.id==='7.2')state.change='rejected';
    edit.decided='Принято';live.latest.applyFingerprint=fingerprint();invalidateReview();render();status('AI-правка принята в тексте примера');
  }
  function undoEdit(){
    const edit=live.undo.at(-1);if(!edit || live.busy)return;
    if(state.file!=='contract' || context().clauses[edit.id]!==edit.after){live.error='Пункт изменен вручную. Отмена не должна удалять ваш текст.';renderLive();return;}
    state.edits[edit.id]=edit.before;edit.proposal.decided='Отменено';live.undo.pop();invalidateReview();render();status('AI-правка отменена в тексте примера');
  }
  window.legalLive={render:renderLive,review,settings:settingsLive,
    isBusy:()=>live.busy,
    snapshot:()=>({messages:live.messages,latest:live.latest,reviewed:live.reviewed,undo:live.undo,error:live.error}),
    restore(data){
      live.messages=data.messages || [];live.latest=data.latest || null;live.reviewed=data.reviewed || null;
      live.undo=data.undo || [];live.error=data.error || '';live.pending=null;live.revision++;
    },
    invalidate(){live.revision++;}
  };
  // The offline example is not an actual API conversation.
  conversations.items=[];conversations.activeId=null;conversations.sequence=0;
  document.addEventListener('submit',event=>{
    if(event.target.id!=='chat-form')return;
    event.preventDefault();event.stopImmediatePropagation();
    const value=document.querySelector('#chat-input').value.trim();if(value)preview(value);
  },true);
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if((button.dataset.file || button.dataset.page || button.dataset.conversation) && live.busy){
      event.preventDefault();event.stopImmediatePropagation();notify('Дождитесь завершения запроса, чтобы сменить документ или диалог.');return;
    }
    if(button.dataset.file || button.dataset.page || button.dataset.agentTab)queueMicrotask(renderLive);
    const action=button.dataset.live;
    if(action){
      event.preventDefault();event.stopImmediatePropagation();
      if(action==='send')send();
      if(action==='review')review();
      if(action==='apply')applyEdit(Number(button.dataset.index));
      if(action==='reject'){const edit=live.latest?.edits[Number(button.dataset.index)];if(edit && !live.busy){edit.decided='Отклонено';renderLive();}}
      if(action==='undo')undoEdit();
      if(action==='save-privacy'){live.redactions=document.querySelector('#redaction-values').value.split('\n').map(v=>v.trim()).filter(Boolean);live.revision++;dialog.close();notify('Замены сохранены локально до перезагрузки.');}
    }
    if(['privacy','new-task','launch-skill','context','undo','accept','reject','source','evidence'].includes(button.dataset.action)){
      event.preventDefault();event.stopImmediatePropagation();
      if(['source','evidence'].includes(button.dataset.action))showDialog('Правовые основания не подключены','<p class="dialog-description">В рабочем AI-прототипе нет полученных текстов норм и проверенных цитат. Демонстрационные карточки источников не являются основаниями ответа агента.</p>');
      else if(button.dataset.action==='privacy')privacyLive();
      else if(button.dataset.action==='undo')undoEdit();
      else if(button.dataset.action==='new-task'){
        if(live.busy){notify('Дождитесь ответа модели.');return;}
        newConversation();
      }else notify('Используйте вопрос агенту и предложения в чате. Этот элемент относится к макету.');
    }
  },true);
  // Remove prewritten proposed edit in live mode: only real model proposals are actionable.
  state.change='rejected';state.redline=false;
  document.querySelector('.demo-label').textContent='API';
  document.querySelector('.tab-count').hidden=true;
  document.querySelector('.composer-note').textContent='Предпросмотр запроса · только синтетические данные';
  document.querySelector('.sidebar-bottom p').textContent='Внешнему API передается выбранный текст после просмотра. Файлы компьютера не читаются.';
  document.querySelector('.privacy-mini span:last-child').textContent='Точная замена заданных значений';
  document.querySelector('.statusbar > span:first-child').textContent='Локальный AI-прототип';
  document.querySelector('.statusbar [data-action="privacy"]').textContent='Защита контекста';
  newConversation();
  fetch('/api/config').then(response=>{if(!response.ok)throw new Error('Не удалось подключить локальный сервер.');return response.json();}).then(config=>{live.config=config;renderLive();}).catch(error=>{live.error=safeError(error);renderLive();});
}
