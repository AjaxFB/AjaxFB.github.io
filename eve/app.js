'use strict';
/* ============================================================================
 * EVE Market — app.js
 * Ferramenta de mercado / arbitragem / logística para EVE Online.
 * 100% client-side: os dados vão do seu navegador direto para a ESI.
 *
 * Compliance: DLA (https://developers.eveonline.com/license-agreement); uso não-comercial (DLA §4.1/4.4).
 * Nada aqui cobra, bloqueia ou restringe acesso; doações em ISK são opcionais.
 * ==========================================================================*/

/* ------------------------------------------------------------------ */
/* SDE + constantes                                                    */
/* ------------------------------------------------------------------ */
const S = window.SDE;
const ESI = 'https://esi.evetech.net/latest';
const IMG = 'https://images.evetech.net';
// Identificação da aplicação para a ESI (Best Practices: User Agents).
// Navegadores descartam o header `User-Agent`, então usamos `X-User-Agent`.
// Formato: AppName/versão (+URL do código-fonte).
const APP_UA = 'EVE-Market/1.0 (+https://github.com/AjaxFB/AjaxFB.github.io)';

const SYS = S.systems, TYPES = S.types, REGS = S.regions, CONSTS = S.constellations,
      STAS = S.stations, STSYS = S.station_sys, MGS = S.marketGroups,
      GRPS = S.groups, CATS = S.categories;

const DB_NAME = 'eveonline', DB_VER = 1, STORE = 'regions';

/* Regiões padrão (as praças cobertas pela ferramenta) + sistema de referência de cada uma.
 * O sistema de referência alimenta as colunas "→<hub>" (distância em saltos). */
const HUBS = [
  { key: 'jita',     name: 'Jita',     regionId: 10000002, systemId: 30000142 }, // The Forge
  { key: 'amarr',    name: 'Amarr',    regionId: 10000043, systemId: 30002187 }, // Domain
  { key: 'dodixie',  name: 'Dodixie',  regionId: 10000032, systemId: 30002659 }, // Sinq Laison
  { key: 'hek',      name: 'Hek',      regionId: 10000042, systemId: 30002053 }, // Metropolis
  { key: 'exordium', name: 'Exordium', regionId: 10001004, systemId: 30100032 }, // Exordium (Manifest)
];

/* Regiões que vêm selecionadas por padrão (as outras ficam no card "adicionar região"). */
const DEFAULT_REGIONS = [10000002, 10000043, 10000032, 10001004]; // The Forge, Domain, Sinq Laison, Exordium

const SHIPS = [
  { key: 'c10',  label: 'Shuttle',  m3: 10 },
  { key: 'c600', label: 'Frigate',  m3: 600 },
  { key: 'c30k', label: 'Hauler',   m3: 30000 },
];

