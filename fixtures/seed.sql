-- Local sample fixtures for `wrangler dev --local` and tests ONLY.
-- Generated from the public read-only API. Do NOT apply to remote D1.
-- Base schema (created here for a fresh local DB; IF NOT EXISTS keeps it additive).
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, name TEXT, program TEXT, priority TEXT, category TEXT,
  status TEXT, deadline TEXT, deadline_date TEXT, budget TEXT, eligible TEXT,
  link TEXT, notes TEXT, is_new INTEGER DEFAULT 0, first_seen TEXT,
  last_updated TEXT, year TEXT
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY, project_id TEXT, title TEXT, doc_type TEXT,
  content TEXT, source_url TEXT
);
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY, run_date TEXT, summary TEXT, created_at TEXT
);
DELETE FROM documents; DELETE FROM projects; DELETE FROM snapshots;
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('np-start-na-karierata', 'Национална програма „Старт на кариерата"', 'Агенция по заетостта', 'Младежка заетост (национална)', 'youth', 'open', 'Ежегоден прием', '2026-12-31', 'Държавен бюджет', 'Младежи до 29 г. с висше образование; работодатели в публичния сектор', 'https://www.az.government.bg/pages/programa-start-na-karierata/', 'Първа работа по специалността за млади висшисти.', 0, '2026-07-07', '2026-07-09', '2024');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('az-myarka-stazhuvane-mladezhi', 'Мярка „Стажуване на младежи"', 'Агенция по заетостта / ПРЧР', 'Младежка заетост', 'youth', 'open', 'Текуща мярка', '2026-12-31', 'По ПРЧР / държавен бюджет', 'Работодатели, наемащи младежи за стаж', 'https://www.az.government.bg/pages/myarka-stazhuvane-na-mladezhi/', 'Насърчаване на работодатели да разкриват стажантски позиции за младежи.', 0, '2026-07-07', '2026-07-09', '2024');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('az-myarka-naemane-mladezhi-29', 'Мярка „Наемане на безработни младежи до 29 г."', 'Агенция по заетостта / ПРЧР', 'Младежка заетост', 'youth', 'open', 'Текуща мярка', '2026-12-31', 'По ПРЧР / държавен бюджет', 'Работодатели', 'https://www.az.government.bg/pages/myarka-naemane-na-bezrabotni-mladezhi-do-29-godishna-vazrast/', 'Субсидирана заетост за младежи до 29 г. без работа.', 0, '2026-07-07', '2026-07-09', '2024');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('nspark-msp-severna', 'N-Spark – подкрепа за МСП от Северна България (ИАНМСП + Световна банка)', 'ИАНМСП', 'Подкрепа за МСП', 'other', 'closed', 'Срок 20.05.2026 (изтекъл)', '2026-05-20', 'Експертна подкрепа (не грант)', 'Микро, малки и средни предприятия от 14 области в Северна България', 'https://eufunds.media/2026/04/30/prakticheski-nasoki-i-podkrepa-za-msp-ot-severna-balgariya-po-programa-n-spark/', 'Срокът за подаване на документи е изтекъл (20.05.2026).', 0, '2026-07-07', '2026-07-07', '2026');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('npvu-tehnologichna-modernizacia', '„Технологична модернизация" (НПВУ)', 'НПВУ / ПВУ', 'Инвестиция за МСП', 'other', 'closed', 'Приключена', '2023-12-31', 'Общ бюджет 260 000 000 лв', 'Микро, малки и средни предприятия', 'https://www.mig.government.bg/naczionalen-plan-za-vazstanovyavane-i-ustojchivost/tehnologichna-modernizacziya/', 'Повишаване на ефективността на производствените процеси и производителността на МСП.', 0, '2026-07-07', '2026-07-07', '2023');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('npvu-vei-sobstveno-potreblenie', '„Нови ВЕИ за собствено потребление + локално съхранение в предприятията" (НПВУ)', 'НПВУ / ПВУ', 'RePowerEU', 'other', 'closed', 'Приключена', '2024-12-31', '249 проекта на обща стойност ~526 млн лв', 'Предприятия', 'https://www.mig.government.bg/naczionalen-plan-za-vazstanovyavane-i-ustojchivost/podkrepa-za-investiczii-za-kombinirane-na-vazobnovyaemi-iztochniczi-za-elektricheska-energiya-sas-saorazheniya-za-lokalno-sahranenie/', 'Производство на електроенергия от ВЕИ за собствено потребление със съоръжения за съхранение.', 0, '2026-07-07', '2026-07-07', '2024');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('vishi-uchilishta-modernizacia-2', 'BG05SFPR001-3.006 „Модернизация на висшите училища 2.0"', 'Образование 2021-2027', 'Приоритет 3 „Връзка на образованието с пазара на труда"', 'other', 'closed', '03.06.2026 г., 17:30 ч. (отворена 22.10.2025 г.)', '2026-06-03', '200 млн. лв. (ЕСФ+ и национален бюджет); 2,5–5 млн. лв. на проект', '16 конкретни висши училища като водещи партньори (напр. СУ, ТУ-София, МУ-София, МУ-Пловдив и др.), задължително партньорство с още 1 акредитирано ВУ', 'https://sf.mon.bg/?go=news&newsId=1562&p=detail', 'Директно предоставяне на БФП. Без собствено съфинансиране. Продължителност на проектите до 48 м., не по-късно от 31.12.2029 г.', 0, '2026-07-08', '2026-07-09', '2026');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('obr-ucenici-talanti-2', 'BG05SFPR001-2.005 „Подкрепа за ученици с таланти-2"', 'Образование 2021-2027', 'Приоритет 2', 'other', 'closing_soon', '21.07.2026 г., 17:30 ч.', '2026-07-21', '17 млн евро', 'Училища, образователни институции', 'https://www.eufunds.bg/bg/opseig/node/20622', 'На 10.07.2026 г. е изменена документацията (Условия за кандидатстване, секция 11.2 и Приложение I – Декларация) заради новия Закон за противодействие на корупцията. Останалите условия без промяна. БФП 51 130–383 470 евро, без собствено финансиране, до 36 месеца.', 1, '2026-07-07', '2026-07-11', '2026');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('obr-dostap-vomr-1009', 'BG05SFPR001-1.009 „Създаване на условия за достъп до образование (ВОМР)"', 'Образование 2021-2027', 'Приоритет 1', 'other', 'open', 'удължен: 3 приема — до 15.07.2026 (I), 16.07.-09.11.2026 (II), 10.11.2026-10.03.2027 (III)', '2027-03-10', '9 760 561,90 € (ЕСФ+ и национален бюджет)', 'Общини, училища, МИГ', 'https://sf.mon.bg/?go=news&newsId=1621&p=detail', 'Първи прием удължен с 1 седмица до 15.07.2026 (промяна във връзка със Закона за противодействие на корупцията — актуализирана Декларация на кандидата). Бюджет 9,7 млн. евро, БФП между 25 565 и 178 952 евро, без изискване за собствено финансиране.', 0, '2026-07-07', '2026-07-09', '2026');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('os-natura-mярка68-2', 'BG16FFPR002-3.031 „Прилагане на мярка 68 от НРПД за NATURA 2000 – Част II"', 'Околна среда 2021-2027', 'Приоритет 3', 'other', 'open', 'Отворена (от 01.07.2026)', '2026-10-31', '852 960 евро', 'Държавни институции, общини, НПО', 'https://www.eufunds.bg/bg/opos/term/1380', 'Нова отворена процедура от 01.07.2026.', 0, '2026-07-07', '2026-07-07', '2026');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('natura-2000-merki-54-55-56', 'BG16FFPR002-3.028 „Изпълнение на мерки 54, 55 и 56 от НРПД за Натура 2000 – 2"', 'Околна среда 2021-2027', 'Приоритет 4 „Риск и изменение на климата" / опазване на природата', 'other', 'upcoming', 'Обществено обсъждане до 13.07.2026 г.; заложена дата на обявяване на приема: 30.09.2026 г.', '2026-09-30', '2,08 млн. евро (ЕФРР + национален бюджет)', 'Структури на МОСВ и МЗХ, общини, областни администрации, ЮЛНЦ (самостоятелно или в партньорство)', 'https://eufunds.media/2026/07/06/za-obshtestveno-obsazhdane-2-mln-evro-za-podobryavane-na-sastoyanieno-na-krajbrezhni-skalni-i-dyunni-tipove-prirodni-mestoobitaniya/', 'Мерки: 54 (премахване на нетипична растителност), 55 (инвазивни чужди видове), 56 (съоръжения за обществен достъп). Без собствено съфинансиране.', 0, '2026-07-08', '2026-07-09', '2026');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('pkip-vnedryavane-inovacii-1003', 'BG16RFPR001-1.003 „Внедряване на иновации в предприятията"', 'ПКИП 2021-2027', 'Приоритет 1 „Иновации и растеж"', 'other', 'closed', 'Краен срок 31.01.2024', '2024-01-31', 'Увеличен бюджет (финансиране на всички 50 проекта от резервните списъци)', 'МСП и големи предприятия', 'https://www.mig.government.bg/programa-konkurentosposobnost-i-inovaczii-v-predpriyatiyata/novini-proczeduri-pkip/bg16rfpr001-1-003-vnedryavane-na-inovaczii-v-predpriyatiyata/', 'Приключена процедура за внедряване на иновации; бюджетът е увеличен допълнително.', 0, '2026-07-07', '2026-07-07', '2024');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('pkip-razrabotvane-inovacii-1001', 'BG16RFPR001-1.001 „Разработване на иновации в предприятията"', 'ПКИП 2021-2027', 'Приоритет 1 „Иновации и растеж"', 'other', 'closed', 'Краен срок 15.05.2024', '2024-05-15', '514 подадени предложения на обща стойност 257 555 411,33 лв', 'МСП и големи предприятия, научни организации', 'https://www.mig.government.bg/programa-konkurentosposobnost-i-inovaczii-v-predpriyatiyata/novini-proczeduri-pkip/razrabotvane-na-inovaczii-v-predpriyatiyata/', 'Приключен прием; голям интерес — 514 проектни предложения.', 0, '2026-07-07', '2026-07-07', '2024');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('pkip-en-efektivnost-vei-2004', 'BG16RFPR001-2.004 „Енергийна ефективност и използване на енергия от ВЕИ в предприятията"', 'ПКИП 2021-2027', 'Приоритет 2 „Кръгова икономика"', 'other', 'closed', 'Приключен прием', '2024-12-31', 'Над 105,2 млн € за 2 395 одобрени проекта', 'МСП и големи предприятия', 'https://www.mig.government.bg/programa-konkurentosposobnost-i-inovaczii-v-predpriyatiyata/novini-proczeduri-pkip/en-efektivnost-i-izpolzvane-na-energiya-ot-vaz-iztoch-v-predpriyatiyata/', 'Огромен интерес: 2 395 одобрени проекта за енергийна ефективност и ВЕИ.', 0, '2026-07-07', '2026-07-07', '2024');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('pkip-industria-4-0-1008', 'BG16RFPR001-1.008 „Въвеждане на технологии от Индустрия 4.0 в предприятията"', 'ПКИП 2021-2027', 'Приоритет 1: Иновации и растеж', 'other', 'closed', 'Прием приключен; резултати обявени 02.06.2026', '2026-06-02', '54 185 762,78 евро (105 978 140,42 лв.) общ бюджет на процедурата', 'Малки и средни предприятия (МСП)', 'https://www.mig.government.bg/programa-konkurentosposobnost-i-inovaczii-v-predpriyatiyata/novini-proczeduri-pkip/vavezhdane-na-tehnologii-ot-oblastta-na-industriya-4-0-v-predpriyatiyata/', '742 МСП кандидатствали, 226 одобрени с над 52,3 млн. евро (102,3 млн. лв.) БФП за AI, IoT, дигитални близнаци, роботика, 3D печат и др. Обмисля се увеличение на бюджета заради резервните списъци.', 0, '2026-07-10', '2026-07-10', '2026');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('pkip-novi-modeli-proizvodstvo-1010', 'BG16RFPR001-1.010 „Нови модели в производството от страна на МСП"', 'ПКИП 2021-2027', 'Приоритет 1: Иновации и растеж (RSO1.1)', 'other', 'closed', 'Изтекъл (удължен до 05.06.2026, 16:30ч.)', '2026-06-05', '96 311 217,23 евро (188 368 368 лв.), от които ~46 млн. евро за Северна България', 'Микро, малки и средни предприятия (МСП)', 'https://www.mig.government.bg/programa-konkurentosposobnost-i-inovaczii-v-predpriyatiyata/novini-proczeduri-pkip/bg16rfpr001-1-010-novi-modeli-v-proizvodstvoto-ot-strana-na-msp/', 'Подкрепа за нови модели (нови/подобрени процеси, стоки, услуги). Мин. БФП 25 000 евро, макс. 250 000 евро (микро/малки) / 400 000 евро (средни). Интензитет до 70%. Прием 05.02–05.06.2026.', 0, '2026-07-10', '2026-07-10', '2026');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('pkip-inovacii-msp-mig-1011', 'BG16RFPR001-1.011 „Внедряване на иновации в МСП на територията на МИГ"', 'ПКИП 2021-2027', 'Приоритет 1 „Иновации и растеж" и Приоритет 2 „Кръгова икономика"', 'new', 'open', 'Първи прозорец: 14.09.2026 г., 16:30 ч.; втори: 14.01–15.03.2027 г.', '2026-09-14', '19,9 млн. евро (10,5 млн. П1 + 9,4 млн. П2)', 'Микро-, малки и средни предприятия от 51 МИГ с одобрено допълващо финансиране по ПКИП; регистрирани до 31.12.2023 г.; мин. приходи 50 000 лв. (микро/малки) / 200 000 лв. (средни)', 'https://eumis2020.government.bg/bg/s/Procedure/Info/06021f2c-6c40-457d-846a-71dcd7b01b83', 'Отворена на 10.07.2026 г. БФП 15 000–102 500 евро, до 75% интензитет, режим de minimis. Внедряване на продуктова/процесова иновация по ИСИС. Изпълнение до 12 месеца.', 1, '2026-07-11', '2026-07-11', '2026');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('pkip-zeleni-tehnologii-msp-2003', 'Въвеждане на зелени технологии в МСП (BG16RFPR001-2.003)', 'ПКИП 2021-2027', 'Приоритет 2 „Кръгова икономика“, СЦ RSO2.6', 'new', 'upcoming', 'Очаква се обявяване на прием през 2026 г. (обществено обсъждане приключи на 23.04.2026)', NULL, '82 995 277 евро общо; БФП 77 000 – 410 000 евро на проект, до 70% интензитет', 'Микро, малки и средни предприятия – търговци по ТЗ/ЗК (или еквивалент от ЕИП), регистрирани не по-късно от 31.12.2023 г., с минимални средногодишни нетни приходи от продажби за 2023–2025 г. според категорията', 'https://www.mig.government.bg/programa-konkurentosposobnost-i-inovaczii-v-predpriyatiyata/novini-proczeduri-pkip/vavezhdane-na-zeleni-technologii-v-msp/', 'Кръгови модели за производство и потребление; задължителна Дейност 1 (зелени технологии) + незадължителна Дейност 2 (екологични стандарти, вкл. Екомаркировка на ЕС, de minimis). Прилага се и подход ИТИ. Изцяло електронно кандидатстване през ИСУН.', 1, '2026-07-12', '2026-07-12', '2026');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('pkip-igrp-2026', 'ПКИП – процедури по ИГРП 2026', 'ПКИП 2021-2027', 'Иновации / конкурентоспособност', 'other', 'upcoming', '2026 (по ИГРП)', '2026-12-31', 'Общ бюджет програма 1.223 млрд. евро', 'МСП и големи предприятия', 'https://pkip.egov.bg/', 'ИГРП 2026 съгласувана; предстоят конкретни процедури за иновации и енергийна ефективност.', 0, '2026-07-07', '2026-07-07', '2026');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('pniidit-modernizirane-izsledovatelska-sreda', 'Модернизиране на изследователската среда в академичните институции (ИТИ)', 'ПНИИДИТ 2021-2027', 'Наука и иновации', 'other', 'upcoming', 'ще отвори през юли 2026 г.', '2026-07-31', '30 млн. евро', 'Висши училища, центрове за върхови постижения/компетентност, научни организации', 'https://eufunds.media/2026/05/22/novi-protseduri-i-uvelichen-byudzhet-za-2026-g-po-pniidit/', 'Част от изменената ИГРП 2026 на ПНИИДИТ (приета 18.05.2026) — общо 12 процедури, бюджет над 272,5 млн. евро за 2026 г.', 0, '2026-07-08', '2026-07-09', '2026');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('prchr-grija-v-doma', '„Грижа в дома"', 'ПРЧР 2021-2027', 'Приоритет 2 „Социално включване и равни възможности"', 'other', 'closed', 'Приключена (2023–2024)', '2024-06-30', 'По ПРЧР', 'Общини', 'https://esf.bg/wps/portal/program-hrd/procedures/ophrd-2021-2027/procedure2/grija_v_doma', 'Почасови мобилни интегрирани здравно-социални услуги в домашна среда.', 0, '2026-07-07', '2026-07-07', '2024');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('zapochvam-rabota-k2-obuchenie', '„Започвам работа" – Компонент 2 „Обучение"', 'ПРЧР 2021-2027', 'Приоритет 1 „Насърчаване на заетостта и развитие на умения"', 'other', 'closed', 'Прием от средата на юли 2024', '2024-07-15', '17 000 000 лв / 8 691 962 € (вкл. 8.6 млн лв за по-слабо развити райони)', 'Безработни и неактивни лица (обучение с ваучери, безплатно)', 'https://esf.bg/wps/portal/program-hrd/procedures/ophrd-2021-2027/procedure1/zapochvam_rabota_K2', 'Обучение с ваучери за 14 000 души: езикови курсове, STEM/дигитални, предприемачество, меки умения.', 0, '2026-07-07', '2026-07-07', '2024');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('prchr-inovativni-zdravno-socialni', '„Иновативни здравно-социални услуги за хора в неравностойно положение"', 'ПРЧР 2021-2027', 'Приоритет 2 „Социално включване и равни възможности"', 'other', 'closed', '2025 (по ИГРП)', '2025-12-31', '100 000 000 лв', 'Общини, доставчици на социални услуги', 'https://www.namrb.org/bg/aktualno/igrp-za-2025-g-po-programa-arazvitie-na-tchoveshkite-resursiv-2021-2027-16255', 'Надгражда „Грижа в дома": мобилни интегрирани услуги, обучения и супервизия, иновативни дистанционни услуги.', 0, '2026-07-07', '2026-07-07', '2025');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('mladezhki-praktiki', 'Младежки практики (проект на Агенция по заетостта)', 'ПРЧР 2021-2027', 'Приоритет 3 – Младежка заетост', 'youth', 'closed', 'Приемът на заявки временно преустановен от 17:00 ч. на 25.02.2026 г. поради изчерпан ресурс', '2026-02-25', '46 000 000 лв. (42,3 млн. лв. за по-слабо развити региони, 3,6 млн. лв. за ЮЗ регион)', 'Работодатели, които наемат младежи до 29 г. без професионален опит за 6-месечни практики с наставник', 'https://www.az.government.bg/pages/mladejki-praktiki/', '6-месечни младежки практики с наставник. Приемът е спрян поради изчерпване на средствата. Очаквани над 9000 младежи (8287 от по-слабо развити региони, 713 от преходния регион).', 0, '2026-07-07', '2026-07-07', '2025');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('predpriemachestvo-severna-bg', 'Насърчаване на предприемачеството в Северна България (Компонент 2)', 'ПРЧР 2021-2027', 'Приоритет – предприемачество', 'youth', 'closed', '2-ро тримесечие 2026', '2026-06-30', '50 млн лв (ИГРП); процедура 25 564 594.06 €; 100% БФП, макс. 25 564.59 € на проект', 'Стартиращи предприемачи / МСП от Северна България', 'https://www.eufunds.bg/bg/indicative-annual-work-programmes', 'Планиран прием Q2 2026 по ИГРП на ПРЧР.', 0, '2026-07-07', '2026-07-07', '2026');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('mladezhka-zaetost-plus', 'Младежка заетост+ (Компонент 1 и 2)', 'ПРЧР 2021-2027', 'Приоритет 3 „Насърчаване на младежката заетост"', 'youth', 'open', 'Текущ прием (стартирал 16.02.2026)', '2026-12-31', 'Подкрепа за 8520 младежи', 'Работодатели; младежи 16–29 г.', 'https://www.az.government.bg/pages/mladejka-zaetost/', 'Компонент 2 (стажуване/наемане при работодател) подновен от 16.02.2026 г. след временно спиране на приема на 15.10.2025 г. поради изчерпан ресурс. Цел: подкрепа на 8520 младежи до 29 г. Бюджет 188 млн. лв., срок до края на 2027 г.', 0, '2026-07-07', '2026-07-08', '2026');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('zaetost-bez-barieri', 'BG05SFPR002-2.018 „Заетост без бариери“', 'ПРЧР 2021-2027', 'П1 Насърчаване на заетостта', 'other', 'open', 'без фиксиран краен срок (до изчерпване на бюджета)', '2027-12-31', '40,9 млн. евро', 'Агенция по заетостта (конкретен бенефициент) чрез Бюро по труда; целева група: продължително безработни, роми, хора с увреждания, по-възрастни работници', 'https://eufunds.media/tag/zaetost-bez-barieri/', 'Отворена за кандидатстване от 06.04.2026 г. Осигурява субсидирана заетост, обучения (ПРЧР/НПВУ), надбавки за транспорт и менторство. Изисква устойчивост на заетостта 1 месец след приключване.', 0, '2026-07-08', '2026-07-09', '2026');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('prchr-iti-predpriemachestvo', 'Развитие на предприемачеството и социалната икономика чрез подхода ИТИ', 'ПРЧР 2021-2027', 'ИТИ', 'other', 'upcoming', '3-то тримесечие 2026', '2026-09-30', 'По ИГРП 2026', 'Общини, НПО, социални предприятия', 'https://www.eufunds.bg/bg/indicative-annual-work-programmes', 'Предстояща процедура по 4-то изменение на ИГРП 2026.', 0, '2026-07-07', '2026-07-07', '2026');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('prchr-iti-umenia', 'Подобряване на уменията на заетите лица и условията на труд чрез ИТИ', 'ПРЧР 2021-2027', 'ИТИ', 'other', 'upcoming', '3-то тримесечие 2026', '2026-09-30', 'По ИГРП 2026', 'Работодатели / предприятия', 'https://www.eufunds.bg/bg/indicative-annual-work-programmes', 'Предстояща процедура по ИГРП 2026.', 0, '2026-07-07', '2026-07-07', '2026');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('prchr-iti-vazrastni', 'Подкрепа за активен живот на възрастните хора и здравословно остаряване чрез ИТИ', 'ПРЧР 2021-2027', 'ИТИ', 'other', 'upcoming', '3-то тримесечие 2026', '2026-09-30', 'По ИГРП 2026', 'Общини, доставчици на социални услуги', 'https://www.eufunds.bg/bg/indicative-annual-work-programmes', 'Предстояща процедура по ИГРП 2026.', 0, '2026-07-07', '2026-07-07', '2026');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('prchr-vomr-clld', 'Подкрепа за изпълнение на стратегии ВОМР (CLLD)', 'ПРЧР 2021-2027', 'ВОМР / CLLD', 'other', 'upcoming', '3-то тримесечие 2026', '2026-09-30', '74.2 млн лв', 'Местни инициативни групи (МИГ)', 'https://eufunds.media/2026/06/04/novi-merki-po-vomr-vlizat-v-indikativnata-godishna-rabotna-programa-na-prchr-za-2026-g/', '5 нови мерки по ВОМР в ИГРП 2026; втори прием планиран за 2027.', 0, '2026-07-07', '2026-07-07', '2026');
INSERT INTO projects (id, name, program, priority, category, status, deadline, deadline_date, budget, eligible, link, notes, is_new, first_seen, last_updated, year) VALUES ('prchr-dalgosrochna-grizha-2026', 'Услуги за дългосрочна грижа (директно предоставяне)', 'ПРЧР 2021-2027', 'Социално включване', 'other', 'upcoming', 'предстои обявяване (планирана за 2-ро тримесечие на 2026 г.)', '2026-12-31', '187,6 млн. евро', 'Общини — за резидентна грижа за възрастни хора и пълнолетни лица с увреждания, изградена по НПВУ/ПРР инфраструктура', 'https://eufunds.media/2026/06/04/novi-merki-po-vomr-vlizat-v-indikativnata-godishna-rabotna-programa-na-prchr-za-2026-g/', 'Включена в ИГРП 2026 на ПРЧР. Към 08.07.2026 г. все още не е потвърдено официално обявяване — да се провери на следващ преглед.', 0, '2026-07-08', '2026-07-09', '2026');
INSERT INTO documents (id, project_id, title, doc_type, content, source_url) VALUES (1, 'zapochvam-rabota-k2-obuchenie', 'Условия за кандидатстване — резюме', 'Условия', '## „Започвам работа" – Компонент 2 „Обучение"

**Програма:** Развитие на човешките ресурси 2021–2027 (ЕСФ+)

**Цел:** Повишаване на квалификацията и уменията на безработни и неактивни лица чрез обучение с ваучери.

### Ключови условия
- **Бюджет:** 17 000 000 лв (8 691 962 €); от тях ~8,6 млн лв за по-слабо развити райони.
- **Целева група:** безработни и неактивни лица; очаквани 14 000 участници.
- **Обучението е напълно безплатно** за участниците (чрез ваучери).
- **Видове обучения:** езикови курсове; компетентности в точните науки, технологии и инженерство (STEM/дигитални); предприемачество; лични и социални (меки) умения.
- **Прием:** от средата на юли 2024 г.

### Как се участва
Кандидатите подават заявление в бюрото по труда и получават ваучер за избран курс от одобрен доставчик на обучение.', 'https://esf.bg/wps/portal/program-hrd/procedures/ophrd-2021-2027/procedure1/zapochvam_rabota_K2');
INSERT INTO documents (id, project_id, title, doc_type, content, source_url) VALUES (2, 'pkip-vnedryavane-inovacii-1003', 'Обява и бюджет — резюме', 'Обява', '## BG16RFPR001-1.003 „Внедряване на иновации в предприятията"

**Програма:** Конкурентоспособност и иновации в предприятията 2021–2027

### Ключови точки
- **Краен срок за подаване:** 16:30 ч. на 31.01.2024 г.
- **Бюджет:** извършено е изменение с **увеличаване на бюджета**, така че да бъдат финансирани **всички 50 проекта**, класирани в резервните списъци.
- **Допустими кандидати:** микро, малки, средни и големи предприятия.
- **Фокус:** внедряване на продуктови и производствени иновации в предприятията.

**Статус:** приключена процедура.', 'https://www.mig.government.bg/programa-konkurentosposobnost-i-inovaczii-v-predpriyatiyata/novini-proczeduri-pkip/bg16rfpr001-1-003-vnedryavane-na-inovaczii-v-predpriyatiyata/');
INSERT INTO documents (id, project_id, title, doc_type, content, source_url) VALUES (3, 'pkip-razrabotvane-inovacii-1001', 'Резултати от приема — резюме', 'Обява', '## BG16RFPR001-1.001 „Разработване на иновации в предприятията"

**Програма:** Конкурентоспособност и иновации в предприятията 2021–2027

### Ключови точки
- **Краен срок:** 15 май 2024 г.
- **Подадени предложения:** 514 проектни предложения.
- **Обща стойност на подадените предложения:** 257 555 411,33 лв.
- **Фокус:** разработване на иновации (научноизследователска и развойна дейност) в предприятията.

**Статус:** приключен прием — изключително висок интерес.', 'https://www.mig.government.bg/programa-konkurentosposobnost-i-inovaczii-v-predpriyatiyata/novini-proczeduri-pkip/razrabotvane-na-inovaczii-v-predpriyatiyata/');
INSERT INTO documents (id, project_id, title, doc_type, content, source_url) VALUES (4, 'mladezhka-zaetost-plus', 'Кратко описание на мярката', 'Насоки', '## „Младежка заетост+"

**Програма:** Развитие на човешките ресурси 2021–2027 · Приоритет 3 „Насърчаване на младежката заетост"

### Основно
- **Целева група:** младежи на възраст 16–29 г. вкл.
- **Възможности:** стажуване, обучение по време на работа, осигуряване на заетост или включване в обучение за „меки" умения при работодател.
- **Прием (Компонент 2):** стартира на 16.02.2026 г.
- **Обхват:** над 300 000 млади хора в България нито учат, нито работят — приоритетна група; за младежка заетост са предвидени значителни средства (порядъка на 735 млн лв за ~110 000 младежи).

### Бележка
Възможни са временни паузи в приема при изчерпване на финансовия ресурс (както след 15.10.2025 г.).', 'https://www.az.government.bg/pages/mladejka-zaetost/');
INSERT INTO documents (id, project_id, title, doc_type, content, source_url) VALUES (5, 'mladezhki-praktiki', 'Младежки практики — описание и условия', 'Обява', '## Младежки практики (ПРЧР 2021–2027)

**Кратко резюме:** Проект на Агенция по заетостта, който осигурява 6-месечни практики за младежи без предходен професионален опит, за да натрупат практически умения на реално работно място с наставник. Финансира се от ЕС чрез ЕСФ+.

### Ключови условия

- **Бюджет:** 46 000 000 лв. — от тях 42,3 млн. лв. за по-слабо развитите региони (извън ЮЗР) и 3,6 млн. лв. за Югозападния регион (София-град, София-област, Благоевград, Перник, Кюстендил).
- **Целева група:** младежи до 29 г. без професионален опит.
- **Допустими кандидати:** работодатели, които осигуряват практика с наставник.
- **Продължителност:** до 6 месеца практика.
- **Очакван обхват:** над 9 000 младежи (8 287 от по-слабо развити региони, 713 от преходния регион).

### Статус

Приемът на заявки за участие е **временно преустановен от 17:00 ч. на 25.02.2026 г.** поради изчерпване на определения финансов ресурс. Крайният срок за подаване на проектното предложение от АЗ беше 06.06.2025 г.

*Източници: Агенция по заетостта; eufunds.media (12.05.2025); ПРЧР.*', 'https://www.az.government.bg/pages/mladejki-praktiki/');
INSERT INTO documents (id, project_id, title, doc_type, content, source_url) VALUES (6, 'obr-dostap-vomr-1009', 'Условия за кандидатстване — резюме', 'Условия', '## BG05SFPR001-1.009 „Създаване на условия за достъп до образование (ВОМР)"

**Програма:** Образование 2021–2027 · Приоритет 1 „Приобщаващо образование и образователна интеграция"

### Цел
Подкрепа за социално включване на деца и ученици от маргинализирани групи чрез по-добър достъп до качествено образование.

### Бюджет
Общ размер на БФП: **9 760 561,90 €** (ЕСФ+ и национален бюджет).

### Дейности
- **Дейност 1:** Подкрепа на деца и ученици.
- **Дейност 2:** Подкрепа за педагогически и непедагогически персонал за работа в мултикултурна среда.
- **Дейност 3:** Подкрепа на училищни/предучилищни и местни общности за активно взаимодействие.

### Срокове
3-ти срок: начало 10.11.2026 г., край 10.03.2027 г., 23:59 ч.', 'https://eufunds.bg/bg/opseig/node/20217');
INSERT INTO documents (id, project_id, title, doc_type, content, source_url) VALUES (7, 'prchr-inovativni-zdravno-socialni', 'Описание на мярката — резюме', 'Насоки', '## „Иновативни здравно-социални услуги за хора в неравностойно положение"

**Програма:** Развитие на човешките ресурси 2021–2027 · Приоритет 2

### Ключово
- **Бюджет:** 100 000 000 лв.
- **Надгражда** съществуващата мярка „Грижа в дома".

### Допустими дейности
- Почасови мобилни интегрирани здравно-социални услуги за нуждаещи се лица.
- Специализирани обучения на екипите и супервизия.
- Развитие и предоставяне на иновативни дистанционни услуги.

**Кандидати:** общини и доставчици на социални услуги.', 'https://www.namrb.org/bg/aktualno/igrp-za-2025-g-po-programa-arazvitie-na-tchoveshkite-resursiv-2021-2027-16255');
INSERT INTO documents (id, project_id, title, doc_type, content, source_url) VALUES (8, 'pkip-en-efektivnost-vei-2004', 'Резултати от приема — резюме', 'Обява', '## BG16RFPR001-2.004 „Енергийна ефективност и ВЕИ в предприятията"

**Програма:** Конкурентоспособност и иновации в предприятията 2021–2027 · Приоритет 2 „Кръгова икономика"

### Резултати
- **2 395 проектни предложения**, преминали оценката, предложени за финансиране.
- **Обща помощ:** над **105,2 млн €**.

### Фокус
По-равномерно въвеждане на ВЕИ технологии в предприятията и добри практики за енергийна ефективност в цялата страна.

**Статус:** приключен прием.', 'https://www.mig.government.bg/programa-konkurentosposobnost-i-inovaczii-v-predpriyatiyata/novini-proczeduri-pkip/en-efektivnost-i-izpolzvane-na-energiya-ot-vaz-iztoch-v-predpriyatiyata/');
INSERT INTO documents (id, project_id, title, doc_type, content, source_url) VALUES (9, 'obr-dostap-vomr-1009', 'Удължен краен срок на първи прием — резюме', 'Обява', '# BG05SFPR001-1.009 — удължаване на първи прием

С една седмица — до **15.07.2026 г.** — се удължава крайният срок на първия прием по процедурата „Създаване на условия за достъп до образование чрез преодоляване на демографски, социални и културни бариери (допълващо финансиране на подхода ВОМР)".

**Причина:** влезлият в сила Закон за противодействие на корупцията сред лица, заемащи публични длъжности — актуализира се Приложение I (Декларация на кандидата/партньора).

**Програма:** Образование 2021-2027 г. Отворена от 08.04.2026 г. Бюджет: 9,7 млн. евро.

**Допустими кандидати:** общини, училища, детски градини, ЮЛНЦ — от територии на МИГ с одобрени ВОМР стратегии; общини и ЮЛНЦ задължително в партньорство с училище/детска градина.

**Размер на БФП:** между 25 565 и 178 952 евро на проект, без изискване за собствено финансиране. За повечето МИГ територии — до 204 516,75 евро.

**График на приемите:**
1. 08.04. – 15.07.2026 г. вкл. (удължен)
2. 16.07. – 09.11.2026 г. вкл.
3. 10.11.2026 г. – 10.03.2027 г. вкл. (без промяна)

**Продължителност на проектите:** до 36 месеца, не по-късно от 31.12.2029 г.

Кандидатстване: ИСУН 2020.', 'https://eufunds.media/2026/07/07/15-yuli-e-noviyat-kraen-srok-na-parviya-priem-po-myarkata-za-sotsialno-vklyuchvane-na-detsa-i-uchenitsi-ot-marginalizirani-grupi/');
INSERT INTO documents (id, project_id, title, doc_type, content, source_url) VALUES (10, 'pniidit-modernizirane-izsledovatelska-sreda', 'Ново в ИГРП 2026 на ПНИИДИТ — резюме', 'Насоки', '# ИГРП 2026 на ПНИИДИТ — изменение (18.05.2026)

Публикувана е изменена Индикативна годишна работна програма на Програма „Научни изследвания, иновации и дигитализация за интелигентна трансформация" (ПНИИДИТ) за 2026 г. — приета на 9-то заседание на Комитета за наблюдение (28.04.2026).

**Общо процедури:** 12 (३ нови), бюджет за 2026 г. над 272,5 млн. евро (над двойно увеличение).

## Модернизиране на изследователската среда в академичните институции (ИТИ)
- **Бюджет:** 30 млн. евро
- **Индикативна дата на обявяване:** юли 2026 г.
- **Интензитет на помощта:** 50–100%
- **Допустими кандидати:** висши училища, центрове за върхови постижения/компетентност

## Други процедури от актуализираната ИГРП (за информация)
- Малки иновативни грантове за МСП, фаза 2 — 13,4 млн. евро (юни)
- Програми за сътрудничество за иновации и трансфер на знания — 87,9 млн. евро (юни, нова)
- НЦ за спортна наука и иновации (София Тех Парк) — 10,8 млн. евро (юни, нова)
- Teaming for Excellence – 2 (ИИКТ-БАН) — 30 млн. евро (юни-юли)
- Киберсигурност за публични предприятия „Енергетика" — 31,7 млн. евро (декември)
- Киберсигурна среда за уязвими организации (CS4) — 2,5 млн. евро (септември)

Пълна ИГРП: https://www.mig.government.bg/wp-content/uploads/2026/05/2.-igrp-pniidit_2026_izmenenie2-1.pdf', 'https://eufunds.media/2026/05/22/novi-protseduri-i-uvelichen-byudzhet-za-2026-g-po-pniidit/');
INSERT INTO documents (id, project_id, title, doc_type, content, source_url) VALUES (11, 'zaetost-bez-barieri', '„Заетост без бариери“ — резюме на мярката', 'Обява', '# BG05SFPR002-2.018 „Заетост без бариери“

Програма: ПРЧР 2021-2027, Приоритет 1. Бенефициент: Агенция по заетостта, чрез дирекции Бюро по труда. Отворена от 06.04.2026 г. Бюджет: 40,9 млн. евро, 100% БФП.

Цел: подобряване на достъпа до заетост и подкрепа на уязвими групи за активно приобщаване чрез започване на работа.

Целеви групи: продължително безработни лица, роми, хора с увреждания, по-възрастни работници.

Условия на подкрепата: субсидирана заетост чрез Бюрата по труда, включване в обучения по ПРЧР и НПВУ, надбавки за транспорт, менторство на работното място.

Изисквания за устойчивост: работодателите трябва да запазят заетостта за период от 1 месец след приключване на подкрепената заетост.

Забележка: мярката е насочена основно към възрастни уязвими групи, но е част от общата рамка за насърчаване на заетостта наред с младежките мерки (Младежка заетост+).', 'https://eufunds.media/tag/zaetost-bez-barieri/');
INSERT INTO documents (id, project_id, title, doc_type, content, source_url) VALUES (12, 'natura-2000-merki-54-55-56', 'Обществено обсъждане на процедурата (мерки 54, 55, 56) — резюме', 'Обява', '# BG16FFPR002-3.028 „Изпълнение на мерки 54, 55 и 56 от НРПД за Натура 2000 – 2“

**Програма:** Околна среда 2021-2027 г. (ПОС)
**Статус:** за обществено обсъждане (публикувана на 06.07.2026 г.)
**Бюджет:** 2,08 млн. евро (ЕФРР + национален бюджет) — 2,06 млн. евро за 5-те слабо развити региона, 18 720 евро за Югозападния регион (в преход)
**Обявяване на прием:** заложена дата 30.09.2026 г.
**Срок за коментари по обществено обсъждане:** до 13.07.2026 г. вкл. чрез ИСУН2020

## Цел
Подобряване на природозащитното състояние на крайбрежни, скални и дюнни типове природни местообитания чрез:
- **Мярка 54:** премахване на нетипична храстова и дървесна растителност (до 200 м от целевите местообитания)
- **Мярка 55:** премахване на инвазивни чужди видове, възстановяване на типични видове
- **Мярка 56:** изграждане и поддържане на съоръжения за обществен достъп, информационни табели

## Допустими кандидати
Структури на Министерството на околната среда и водите и на Министерството на земеделието и храните, общини, областни администрации и юридически лица с нестопанска цел — самостоятелно или в партньорство.

## Максимална БФП по мярка
- Мярка 54: 1 млн. евро
- Мярка 55: 395 721.28 евро
- Мярка 56: 681 662.89 евро

Не се изисква собствено финансиране от бенефициентите.

## Допустими разходи
СМР, материални и нематериални активи, услуги, персонал, такси, материали, мероприятия; непреки разходи (организация, видимост, документация за ОП) — 9–14% от преките.

Източник: eufunds.media, 06.07.2026', 'https://eufunds.media/2026/07/06/za-obshtestveno-obsazhdane-2-mln-evro-za-podobryavane-na-sastoyanieno-na-krajbrezhni-skalni-i-dyunni-tipove-prirodni-mestoobitaniya/');
INSERT INTO documents (id, project_id, title, doc_type, content, source_url) VALUES (13, 'vishi-uchilishta-modernizacia-2', 'Условия за кандидатстване — резюме', 'Условия', '# BG05SFPR001-3.006 „Модернизация на висшите училища 2.0“

**Програма:** Образование 2021-2027 г., Приоритет 3 „Връзка на образованието с пазара на труда“
**Тип:** директно предоставяне на БФП на конкретни бенефициенти
**Статус:** закрита — краен срок 03.06.2026 г., 17:30 ч. (отворена на 22.10.2025 г., оригинален срок 23.02.2026 г., удължен два пъти)
**Бюджет:** 200 млн. лв. (ЕСФ+ и национален бюджет); 2,5–5 млн. лв. на проект; без собствено съфинансиране

## Цел
Подобряване качеството на висшето образование и съответствието му с пазара на труда: компетентностен подход в преподаването/оценяването, дигитални компетентности и ОER, привлекателност за чуждестранни студенти, интердисциплинарност.

## Конкретни бенефициенти (водещи партньори)
Софийски университет, УАСГ, Минно-геоложки университет, ХТМУ, Университет по хранителни технологии – Пловдив, ТУ-София, Аграрен университет – Пловдив, Тракийски университет, Лесотехнически университет, АМТИИ – Пловдив, НХА, НМА, НАТФИЗ, ВВМУ „Н. Й. Вапцаров“, МУ-София, МУ-Пловдив. Задължително партньорство с още поне 1 акредитирано ВУ; допустими и представителни организации на работници/работодатели.

## Дейности
Гъвкави методи на кандидатстване/преподаване/оценяване; допълнителни обучения на студенти; обучение на преподаватели и администрация; мобилност на студенти/преподаватели; популяризиране на българските ВУ в чужбина.

## Целеви показатели
>37 600 обхванати участници (средно и над средното образование), >5 400 студенти. Продължителност на проектите до 48 месеца, не по-късно от 31.12.2029 г.

Източник: eufunds.media / sf.mon.bg', 'https://sf.mon.bg/?go=news&newsId=1562&p=detail');
INSERT INTO documents (id, project_id, title, doc_type, content, source_url) VALUES (14, 'az-myarka-stazhuvane-mladezhi', 'Мярка „Стажуване на младежи" — условия', 'Условия', '## Мярка „Стажуване на младежи“ (Агенция по заетостта)

**Целева група:** младежи на възраст 16–29 г. включително.

**Вид подкрепа:** стажуване при работодател от 6 до 9 месеца, обучение по време на работа, осигуряване на заетост или включване в обучение за придобиване на „меки“ умения.

**Условия за работодателя:**
- Сключва договор за заетост с Агенцията по заетостта.
- Задължен е да запази заетостта на включените лица за период, равен на половината от периода на подкрепената заетост (допуска се замяна на лица от целевата група).

**Стимули:** ако работодателят сключи безсрочен трудов договор със стажувал младеж на длъжност, съответстваща на квалификацията му, при същото или по-добро възнаграждение — получава компенсация на осигурителните вноски за 6 месеца от началото на договора.

**Допълнителна подкрепа:** за първия месец от стажа/обучението/субсидираната заетост се осигуряват средства за обществен транспорт от и до работното място.

**Статус:** отворена (без определен фиксиран краен срок — прием чрез бюрата по труда).', 'https://www.az.government.bg/pages/myarka-stazhuvane-na-mladezhi/');
INSERT INTO documents (id, project_id, title, doc_type, content, source_url) VALUES (15, 'az-myarka-naemane-mladezhi-29', 'Мярка „Наемане на безработни лица до 29 г." — условия', 'Условия', '## Мярка — насърчаване на работодателите да наемат безработни лица до 29-годишна възраст (Закон за насърчаване на заетостта)

**Видове насърчителни мерки:**

1. **Регистрирани ≥12 месеца:** за всяко разкрито работно място с наето безработно лице до 29 г. с непрекъсната регистрация не по-малко от 12 месеца, насочено от бюрото по труда — субсидия за времето, през което лицето е било на работа, до максимум 12 месеца.

2. **Лица с трайни увреждания** (вкл. военноинвалиди) и младежи от социални заведения, завършили образование и насочени от бюрото по труда — субсидия за не повече от 18 месеца.

3. **Стажуване по придобита квалификация:** младежи до 29 г., придобили през последните 24 месеца квалификация по професия и без трудов стаж по нея — възможност за стаж при работодател.

**Финансиране:** от държавния бюджет, за период до 9 месеца в зависимост от категорията.

**Кандидатстване:** през дирекции „Бюро по труда“ към Агенция по заетостта.

**Статус:** постоянно действаща мярка, отворена за кандидатстване.', 'https://www.az.government.bg/pages/myarka-naemane-na-bezrabotni-mladezhi-do-29-godishna-vazrast/');
INSERT INTO documents (id, project_id, title, doc_type, content, source_url) VALUES (16, 'np-start-na-karierata', 'Национална програма „Старт на кариерата" — условия', 'Условия', '## Национална програма „Старт на кариерата“ (Агенция по заетостта)

**Цел:** осигуряване на възможности за придобиване на трудов стаж на безработни младежи, завършили средно или висше образование, за улесняване на прехода между образование и заетост.

**Кандидати:**
- възраст до 29 г.
- завършено висше образование
- без трудов стаж по придобитата специалност
- регистрирани в дирекция „Бюро по труда“ към Агенция по заетостта

**Трудово правоотношение:** 12-месечен трудов договор в централните управления на институции и техните териториални поделения.

**Финансиране:** възнагражденията и осигуровките се поемат от държавния бюджет (политики по заетостта). За работни места в областни и общински администрации — средства за трудово възнаграждение в размер на 800 лв.

**Статус:** действаща национална програма, периодични покани за прием на заявки от институции и кандидати.', 'https://www.az.government.bg/pages/programa-start-na-karierata/');
INSERT INTO documents (id, project_id, title, doc_type, content, source_url) VALUES (17, 'pkip-novi-modeli-proizvodstvo-1010', 'Условия за кандидатстване — резюме (от разархивиран официален пакет)', 'Архив', '# BG16RFPR001-1.010 „Нови модели в производството от страна на МСП"

**Програма:** Конкурентоспособност и иновации в предприятията (ПКИП) 2021-2027, Приоритет 1 „Иновации и растеж", Специфична цел RSO1.1.

**Цел:** Подкрепа на микро, малки и средни предприятия (МСП) за въвеждане на нови модели, базирани на нови или подобрени процеси, стоки или услуги, за повишаване на иновационната им дейност и конкурентоспособност.

## Бюджет
- Общ бюджет: 96 311 217,23 евро (188 368 368 лв.)
- Почти половината (46 016 269,31 евро) е заделена за предприятия от Северна България
- Проектите се изпълняват само в един от трите региона: регион в преход (ЮЗР), по-слабо развити северни региони, по-слабо развити южни региони — не е допустимо комбиниране

## Размер на БФП по проект
- Минимум: 25 000 евро
- Максимум: 250 000 евро (микро и малки предприятия) / 400 000 евро (средни предприятия)
- Допълнително ограничение: не повече от 100% (микро) / 60% (малки) / 25% (средни) от средногодишните нетни приходи от продажби за периода 2022–2024 г.

## Интензитет на съфинансиране
- До 70% от допустимите разходи, в зависимост от избрания режим на помощ (регионална инвестиционна помощ по Регламент 651/2014 или минимална помощ/de minimis по Регламент 2023/2831), категорията на предприятието и мястото на изпълнение

## Допустими кандидати
Микро, малки и средни предприятия (МСП), регистрирани и осъществяващи дейност в България.

## Допустими разходи (обобщено)
Машини, съоръжения, оборудване, софтуер, патенти, полезни модели, промишлени дизайни и лицензии, необходими за въвеждането на новия модел в предприятието.

## Срокове
- Обявена: 05.02.2026 г.
- Първоначален краен срок: 27.05.2026 г., 16:30 ч.
- Удължен (поради технически проблеми в ИСУН) до: **05.06.2026 г., 16:30 ч.**
- Статус към 10.07.2026 г.: **закрита** (срокът е изтекъл)

## Подаване
Изцяло по електронен път чрез ИСУН (раздел „ЕФСУ 2021-2027"), с Квалифициран електронен подпис (КЕП), модул „Е-кандидатстване".

_Резюме, изготвено от разархивиран официален пакет документи (Условия за кандидатстване + приложения), свален от официалния сайт на МИР._', 'https://www.mig.government.bg/wp-content/uploads/2026/05/1.010_novi_modeli_izm_srok_05.2026.zip');
INSERT INTO documents (id, project_id, title, doc_type, content, source_url) VALUES (18, 'pkip-industria-4-0-1008', 'Резултати от приема — 226 одобрени фирми (резюме)', 'Обява', '# BG16RFPR001-1.008 „Въвеждане на технологии от Индустрия 4.0 в предприятията"

**Програма:** Конкурентоспособност и иновации в предприятията (ПКИП) 2021-2027.

**Обявени резултати (02.06.2026 г.):** Министерството на иновациите и дигиталната трансформация (МИДТ) одобри **226 фирми** за общо над **52 288 655,96 евро** (102 267 721,99 лв.) безвъзмездна помощ.

## Кандидатствали
742 малки и средни предприятия кандидатстваха по мярката.

## Общ бюджет на процедурата
54 185 762,78 евро (105 978 140,42 лв.)

## Допустими дейности/технологии
Изкуствен интелект, виртуална/добавена реалност, 3D принтиране, анализ на големи бази данни (Big Data), индустриален интернет на нещата (IIoT), киберфизични системи, дигитални близнаци, съвместни роботи (коботи), облачни технологии.

## Одобрени сектори
Над половината одобрени са от преработващата промишленост; останалите — от търговия, ИТ и далекосъобщения, професионални и научни дейности и др.

## Бележка
Заради големия брой класирани в резервните списъци кандидати, се обмисля увеличение на бюджета на процедурата.

_Резюме от официалната новина на mig.government.bg._', 'https://www.mig.government.bg/vsichki-novini/odobreni-sa-226-firmi-za-vnedryavane-na-izkustven-intelekt-i-oblachni-tehnologii/');
INSERT INTO documents (id, project_id, title, doc_type, content, source_url) VALUES (19, 'pkip-inovacii-msp-mig-1011', 'Обява: Внедряване на иновации в МСП на територията на МИГ (BG16RFPR001-1.011)', 'Обява', '# BG16RFPR001-1.011 „Внедряване на иновации в МСП на територията на МИГ"

## Резюме
Отворена на **10.07.2026 г.** процедура по ПКИП 2021-2027 за внедряване на иновации (нови/подобрени продукти и бизнес процеси) в МСП от териториите на **51 МИГ** с одобрено допълващо финансиране. Кандидатстването е изцяло онлайн през ИСУН 2020.

## Бюджет — 19,9 млн. евро
- **Приоритет 1 „Иновации и растеж"** – 10,5 млн. евро (0,9 млн. ЮЗР; 6,6 млн. Северна България; 2,8 млн. Южна България): ИКТ; мехатроника и микроелектроника; индустрия за здравословен живот, биоикономика и биотехнологии; нови технологии в креативните и рекреативните индустрии.
- **Приоритет 2 „Кръгова икономика"** – 9,4 млн. евро (0,9 млн. ЮЗР; 5,7 млн. Северна; 2,7 млн. Южна): чисти технологии, кръгова и нисковъглеродна икономика.

## Допустими кандидати
- Микро-, малки и средни предприятия с дейност на територията на МИГ (микро – само в населени места на градските общини);
- Търговци, регистрирани **не по-късно от 31.12.2023 г.**;
- Средногодишни нетни приходи от продажби 2023–2025 г.: микро/малки ≥ 50 000 лв.; средни ≥ 200 000 лв.
- Индивидуално кандидатстване.

## Финансови условия
- БФП: **15 000 – 102 500 евро**, не повече от 100% от нетните приходи 2023–2025 г.
- Интензитет: до **75%** от допустимите разходи; режим **de minimis** (таван 300 000 евро/3 г.).
- Допустими разходи: ДМА/ДНА – машини, съоръжения, оборудване, софтуер; патенти, полезни модели, промишлени дизайни и лицензи (до 50 000 евро).

## Срокове
- Прозорец 1: **10.07 – 14.09.2026 г., 16:30 ч.**
- Прозорец 2: **14.01 – 15.03.2027 г.**
- Изпълнение на проекта: до **12 месеца**.
- Въпроси в ИСУН до 21 дни преди крайния срок.

Очакван обхват: 194–1 331 фирми. Изисква се внедряване на поне една продуктова или процесова иновация в тематична област на ИСИС 2021-2027.', 'https://www.mig.government.bg/vsichki-novini/inovaczii-za-blizo-20-mln-evro-sthe-vnedryavat-kompanii-ot-mestni-inicziativni-grupi/');
INSERT INTO documents (id, project_id, title, doc_type, content, source_url) VALUES (20, 'obr-ucenici-talanti-2', 'Изменение на документацията по „Подкрепа за ученици с таланти-2" (10.07.2026)', 'Условия', '# Изменение на документацията – BG05SFPR001-2.005 „Подкрепа за ученици с таланти-2"

## Какво се променя (10.07.2026 г.)
Промените са заради влезлия в сила Закон за противодействие на корупцията сред лица, заемащи публични длъжности:
- **Условия за кандидатстване, секция 11.2 „Недопустими кандидати"** – актуализирани текстове по буква к);
- **Приложение I. Декларация на кандидата/партньора**, Раздел I (декларация по чл. 25, ал. 2 ЗУСЕФСУ и чл. 7 от ПМС № 23/2023) – променят се т. 6 букви б) и г) и т. 14.

Останалите условия не се променят. Измененията са отразени в ИСУН.

## Ключови параметри на процедурата
- Бюджет: **17 млн. евро** (Компонент 1 – по-слабо развити региони: 13,6 млн.; Компонент 2 – ЮЗР: 3,3 млн.);
- Кандидати: общини и районни администрации (София, Пловдив, Варна), в партньорство с ЮЛНЦ, културни организации, читалища, библиотеки, спортни клубове; една община – само в едно предложение; кандидатите да не са бенефициенти по BG05SFPR001-2.003;
- БФП: **51 130 – 383 470 евро**, без собствено финансиране;
- Дейности: развитие и изява на таланти (конкурси, състезания, олимпиади, кръжоци), организация и управление, комуникация; други преки/непреки разходи до 40% от възнагражденията;
- Продължителност: до **36 месеца**, не по-късно от 31.12.2030 г.; очакван обхват 19 700+ деца и ученици;
- **Краен срок: 21.07.2026 г., 17:30 ч.** през ИСУН 2020.', 'https://eufunds.media/2026/07/10/izmenya-se-dokumentatsiyata-po-protsedurata-za-nasarchavane-na-uchenitsi-s-talanti/');
INSERT INTO documents (id, project_id, title, doc_type, content, source_url) VALUES (21, 'pkip-zeleni-tehnologii-msp-2003', 'Проект на Условия за кандидатстване – BG16RFPR001-2.003 „Въвеждане на зелени технологии в МСП“', 'Насоки', '# BG16RFPR001-2.003 „Въвеждане на зелени технологии в МСП“ — резюме на проекта на Условия за кандидатстване

**Програма:** ПКИП 2021-2027, Приоритет 2 „Кръгова икономика“, СЦ RSO2.6 (ЕФРР)
**Статус:** проект на документация, публикуван за обществено обсъждане на 15.04.2026 г. (коментари до 23.04.2026 г.); прием очакван през 2026 г. изцяло през ИСУН. Крайният срок в проекта е непопълнен („16:30 часа на …2026 г.“) — един краен срок за кандидатстване.

## Бюджет и размер на помощта
- Общ бюджет: **82 995 277 евро**
- БФП на проект: **77 000 – 410 000 евро** според категорията на предприятието и избрания режим на помощ
- Максимален интензитет: **до 70%** от допустимите разходи
- Режими по Елемент I (избира се ЕДИН): „регионална инвестиционна помощ“ (Регламент 651/2014) или „минимална помощ“ de minimis (Регламент 2023/2831). При регионална инвестиционна помощ — мин. 25% собствено/външно съфинансиране без публична подкрепа

## Допустими кандидати
1. Търговци по ТЗ/ЗК или еквивалент от държава от ЕИП
2. Регистрирани **не по-късно от 31.12.2023 г.**
3. Микро, малко или средно предприятие (ЗМСП)
4. Минимални средногодишни нетни приходи от продажби за 2023–2025 г. в зависимост от категорията

## Дейности
- **Дейност 1 (задължителна, Елемент I):** Въвеждане на зелени технологии за кръгови модели на производство и потребление — придобиване на машини, съоръжения, оборудване, софтуер, патенти, полезни модели, промишлени дизайни, лицензии. Всеки актив трябва да е обвързан с конкретен кръгов модел/резултат; при непостигане на резултатите УО може да откаже плащане или да изиска възстановяване
- **Дейност 2 (незадължителна, Елемент II, само de minimis):** Услуги за постигане на съответствие с екологични стандарти, вкл. Екомаркировката на ЕС

## Особености
- Мярката се реализира и чрез подхода **Интегрирани териториални инвестиции (ИТИ)**
- Задължение за поддържане на придобитите активи и резултати след приключване
- Пакетът включва критерии за оценка (Прил. 6), индикатори (Прил. 8), списъци на общини за селски райони и КИТИ (Прил. 14, 15), деклараци�� за държавни/минимални помощи и МСП

*Източник: официален пакет (zip) от mig.government.bg, обработен на 12.07.2026 г.*', 'https://www.mig.government.bg/wp-content/uploads/2026/04/2.003_usloviya_za_kandidatstvane_green-technologies-in-smes-iti.zip');
INSERT INTO snapshots (id, run_date, summary, created_at) VALUES (11, '2026-07-12', 'Добавена нова процедура ПКИП „Въвеждане на зелени технологии в МСП" (BG16RFPR001-2.003, 83 млн. евро, предстояща) с обработен пакет Условия за кандидатстване (1 нов документ от архив). Без промени по младежките мерки. Статуси актуализирани.', '2026-07-12T08:16:00Z');
