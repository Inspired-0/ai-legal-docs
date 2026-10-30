# Карта документации

Новая сессия: [AGENTS.md](../AGENTS.md) → [CURRENT_STATE.md](CURRENT_STATE.md) →
требования и активный план задачи → нужные части кода и архитектуры.

## Концепция и реализация модулей

- [Общая концепция](specs/modular-legal-platform.md): самостоятельные MCP, плагин и IDE.
- [Правовой MCP](specs/legal-mcp.md): федеральный корпус, подбор регулирования,
  поиск ограничений, редакции, цитаты и обновления.
- [Юридический плагин](specs/legal-agent-plugin.md): самостоятельная работа с документами
  в Codex/Claude Code и необязательные правовые источники.
- [IDE](specs/legal-ide-shell.md): третий модуль, рабочее пространство и подключения.
- [Дорожная карта](plans/active/modular-platform-roadmap.md): этапы, зависимости и приёмка.
- [Интервью](investigations/modular-platform-interview.md): принятые решения и открытые вопросы.
- [ADR-0002](decisions/ADR-0002-independent-legal-modules.md): границы модулей и порядок выпуска.
- [ADR-0003](decisions/ADR-0003-compound-legal-search.md): составной поиск на сервере,
  оценка применимости у подключённого агента.

## Общие требования

- [Агентные процедуры и навыки](specs/agent-knowledge-skills.md): ответственность модулей,
  настройка процедур и отдельная проверка результата.
- [Правовые ссылки](specs/legal-citations.md): акт, редакция, пункт, доказательство и применимость.
- [Будущий защищённый режим](specs/local-pseudonymization.md): псевдонимизация и контроль
  каналов; не условие первого выпуска плагина.

## Исследования для модулей

- [Способы реализации](investigations/modular-legal-platform.md): MCP, стек, newsBot и упаковка плагина.
- [Каталог claude-for-legal](investigations/claude-for-legal-capabilities.md): 12 основных
  пакетов, 150 файлов навыков, 10 агентов, форматы и зависимости.
- [VPS и бесплатные источники](investigations/legal-mcp-vps.md): CPU/RAM/диск и план измерений.
- [Открытая правовая база](investigations/open-legal-sources.md): корпуса, редакции и условия использования.
- [Аудит pravo.gov.ru](investigations/pravo-portal-audit.md): HTTP API, экспорт и ограничения.
- [Источники newsBot](investigations/newsbot-sources.md): адаптеры, ЕБПИ и конвейер обновлений.
- [RAG-проба](investigations/shared-legal-rag-spike.md): фактический прогон и ограничения;
  [код](../prototypes/legal-rag/README.md), [план](plans/completed/shared-legal-rag-spike.md).
- [Конкуренты и движки документов](investigations/legal-ide-market.md): материалы для
  этапа IDE; возможности и условия поставщиков требуют проверки перед выбором.

## Существующий код и запуск

- [PROJECT.md](PROJECT.md): продуктовый контекст и границы исходного демо.
- [architecture.md](architecture.md): целевые модули и реализованные прототипы.
- [DOCX-демо](specs/synthetic-document-pipeline.md), [ограничения](limitations.md)
  и [работа с шаблоном](template-authoring.md).
- [IDE-прототип](../prototypes/legal-ide/README.md): экраны, сценарии и результаты проверок.
- [Запуск AI-прототипа](runbooks/live-ide.md): localhost, модель/API, preview и ограничения.
- [Разработка и проверки](runbooks/development.md): установка, команды и диагностика.
- [SECURITY.md](../SECURITY.md) и [PROVENANCE.md](../PROVENANCE.md): данные и происхождение материалов.

## Процесс и выполненные задачи

- [Работа агентов](runbooks/agent-workflow.md): постановка задачи, ревью и передача контекста.
- [Правила планов](plans/README.md) и [шаблон](plans/TEMPLATE.md).
- [Шаблон спецификации](specs/TEMPLATE.md), [ADR](decisions/README.md) и [шаблон ADR](decisions/TEMPLATE.md).
- [Организация контекста](decisions/ADR-0001-repository-context.md).
- [Переход к модульной концепции](plans/completed/modular-platform-discovery.md): исследование и интервью.
- [Очистка документации](plans/completed/documentation-cleanup.md): удаление отменённых требований и ссылок.
- [Составной поиск MCP](plans/completed/compound-legal-search.md): уточнение сценариев,
  границы с рассуждением агента и приёмка.
- [Обновление интерфейса](plans/completed/minimal-ui-dialogues.md): выполненная работа над прототипом.

Добавляй сюда новые устойчивые документы; результаты проверок и следующий шаг
держи в CURRENT_STATE. Завершённые планы хранят историю выполненной работы,
но не заменяют действующие требования и дорожную карту.