/* ------------------------------------------------------------------ */
/* i18n (pt / en / es)                                                 */
/* ------------------------------------------------------------------ */
const LANGS = ['pt', 'en', 'es'];
const I18N = {
  pt: {
    'brand.tag': 'client-side',
    'btn.collect': '⟳ Coletar', 'btn.force': '⚡ Forçar', 'btn.export': '⭳ CSV',
    'btn.force.title': 'Ignorar cache (ETag) e baixar tudo de novo',
    'btn.export.title': 'Exportar resultados filtrados em CSV',
    'tab.opps': 'Oportunidades', 'tab.legal': 'Legal',
    'left.market': 'Mercado', 'left.searchPh': 'buscar item...',
    'left.whitelist': 'whitelist (só estes)', 'left.blacklist': 'blacklist (exceto estes)',
    'left.tree': 'Árvore de mercado',
    'center.collect': 'Coleta ESI', 'results.title': 'Oportunidades', 'right.filters': 'Filtros',
    'results.cols': 'colunas', 'results.colsTitle': 'deslize para ver as colunas',
    'ship.shuttle': 'Shuttle', 'ship.frigate': 'Frigate', 'ship.hauler': 'Hauler',
    'f.item': 'nome do item', 'f.itemPh': 'texto...', 'f.tax': 'taxa compra / venda (%)',
    'f.roi': 'roi min / max (%)', 'f.ppj': 'ppj min (ISK/salto)',
    'f.jumps': 'saltos máx (compra↔venda)',
    'f.buysec': 'segurança compra min / max', 'f.sellsec': 'segurança venda min / max',
    'f.vol': 'volume un. m³ min / max', 'f.price': 'preço un. (compra) min / max',
    'f.buyregion': 'região compra (texto)', 'f.buyregionPh': 'ex: Domain',
    'f.sellregion': 'região venda (texto)', 'f.sellregionPh': 'ex: The Forge',
    'f.topn': 'top N oportunidades', 'f.displaymax': 'exibir no máximo',
    'f.group': 'agrupar por item+par', 'f.icons': 'ícones', 'f.preset': 'preset (JSON)',
    'preset.copy': 'copiar', 'preset.load': 'carregar', 'preset.clear': 'limpar',
    'reg.orders': 'ordens', 'reg.expires': 'expira', 'reg.active': 'ativa',
    'reg.add': 'adicionar região', 'reg.addPh': 'nome ou id da região...', 'reg.clear': 'limpar cache',
    'log.collecting': 'coleta já em andamento',
    'log.collect': 'coleta: {n} região(ões){force}', 'log.force': ' [FORÇAR]',
    'log.cache304': '{name}: 304 (cache válido)', 'log.orders': '{name}: {n} ordens ({p} pág)',
    'log.error': 'ERRO {name}: {msg}',
    'log.done': 'coleta concluída em {t}s — {ok} ok, {skipped} em cache, {errs} erro(s)',
    'log.ready': 'pronto. {types} tipos, {sys} sistemas carregados.',
    'log.rate': 'ESI {status}; aguardando {s}s', 'log.workerErr': 'worker erro: {msg}',
    'log.calcErr': 'erro no cálculo: {msg}', 'log.csv': 'CSV exportado ({n} linhas)',
    'log.presetCopied': 'preset copiado', 'log.presetLoaded': 'preset carregado',
    'log.presetInvalid': 'JSON inválido: {msg}',
    'log.regionErr': 'região {id}', 'log.pageErr': 'região {id} pág {p}',
    'meta.cycle': '{orders} ordens → {raw} pares → {cand} candidatos  ·  {ms} ms',
    'meta.filters': '{n} de {total} candidatos', 'countdown': 'próx. refresh em {s}s',
    'th.item': 'Item', 'th.roi': 'ROI', 'th.profitUnit': 'Lucro/un', 'th.qty': 'Qtd',
    'th.total': 'Total', 'th.ppj': 'PpJ', 'th.jumps': 'Jumps',
    'th.buySys': 'Compra sys', 'th.buyLoc': 'Compra local', 'th.buyPrice': 'Preço C', 'th.buyQty': 'Qtd C',
    'th.sellSys': 'Venda sys', 'th.sellLoc': 'Venda local', 'th.sellPrice': 'Preço V', 'th.sellQty': 'Qtd V',
    'th.m3': 'M3', 'th.c30k': 'C30k', 'th.c600': 'C600', 'th.c10': 'C10', 'th.hub': '→{name}',
    'modal.hist': 'Histórico de preço (região de venda)', 'modal.loading': 'carregando…',
    'modal.days': '{n} dias · último vol {vol}', 'modal.nodata': 'sem dados suficientes',
    'modal.offline': 'histórico indisponível ({msg})',
    'modal.meta': 'type_id {id} · {group} · volume {vol} m³',
    'modal.roi': 'ROI', 'modal.profitUnit': 'Lucro/un', 'modal.total': 'Total', 'modal.ppj': 'PpJ',
    'modal.jumps': 'Jumps', 'modal.buy': 'Compra', 'modal.sell': 'Venda', 'modal.sellLoc': 'Local venda',
    'legal.title': 'Sobre esta ferramenta',
    'legal.badge1': 'não-comercial', 'legal.badge2': 'client-side', 'legal.badge3': 'projeto de fã',
    'legal.intro': 'Ferramenta de mercado e arbitragem cross-region para EVE Online. Ela usa a API pública (ESI) e o SDE estático oficial. Não cobra nada, não tem paywall e não restringe acesso — conforme a política do desenvolvedor (Fenris Creations, ex-CCP Games) para Aplicações de terceiros.',
    'legal.flowTitle': 'Como os dados fluem',
    'legal.flow1': 'O seu navegador fala direto com esi.evetech.net e images.evetech.net.',
    'legal.flow2': 'Não existe servidor nosso, banco central, telemetria ou analytics.',
    'legal.flow3': 'Os dados coletados ficam no seu IndexedDB; os ajustes, no seu localStorage.',
    'legal.flow4': 'Nenhuma chamada autenticada, nenhuma chave de API, nenhum SSO/login.',
    'legal.dataTitle': 'Fontes de dados e endpoints',
    'legal.epEsiB': 'API pública, sem autenticação',
    'legal.epOrders': '— ordens de mercado por região (paginação por X-Pages; cache por ETag/Expires)',
    'legal.epHistory': '— histórico diário de preço (modal de detalhe)',
    'legal.epNames': '— resolve IDs→nomes (apenas no build do SDE)',
    'legal.epRate': '— limites lidos dos headers X-Ratelimit-*; backoff em 429 / Retry-After',
    'legal.epUa': '— identifica a aplicação via X-User-Agent (browsers descartam User-Agent):',
    'legal.epImgB': 'Imagens',
    'legal.epImg': '— ícones de tipos exibidos direto do servidor oficial',
    'legal.epSdeB': '(dados estáticos oficiais)',
    'legal.epSde': '— build baixado uma vez por build/gen_sde.py e embutido em sde.js',
    'legal.epDotlanB': '(link externo, só navegação)',
    'legal.lawTitle': 'Enquadramento legal (resumo)',
    'legal.law1b': '— Aplicação não-comercial (§1.13, §4.1); monetização só nas formas do §4.4 (ISK, doação de hospedagem, anúncios gerais).',
    'legal.law2b': '— sem modificar o cliente; cache scraping é proibido (EULA §9.C).',
    'legal.law3b': '— conteúdo gratuito, sem paywall; uso de marcas com aviso.',
    'legal.law4b': '— uso pessoal; sem automatizar o cliente.',
    'legal.law5b': '— dados do ESI não são dados pessoais; nada é coletado por nós (LGPD/GDPR).',
    'legal.citeTitle': 'Citações (fontes oficiais)',
    'legal.citeUpd': 'atualizado em 18 May 2026',
    'legal.source': 'Código-fonte:',
    'legal.official': 'Links oficiais:',
    'legal.tmTitle': 'Aviso de marca',
    'legal.tm': 'EVE Online® e Fenris Creations™, e todos os respectivos logotipos e elementos, são marcas da Fenris Creations. ©2026 Fenris Creations. Todos os direitos reservados. Esta ferramenta é um projeto não-oficial de fã, não afiliado nem endossado pela Fenris Creations (ex-CCP Games). Dados do jogo © Fenris Creations.',
    'legal.disclaimer': 'Aviso exigido pelos Content Creation Terms of Use: "This material is used with limited permission of CCP Games. No official affiliation or endorsement by CCP Games is stated or implied."',
    'footer.mid': 'projeto de fã · não-oficial · não-comercial',
    'footer.right': 'EVE Online © Fenris Creations. Dados via ESI/SDE oficiais.',
  },
  en: {
    'brand.tag': 'client-side',
    'btn.collect': '⟳ Collect', 'btn.force': '⚡ Force', 'btn.export': '⭳ CSV',
    'btn.force.title': 'Ignore cache (ETag) and re-download everything',
    'btn.export.title': 'Export filtered results to CSV',
    'tab.opps': 'Opportunities', 'tab.legal': 'Legal',
    'left.market': 'Market', 'left.searchPh': 'search item...',
    'left.whitelist': 'whitelist (only these)', 'left.blacklist': 'blacklist (except these)',
    'left.tree': 'Market tree',
    'center.collect': 'ESI collection', 'results.title': 'Opportunities', 'right.filters': 'Filters',
    'results.cols': 'columns', 'results.colsTitle': 'slide to see the columns',
    'ship.shuttle': 'Shuttle', 'ship.frigate': 'Frigate', 'ship.hauler': 'Hauler',
    'f.item': 'item name', 'f.itemPh': 'text...', 'f.tax': 'buy / sell tax (%)',
    'f.roi': 'roi min / max (%)', 'f.ppj': 'ppj min (ISK/jump)',
    'f.jumps': 'max jumps (buy↔sell)',
    'f.buysec': 'buy security min / max', 'f.sellsec': 'sell security min / max',
    'f.vol': 'unit volume m³ min / max', 'f.price': 'unit price (buy) min / max',
    'f.buyregion': 'buy region (text)', 'f.buyregionPh': 'e.g. Domain',
    'f.sellregion': 'sell region (text)', 'f.sellregionPh': 'e.g. The Forge',
    'f.topn': 'top N opportunities', 'f.displaymax': 'display at most',
    'f.group': 'group by item+pair', 'f.icons': 'icons', 'f.preset': 'preset (JSON)',
    'preset.copy': 'copy', 'preset.load': 'load', 'preset.clear': 'clear',
    'reg.orders': 'orders', 'reg.expires': 'expires', 'reg.active': 'active',
    'reg.add': 'add region', 'reg.addPh': 'region name or id...', 'reg.clear': 'clear cache',
    'log.collecting': 'collection already running',
    'log.collect': 'collection: {n} region(s){force}', 'log.force': ' [FORCE]',
    'log.cache304': '{name}: 304 (valid cache)', 'log.orders': '{name}: {n} orders ({p} pages)',
    'log.error': 'ERROR {name}: {msg}',
    'log.done': 'collection finished in {t}s — {ok} ok, {skipped} cached, {errs} error(s)',
    'log.ready': 'ready. {types} types, {sys} systems loaded.',
    'log.rate': 'ESI {status}; waiting {s}s', 'log.workerErr': 'worker error: {msg}',
    'log.calcErr': 'calculation error: {msg}', 'log.csv': 'CSV exported ({n} rows)',
    'log.presetCopied': 'preset copied', 'log.presetLoaded': 'preset loaded',
    'log.presetInvalid': 'invalid JSON: {msg}',
    'log.regionErr': 'region {id}', 'log.pageErr': 'region {id} page {p}',
    'meta.cycle': '{orders} orders → {raw} pairs → {cand} candidates  ·  {ms} ms',
    'meta.filters': '{n} of {total} candidates', 'countdown': 'next refresh in {s}s',
    'th.item': 'Item', 'th.roi': 'ROI', 'th.profitUnit': 'Profit/unit', 'th.qty': 'Qty',
    'th.total': 'Total', 'th.ppj': 'PpJ', 'th.jumps': 'Jumps',
    'th.buySys': 'Buy sys', 'th.buyLoc': 'Buy location', 'th.buyPrice': 'Buy price', 'th.buyQty': 'Qty C',
    'th.sellSys': 'Sell sys', 'th.sellLoc': 'Sell location', 'th.sellPrice': 'Sell price', 'th.sellQty': 'Qty V',
    'th.m3': 'M3', 'th.c30k': 'C30k', 'th.c600': 'C600', 'th.c10': 'C10', 'th.hub': '→{name}',
    'modal.hist': 'Price history (sell region)', 'modal.loading': 'loading…',
    'modal.days': '{n} days · last vol {vol}', 'modal.nodata': 'not enough data',
    'modal.offline': 'history unavailable ({msg})',
    'modal.meta': 'type_id {id} · {group} · volume {vol} m³',
    'modal.roi': 'ROI', 'modal.profitUnit': 'Profit/unit', 'modal.total': 'Total', 'modal.ppj': 'PpJ',
    'modal.jumps': 'Jumps', 'modal.buy': 'Buy', 'modal.sell': 'Sell', 'modal.sellLoc': 'Sell location',
    'legal.title': 'About this tool',
    'legal.badge1': 'non-commercial', 'legal.badge2': 'client-side', 'legal.badge3': 'fan project',
    'legal.intro': 'Cross-region market and arbitrage tool for EVE Online. It uses the public API (ESI) and the official static SDE. It charges nothing, has no paywall and does not restrict access — per the developer policy (Fenris Creations, formerly CCP Games) for third-party Applications.',
    'legal.flowTitle': 'How data flows',
    'legal.flow1': 'Your browser talks directly to esi.evetech.net and images.evetech.net.',
    'legal.flow2': 'There is no server of ours, no central database, no telemetry or analytics.',
    'legal.flow3': 'Collected data stays in your IndexedDB; settings in your localStorage.',
    'legal.flow4': 'No authenticated calls, no API key, no SSO/login.',
    'legal.dataTitle': 'Data sources and endpoints',
    'legal.epEsiB': 'public API, no authentication',
    'legal.epOrders': '— market orders per region (pagination via X-Pages; cache via ETag/Expires)',
    'legal.epHistory': '— daily price history (detail modal)',
    'legal.epNames': '— resolves IDs→names (SDE build only)',
    'legal.epRate': '— limits read from X-Ratelimit-* headers; backoff on 429 / Retry-After',
    'legal.epUa': '— identifies the app via X-User-Agent (browsers drop User-Agent):',
    'legal.epImgB': 'Images',
    'legal.epImg': '— type icons served straight from the official server',
    'legal.epSdeB': '(official static data)',
    'legal.epSde': '— build downloaded once by build/gen_sde.py and embedded in sde.js',
    'legal.epDotlanB': '(external link, navigation only)',
    'legal.lawTitle': 'Legal framing (summary)',
    'legal.law1b': '— non-commercial Application (§1.13, §4.1); monetization only as per §4.4 (ISK, hosting donation, general ads).',
    'legal.law2b': '— no client modification; cache scraping is prohibited (EULA §9.C).',
    'legal.law3b': '— free content, no paywall; trademark use with notice.',
    'legal.law4b': '— personal use; no client automation.',
    'legal.law5b': '— ESI data is not personal data; nothing is collected by us (GDPR/LGPD).',
    'legal.citeTitle': 'Citations (official sources)',
    'legal.citeUpd': 'updated 18 May 2026',
    'legal.source': 'Source code:',
    'legal.official': 'Official links:',
    'legal.tmTitle': 'Trademark notice',
    'legal.tm': 'EVE Online® and Fenris Creations™, and all related logos and elements, are trademarks of Fenris Creations. ©2026 Fenris Creations. All rights reserved. This tool is an unofficial fan project, not affiliated with or endorsed by Fenris Creations (formerly CCP Games). Game data © Fenris Creations.',
    'legal.disclaimer': 'Notice required by the Content Creation Terms of Use: "This material is used with limited permission of CCP Games. No official affiliation or endorsement by CCP Games is stated or implied."',
    'footer.mid': 'fan project · unofficial · non-commercial',
    'footer.right': 'EVE Online © Fenris Creations. Data via official ESI/SDE.',
  },
  es: {
    'brand.tag': 'client-side',
    'btn.collect': '⟳ Recopilar', 'btn.force': '⚡ Forzar', 'btn.export': '⭳ CSV',
    'btn.force.title': 'Ignorar caché (ETag) y descargar todo de nuevo',
    'btn.export.title': 'Exportar resultados filtrados a CSV',
    'tab.opps': 'Oportunidades', 'tab.legal': 'Legal',
    'left.market': 'Mercado', 'left.searchPh': 'buscar ítem...',
    'left.whitelist': 'whitelist (solo estos)', 'left.blacklist': 'blacklist (excepto estos)',
    'left.tree': 'Árbol de mercado',
    'center.collect': 'Recolección ESI', 'results.title': 'Oportunidades', 'right.filters': 'Filtros',
    'results.cols': 'columnas', 'results.colsTitle': 'desliza para ver las columnas',
    'ship.shuttle': 'Shuttle', 'ship.frigate': 'Frigate', 'ship.hauler': 'Hauler',
    'f.item': 'nombre del ítem', 'f.itemPh': 'texto...', 'f.tax': 'impuesto compra / venta (%)',
    'f.roi': 'roi min / max (%)', 'f.ppj': 'ppj min (ISK/salto)',
    'f.jumps': 'saltos máx (compra↔venta)',
    'f.buysec': 'seguridad compra min / max', 'f.sellsec': 'seguridad venta min / max',
    'f.vol': 'volumen un. m³ min / max', 'f.price': 'precio un. (compra) min / max',
    'f.buyregion': 'región compra (texto)', 'f.buyregionPh': 'ej: Domain',
    'f.sellregion': 'región venta (texto)', 'f.sellregionPh': 'ej: The Forge',
    'f.topn': 'top N oportunidades', 'f.displaymax': 'mostrar como máximo',
    'f.group': 'agrupar por ítem+par', 'f.icons': 'iconos', 'f.preset': 'preset (JSON)',
    'preset.copy': 'copiar', 'preset.load': 'cargar', 'preset.clear': 'limpiar',
    'reg.orders': 'órdenes', 'reg.expires': 'expira', 'reg.active': 'activa',
    'reg.add': 'añadir región', 'reg.addPh': 'nombre o id de la región...', 'reg.clear': 'limpiar caché',
    'log.collecting': 'recolección ya en curso',
    'log.collect': 'recolección: {n} región(es){force}', 'log.force': ' [FORZAR]',
    'log.cache304': '{name}: 304 (caché válida)', 'log.orders': '{name}: {n} órdenes ({p} pág)',
    'log.error': 'ERROR {name}: {msg}',
    'log.done': 'recolección finalizada en {t}s — {ok} ok, {skipped} en caché, {errs} error(es)',
    'log.ready': 'listo. {types} tipos, {sys} sistemas cargados.',
    'log.rate': 'ESI {status}; esperando {s}s', 'log.workerErr': 'error del worker: {msg}',
    'log.calcErr': 'error de cálculo: {msg}', 'log.csv': 'CSV exportado ({n} filas)',
    'log.presetCopied': 'preset copiado', 'log.presetLoaded': 'preset cargado',
    'log.presetInvalid': 'JSON inválido: {msg}',
    'log.regionErr': 'región {id}', 'log.pageErr': 'región {id} pág {p}',
    'meta.cycle': '{orders} órdenes → {raw} pares → {cand} candidatos  ·  {ms} ms',
    'meta.filters': '{n} de {total} candidatos', 'countdown': 'próx. refresh en {s}s',
    'th.item': 'Ítem', 'th.roi': 'ROI', 'th.profitUnit': 'Beneficio/un', 'th.qty': 'Cant',
    'th.total': 'Total', 'th.ppj': 'PpJ', 'th.jumps': 'Saltos',
    'th.buySys': 'Compra sys', 'th.buyLoc': 'Compra local', 'th.buyPrice': 'Precio C', 'th.buyQty': 'Cant C',
    'th.sellSys': 'Venta sys', 'th.sellLoc': 'Venta local', 'th.sellPrice': 'Precio V', 'th.sellQty': 'Cant V',
    'th.m3': 'M3', 'th.c30k': 'C30k', 'th.c600': 'C600', 'th.c10': 'C10', 'th.hub': '→{name}',
    'modal.hist': 'Historial de precios (región de venta)', 'modal.loading': 'cargando…',
    'modal.days': '{n} días · últ. vol {vol}', 'modal.nodata': 'datos insuficientes',
    'modal.offline': 'historial no disponible ({msg})',
    'modal.meta': 'type_id {id} · {group} · volumen {vol} m³',
    'modal.roi': 'ROI', 'modal.profitUnit': 'Beneficio/un', 'modal.total': 'Total', 'modal.ppj': 'PpJ',
    'modal.jumps': 'Saltos', 'modal.buy': 'Compra', 'modal.sell': 'Venta', 'modal.sellLoc': 'Venta local',
    'legal.title': 'Sobre esta herramienta',
    'legal.badge1': 'no comercial', 'legal.badge2': 'client-side', 'legal.badge3': 'proyecto fan',
    'legal.intro': 'Herramienta de mercado y arbitraje cross-region para EVE Online. Usa la API pública (ESI) y el SDE estático oficial. No cobra nada, no tiene paywall y no restringe el acceso — según la política del desarrollador (Fenris Creations, ex-CCP Games) para Aplicaciones de terceros.',
    'legal.flowTitle': 'Cómo fluyen los datos',
    'legal.flow1': 'Tu navegador habla directamente con esi.evetech.net y images.evetech.net.',
    'legal.flow2': 'No existe servidor nuestro, base central, telemetría ni analytics.',
    'legal.flow3': 'Los datos recolectados quedan en tu IndexedDB; los ajustes, en tu localStorage.',
    'legal.flow4': 'Sin llamadas autenticadas, sin clave de API, sin SSO/login.',
    'legal.dataTitle': 'Fuentes de datos y endpoints',
    'legal.epEsiB': 'API pública, sin autenticación',
    'legal.epOrders': '— órdenes de mercado por región (paginación por X-Pages; caché por ETag/Expires)',
    'legal.epHistory': '— historial diario de precios (modal de detalle)',
    'legal.epNames': '— resuelve IDs→nombres (solo en el build del SDE)',
    'legal.epRate': '— límites leídos de los headers X-Ratelimit-*; backoff en 429 / Retry-After',
    'legal.epUa': '— identifica la app vía X-User-Agent (los navegadores descartan User-Agent):',
    'legal.epImgB': 'Imágenes',
    'legal.epImg': '— iconos de tipos servidos directo del servidor oficial',
    'legal.epSdeB': '(datos estáticos oficiales)',
    'legal.epSde': '— build descargado una vez por build/gen_sde.py y embebido en sde.js',
    'legal.epDotlanB': '(enlace externo, solo navegación)',
    'legal.lawTitle': 'Marco legal (resumen)',
    'legal.law1b': '— Aplicación no comercial (§1.13, §4.1); monetización solo en las formas del §4.4 (ISK, donación de hosting, anuncios generales).',
    'legal.law2b': '— sin modificar el cliente; el cache scraping está prohibido (EULA §9.C).',
    'legal.law3b': '— contenido gratuito, sin paywall; uso de marcas con aviso.',
    'legal.law4b': '— uso personal; sin automatizar el cliente.',
    'legal.law5b': '— los datos del ESI no son datos personales; no recolectamos nada (GDPR/LGPD).',
    'legal.citeTitle': 'Citas (fuentes oficiales)',
    'legal.citeUpd': 'actualizado el 18 May 2026',
    'legal.source': 'Código fuente:',
    'legal.official': 'Enlaces oficiales:',
    'legal.tmTitle': 'Aviso de marca',
    'legal.tm': 'EVE Online® y Fenris Creations™, y todos sus logotipos y elementos, son marcas de Fenris Creations. ©2026 Fenris Creations. Todos los derechos reservados. Esta herramienta es un proyecto fan no oficial, no afiliado ni respaldado por Fenris Creations (ex-CCP Games). Datos del juego © Fenris Creations.',
    'legal.disclaimer': 'Aviso exigido por los Content Creation Terms of Use: "This material is used with limited permission of CCP Games. No official affiliation or endorsement by CCP Games is stated or implied."',
    'footer.mid': 'proyecto fan · no oficial · no comercial',
    'footer.right': 'EVE Online © Fenris Creations. Datos vía ESI/SDE oficiales.',
  },
};

