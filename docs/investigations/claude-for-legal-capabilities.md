# Возможности claude-for-legal и объём нашего плагина

Дата: 2026-10-30. Основание: INT-09…INT-11 [интервью](modular-platform-interview.md).
Владелец подтвердил самостоятельность плагина, создание/проверку договоров с DOCX
и весь набор возможностей claude-for-legal. Платные правовые источники исключены.

## Проверенная версия и границы исследования

Изучена версия [`4a6c651889c97cc9140580363c73e0eb17379c2b`](https://github.com/anthropics/claude-for-legal/tree/4a6c651889c97cc9140580363c73e0eb17379c2b).
Проверены полное дерево, README всех 12 основных пакетов, их MCP-манифесты и выбранные
навыки/агенты: договорная проверка, табличный анализ, начало исследования и мониторинг.
Отдельно прочитан внешний CoCounsel Deep Research. Запуска и установки не было;
по наличию файла нельзя заключать, что процедура работает в обоих наших хостах.

В дереве 150 файлов `SKILL.md` основных пакетов, 10 файлов агентов и 5 managed-agent
cookbooks. Счётчик включает общие интервью, настройку и вспомогательные процедуры;
это не 150 разных юридических продуктов. Дополнительно есть один внешний пакет
CoCounsel с навыком `deep-research`. Полный список основных навыков приведён ниже,
чтобы при адаптации не потерять функции, отсутствующие в кратком README.

Лицензия основных материалов:
[Apache-2.0](https://github.com/anthropics/claude-for-legal/blob/4a6c651889c97cc9140580363c73e0eb17379c2b/LICENSE).
При переносе фиксируются исходные файлы, версия, уведомления и изменения в PROVENANCE.
В этой задаче код и инструкции upstream в пакет не переносились.

## Что означает полный охват

Целевая поставка включает все семейства процедур в таблице. Договоры с DOCX идут первыми,
остальные семейства выпускаются по этапам M2 дорожной карты. Окончание договорного
пилота не означает готовность всего плагина.

Переносится пользовательская функция: собрать материалы, выполнить проверку,
подготовить документ, вести реестр или наблюдать изменения. Для права РФ нужны
собственные критерии и источники. Нельзя просто перевести американские сроки,
FRE 408, subpoena, DMCA, FMLA или классы EU AI Act и объявить их российским правом.
Для иностранной процедуры без прямого российского аналога нужно явно описать
применимую юрисдикцию либо спроектировать соответствующий российский процесс.

| Семейство | Навыки / агенты | Возможности для переноса | Зависимости и приёмка |
| --- | --- | --- | --- |
| Договоры | 12 / 3 | NDA, договоры поставщиков и SaaS, стандарты переговоров, история поправок, продления, эскалация, краткий отчёт бизнесу | Локальные договоры и стандарты достаточны для базового сценария; DOCX с замечаниями и правками требует собственного инструмента |
| Корпоративная работа | 13 / 1 | Анализ массива документов, таблица проверки, существенные договоры, протоколы и решения, закрытие сделки, учёт компаний и интеграция | Локальная папка заменяет обязательную виртуальную комнату данных; нужны XLSX/CSV, ссылки на ячейки и источники |
| Трудовые вопросы | 20 / 1 | Приём и увольнение, статус исполнителя, отпуска, локальные акты, расследования, оплата труда, выход в другие юрисдикции | Профили и расчёты для РФ; иностранные правила применяются только при явно выбранной юрисдикции |
| Персональные данные | 9 / 0 | Соглашения об обработке, обращения субъектов, оценка обработки, расхождения с политиками | Данные о процессах организации; российские требования проверяются отдельно от GDPR-профиля |
| Продукт и реклама | 7 / 1 | Проверка запуска, отдельных функций и рекламных утверждений, краткая оценка вопроса | Документы продукта и локальный реестр запусков; корпоративный task tracker необязателен |
| Регуляторные изменения | 9 / 1 | Проверка лент, сравнение с политиками, реестр пробелов, проекты правок, обсуждение проектов актов | Бесплатные источники, загруженные изменения или необязательный MCP; поправка к политике остаётся предложением |
| Использование ИИ | 10 / 0 | Реестр систем, оценка применения и последствий, проверка поставщика, политики и расхождения | Профиль организации и выбранная юрисдикция; категории EU AI Act не переносятся на РФ автоматически |
| Интеллектуальные права | 12 / 1 | Товарные знаки, претензии, нарушения, предварительный патентный анализ, OSS, договорные условия, портфель и сроки | Бесплатные реестры и материалы пользователя; доступность поиска патентов/знаков требует отдельного адаптера и проверки |
| Споры | 19 / 1 | Дела и портфель, претензии, процессуальные проекты, хронология, доказательства, подготовка к опросу, сохранение материалов, статусы консультантов | Судебные источники выходят за первый федеральный корпус MCP; сначала документы пользователя, затем отдельная проверка бесплатных каналов |
| Юридическая клиника | 16 / 0 | Приём, проекты и формы, письма, сроки, план исследования, передача дела и очередь проверки руководителем | Настраиваемые процедуры и роль руководителя; план исследования не выдаёт неподтверждённые ссылки за найденные нормы |
| Обучение | 13 / 0 | Разбор материалов, вопросы, карточки, структура анализа, письменная практика, план занятий | Учебные материалы и российские программы; режим обратной связи сохраняется отдельно от подготовки рабочих документов |
| Управление навыками | 10 / 1 | Поиск, установка, обновление, проверка, отключение и удаление пользовательских навыков | Хостовые адаптеры, происхождение версий и сохранность дел; наличие записи в каталоге не подтверждает доверие к навыку |

## Исследовательский агент

В основных 12 пакетах отдельного универсального исследователя права в каталоге
`agents/` не найдено. Есть
[`research-start`](https://github.com/anthropics/claude-for-legal/blob/4a6c651889c97cc9140580363c73e0eb17379c2b/legal-clinic/skills/research-start/SKILL.md):
он формулирует вопрос, предлагает направления и поисковые запросы, работает с
предоставленными материалами. Эта процедура входит в адаптацию плагина и не требует
самостоятельного серверного агента.

Внешний
[CoCounsel Deep Research](https://github.com/anthropics/claude-for-legal/blob/4a6c651889c97cc9140580363c73e0eb17379c2b/external_plugins/cocounsel-legal/README.md)
запускает исследование через сервис Thomson Reuters. Его
[инструкция](https://github.com/anthropics/claude-for-legal/blob/4a6c651889c97cc9140580363c73e0eb17379c2b/external_plugins/cocounsel-legal/skills/deep-research/SKILL.md)
требует подписку CoCounsel Legal и подключённый MCP; заявленная область включает право
США и исключает иностранное право. Это не готовый исследовательский движок для нашего
сервера. Интеграция исключена ограничением на платные источники; бесплатная равноценная
замена пока не установлена. Собственный автономный исследователь отложен.

Отдельный проверяющий уже подготовленного результата из наших прежних требований
сохраняется. Он проверяет утверждения и версию документа; это другая роль, которая
не требует добавлять универсального исследователя внутрь MCP.

## DOCX и другие файлы

[`vendor-agreement-review`](https://github.com/anthropics/claude-for-legal/blob/4a6c651889c97cc9140580363c73e0eb17379c2b/commercial-legal/skills/vendor-agreement-review/SKILL.md)
предусматривает DOCX с tracked changes и комментариями через внешний для этого
навыка `docx skill`. Сам текст юридического навыка не поставляет движок редактирования.
Наш плагин должен явно включить или объявить проверенную доступную зависимость,
одинаково работающую в Codex и Claude Code.

Первый документный этап охватывает создание договора по обстоятельствам, чтение и
проверку существующего DOCX, отчёт с адресами замечаний, новый файл с предложенными
исправлениями. Для полного договорного сценария нужны tracked changes и комментарии:
проверяем вставку, удаление, принятие/отклонение изменений, таблицы, нумерацию,
колонтитулы и сноски на заявленном наборе файлов. Неподдержанный объект явно отмечается;
его нельзя незаметно потерять при сохранении.

[`tabular-review`](https://github.com/anthropics/claude-for-legal/blob/4a6c651889c97cc9140580363c73e0eb17379c2b/corporate-legal/skills/tabular-review/SKILL.md)
также предусматривает XLSX, CSV и таблицу происхождения данных. Значит, DOCX не является
единственным итоговым форматом всего плагина. Импорт PDF и таблиц, выгрузки реестров и
сохранение ссылок входят в этап соответствующего семейства.

## Интеграции и самостоятельность

В MCP-манифестах upstream встречаются Ironclad, DocuSign, iManage, Definely, TopCounsel,
Box, Solve Intelligence, CourtListener, Descrybe, Courtroom5, Everlaw, Aurora, Trellis,
Lawve AI, Slack, Google Drive, Linear, Atlassian и Asana. Манифесты задают подключения;
они не предоставляют аккаунт, лицензию, доступ к данным или подтверждённую работу.

Для нашей поставки:

- Наш MCP необязателен во всех семействах. Работа с документами и реестрами выполняется
  локально; для внешней актуальности нужен доступный бесплатный источник.
- Платные юридические базы и платный поиск не входят в зависимости. При отсутствии
  бесплатного канала функция показывает ограничение; нельзя объявлять поиск выполненным
  по модельной памяти.
- Сторонние хранилища, электронная подпись и коммуникации отделены от юридической
  процедуры. Пакет может подготовить файл или проект сообщения без этих интеграций.
  Реальная отправка, подписание и синхронизация требуют отдельной интеграции и прав.
- Отсутствие обязательного коннектора конкретной функции фиксируется в её статусе.
  Проект письма не засчитывается как отправка, ручная выгрузка как работающий мониторинг,
  локальный анализ как выполненный внешний патентный поиск.
- Автоматический запуск watcher требует работающего планировщика и runtime хоста.
  Markdown с расписанием не подтверждает выполнение при закрытом приложении.
  Сначала проверяется ручной запуск, затем расписание, восстановление после пропуска
  и выбранный способ выдачи результата. Установка плагина не запускает рассылки сама.

Пять [managed-agent cookbooks](https://github.com/anthropics/claude-for-legal/tree/4a6c651889c97cc9140580363c73e0eb17379c2b/managed-agent-cookbooks)
описывают diligence-grid, docket-watcher, launch-radar, reg-monitor и renewal-watcher.
Они служат примерами исполнения уже перечисленных функций. Managed Agents API
Anthropic не становится обязательной зависимостью нашего переносимого плагина.

## Реестр файлов для адаптации

Все позиции ниже пока имеют статус «исследовано по составу, не перенесено, не испытано».
При реализации для каждой позиции фиксируются наш навык или эквивалентная процедура,
версия, правовой профиль, зависимости и результаты в двух хостах. Общие интервью
можно объединять, сохраняя соответствие исходным функциям.

### Договоры: commercial-legal

[Исходный пакет](https://github.com/anthropics/claude-for-legal/tree/4a6c651889c97cc9140580363c73e0eb17379c2b/commercial-legal).
Навыки (12): `amendment-history`, `cold-start-interview`, `customize`, `escalation-flagger`, `matter-workspace`, `nda-review`, `renewal-tracker`, `review-proposals`, `review`, `saas-msa-review`, `stakeholder-summary`, `vendor-agreement-review`.

Агенты (3): `deal-debrief`, `playbook-monitor`, `renewal-watcher`.

### Корпоративная работа и сделки: corporate-legal

[Исходный пакет](https://github.com/anthropics/claude-for-legal/tree/4a6c651889c97cc9140580363c73e0eb17379c2b/corporate-legal).
Навыки (13): `ai-tool-handoff`, `board-minutes`, `closing-checklist`, `cold-start-interview`, `customize`, `deal-team-summary`, `diligence-issue-extraction`, `entity-compliance`, `integration-management`, `material-contract-schedule`, `matter-workspace`, `tabular-review`, `written-consent`.

Агенты (1): `dataroom-watcher`.

### Трудовые вопросы: employment-legal

[Исходный пакет](https://github.com/anthropics/claude-for-legal/tree/4a6c651889c97cc9140580363c73e0eb17379c2b/employment-legal).
Навыки (20): `cold-start-interview`, `customize`, `expansion-kickoff`, `expansion-update`, `handbook-updates`, `hiring-review`, `internal-investigation`, `international-expansion`, `investigation-add`, `investigation-memo`, `investigation-open`, `investigation-query`, `investigation-summary`, `leave-tracker`, `log-leave`, `matter-workspace`, `policy-drafting`, `termination-review`, `wage-hour-qa`, `worker-classification`.

Агенты (1): `leave-tracker`.

### Персональные данные: privacy-legal

[Исходный пакет](https://github.com/anthropics/claude-for-legal/tree/4a6c651889c97cc9140580363c73e0eb17379c2b/privacy-legal).
Навыки (9): `cold-start-interview`, `customize`, `dpa-review`, `dsar-response`, `matter-workspace`, `pia-generation`, `policy-monitor`, `reg-gap-analysis`, `use-case-triage`.

### Продукт и реклама: product-legal

[Исходный пакет](https://github.com/anthropics/claude-for-legal/tree/4a6c651889c97cc9140580363c73e0eb17379c2b/product-legal).
Навыки (7): `cold-start-interview`, `customize`, `feature-risk-assessment`, `is-this-a-problem`, `launch-review`, `marketing-claims-review`, `matter-workspace`.

Агенты (1): `launch-watcher`.

### Регуляторные изменения: regulatory-legal

[Исходный пакет](https://github.com/anthropics/claude-for-legal/tree/4a6c651889c97cc9140580363c73e0eb17379c2b/regulatory-legal).
Навыки (9): `cold-start-interview`, `comments`, `customize`, `gap-surfacer`, `gaps`, `matter-workspace`, `policy-diff`, `policy-redraft`, `reg-feed-watcher`.

Агенты (1): `reg-change-monitor`.

### Использование ИИ: ai-governance-legal

[Исходный пакет](https://github.com/anthropics/claude-for-legal/tree/4a6c651889c97cc9140580363c73e0eb17379c2b/ai-governance-legal).
Навыки (10): `ai-inventory`, `aia-generation`, `cold-start-interview`, `customize`, `matter-workspace`, `policy-monitor`, `policy-starter`, `reg-gap-analysis`, `use-case-triage`, `vendor-ai-review`.

### Интеллектуальные права: ip-legal

[Исходный пакет](https://github.com/anthropics/claude-for-legal/tree/4a6c651889c97cc9140580363c73e0eb17379c2b/ip-legal).
Навыки (12): `cease-desist`, `clearance`, `cold-start-interview`, `customize`, `fto-triage`, `infringement-triage`, `invention-intake`, `ip-clause-review`, `matter-workspace`, `oss-review`, `portfolio`, `takedown`.

Агенты (1): `ip-renewal-watcher`.

### Споры: litigation-legal

[Исходный пакет](https://github.com/anthropics/claude-for-legal/tree/4a6c651889c97cc9140580363c73e0eb17379c2b/litigation-legal).
Навыки (19): `brief-section-drafter`, `chronology`, `claim-chart`, `cold-start-interview`, `customize`, `demand-draft`, `demand-intake`, `demand-received`, `deposition-prep`, `legal-hold`, `matter-briefing`, `matter-close`, `matter-intake`, `matter-update`, `matter-workspace`, `oc-status`, `portfolio-status`, `privilege-log-review`, `subpoena-triage`.

Агенты (1): `docket-watcher`.

### Юридическая клиника: legal-clinic

[Исходный пакет](https://github.com/anthropics/claude-for-legal/tree/4a6c651889c97cc9140580363c73e0eb17379c2b/legal-clinic).
Навыки (16): `build-guide`, `client-comms-log`, `client-intake`, `client-letter`, `cold-start-interview`, `customize`, `deadlines`, `draft`, `form-generation`, `memo`, `plain-language-letters`, `ramp`, `research-start`, `semester-handoff`, `status`, `supervisor-review-queue`.

### Обучение: law-student

[Исходный пакет](https://github.com/anthropics/claude-for-legal/tree/4a6c651889c97cc9140580363c73e0eb17379c2b/law-student).
Навыки (13): `bar-prep-questions`, `case-brief`, `cold-call-prep`, `cold-start-interview`, `customize`, `exam-forecast`, `flashcards`, `irac-practice`, `legal-writing`, `outline-builder`, `session`, `socratic-drill`, `study-plan`.

### Управление навыками: legal-builder-hub

[Исходный пакет](https://github.com/anthropics/claude-for-legal/tree/4a6c651889c97cc9140580363c73e0eb17379c2b/legal-builder-hub).
Навыки (10): `auto-updater`, `cold-start-interview`, `customize`, `disable`, `registry-browser`, `related-skills-surfacer`, `skill-installer`, `skill-manager`, `skills-qa`, `uninstall`.

Агенты (1): `registry-sync`.

## Приёмка полного набора

Для каждого семейства нужны сценарии на синтетических материалах в обоих хостах,
проверка с отключённым нашим MCP и явные результаты внешних операций. Юристы позже
проверяют российские критерии и результаты на отдельной выборке. Технически работающая
процедура до такой проверки не получает отметку юридически проверенной.

Состояния реализации: запланировано, технически испытано, юридически проверено,
зависит от внешнего адаптера, исключено ограничением на платные источники.
Последние два состояния не засчитываются как реализованная функция. Расписание
разработки: [дорожная карта](../plans/active/modular-platform-roadmap.md).
Требования к поставке: [спецификация плагина](../specs/legal-agent-plugin.md).

