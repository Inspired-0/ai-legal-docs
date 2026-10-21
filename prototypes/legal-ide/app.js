"use strict";

// Synthetic interface only. No filesystem access, network calls, secrets or persistent storage.
const icons = {
  chat: '<path d="M4 4h16v12H9l-5 4z"/><path d="M8 8h8M8 12h5"/>',
  files: '<path d="M8 3h8l4 4v14H8z"/><path d="M16 3v5h4M4 17V3h2M11 12h6M11 16h6"/>',
  book: '<path d="M12 5C8 2 4 3 2 4v15c4-2 7-1 10 1 3-2 6-3 10-1V4c-4-2-7-1-10 1v15"/>',
  spark: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z"/>',
  shield: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6z"/><path d="m8 12 3 3 5-6"/>',
  settings: '<path d="m9 3 1-1h4l1 3 3 1 3 3-1 3 1 3-3 3-3 1-1 3h-4l-1-3-3-1-3-3 1-3-1-3 3-3 3-1z"/><circle cx="12" cy="12" r="3"/>',
  folder: '<path d="M3 6V4h6l2 3h10v13H3z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  alert: '<path d="m12 3 10 18H2zM12 9v5M12 17v1"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.files}</svg>`;
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const initialClause = '7.2. За нарушение срока выполнения работ Исполнитель уплачивает Заказчику неустойку в размере 0,5% от общей цены договора за каждый день просрочки. Общий размер неустойки не ограничен.';
const proposedClause = '7.2. За нарушение срока выполнения работ Исполнитель уплачивает Заказчику неустойку в размере 0,1% от стоимости просроченного этапа за каждый день просрочки, но не более 10% стоимости этого этапа.';
const state = {view:'workspace',file:'contract',agentTab:'task',review:'idle',change:'pending',redline:true,pdfPage:1,pdfContext:false,edits:{},messages:[],skill:null,skillDraft:null,skillTested:false,provider:'Yandex AI Studio',model:'YandexGPT Pro 5.1',sourceFilter:'all'};
const main = document.querySelector('#main');
const agentContent = document.querySelector('#agent-content');
const dialog = document.querySelector('#dialog');
let toastTimer;
let reviewTimer;
const hydrateIcons = (root = document) => root.querySelectorAll('[data-icon]').forEach(el => {el.innerHTML = icon(el.dataset.icon);});
function notify(message) {
  const el = document.querySelector('#toast');
  clearTimeout(toastTimer); el.textContent = message; el.classList.add('visible');
  toastTimer = setTimeout(() => el.classList.remove('visible'), 4200);
}
function status(message) {document.querySelector('#status-message').textContent = message;}
function showDialog(title, content) {
  document.querySelector('#dialog-title').textContent = title;
  document.querySelector('#dialog-body').innerHTML = content;
  hydrateIcons(dialog); if (!dialog.open) dialog.showModal();
}
const filenames = {contract:'Договор внедрения.docx',pdf:'Техническое задание.pdf',protocol:'Протокол разногласий.docx',notes:'Позиция компании.md'};
// Conversation state is deliberately session-only, like the document editor.
const conversations = {items:[], activeId:null, sequence:0, query:''};
const demoReply = 'Демонстрационный ответ: для этой задачи потребуются обстоятельства клиента, применимые источники и проверка предлагаемого результата. Реального обращения к модели не было.';
function activeConversation(){return conversations.items.find(item=>item.id===conversations.activeId);}
function saveConversation(){
  const item=activeConversation();if(!item)return;
  item.data=window.legalLive ? window.legalLive.snapshot() : {messages:[...state.messages],review:state.review};
  item.draft=document.querySelector('#chat-input').value;
  item.pdfPage=state.pdfPage;item.pdfContext=state.pdfContext;
}
function conversationMessages(item){
  if(window.legalLive)return item.data.messages || [];
  const messages=(item.data.messages || []).flatMap(content=>[{role:'user',content},{role:'assistant',content:demoReply}]);
  if(item.seed)messages.unshift({role:'user',content:'Проверь приемку и ответственность. Покажи риски для нас и предложи правки с основаниями.'},{role:'assistant',content:'Демонстрационный анализ: ответственность, сроки приемки и позиция заказчика. Юридическая проверка не выполнена.'});
  return messages;
}
function syncConversation(touched=false){
  saveConversation();const item=activeConversation();if(!item)return;
  const messages=conversationMessages(item);
  item.title=messages.find(m=>m.role==='user')?.content || 'Новый диалог';
  if(touched)item.updatedAt=Date.now();
  document.querySelector('#conversation-title').textContent=item.title;
  document.querySelector('#conversation-title').title=item.title;
  document.querySelector('#dialogue-count').textContent=conversations.items.length;
}
function canSwitchConversation(){
  if(window.legalLive?.isBusy()){notify('Дождитесь завершения запроса, чтобы сменить диалог.');return false;}
  return true;
}
function openConversation(id){
  if(!canSwitchConversation())return;
  const item=conversations.items.find(item=>item.id===id);if(!item)return;
  saveConversation();clearTimeout(reviewTimer);conversations.activeId=id;
  state.file=item.file;state.pdfPage=item.pdfPage;state.pdfContext=item.pdfContext;
  state.view='workspace';state.agentTab='task';
  if(window.legalLive)window.legalLive.restore(item.data);
  else {state.messages=[...item.data.messages];state.review=item.data.review==='running'?'idle':item.data.review || 'idle';}
  document.querySelector('#chat-input').value=item.draft;
  render();
}
function newConversation(seed=false){
  if(!canSwitchConversation())return;
  saveConversation();
  const item={id:String(++conversations.sequence),file:state.file,pdfPage:state.pdfPage,pdfContext:false,
    title:'Новый диалог',updatedAt:Date.now(),draft:'',seed,data:{messages:[]}};
  conversations.items.push(item);openConversation(item.id);
  document.querySelector('#chat-input').focus();
}
function selectDocument(file){
  if(file===state.file){state.view='workspace';renderMain();return;}
  if(!canSwitchConversation())return;
  saveConversation();
  const item=conversations.items.filter(item=>item.file===file).sort((a,b)=>b.updatedAt-a.updatedAt || Number(b.id)-Number(a.id))[0];
  if(item)openConversation(item.id);
  else {conversations.activeId=null;state.file=file;state.pdfPage=1;newConversation();}
}
function dialogueRows(){
  const query=conversations.query.trim().toLocaleLowerCase('ru');
  const items=[...conversations.items].sort((a,b)=>b.updatedAt-a.updatedAt || Number(b.id)-Number(a.id)).filter(item=>
    [item.title,filenames[item.file],...conversationMessages(item).map(m=>m.content)].join(' ').toLocaleLowerCase('ru').includes(query));
  if(!items.length)return '<div class="empty-state">Ничего не найдено.<br>Попробуйте название документа или слова из переписки.</div>';
  return items.map(item=>{
    const messages=conversationMessages(item),last=messages.at(-1);
    const date=new Date(item.updatedAt);
    return `<button class="dialogue-row" data-conversation="${item.id}" aria-label="Открыть диалог: ${escapeHTML(item.title)}"><span class="dialogue-icon">${icon('chat')}</span><span class="dialogue-summary"><strong>${escapeHTML(item.title)}</strong><span class="dialogue-document">${icon('files')}${escapeHTML(filenames[item.file])}${item.pdfContext?' · фрагмент ТЗ':''}</span><span class="dialogue-excerpt">${escapeHTML(last?.content || 'Сообщений пока нет. Начните с вопроса по документу.')}</span></span><span class="dialogue-meta"><time datetime="${date.toISOString()}">${date.toLocaleDateString('ru',{day:'numeric',month:'short'})} · ${date.toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'})}</time><span>${item.id===conversations.activeId?'Текущий · ':''}${messages.length} сообщ.</span></span><span class="dialogue-arrow" aria-hidden="true">↗</span></button>`;
  }).join('');
}
function dialogues(){
  syncConversation();
  return `<section class="dialogues-view"><div class="dialogues-top"><div><p class="view-eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</p><h1>Диалоги</h1><p class="view-description">Задачи, документы и переписка с агентом.</p></div><button class="primary-btn" data-action="new-task">＋ Новый диалог</button></div><div class="dialogues-tools"><label class="dialogue-search">${icon('chat')}<input id="dialogue-search" type="search" aria-label="Поиск диалогов" placeholder="Найти диалог или документ…" value="${escapeHTML(conversations.query)}"></label><span>В этой сессии: ${conversations.items.length}</span></div><div class="dialogue-list" id="dialogue-list">${dialogueRows()}</div><p class="history-note">История хранится до перезагрузки страницы. Откройте диалог, чтобы вернуться к документу и продолжить работу.</p></section>`;
}
function renderOfflineMessages(){
  return state.messages.map(content=>`<div class="new-message"><strong>Вы</strong><p class="live-text">${escapeHTML(content)}</p></div><div class="new-message"><strong>Ассистент · демо</strong><p>${demoReply}</p></div>`).join('');
}
function tabs() {
  return `<div class="document-tabs">${['contract','pdf'].map(file => `<button class="document-tab ${state.view==='workspace'&&state.file===file?'active':''}" data-file="${file}"><span class="file-type ${file==='pdf'?'pdf':'word'}">${file==='pdf'?'P':'W'}</span>${filenames[file]}<span class="tab-x">·</span></button>`).join('')}${state.view==='sources'?'<button class="document-tab active" data-view="sources">Правовые основания</button>':''}${state.view==='skills'?'<button class="document-tab active" data-view="skills">Навыки</button>':''}<button class="icon-btn" data-action="search" aria-label="Найти документ">＋</button></div>`;
}
function editable(id, fallback) {return `<p class="clause" contenteditable="true" role="textbox" aria-label="Редактировать пункт ${id}" data-edit="${id}" spellcheck="false">${escapeHTML(state.edits[id] ?? fallback)}</p>`;}
function clause() {
  if(window.legalLive)return `<div class="clause" id="selected-clause">${editable('7.2',initialClause)}</div>`;
  let text = escapeHTML(state.edits['7.2'] ?? (state.change==='accepted'?proposedClause:initialClause));
  if (state.change==='pending' && state.redline && !state.edits['7.2']) text = '7.2. За нарушение срока выполнения работ Исполнитель уплачивает Заказчику неустойку в размере <del>0,5% от общей цены договора</del> <ins>0,1% от стоимости просроченного этапа</ins> за каждый день просрочки. <del>Общий размер неустойки не ограничен.</del> <ins>Не более 10% стоимости этого этапа.</ins>';
  return `<div class="clause selected" id="selected-clause"><div class="clause-marker">✦ ${state.change==='accepted'?'Правка принята в макете':state.change==='rejected'?'Предложение отклонено':'Предложение 1 из 3 · требует решения юриста'}</div><p ${state.change==='pending'?'':'contenteditable="true" role="textbox" aria-label="Редактировать пункт 7.2" data-edit="7.2"'}>${text}</p><div class="clause-actions">${state.change==='pending'?'<button class="accept" data-action="accept">✓ Принять</button><button data-action="reject">Отклонить</button>':'<button data-action="undo">↶ Отменить решение</button>'}<button data-action="source">Основание ↗</button></div></div>`;
}
function contractPage() {
  return `<article class="paper"><div class="paper-meta"><span>АЛЬТА / ДОГОВОРНАЯ РАБОТА</span><span>СИНТЕТИЧЕСКИЙ ПРИМЕР</span></div><h1>Договор внедрения<br>информационной системы</h1><p class="subtitle">№ АЛТ-24/26</p><div class="place-date"><span>г. Екатеринбург</span><span>19 октября 2026 года</span></div><p>Общество «Альта» (Заказчик) и общество «Вектор Систем» (Исполнитель), совместно именуемые Сторонами, заключили настоящий договор о нижеследующем. Все названия и условия в этом макете вымышлены.</p><h2>1. Предмет договора</h2>${editable('1.1','1.1. Исполнитель обязуется выполнить работы по внедрению информационной системы в соответствии с Техническим заданием (Приложение № 1), а Заказчик — принять и оплатить результат работ.')}<h2>4. Порядок сдачи и приемки</h2>${editable('4.2','4.2. Заказчик в течение 5 рабочих дней со дня получения результата направляет подписанный акт либо мотивированный перечень замечаний.')}<h2>7. Ответственность сторон</h2>${clause()}${editable('7.3','7.3. Уплата неустойки не освобождает Стороны от исполнения обязательств по договору.')}<div class="paper-footer"><span>Учебный документ · редактируется только в макете</span><span>1 / 1</span></div></article>`;
}
function pdfPage() {
  return `<div class="pdf-shell"><nav class="pdf-thumbnails" aria-label="Страницы PDF">${[1,2].map(n=>`<button class="pdf-thumb ${state.pdfPage===n?'active':''}" data-page="${n}" aria-label="Страница ${n}"><span></span><span></span><span></span><span></span><small>${n}</small></button>`).join('')}</nav><article class="paper pdf-paper"><div class="paper-meta"><span>ПРИЛОЖЕНИЕ № 1</span><span>ИМИТАЦИЯ PDF</span></div><h1>Техническое задание</h1><p class="subtitle">Внедрение информационной системы</p>${state.pdfPage===1?'<h2>1. Объем работ</h2><p>Настройка рабочего пространства, импорт справочников и обучение сотрудников Заказчика.</p><table><thead><tr><th>Этап</th><th>Результат</th></tr></thead><tbody><tr><td>01</td><td>Обследование процессов и согласование проектного решения</td></tr><tr><td>02</td><td>Настройка и тестирование системы</td></tr><tr><td>03</td><td>Опытная эксплуатация и передача документации</td></tr></tbody></table><h2>2. Приемочные испытания</h2><p><button class="pdf-mark" data-action="pdf-context" title="Добавить пункт в диалог по договору">2.3. Срок приемочных испытаний составляет 10 рабочих дней после передачи результата этапа.</button></p><p>Результаты испытаний оформляются протоколом с перечнем выявленных замечаний.</p>':'<h2>3. Требования к результату</h2><p>Исполнитель передает пользовательскую документацию, перечень настроек и сценарии приемочных испытаний.</p><h2>4. Сопровождение</h2><p>Порядок передачи обращений, сроки реакции и границы сопровождения согласовываются Сторонами отдельно.</p><p>Данный экран — HTML-макет просмотра. Настоящий PDF-файл не открыт.</p>'}<div class="pdf-counter">Страница ${state.pdfPage} из 2 · синтетический макет</div></article></div>`;
}
function additionalPage() {
  const protocol = state.file==='protocol';
  return `<article class="paper"><div class="paper-meta"><span>АЛЬТА / РАБОЧИЕ МАТЕРИАЛЫ</span><span>СИНТЕТИЧЕСКИЙ ПРИМЕР</span></div><h1>${protocol?'Протокол разногласий':'Позиция компании'}</h1><p class="subtitle">К договору № АЛТ-24/26</p>${protocol?'<ol class="protocol-list"><li>Пункт 4.2: согласовать единый срок приемки с Техническим заданием.</li><li>Пункт 7.2: оценить влияние ограничения ответственности на интересы Заказчика.</li><li>Пункт 7.3: проверить взаимосвязь с остальными условиями договора.</li></ol>':'<h2>Приоритеты заказчика</h2><p>Получить работоспособный результат, сохранить возможность предъявить замечания и установить понятный порядок приемки.</p><h2>Стандарт переговоров</h2><p>Ограничение ответственности не принимается автоматически. Размер и базу расчета согласовывает юрист с владельцем проекта.</p>'}<p>Содержание приведено для демонстрации интерфейса и не является юридической рекомендацией.</p><button class="secondary-btn" data-action="context">Добавить в контекст</button></article>`;
}
function workspace() {
  return `${tabs()}<div class="document-header"><span class="breadcrumb">Внедрение платформы <span class="muted"> / </span> <strong>${filenames[state.file]}</strong></span><span class="draft-badge">${state.file==='pdf'?'Макет просмотра PDF':'Рабочая версия · демо'}</span></div><div class="doc-toolbar">${state.file==='pdf'?'<span>Просмотр</span><span class="toolbar-divider"></span><span>100%</span><button data-action="pdf-context" class="right">＋ В контекст договора</button>':`<span>Основной текст</span><span class="toolbar-divider"></span><span>Georgia · 12</span><span class="toolbar-divider"></span><button class="${state.redline?'active':''}" data-action="toggle-redline">Правки</button><button data-action="undo" title="Отменить решение по правке">↶</button><button class="right" data-action="export">Экспорт макета ↗</button>`}</div><div class="document-scroll">${state.file==='contract'?contractPage():state.file==='pdf'?pdfPage():additionalPage()}</div>`;
}
function sources() {
  return `${tabs()}<section class="view-content"><div class="view-eyebrow">ПРАВОВЫЕ ОСНОВАНИЯ</div><div class="view-top"><div><h1>От вывода — к источнику</h1><p class="view-description">Норма, редакция и объяснение связи с условием договора. Здесь показан демонстрационный маршрут проверки.</p></div><button class="secondary-btn" data-file="contract">← К договору</button></div><form class="source-search" id="source-search"><input aria-label="Поиск правового источника" name="query" placeholder="Акт, статья или правовой вопрос" value=""><button class="primary-btn">Найти в макете</button></form><div class="source-filter"><button class="pill ${state.sourceFilter==='all'?'active':''}" data-filter="all">Все источники</button><button class="pill ${state.sourceFilter==='law'?'active':''}" data-filter="law">Законодательство</button><button class="pill ${state.sourceFilter==='company'?'active':''}" data-filter="company">Стандарт компании</button></div><div id="source-results">${sourceResults('')}</div></section>`;
}
function sourceResults(query) {
  const q = query.trim().toLowerCase();
  const lawMatch = state.sourceFilter!=='company' && (!q || /неустой|330|гк|ответствен|граждан/.test(q));
  const companyMatch = state.sourceFilter!=='law' && (!q || /компани|стандарт|ответствен|позици/.test(q));
  if (!lawMatch && !companyMatch) return '<div class="empty-state">В демонстрационной подборке нет такого источника.<br>Это не означает отсутствия нормы в законодательстве.</div>';
  return `${lawMatch?'<article class="source-card"><span class="tag">НОРМАТИВНЫЙ АКТ · КАРТОЧКА-ПРИМЕР</span><h3>Гражданский кодекс Российской Федерации<br>Статья 330. Понятие неустойки</h3><p>Кандидат в основание для анализа пункта 7.2 договора.</p><p class="source-disclaimer">Текст и применимая редакция в макет не загружены. Ссылка не подтверждает предложенный размер неустойки.</p><footer><span>Источник: требуется получение текста</span><button data-action="evidence">Открыть карточку ↗</button></footer></article>':''}${companyMatch?'<article class="source-card"><span class="tag">СТАНДАРТ КОМПАНИИ · СИНТЕТИЧЕСКИЙ</span><h3>Позиция заказчика по ответственности</h3><p>Ограничение ответственности требует отдельного согласования владельцем проекта. Это внутренняя позиция, не требование закона.</p><footer><span>Позиция компании.md · версия примера 1</span><button data-file="notes">Открыть документ ↗</button></footer></article>':''}`;
}
function evidence() {
  state.view='sources'; renderMain();
  main.innerHTML = `${tabs()}<section class="view-content"><div class="view-eyebrow">ОСНОВАНИЕ / ПУНКТ 7.2</div><div class="view-top"><div><h1>Проверяем связь с нормой</h1><p class="view-description">Предложение: изменить размер и предел неустойки.</p></div><button class="secondary-btn" data-view="sources">Все источники</button></div><div class="source-paper"><div class="source-label">КАРТОЧКА ИСТОЧНИКА · ДЕМОНСТРАЦИЯ</div><h2>ГК РФ · статья 330</h2><p>Понятие неустойки</p><div class="source-highlight"><p>Здесь будет точный фрагмент полученной редакции с выделением статьи, части и пункта.</p></div><p class="source-disclaimer">Цитата не загружена. Не выдаем демонстрационный текст за формулировку закона.</p></div><div class="evidence-grid"><div><small>ПРИМЕНИМАЯ РЕДАКЦИЯ</small>Не установлена в макете</div><div><small>ПРОВЕРКА ЦИТАТЫ</small>Не выполнена</div><div><small>СВЯЗЬ С ВЫВОДОМ</small>Размер 0,1% и предел 10% требуют самостоятельного обоснования</div><div><small>РЕШЕНИЕ ПРОВЕРЯЮЩЕГО</small>Показать как переговорную рекомендацию</div></div><div class="info-box">Даже существование статьи не подтверждает, что предложенная правка отвечает интересам Заказчика. Второй агент должен проверить именно этот вывод.</div><div class="dialog-actions"><button class="secondary-btn" data-file="contract">← Вернуться к правке</button><button class="primary-btn" data-action="review">Смотреть замечания</button></div></section>`;
  hydrateIcons(main);
}
function skills() {
  return `${tabs()}<section class="view-content"><div class="view-eyebrow">ПРОЦЕДУРЫ РАБОТЫ</div><div class="view-top"><div><h1>Ваш опыт становится навыком</h1><p class="view-description">Опишите задачу один раз. Сохраните вопросы, порядок проверки и формат результата для следующих дел.</p></div><button class="primary-btn" data-action="create-skill">＋ Создать навык</button></div><div class="skill-grid">${[['Проверка IT-договора','Приемка, ответственность, права на результат. Анализ с позиции выбранной стороны.','Договоры · демо'],['Матрица требований закупки','Сопоставление требований, документов и сроков. Отдельный список неизвестного.','Закупки · демо'],['Исследование правового вопроса','От обстоятельств клиента к источникам, альтернативам и проверяемому выводу.','Универсальный · демо'],...(state.skill?[[state.skill.name,state.skill.description,'Ваша версия 1 · в памяти']]:[])].map(([name,description,tag])=>`<article class="skill-card"><div class="skill-icon">${icon('spark')}</div><h3>${escapeHTML(name)}</h3><p>${escapeHTML(description)}</p><footer><span>${escapeHTML(tag)}</span><button data-skill="${escapeHTML(name)}">Открыть ↗</button></footer></article>`).join('')}</div><div class="skills-bottom">Навык задает порядок работы. Правовые источники и редакции он должен получать заново при каждом запуске.<br>В макете генерация и пробный запуск выполняются по готовому сценарию.</div></section>`;
}
function renderMain() {
  document.querySelector('.app').classList.toggle('history-open',state.view==='dialogues');
  main.innerHTML = state.view==='dialogues'?dialogues():state.view==='workspace'?workspace():state.view==='sources'?sources():skills();
  document.querySelectorAll('[data-view].rail-button,.dialogues-nav').forEach(el=>{
    const active=el.dataset.view===state.view;el.classList.toggle('active',active);
    if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');
  });
  document.querySelectorAll('.file-row').forEach(el=>el.classList.toggle('selected',state.view==='workspace'&&el.dataset.file===state.file));
  document.querySelector('#context-label').textContent = state.pdfContext?`${filenames[state.file]} + фрагмент ТЗ, стр. 1`:filenames[state.file];
  hydrateIcons();
}
function renderAgent() {
  if (window.legalLive) { window.legalLive.render(); return; }
  syncConversation();
  if(!activeConversation()?.seed){
    agentContent.innerHTML='<p class="agent-intro">Диалог по документу «'+escapeHTML(filenames[state.file])+'». Это автономный макет: ответы демонстрационные.</p>'+renderOfflineMessages();
    document.querySelectorAll('[data-agent-tab]').forEach(el=>el.classList.toggle('active',el.dataset.agentTab===state.agentTab));
    return;
  }
  document.querySelectorAll('[data-agent-tab]').forEach(el=>el.classList.toggle('active',el.dataset.agentTab===state.agentTab));
  const changed = Object.keys(state.edits).length > 0 || state.change !== 'pending' || state.messages.length > 0;
  if (changed) {
    agentContent.innerHTML = `<h2 class="review-title">${icon('shield')} Контекст изменился</h2><p class="review-summary">Вы изменили документ, решение по правке или задачу. Готовый демонстрационный ответ относится к исходному примеру.</p><div class="info-box">Текущий текст не анализируется: реальная модель не подключена. Предыдущие замечания не считаются проверкой новой версии.</div><p class="agent-footnote">Чтобы повторить исходный сценарий, сбросьте демонстрацию. Это удалит изменения только в памяти макета.</p><button class="run-review" data-action="reset">Сбросить демонстрацию</button>`;
    agentContent.insertAdjacentHTML('beforeend',renderOfflineMessages());
    return;
  }
  if (state.agentTab==='task') {
    agentContent.innerHTML = `<div class="task-context">${icon('folder')} Внедрение платформы · Заказчик</div><div class="user-message">Проверь приемку и ответственность. Покажи риски для нас и предложи правки с основаниями.</div><div class="run-heading">${icon('check')} Сценарий анализа подготовлен <span>ДЕМО</span></div><p class="agent-intro">В примере есть <strong>3 вопроса для проверки</strong>. Начнем с ответственности: предложение меняет баланс интересов сторон.</p><article class="suggestion"><div class="suggestion-head"><span class="issue-number">01</span> Ответственность · пункт 7.2</div><h3>Изменение базы и предела неустойки</h3><p>Предлагаемая правка снижает ответственность Исполнителя. Для Заказчика это переговорное решение, а не автоматически выгодное изменение.</p><div class="suggestion-footer"><button data-action="show-clause">Показать правку ↗</button><button data-action="evidence">Основание ↗</button></div></article><article class="suggestion"><div class="suggestion-head"><span class="issue-number">02</span> Приемка · пункт 4.2</div><h3>Разные сроки в договоре и ТЗ</h3><p>В договоре — 5 рабочих дней, в приложении — 10. Нужно согласовать единый порядок.</p><div class="suggestion-footer"><button data-file="pdf">Открыть приложение ↗</button></div></article><div class="review-note">${icon('alert')}<div>Юридическая проверка еще не выполнена. Все ответы здесь — демонстрационные.<button class="inline-action" data-action="review">Посмотреть работу второго агента</button></div></div><button class="run-review" data-action="run-review">${icon('shield')} Запустить демопроверку</button><p class="agent-footnote">Третий вопрос — согласовать предложенное ограничение ответственности с позицией компании.</p>`;
  } else {
    const done = state.review==='done';
    const running = state.review==='running';
    agentContent.innerHTML = `<h2 class="review-title">${icon('shield')} Второй агент</h2><p class="review-summary">${running?'Демонстрация проверки источников и связи с выводом…':done?'Демопроверка завершена. Обнаружено замечание к предложенной правке.':'Отдельная проверка фактов, источников и применимости. Реальная модель не подключена.'}</p><div class="review-step"><strong>01 / Существование источника</strong><p>Получить акт и точную цитату из правовой базы.</p><span class="status-tag neutral">Не проверено в макете</span><button class="evidence-link" data-action="evidence">Открыть карточку источника ↗</button></div><div class="review-step"><strong>02 / Связь нормы с выводом</strong><p>${done?'Указание на статью о неустойке не обосновывает конкретные 0,1% и 10%. Правку следует представить как предложение для переговоров.':'Проверить, подтверждает ли норма размер и предел неустойки, предложенные первым агентом.'}</p><span class="status-tag ${done?'warning':'neutral'}">${done?'Замечание · демонстрация':'Ожидает демозапуска'}</span></div><div class="review-step"><strong>03 / Согласованность документов</strong><p>Срок приемки в договоре: 5 дней. В ТЗ: 10 дней.</p><span class="status-tag warning">Расхождение в примере</span><button class="evidence-link" data-file="pdf">Техническое задание · стр. 1 ↗</button></div><button class="run-review" data-action="run-review" ${running?'disabled':''}>${icon('shield')} ${running?'Проверяем демосценарий…':done?'Повторить демопроверку':'Запустить демопроверку'}</button><p class="agent-footnote">Статус относится только к текущей версии макета. Изменение текста сбрасывает результат проверки.</p>`;
  }
  for (const message of state.messages) {
    const el=document.createElement('div'); el.className='new-message';
    const p=document.createElement('p'); p.textContent=`Вы: ${message}`; el.append(p);
    const answer=document.createElement('p'); answer.textContent='Демонстрационный ответ: для этой задачи потребуются обстоятельства клиента, применимые источники и проверка предлагаемого результата. Реального обращения к модели не было.'; el.append(answer); agentContent.append(el);
  }
}
function render(){renderMain();renderAgent();}
function invalidateReview(){clearTimeout(reviewTimer);state.review='idle';if(window.legalLive)window.legalLive.invalidate();}
function startReview(){
  if(window.legalLive){window.legalLive.review();return;}
  if(Object.keys(state.edits).length || state.change!=='pending' || state.messages.length){invalidateReview();state.agentTab='review';renderAgent();notify('Измененный текст не анализируется. Демосценарий относится к исходному примеру.');return;}
  state.agentTab='review';state.review='running';renderAgent();
  clearTimeout(reviewTimer);reviewTimer=setTimeout(()=>{state.review='done';renderAgent();notify('Демопроверяющий нашел неподтвержденное основание правки.');},900);
}
function settings(){
  if(window.legalLive){window.legalLive.settings();return;}
  showDialog('Модели и подключения',`<p class="dialog-description">У каждой роли может быть своя модель. Это экран настройки будущего продукта: подключения в макете не выполняются.</p><label class="form-field"><span>Провайдер основного агента</span><select id="provider">${['Yandex AI Studio','GigaChat / Cloud.ru','Свой совместимый API','Локальная модель'].map(p=>`<option ${state.provider===p?'selected':''}>${p}</option>`).join('')}</select></label><label class="form-field"><span>Модель</span><input id="model-name" value="${escapeHTML(state.model)}"></label><label class="form-field"><span>API endpoint</span><input id="endpoint" placeholder="https://api.example.com/v1" autocomplete="off"><small>Адрес показан как настройка. Запросы по нему не отправляются.</small></label><label class="form-field"><span>API-ключ</span><input disabled placeholder="Не вводите настоящие ключи в макет"><small>В приложении ключ будет храниться в защищенном хранилище Windows.</small></label><div class="info-box">Проверяющий: отдельный контекст. Смена провайдера не должна обходить настройки защиты данных.</div><div class="dialog-actions"><button class="secondary-btn" data-action="test-connection">Демопроверка подключения</button><button class="primary-btn" data-action="save-settings">Сохранить в макете</button></div>`);
}
function privacy(){showDialog('Что увидит агент',`<p class="dialog-description">Демонстрация локальной замены имен. Оригинальный текст и таблица соответствий должны оставаться в доверенном контуре.</p><div class="privacy-columns"><div class="privacy-card"><small>В ДОКУМЕНТЕ ЮРИСТА</small><p>Общество «Альта» заключает договор с обществом «Вектор Систем». Ответственное лицо — Анна Примерова.</p></div><div class="privacy-card"><small>В КОНТЕКСТЕ АГЕНТА</small><p><code>ORG_A</code> заключает договор с <code>ORG_B</code>. Ответственное лицо — <code>PERSON_1</code>.</p></div></div><div class="info-box">Это иллюстрация, не работающий анонимизатор. Все имена вымышлены. Суммы, сроки и другие юридически значимые факты требуют отдельной политики обработки.</div><div class="dialog-actions"><button class="primary-btn" data-action="close-dialog">Понятно</button></div>`);}
function createSkill(){state.skillDraft=null;state.skillTested=false;showDialog('Создать навык из инструкции',`<p class="dialog-description">Опишите повторяемую задачу. Макет соберет пример процедуры, которую можно проверить и сохранить на время сессии.</p><label class="form-field"><span>Название</span><input id="skill-name" value="Проверка приемки работ" maxlength="100"></label><label class="form-field"><span>Что должен делать навык?</span><textarea id="skill-instruction" maxlength="2000">Сравни сроки и условия приемки в договоре и приложениях. Покажи противоречия и вопросы для согласования.</textarea></label><div class="dialog-actions"><button class="primary-btn" data-action="generate-skill">Собрать демопроцедуру</button></div>`);}
function skillDraft(){
  const s=state.skillDraft;
  showDialog('Черновик навыка',`<p class="dialog-description"><strong>${escapeHTML(s.name)}</strong><br>${escapeHTML(s.description)}</p><ol class="skill-steps"><li>Уточнить роль клиента и результат задачи.</li><li>Собрать положения договора и приложений.</li><li>Найти расхождения и получить основания.</li><li>Передать выводы отдельному проверяющему.</li><li>Показать юристу правки и нерешенные вопросы.</li></ol><div class="info-box" id="skill-result">${state.skillTested?'Демозапуск: найдено расхождение 5 / 10 рабочих дней. Реальный агент не запускался.':'Разрешенные действия: чтение выбранных документов и поиск. Запись оригинала не разрешена.'}</div><div class="dialog-actions"><button class="secondary-btn" data-action="test-skill">Пробный демозапуск</button><button class="primary-btn" data-action="save-skill" ${state.skillTested?'':'disabled'}>Сохранить версию 1</button></div>`);
}
function search(){showDialog('Быстрый переход',`<label class="form-field"><span>Документ, источник или действие</span><input id="quick-search" placeholder="Начните вводить название…" autofocus></label><div class="search-results" id="quick-results">${quickResults('')}</div>`);document.querySelector('#quick-search').focus();}
function quickResults(query){return [['Договор внедрения.docx','Документы','file','contract'],['Техническое задание.pdf','Документы','file','pdf'],['Все диалоги','История работы с документами','view','dialogues'],['Правовая база','Источники и редакции','view','sources'],['Навыки','Повторяемые процедуры','view','skills'],['Настройки API','Модели и подключения','action','settings']].filter(r=>r[0].toLowerCase().includes(query.toLowerCase())).map(([name,description,key,value])=>`<button data-${key}="${value}" data-close="true">${escapeHTML(name)}<small>${description}</small></button>`).join('') || '<p class="dialog-description">В макете ничего не найдено.</p>';}
function exportMock(){
  const paper=main.querySelector('.paper');if(!paper)return;
  const copy=paper.cloneNode(true);
  copy.querySelectorAll('button,.clause-actions,.clause-marker,.paper-meta,.paper-footer').forEach(el=>el.remove());
  const selected=copy.querySelector('#selected-clause p');
  if(selected)selected.textContent=state.edits['7.2'] ?? (state.change==='accepted'?proposedClause:initialClause);
  const lines=[...copy.querySelectorAll('h1,h2,p,li,td,th,.place-date')].map(el=>el.textContent.trim());
  const text=`СИНТЕТИЧЕСКИЙ МАКЕТ — НЕ ЮРИДИЧЕСКИЙ ДОКУМЕНТ\n${filenames[state.file]}\n\n${lines.join('\n\n')}\n\nРеальная правовая проверка не выполнена.${state.file==='contract'&&state.change==='pending'?' Предложенная правка не применена.':''}\n`;
  const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='synthetic-prototype.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  notify('Экспортирован текст примера (.txt). Это не DOCX-экспорт.');
}
document.addEventListener('click',event=>{
  const button=event.target.closest('button,a.brand'); if(!button)return;
  if(button.dataset.close)dialog.close();
  if(button.matches('a.brand')){event.preventDefault();state.view='workspace';renderMain();}
  if(button.dataset.view){state.view=button.dataset.view;renderMain();}
  if(button.dataset.file)selectDocument(button.dataset.file);
  if(button.dataset.conversation)openConversation(button.dataset.conversation);
  if(button.dataset.agentTab){state.agentTab=button.dataset.agentTab;renderAgent();}
  if(button.dataset.page){state.pdfPage=Number(button.dataset.page);renderMain();}
  if(button.dataset.filter){state.sourceFilter=button.dataset.filter;renderMain();}
  if(button.dataset.skill){showDialog(button.dataset.skill,`<p class="dialog-description">Демонстрационная процедура. Выполняется на синтетическом договоре текущего дела.</p><ol class="skill-steps"><li>Уточнить обстоятельства и сторону клиента.</li><li>Получить документы и применимые источники.</li><li>Подготовить выводы с основаниями.</li><li>Проверить отдельным агентом.</li></ol><div class="dialog-actions"><button class="primary-btn" data-action="launch-skill">Запустить демосценарий</button></div>`);}
  switch(button.dataset.action){
    case 'settings':settings();break;
    case 'privacy':privacy();break;
    case 'close-dialog':dialog.close();break;
    case 'search':search();break;
    case 'folder':notify('В макете открыта синтетическая папка. Доступ к папкам Windows будет в приложении.');break;
    case 'toggle-files':{const list=document.querySelector('#file-list');list.hidden=!list.hidden;document.querySelector('#folder-chevron').textContent=list.hidden?'›':'⌄';break;}
    case 'toggle-redline':state.redline=!state.redline;renderMain();break;
    case 'accept':state.change='accepted';delete state.edits['7.2'];invalidateReview();render();status('Правка принята в макете · проверка сброшена');notify('Принято только в примере. Реальная юридическая проверка не выполнена.');break;
    case 'reject':state.change='rejected';delete state.edits['7.2'];invalidateReview();render();status('Предложение отклонено');break;
    case 'undo':if(state.file!=='contract'){notify('Отмена решения доступна в договоре.');break;}if(Object.hasOwn(state.edits,'7.2')){notify('После ручного изменения пункта отмена старого решения недоступна. Ваш текст сохранен.');break;}state.change='pending';invalidateReview();render();status('Решение по правке отменено');break;
    case 'show-clause':selectDocument('contract');document.querySelector('#selected-clause').scrollIntoView({behavior:'smooth',block:'center'});break;
    case 'source':case 'evidence':evidence();break;
    case 'review':state.agentTab='review';renderAgent();break;
    case 'run-review':startReview();break;
    case 'pdf-context':if(!canSwitchConversation())break;selectDocument('contract');state.pdfContext=true;invalidateReview();render();notify('Фрагмент ТЗ, страница 1, добавлен в диалог по договору. Проверка сброшена.');break;
    case 'context':notify('Документ отмечен как контекст примера. Передачи модели нет.');break;
    case 'new-task':newConversation();break;
    case 'create-skill':createSkill();break;
    case 'generate-skill':{const name=document.querySelector('#skill-name').value.trim(),description=document.querySelector('#skill-instruction').value.trim();if(!name||!description){notify('Укажите название и инструкцию.');break;}state.skillDraft={name,description};skillDraft();break;}
    case 'test-skill':state.skillTested=true;skillDraft();break;
    case 'save-skill':if(state.skillTested){state.skill={...state.skillDraft};dialog.close();state.view='skills';renderMain();notify('Версия 1 сохранена в памяти макета до перезагрузки.');}break;
    case 'launch-skill':dialog.close();selectDocument('contract');startReview();break;
    case 'save-settings':state.provider=document.querySelector('#provider').value;state.model=document.querySelector('#model-name').value.trim()||'Не задана';dialog.close();notify('Настройки сохранены только в памяти макета. Модель не подключена.');break;
    case 'test-connection':notify('Это демопроверка интерфейса. Сеть не используется, подключение не проверено.');break;
    case 'export':exportMock();break;
    case 'reset':clearTimeout(reviewTimer);location.reload();break;
  }
});
document.addEventListener('input',event=>{
  if(event.target.dataset.edit){state.edits[event.target.dataset.edit]=event.target.textContent;invalidateReview();status('Текст изменен в макете · требуется новая проверка');renderAgent();}
  if(event.target.id==='dialogue-search'){conversations.query=event.target.value;document.querySelector('#dialogue-list').innerHTML=dialogueRows();}
  if(event.target.id==='quick-search')document.querySelector('#quick-results').innerHTML=quickResults(event.target.value);
});
document.addEventListener('submit',event=>{
  if(event.target.id==='source-search'){event.preventDefault();document.querySelector('#source-results').innerHTML=sourceResults(new FormData(event.target).get('query'));}
  if(event.target.id==='chat-form'){event.preventDefault();const input=document.querySelector('#chat-input'),value=input.value.trim();if(!value)return;invalidateReview();state.messages.push(value);input.value='';syncConversation(true);renderAgent();agentContent.scrollTop=agentContent.scrollHeight;}
});
document.addEventListener('paste',event=>{
  const editable=event.target.closest('[contenteditable]');if(!editable)return;
  event.preventDefault();const text=event.clipboardData.getData('text/plain');
  const selection=getSelection();if(!selection.rangeCount)return;
  const range=selection.getRangeAt(0);if(!editable.contains(range.commonAncestorContainer))return;
  range.deleteContents();const node=document.createTextNode(text);range.insertNode(node);range.setStartAfter(node);range.collapse(true);selection.removeAllRanges();selection.addRange(range);
  editable.dispatchEvent(new Event('input',{bubbles:true}));
});
document.addEventListener('drop',event=>{if(event.target.closest('[contenteditable]')){event.preventDefault();notify('Вставка файлов и HTML в текст макета отключена.');}});
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();search();}});
dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
newConversation(true);