let LANG = (() => {
  const saved = localStorage.getItem('eveonline.lang');
  if (saved && LANGS.includes(saved)) return saved;
  const n = (navigator.language || 'pt').slice(0, 2).toLowerCase();
  return LANGS.includes(n) ? n : 'pt';
})();
let LOCALE = LANG === 'en' ? 'en-US' : LANG === 'es' ? 'es-ES' : 'pt-BR';

function t(key, vars) {
  const dict = I18N[LANG] || I18N.pt;
  let s = dict[key] != null ? dict[key] : (I18N.pt[key] != null ? I18N.pt[key] : key);
  if (vars) for (const k in vars) s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
  return s;
}

/* ------------------------------------------------------------------ */
/* Helpers SDE                                                         */
/* ------------------------------------------------------------------ */
function systemName(id) { const s = SYS[id]; return s ? s[0] : String(id); }
function systemSec(id) { const s = SYS[id]; return s ? s[1] : null; }
function systemRegion(id) { const s = SYS[id]; return s ? s[3] : null; }
function systemConst(id) { const s = SYS[id]; return s ? s[2] : null; }
function regionName(id) { return REGS[id] ? REGS[id][0] : String(id); }
function constName(id) { return id && CONSTS[id] ? CONSTS[id][0] : ''; }
function stationName(id) {
  if (id == null) return '';
  if (STAS[id]) return STAS[id];
  const s = String(id);
  return s.length > 9 ? 'Structure ' + s.slice(2, 8) : 'Station #' + s;
}
function stationSystem(id) { return STSYS[id] || null; }
function typeName(id) { const t = TYPES[id]; return t ? t[0] : String(id); }
function typeVol(id) { const t = TYPES[id]; return t ? (t[1] || 0) : 0; }
function typeGroup(id) { const t = TYPES[id]; return t ? t[2] : null; }
function groupName(id) { return GRPS[id] ? GRPS[id][0] : String(id); }
function catName(id) { return CATS[id] || String(id); }

/* ------------------------------------------------------------------ */
/* Helpers gerais                                                      */
/* ------------------------------------------------------------------ */
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return Array.from(document.querySelectorAll(sel)); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtIsk(v) {
  if (v == null || !isFinite(v)) return '';
  const a = Math.abs(v);
  if (a >= 1e12) return (v / 1e12).toFixed(2) + 'T';
  if (a >= 1e9)  return (v / 1e9).toFixed(2) + 'B';
  if (a >= 1e6)  return (v / 1e6).toFixed(2) + 'M';
  if (a >= 1e3)  return (v / 1e3).toFixed(2) + 'k';
  if (a >= 1)    return v.toFixed(2);
  if (a > 0)     return v.toFixed(4);
  return '0';
}
function fmtInt(v) { return v == null || !isFinite(v) ? '' : Math.round(v).toLocaleString(LOCALE); }
function fmtNum(v) { return v == null || !isFinite(v) ? '' : (Math.round(v * 100) / 100).toLocaleString(LOCALE); }
function debounce(fn, ms) { let t; return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); }; }
function download(name, text, mime) {
  const b = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
  const u = URL.createObjectURL(b), a = document.createElement('a');
  a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000);
}
function secColor(sec) {
  if (sec == null) return '#64748b';
  if (sec >= 0.5) return '#4ade80';
  if (sec > 0) return '#facc15';
  if (sec > -0.5) return '#fb923c';
  return '#f87171';
}
function log(...a) {
  const el = $('#collect-log'); if (!el) return;
  const line = new Date().toLocaleTimeString(LOCALE) + '  ' + a.join(' ');
  el.textContent = (line + '\n' + el.textContent).split('\n').slice(0, 200).join('\n');
}

/* ------------------------------------------------------------------ */
/* Estado + persistência                                               */
/* ------------------------------------------------------------------ */
const state = {
  regions: DEFAULT_REGIONS.slice(),
  candidates: [],
  filtered: [],
  sort: { key: 'total', dir: -1 },
  ship: 'c600',
  filters: {
    name: '', roiMin: 20, roiMax: '', ppjMin: '', jumps: '',
    buySecMin: '', buySecMax: '', sellSecMin: '', sellSecMax: '',
    m3Min: '', m3Max: '', priceMin: '', priceMax: '',
    buyRegion: '', sellRegion: '', group: false,
  },
  taxes: { buy: 0, sell: 7.5 },
  topN: 5000,
  displayMax: 1500,
  icons: true,
  whitelist: [],
  blacklist: [],
  stats: null,
  lastMs: 0,
};

function saveSettings() {
  try {
    localStorage.setItem('eveonline.settings', JSON.stringify({
      regions: state.regions, taxes: state.taxes, topN: state.topN,
      displayMax: state.displayMax, icons: state.icons,
      whitelist: state.whitelist, blacklist: state.blacklist,
      filters: state.filters, ship: state.ship,
    }));
  } catch (e) { /* ignora */ }
}
function loadSettings() {
  try {
    const raw = localStorage.getItem('eveonline.settings');
    if (!raw) return;
    const o = JSON.parse(raw);
    // migração: quem nunca customizou as regiões (os 5 hubs antigos) passa ao padrão novo
    const oldDefault = HUBS.map(h => h.regionId).join(',');
    const regions = (Array.isArray(o.regions) && o.regions.join(',') === oldDefault)
      ? DEFAULT_REGIONS.slice() : (o.regions || state.regions);
    Object.assign(state, {
      regions, taxes: o.taxes || state.taxes,
      topN: o.topN || state.topN, displayMax: o.displayMax || state.displayMax,
      icons: o.icons !== false, whitelist: o.whitelist || [], blacklist: o.blacklist || [],
      filters: Object.assign(state.filters, o.filters || {}), ship: o.ship || state.ship,
    });
  } catch (e) { /* ignora */ }
}

/* ------------------------------------------------------------------ */
/* IndexedDB (mesma origem do worker)                                  */
/* ------------------------------------------------------------------ */
let idb = null;
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'region_id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbPut(rec) {
  return new Promise((res, rej) => {
    const tx = idb.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
}
function idbGet(rid) {
  return new Promise((res, rej) => {
    const tx = idb.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).get(rid);
    r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error);
  });
}
function idbAll() {
  return new Promise((res, rej) => {
    const tx = idb.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).getAll();
    r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error);
  });
}
function idbDel(rid) {
  return new Promise((res, rej) => {
    const tx = idb.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(rid);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
}

/* ------------------------------------------------------------------ */
/* Cliente ESI (rate-limit aware)                                      */
/* ------------------------------------------------------------------ */
const RL = { group: '', limit: '', remaining: null, used: null };
let RL_LAST = 0;

function updateRL(headers) {
  const g = headers.get('X-Ratelimit-Group');
  const lim = headers.get('X-Ratelimit-Limit');
  const rem = headers.get('X-Ratelimit-Remaining');
  const used = headers.get('X-Ratelimit-Used');
  if (g) RL.group = g;
  if (lim) RL.limit = lim;
  if (rem != null) RL.remaining = +rem;
  if (used != null) RL.used = +used;
  RL_LAST = Date.now();
  renderRL();
}
function renderRL() {
  const el = $('#esi-pill'); if (!el) return;
  if (RL.remaining == null) { el.textContent = 'ESI —'; el.className = 'pill'; return; }
  const warn = RL.remaining < 500;
  el.textContent = `ESI ${RL.remaining}/${RL.limit || '?'} · ${RL.group || ''}`;
  el.className = 'pill' + (warn ? ' warn' : ' ok');
}

async function esiFetch(path, opts = {}) {
  const url = path.startsWith('http') ? path : ESI + path;
  const init = {
    method: opts.method || 'GET',
    // sempre identifica a aplicação (ESI Best Practices / User Agents)
    headers: Object.assign({ 'X-User-Agent': APP_UA }, opts.headers || {}),
    body: opts.body || undefined,
    signal: opts.signal || undefined,
    cache: 'no-store',
  };
  let attempt = 0;
  for (;;) {
    let r;
    try {
      r = await fetch(url, init);
    } catch (e) {
      if (attempt++ < 3) { await sleep(400 * attempt); continue; }
      throw e;
    }
    updateRL(r.headers);
    if (r.status === 429 || (r.status >= 500 && attempt < 3)) {
      const ra = parseInt(r.headers.get('Retry-After') || '0', 10);
      const wait = ra > 0 ? ra * 1000 : 500 * Math.pow(2, attempt);
      attempt++;
      if (attempt > 6) throw new Error('ESI ' + r.status + ' ' + url);
      log(t('log.rate', { status: r.status, s: (wait / 1000).toFixed(1) }));
      await sleep(wait);
      continue;
    }
    return r;
  }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ------------------------------------------------------------------ */
/* Coleta de regiões                                                   */
/* ------------------------------------------------------------------ */
function parseExpires(raw) {
  if (!raw) return 0;
  const t = Date.parse(raw);
  return isNaN(t) ? 0 : t;
}

async function fetchOrdersPage(regionId, page, headers) {
  const path = `/markets/${regionId}/orders/?order_type=all&datasource=tranquility&page=${page}`;
  const r = await esiFetch(path, { headers });
  return r;
}

async function collectRegion(regionId, force) {
  const prev = await idbGet(regionId);
  const h1 = {};
  if (!force && prev && prev.etag) h1['If-None-Match'] = prev.etag;
  const r1 = await fetchOrdersPage(regionId, 1, h1);
  if (r1.status === 304) return { regionId, skipped: true, count: (prev && prev.orders ? prev.orders.length : 0) };
  if (!r1.ok) throw new Error('ESI ' + r1.status + ' ' + t('log.regionErr', { id: regionId }));

  const pages = Math.max(1, parseInt(r1.headers.get('X-Pages') || '1', 10));
  const etag = r1.headers.get('ETag') || null;
  const expires = parseExpires(r1.headers.get('Expires')) || (Date.now() + 5 * 60 * 1000);

  const all = [];
  const add = (arr) => { for (const o of arr) all.push(normOrder(o)); };
  add(await r1.json());

  if (pages > 1) {
    let next = 2;
    const CONC = 12;
    const runners = Array.from({ length: Math.min(CONC, pages - 1) }, async () => {
      for (;;) {
        const p = next++;
        if (p > pages) break;
        const r = await fetchOrdersPage(regionId, p, {});
        if (!r.ok) throw new Error('ESI ' + r.status + ' ' + t('log.pageErr', { id: regionId, p }));
        add(await r.json());
      }
    });
    await Promise.all(runners);
  }

  await idbPut({ region_id: regionId, orders: all, etag, expires, fetched_at: Date.now(), pages });
  return { regionId, skipped: false, count: all.length, pages };
}
function normOrder(o) {
  return {
    type_id: o.type_id, price: o.price, volume_remain: o.volume_remain,
    is_buy_order: o.is_buy_order ? 1 : 0, system_id: o.system_id, location_id: o.location_id,
  };
}

let collecting = false;
async function collectAll(force) {
  if (collecting) { log(t('log.collecting')); return; }
  collecting = true;
  const btn = $('#btn-collect'), bf = $('#btn-force');
  if (btn) btn.disabled = true; if (bf) bf.disabled = true;
  const t0 = Date.now();
  const targets = state.regions.slice();
  log(t('log.collect', { n: targets.length, force: force ? t('log.force') : '' }));
  renderRegionGrid();
  let ok = 0, skipped = 0, errs = 0;
  try {
    const CONC = 3;
    let i = 0;
    const runners = Array.from({ length: Math.min(CONC, targets.length) }, async () => {
      for (;;) {
        const idx = i++;
        if (idx >= targets.length) break;
        const rid = targets[idx];
        setRegionStatus(rid, 'load');
        try {
          const res = await collectRegion(rid, force);
          if (res.skipped) { skipped++; setRegionStatus(rid, 'fresh'); log(t('log.cache304', { name: regionName(rid) })); }
          else { ok++; setRegionStatus(rid, 'ok'); log(t('log.orders', { name: regionName(rid), n: fmtInt(res.count), p: res.pages })); }
        } catch (e) {
          errs++; setRegionStatus(rid, 'err'); log(t('log.error', { name: regionName(rid), msg: e.message }));
        }
      }
    });
    await Promise.all(runners);
    log(t('log.done', { t: ((Date.now() - t0) / 1000).toFixed(1), ok, skipped, errs }));
  } finally {
    collecting = false;
    if (btn) btn.disabled = false; if (bf) bf.disabled = false;
    renderRegionGrid();
    scheduleNextRefresh();
    recalc();
  }
}

/* agenda refresh suave ao expirar a região mais próxima */
let refreshTimer = null;
function scheduleNextRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  idbAll().then(recs => {
    const now = Date.now();
    const exps = recs.map(r => r.expires).filter(Boolean);
    if (!exps.length) return;
    const next = Math.min(...exps);
    const wait = Math.max(60000, next - now + 3000);
    const el = $('#esi-countdown');
    if (el) el.textContent = t('countdown', { s: Math.round(wait / 1000) });
    refreshTimer = setTimeout(() => { collectAll(false); }, wait);
  });
}

/* ------------------------------------------------------------------ */
/* Cálculo (via worker)                                                */
/* ------------------------------------------------------------------ */
let worker = null, seq = 0, pending = new Map();
function initWorker() {
  worker = new Worker('worker.js');
  worker.onmessage = (e) => {
    const d = e.data;
    const cb = pending.get(d.seq);
    if (cb) { pending.delete(d.seq); cb(d); }
  };
  worker.onerror = (e) => log(t('log.workerErr', { msg: e.message }));
}
function callWorker(kind, params) {
  return new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    worker.postMessage({ seq: id, kind, params });
  });
}

function workerParams() {
  return {
    taxBuy: (state.taxes.buy || 0) / 100,
    taxSell: (state.taxes.sell || 0) / 100,
    perSideK: 10,
    topN: state.topN,
    maxJumps: 999,
    hubs: HUBS.map(h => ({ key: h.key, systemId: h.systemId })),
    regions: state.regions,
    types: state.whitelist.length ? state.whitelist : null,
    typesDeny: state.blacklist.length ? state.blacklist : null,
  };
}

async function recalc() {
  const d = await callWorker('candidates', workerParams());
  if (!d.ok) { log(t('log.calcErr', { msg: d.msg })); return; }
  state.candidates = d.candidates;
  state.stats = d.stats;
  state.lastMs = d.ms;
  renderCycleMeta();
  applyFilters();
}

function renderCycleMeta() {
  const el = $('#cycle-meta'); if (!el) return;
  const st = state.stats;
  if (!st) { el.textContent = ''; return; }
  el.textContent = t('meta.cycle', {
    orders: fmtInt(st.orders), raw: fmtInt(st.raw),
    cand: fmtInt(state.candidates.length), ms: state.lastMs || '',
  });
}

/* ------------------------------------------------------------------ */
/* Filtros                                                             */
/* ------------------------------------------------------------------ */
function numOrNull(v) { const n = parseFloat(v); return isFinite(n) ? n : null; }
function applyFilters() {
  const f = state.filters;
  const name = (f.name || '').trim().toLowerCase();
  const roiMin = numOrNull(f.roiMin), roiMax = numOrNull(f.roiMax);
  const ppjMin = numOrNull(f.ppjMin), jumps = numOrNull(f.jumps);
  const bSMin = numOrNull(f.buySecMin), bSMax = numOrNull(f.buySecMax);
  const sSMin = numOrNull(f.sellSecMin), sSMax = numOrNull(f.sellSecMax);
  const m3Min = numOrNull(f.m3Min), m3Max = numOrNull(f.m3Max);
  const pMin = numOrNull(f.priceMin), pMax = numOrNull(f.priceMax);
  const bReg = (f.buyRegion || '').trim().toLowerCase();
  const sReg = (f.sellRegion || '').trim().toLowerCase();
  const key = state.ship;
  const group = f.group;

  let rows = state.candidates.filter(r => {
    if (name && r.type_name.toLowerCase().indexOf(name) < 0) return false;
    if (roiMin != null && r.roi * 100 < roiMin) return false;
    if (roiMax != null && r.roi * 100 > roiMax) return false;
    if (ppjMin != null && r.ppj < ppjMin) return false;
    if (jumps != null && r.jumps > jumps) return false;
    if (bSMin != null && (r.buy_sec == null || r.buy_sec < bSMin)) return false;
    if (bSMax != null && (r.buy_sec == null || r.buy_sec > bSMax)) return false;
    if (sSMin != null && (r.sell_sec == null || r.sell_sec < sSMin)) return false;
    if (sSMax != null && (r.sell_sec == null || r.sell_sec > sSMax)) return false;
    if (m3Min != null && r.vol < m3Min) return false;
    if (m3Max != null && r.vol > m3Max) return false;
    if (pMin != null && r.buy_price < pMin) return false;
    if (pMax != null && r.buy_price > pMax) return false;
    if (bReg && r.buy_region.toLowerCase().indexOf(bReg) < 0) return false;
    if (sReg && r.sell_region.toLowerCase().indexOf(sReg) < 0) return false;
    if (key && r[key] <= 0) return false;
    return true;
  });

  if (group) {
    const seen = new Map();
    for (const r of rows) {
      const k = r.type_id + '|' + r.buy_sys + '|' + r.sell_sys;
      const prev = seen.get(k);
      if (!prev) { seen.set(k, r); continue; }
      if ((r[key] || 0) > (prev[key] || 0)) seen.set(k, r);
    }
    rows = Array.from(seen.values());
  }

  const { key: sk, dir } = state.sort;
  rows.sort((a, b) => {
    const va = colVal(a, sk), vb = colVal(b, sk);
    if (typeof va === 'string' || typeof vb === 'string') return dir * String(va).localeCompare(String(vb));
    return dir * ((va || 0) - (vb || 0));
  });

  state.filtered = rows;
  renderTable();
  const info = $('#filters-info');
  if (info) info.textContent = t('meta.filters', { n: fmtInt(rows.length), total: fmtInt(state.candidates.length) });
}
const applyFiltersDebounced = debounce(applyFilters, 200);

function colVal(r, k) {
  if (k.indexOf('hub_') === 0) { const hk = k.slice(4); return (r.hub && r.hub[hk] != null) ? r.hub[hk] : 999; }
  return r[k];
}

/* ------------------------------------------------------------------ */
/* Tabela                                                              */
/* ------------------------------------------------------------------ */
const BASE_COLS = [
  { k: 'type_name', lk: 'th.item' },
  { k: 'roi', lk: 'th.roi', num: 1, f: v => (v * 100).toFixed(1) + '%' },
  { k: 'net', lk: 'th.profitUnit', num: 1, f: fmtIsk },
  { k: 'qty', lk: 'th.qty', num: 1, f: fmtInt },
  { k: 'total', lk: 'th.total', num: 1, f: fmtIsk },
  { k: 'ppj', lk: 'th.ppj', num: 1, f: fmtIsk },
  { k: 'jumps', lk: 'th.jumps', num: 1, f: fmtInt },
  { k: 'buy_sys_name', lk: 'th.buySys' },
  { k: 'buy_loc_name', lk: 'th.buyLoc' },
  { k: 'buy_price', lk: 'th.buyPrice', num: 1, f: fmtIsk },
  { k: 'buy_qty', lk: 'th.buyQty', num: 1, f: fmtInt },
  { k: 'sell_sys_name', lk: 'th.sellSys' },
  { k: 'sell_loc_name', lk: 'th.sellLoc' },
  { k: 'sell_price', lk: 'th.sellPrice', num: 1, f: fmtIsk },
  { k: 'sell_qty', lk: 'th.sellQty', num: 1, f: fmtInt },
  { k: 'm3', lk: 'th.m3', num: 1, f: fmtNum },
  { k: 'c30k', lk: 'th.c30k', num: 1, f: fmtIsk },
  { k: 'c600', lk: 'th.c600', num: 1, f: fmtIsk },
  { k: 'c10', lk: 'th.c10', num: 1, f: fmtIsk },
];
const COLS = BASE_COLS.concat(HUBS.map(h => ({ k: 'hub_' + h.key, lk: 'th.hub', hub: h.name, num: 1, f: fmtInt })));
function colLabel(c) { return c.hub ? t('th.hub', { name: c.hub }) : t(c.lk); }

function renderHead() {
  const tr = $('#tbl-head'); if (!tr) return;
  tr.innerHTML = COLS.map(c => {
    const s = state.sort.key === c.k ? (state.sort.dir < 0 ? ' s-desc' : ' s-asc') : '';
    return `<th data-k="${c.k}" class="${c.num ? 'num' : ''}${s}">${esc(colLabel(c))}</th>`;
  }).join('');
  tr.querySelectorAll('th').forEach(th => th.addEventListener('click', () => {
    const k = th.dataset.k;
    if (state.sort.key === k) state.sort.dir *= -1; else { state.sort.key = k; state.sort.dir = -1; }
    renderHead(); applyFilters();
  }));
}

function cellHtml(c, r) {
  switch (c.k) {
    case 'type_name':
      return `<td class="item">${state.icons ? `<img class="ico" loading="lazy" src="${IMG}/types/${r.type_id}/icon?size=32" alt="">` : ''}<span class="iname">${esc(r.type_name)}</span></td>`;
    case 'roi':
      return `<td class="num roi">${(r.roi * 100).toFixed(1)}%</td>`;
    case 'buy_sys_name':
      return `<td>${esc(r.buy_sys_name)} <span class="sec" style="background:${secColor(r.buy_sec)}"></span></td>`;
    case 'sell_sys_name':
      return `<td>${esc(r.sell_sys_name)} <span class="sec" style="background:${secColor(r.sell_sec)}"></span></td>`;
    case 'buy_loc_name': case 'sell_loc_name':
      return `<td class="loc">${esc(r[c.k])}</td>`;
    default: {
      const v = colVal(r, c.k);
      const hl = (c.k === state.ship) ? ' hl' : '';
      return `<td class="num${hl}">${c.f ? c.f(v) : esc(v)}</td>`;
    }
  }
}

function renderTable() {
  const body = $('#tbl-body'); if (!body) return;
  const rows = state.filtered.slice(0, state.displayMax);
  body.innerHTML = rows.map((r, i) => `<tr data-i="${i}">${COLS.map(c => cellHtml(c, r)).join('')}</tr>`).join('');
  body.querySelectorAll('tr').forEach(tr => tr.addEventListener('click', () => {
    const r = rows[+tr.dataset.i]; if (r) openDetail(r);
  }));
  syncHScroll();
}

/* slider horizontal: rola a tabela p/ ver as colunas fora da tela */
function syncHScroll() {
  const tw = $('.tablewrap'), bar = $('#hslide'), rng = $('#hslide-range');
  if (!tw || !bar || !rng) return;
  const max = tw.scrollWidth - tw.clientWidth;
  if (max > 4) {
    bar.classList.add('on');
    rng.max = String(max);
    rng.value = String(Math.max(0, Math.min(tw.scrollLeft, max)));
  } else {
    bar.classList.remove('on');
    rng.value = '0';
  }
}
function bindHScroll() {
  const tw = $('.tablewrap'), rng = $('#hslide-range');
  if (!tw || !rng) return;
  rng.addEventListener('input', () => { tw.scrollLeft = +rng.value; });
  tw.addEventListener('scroll', () => {
    if (document.activeElement !== rng) rng.value = String(tw.scrollLeft);
  }, { passive: true });
  window.addEventListener('resize', syncHScroll);
  syncHScroll();
}

function exportCSV() {
  const cols = ['type_id', 'type_name', 'roi', 'net', 'qty', 'total', 'ppj', 'jumps',
    'buy_sys_name', 'buy_loc_name', 'buy_region', 'buy_sec', 'buy_price', 'buy_qty',
    'sell_sys_name', 'sell_loc_name', 'sell_region', 'sell_sec', 'sell_price', 'sell_qty',
    'vol', 'm3', 'c30k', 'c600', 'c10'];
  const lines = [cols.join(',')];
  for (const r of state.filtered) {
    lines.push(cols.map(c => {
      let v = r[c];
      if (c === 'roi') v = (r.roi * 100).toFixed(2);
      if (typeof v === 'string' && v.indexOf(',') >= 0) v = '"' + v.replace(/"/g, '""') + '"';
      return v == null ? '' : v;
    }).join(','));
  }
  download('eveonline-oportunidades.csv', lines.join('\n'), 'text/csv;charset=utf-8');
  log(t('log.csv', { n: fmtInt(state.filtered.length) }));
}

/* ------------------------------------------------------------------ */
/* Detalhe + histórico                                                 */
/* ------------------------------------------------------------------ */
async function openDetail(r) {
  const m = $('#modal'); if (!m) return;
  m.classList.add('open');
  $('#modal-body').innerHTML = `<div class="mhead">
      <img src="${IMG}/types/${r.type_id}/icon?size=64" alt="">
      <div><h3>${esc(r.type_name)}</h3>
      <div class="meta">${esc(t('modal.meta', { id: r.type_id, group: groupName(typeGroup(r.type_id)), vol: fmtNum(r.vol) }))}</div></div></div>
    <div class="mgrid">
      <div><b>${esc(t('modal.roi'))}</b><span>${(r.roi * 100).toFixed(1)}%</span></div>
      <div><b>${esc(t('modal.profitUnit'))}</b><span>${fmtIsk(r.net)}</span></div>
      <div><b>${esc(t('modal.total'))}</b><span>${fmtIsk(r.total)}</span></div>
      <div><b>${esc(t('modal.ppj'))}</b><span>${fmtIsk(r.ppj)}</span></div>
      <div><b>${esc(t('modal.jumps'))}</b><span>${r.jumps}</span></div>
      <div><b>${esc(t('modal.buy'))}</b><span>${esc(r.buy_sys_name)} · ${fmtIsk(r.buy_price)}</span></div>
      <div><b>${esc(t('modal.sell'))}</b><span>${esc(r.sell_sys_name)} · ${fmtIsk(r.sell_price)}</span></div>
      <div><b>${esc(t('modal.sellLoc'))}</b><span>${esc(r.sell_loc_name)}</span></div>
    </div>
    <div class="mhist"><b>${esc(t('modal.hist'))}</b><div id="hist-box" class="meta">${esc(t('modal.loading'))}</div></div>`;
  const box = $('#hist-box');
  try {
    const rid = systemRegion(r.sell_sys);
    const res = await esiFetch(`/markets/${rid}/history/?type_id=${r.type_id}&datasource=tranquility`);
    if (!res.ok) throw new Error('ESI ' + res.status);
    const hist = await res.json();
    box.innerHTML = sparkline(hist) + `<div class="meta">${esc(t('modal.days', { n: hist.length, vol: fmtInt(hist.length ? hist[hist.length - 1].volume : 0) }))}</div>`;
  } catch (e) {
    box.innerHTML = `<span class="err">${esc(t('modal.offline', { msg: e.message }))}</span>`;
  }
}
function sparkline(hist) {
  const pts = hist.slice(-60).map(d => d.average || d.highest || 0).filter(v => v > 0);
  if (pts.length < 2) return `<div class="meta">${esc(t('modal.nodata'))}</div>`;
  const min = Math.min(...pts), max = Math.max(...pts), W = 560, H = 70;
  const path = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * W;
    const y = H - ((v - min) / ((max - min) || 1)) * H;
    return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
  }).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" class="spark"><path d="${path}" fill="none" stroke="#38bdf8" stroke-width="1.5"/></svg>`;
}

/* ------------------------------------------------------------------ */
/* Árvore de mercado                                                   */
/* ------------------------------------------------------------------ */
const MG_CHILD = {}, MG_TYPES = {}, ROOT_MG = [];
let TYPES_LIST = [];
function buildMarketIndex() {
  for (const [id, mg] of Object.entries(MGS)) {
    const parent = mg[1];
    if (parent == null) ROOT_MG.push(+id);
    else (MG_CHILD[parent] = MG_CHILD[parent] || []).push(+id);
  }
  for (const [tid, t] of Object.entries(TYPES)) {
    const mg = t[3];
    if (mg != null) (MG_TYPES[mg] = MG_TYPES[mg] || []).push(+tid);
    TYPES_LIST.push([+tid, t[0]]);
  }
  TYPES_LIST.sort((a, b) => a[1].localeCompare(b[1]));
  ROOT_MG.sort((a, b) => (MGS[a][0] || '').localeCompare(MGS[b][0] || ''));
}

function renderMarketTree() {
  const el = $('#mg-tree'); if (!el) return;
  el.innerHTML = ROOT_MG.map(id => mgNodeHtml(id, 0)).join('');
  el.querySelectorAll('.mg-h').forEach(h => h.addEventListener('click', () => h.parentElement.classList.toggle('open')));
  el.querySelectorAll('.act-add').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); addTag(+b.dataset.t, 'wl'); }));
  el.querySelectorAll('.act-rem').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); addTag(+b.dataset.t, 'bl'); }));
  el.querySelectorAll('.it-name').forEach(n => n.addEventListener('click', e => { e.stopPropagation(); focusType(+n.dataset.t); }));
}
function mgNodeHtml(id, depth) {
  const mg = MGS[id]; if (!mg) return '';
  const kids = MG_CHILD[id] || [];
  const types = MG_TYPES[id] || [];
  if (!kids.length && !types.length) return '';
  const inner = kids.map(k => mgNodeHtml(k, depth + 1)).join('') +
    types.map(t => `<div class="it" title="type_id ${t}"><span class="it-name" data-t="${t}">${esc(typeName(t))}</span>
      <span class="tree-acts"><button class="act-add" data-t="${t}" title="whitelist">+</button>
      <button class="act-rem" data-t="${t}" title="blacklist">−</button></span></div>`).join('');
  return `<div class="mg" data-mg="${id}"><div class="mg-h"><span class="car">▸</span>${esc(mg[0])}</div><div class="mg-kids">${inner}</div></div>`;
}
function focusType(t) {
  const f = $('#f-name'); if (f) { f.value = typeName(t); state.filters.name = typeName(t); applyFilters(); }
}

function searchTypes(q) {
  q = (q || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const out = [];
  for (const [id, name] of TYPES_LIST) {
    if (name.toLowerCase().indexOf(q) >= 0) { out.push([id, name]); if (out.length >= 25) break; }
  }
  return out;
}

/* tags whitelist/blacklist */
function addTag(tid, which) {
  const arr = which === 'wl' ? state.whitelist : state.blacklist;
  if (!arr.includes(tid)) arr.push(tid);
  if (which === 'wl') state.blacklist = state.blacklist.filter(x => x !== tid);
  else state.whitelist = state.whitelist.filter(x => x !== tid);
  renderTags(); saveSettings(); recalc();
}
function removeTag(tid, which) {
  if (which === 'wl') state.whitelist = state.whitelist.filter(x => x !== tid);
  else state.blacklist = state.blacklist.filter(x => x !== tid);
  renderTags(); saveSettings(); recalc();
}
function renderTags() {
  const wl = $('#wl-tags'), bl = $('#bl-tags');
  if (wl) wl.innerHTML = state.whitelist.map(t => `<span class="tag tag-add">${esc(typeName(t))}<span class="x" data-t="${t}" data-w="wl">×</span></span>`).join('');
  if (bl) bl.innerHTML = state.blacklist.map(t => `<span class="tag tag-rem">${esc(typeName(t))}<span class="x" data-t="${t}" data-w="bl">×</span></span>`).join('');
  document.querySelectorAll('.tag .x').forEach(x => x.addEventListener('click', () => removeTag(+x.dataset.t, x.dataset.w)));
}

/* ------------------------------------------------------------------ */
/* Grid de regiões                                                     */
/* ------------------------------------------------------------------ */
const REG_STATUS = {};
function setRegionStatus(rid, st) { REG_STATUS[rid] = st; renderRegionGrid(); }
function renderRegionGrid() {
  const el = $('#region-grid'); if (!el) return;
  el.innerHTML = state.regions.map(rid => {
    const st = REG_STATUS[rid] || 'idle';
    const rec = REG_CACHE[rid];
    const n = rec ? fmtInt(rec.orders.length) : '—';
    const exp = rec && rec.expires ? Math.max(0, Math.round((rec.expires - Date.now()) / 1000)) : null;
    const cls = st === 'ok' ? 'ok' : st === 'err' ? 'err' : st === 'load' ? 'load' : '';
    const icon = st === 'ok' ? '●' : st === 'err' ? '✖' : st === 'load' ? '◌' : '○';
    return `<div class="card ${cls}">
      <div class="reg-head"><h3>${esc(regionName(rid))}</h3>
      <span class="st">${icon}</span>
      <button class="mini" data-del="${rid}" title="${esc(t('reg.clear'))}">🗑</button></div>
      <div class="stat"><span>${esc(t('reg.orders'))}</span><b>${n}</b></div>
      <div class="stat"><span>${esc(t('reg.expires'))}</span><b>${exp == null ? '—' : exp + 's'}</b></div>
      <label class="row"><input type="checkbox" data-rid="${rid}" ${state.regions.includes(rid) ? 'checked' : ''}> <span class="meta">${esc(t('reg.active'))}</span></label>
    </div>`;
  }).join('') + `<div class="card add"><label class="meta">${esc(t('reg.add'))}</label>
      <input type="text" id="reg-add" placeholder="${esc(t('reg.addPh'))}">
      <div id="reg-sugg" class="sugg"></div></div>`;
  el.querySelectorAll('button[data-del]').forEach(b => b.addEventListener('click', async () => {
    await idbDel(+b.dataset.del); delete REG_CACHE[+b.dataset.del]; renderRegionGrid(); recalc();
  }));
  el.querySelectorAll('input[data-rid]').forEach(cb => cb.addEventListener('change', () => {
    const rid = +cb.dataset.rid;
    if (cb.checked) { if (!state.regions.includes(rid)) state.regions.push(rid); }
    else state.regions = state.regions.filter(x => x !== rid);
    saveSettings();
  }));
  const ra = $('#reg-add');
  if (ra) ra.addEventListener('input', () => {
    const q = ra.value.trim().toLowerCase();
    const box = $('#reg-sugg');
    if (q.length < 2) { box.innerHTML = ''; return; }
    const hits = [];
    for (const [id, r] of Object.entries(REGS)) {
      if (r[1]) continue; // ignora wormhole
      if (r[0].toLowerCase().indexOf(q) >= 0 || String(id).indexOf(q) >= 0) { hits.push([+id, r[0]]); if (hits.length >= 12) break; }
    }
    box.innerHTML = hits.map(([id, name]) => `<div class="sugg-i" data-rid="${id}">${esc(name)} <span class="meta">${id}</span></div>`).join('');
    box.querySelectorAll('.sugg-i').forEach(x => x.addEventListener('click', () => {
      const rid = +x.dataset.rid;
      if (!state.regions.includes(rid)) state.regions.push(rid);
      saveSettings(); renderRegionGrid(); ra.value = '';
    }));
  });
}

let REG_CACHE = {};
async function loadRegionCache() {
  const recs = await idbAll();
  REG_CACHE = {};
  for (const r of recs) REG_CACHE[r.region_id] = r;
}

/* ------------------------------------------------------------------ */
/* Presets                                                             */
/* ------------------------------------------------------------------ */
function presetState() {
  return {
    regions: state.regions, taxes: state.taxes, topN: state.topN, ship: state.ship,
    filters: state.filters, whitelist: state.whitelist, blacklist: state.blacklist,
  };
}
function loadPresetObj(o) {
  if (o.regions) state.regions = o.regions;
  if (o.taxes) state.taxes = o.taxes;
  if (o.topN) state.topN = o.topN;
  if (o.ship) state.ship = o.ship;
  if (o.filters) state.filters = Object.assign(state.filters, o.filters);
  if (o.whitelist) state.whitelist = o.whitelist;
  if (o.blacklist) state.blacklist = o.blacklist;
  syncFiltersToUI(); renderTags(); renderRegionGrid(); saveSettings(); recalc();
}
function syncFiltersToUI() {
  const f = state.filters;
  const set = (id, v) => { const el = $('#' + id); if (el) el.value = v == null ? '' : v; };
  set('f-name', f.name); set('f-roimin', f.roiMin); set('f-roimax', f.roiMax);
  set('f-ppjmin', f.ppjMin); set('f-jumps', f.jumps);
  set('f-buysecmin', f.buySecMin); set('f-buysecmax', f.buySecMax);
  set('f-sellsecmin', f.sellSecMin); set('f-sellsecmax', f.sellSecMax);
  set('f-m3min', f.m3Min); set('f-m3max', f.m3Max);
  set('f-pricemin', f.priceMin); set('f-pricemax', f.priceMax);
  set('f-buyregion', f.buyRegion); set('f-sellregion', f.sellRegion);
  set('f-taxbuy', state.taxes.buy); set('f-taxsell', state.taxes.sell);
  set('f-topn', state.topN); set('f-displaymax', state.displayMax);
  const g = $('#f-group'); if (g) g.checked = !!f.group;
}

/* ------------------------------------------------------------------ */
/* Abas                                                                */
/* ------------------------------------------------------------------ */
function initTabs() {
  $$('.tab-btn').forEach(b => b.addEventListener('click', () => {
    $$('.tab-btn').forEach(x => x.classList.toggle('active', x === b));
    $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
  }));
}

/* ------------------------------------------------------------------ */
/* Bind de UI                                                          */
/* ------------------------------------------------------------------ */
function bindUI() {
  $('#btn-collect').addEventListener('click', () => collectAll(false));
  $('#btn-force').addEventListener('click', () => collectAll(true));
  $('#btn-export').addEventListener('click', exportCSV);
  $('#modal-close').addEventListener('click', () => $('#modal').classList.remove('open'));
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') $('#modal').classList.remove('open'); });

  const bind = (id, path, extra) => {
    const el = $('#' + id); if (!el) return;
    const upd = () => {
      let v = el.value;
      if (el.type === 'checkbox') v = el.checked;
      let target = state.filters, key = path;
      if (path.indexOf('.') > 0) { const [a, b] = path.split('.'); target = state[a]; key = b; }
      target[key] = v;
      saveSettings();
      (extra || applyFiltersDebounced)();
    };
    el.addEventListener('input', upd);
    el.addEventListener('change', upd);
  };
  bind('f-name', 'name'); bind('f-roimin', 'roiMin'); bind('f-roimax', 'roiMax');
  bind('f-ppjmin', 'ppjMin'); bind('f-jumps', 'jumps');
  bind('f-buysecmin', 'buySecMin'); bind('f-buysecmax', 'buySecMax');
  bind('f-sellsecmin', 'sellSecMin'); bind('f-sellsecmax', 'sellSecMax');
  bind('f-m3min', 'm3Min'); bind('f-m3max', 'm3Max');
  bind('f-pricemin', 'priceMin'); bind('f-pricemax', 'priceMax');
  bind('f-buyregion', 'buyRegion'); bind('f-sellregion', 'sellRegion');
  bind('f-group', 'group');
  bind('f-taxbuy', 'taxes.buy', recalc); bind('f-taxsell', 'taxes.sell', recalc);
  bind('f-topn', 'topN', recalc); bind('f-displaymax', 'displayMax', applyFilters);
  const ic = $('#f-icons'); if (ic) { ic.checked = state.icons; ic.addEventListener('change', () => { state.icons = ic.checked; saveSettings(); applyFilters(); }); }

  $$('.ship-btn').forEach(b => b.addEventListener('click', () => {
    state.ship = b.dataset.ship; saveSettings();
    $$('.ship-btn').forEach(x => x.classList.toggle('active', x === b));
    // ao escolher a nave, ordena pela coluna de capacidade correspondente, decrescente (C10/C600/C30k)
    state.sort.key = b.dataset.ship; state.sort.dir = -1;
    renderHead();
    applyFilters();
  }));

  /* preset */
  $('#btn-preset-copy').addEventListener('click', () => {
    const s = JSON.stringify(presetState(), null, 0);
    $('#preset-json').value = s;
    navigator.clipboard && navigator.clipboard.writeText(s);
    log(t('log.presetCopied'));
  });
  $('#btn-preset-load').addEventListener('click', () => {
    try { loadPresetObj(JSON.parse($('#preset-json').value)); log(t('log.presetLoaded')); }
    catch (e) { alert(t('log.presetInvalid', { msg: e.message })); }
  });
  $('#btn-preset-clear').addEventListener('click', () => { $('#preset-json').value = ''; });
  $('#preset-json').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#btn-preset-load').click(); }
  });

  /* item search (filtro rápido por nome) */
  const is = $('#mg-search');
  if (is) is.addEventListener('input', debounce(() => {
    const res = searchTypes(is.value);
    const box = $('#mg-results');
    box.innerHTML = res.map(([id, name]) => `<div class="sugg-i">${esc(name)}
      <span class="tree-acts"><button class="act-add" data-t="${id}">+</button><button class="act-rem" data-t="${id}">−</button></span></div>`).join('');
    box.querySelectorAll('.act-add').forEach(b => b.addEventListener('click', () => addTag(+b.dataset.t, 'wl')));
    box.querySelectorAll('.act-rem').forEach(b => b.addEventListener('click', () => addTag(+b.dataset.t, 'bl')));
  }, 180));

  /* switch Mercado / Filtros (coluna esquerda) */
  $$('.side-btn').forEach(b => b.addEventListener('click', () => {
    $$('.side-btn').forEach(x => x.classList.toggle('active', x === b));
    $$('.side-pane').forEach(p => p.classList.toggle('active', p.id === 'side-' + b.dataset.side));
  }));

  /* idioma (bandeiras) */
  $$('.lang-btn').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
}

/* ------------------------------------------------------------------ */
/* Idioma                                                              */
/* ------------------------------------------------------------------ */
function setLang(l) {
  if (!LANGS.includes(l)) return;
  LANG = l;
  localStorage.setItem('eveonline.lang', l);
  applyLang();
}
function applyLang() {
  LOCALE = LANG === 'en' ? 'en-US' : LANG === 'es' ? 'es-ES' : 'pt-BR';
  document.documentElement.lang = LANG === 'pt' ? 'pt-BR' : LANG;
  $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  $$('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  $$('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === LANG));
  renderHead();
  renderRegionGrid();
  renderTags();
  renderCycleMeta();
  applyFilters();
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */
async function boot() {
  buildMarketIndex();
  loadSettings();
  idb = await openDB();
  await loadRegionCache();
  initWorker();
  initTabs();
  bindUI();
  bindHScroll();
  syncFiltersToUI();
  renderTags();
  renderHead();
  renderMarketTree();
  renderRegionGrid();
  renderRL();
  $$('.ship-btn').forEach(x => x.classList.toggle('active', x.dataset.ship === state.ship));
  const ver = $('#sde-ver');
  if (ver) ver.textContent = 'SDE build ' + S.build + ' · ' + (S.release || '').slice(0, 10);
  applyLang();
  log(t('log.ready', { types: fmtInt(Object.keys(TYPES).length), sys: fmtInt(Object.keys(SYS).length) }));

  if (state.candidates.length === 0 && Object.keys(REG_CACHE).length) recalc();
  scheduleNextRefresh();

  // handle de depuração/power-user (console do navegador)
  window.EVE = { state, HUBS, recalc, collectAll, applyFilters, saveSettings, setLang, applyLang, t, S };
}
document.addEventListener('DOMContentLoaded', boot);
