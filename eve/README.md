# EVE Market

Ferramenta de **mercado e arbitragem cross-region** para **EVE Online** — 100%
**client-side** (HTML+JS), **sem servidor**, **sem custo** e **grátis**.

O navegador fala direto com a **ESI** e usa o **SDE** oficial; o cálculo roda em um
**Web Worker** e os dados ficam no **IndexedDB** do próprio usuário. Não existe backend,
banco central, telemetria, analytics **nem login/SSO**.

> **Projeto não-oficial de fã.** EVE Online® e Fenris Creations™ são marcas da **Fenris
> Creations** (empresa que operava como **CCP Games** até maio/2026). Não afiliado nem
> endossado. Links oficiais na aba **Legal** do app.

**Código-fonte:** https://github.com/AjaxFB/AjaxFB.github.io

---

## Funcionalidades

- **Arbitragem cross-region**: comprar em A, vender em B, com impostos, ROI, lucro total,
  **lucro por salto (PpJ)** e distância aos hubs (Jita/Amarr/Dodixie/Hek/Exordium).
- **Regiões padrão**: The Forge, Domain, Sinq Laison e Exordium — e dá para
  adicionar outras por nome ou ID (ex.: Metropolis).
- **Presets de carga**: Shuttle (10 m³), Frigate (600 m³), Hauler (30.000 m³). Ao escolher a
  nave, a tabela passa a ordenar pela coluna de capacidade correspondente (C10/C600/C30k),
  em ordem **decrescente**.
- **Árvore de mercado** (market groups), whitelist/blacklist, filtros por ROI, PpJ, saltos,
  segurança, volume, preço e região.
- **Detalhe do item** com **histórico de preço** (sparkline) via ESI.
- **Export CSV** e **presets JSON** compartilháveis.
- **Interface em 3 idiomas** (PT / EN / ES), com troca por bandeira.
- **Coleta eficiente**: paginação (`X-Pages`), cache por `ETag` (304), respeito a
  `Retry-After` e monitoramento de rate limit.
- **Tabela larga** com rolagem horizontal — barra de rolagem **e um slider** para
  deslizar e ver as colunas que ficam fora da tela — e a coluna de item fixa.

---

## Como rodar

A ferramenta precisa de uma origem **http(s)** (Worker + IndexedDB não funcionam em
`file://`).

```bash
cd eveonline
python3 -m http.server 8080
# abra http://localhost:8080/
```

Ou use qualquer servidor estático (`npx serve`, Cloudflare Pages, GitHub Pages, etc.).

### Deploy (grátis)

- **GitHub Pages**: publique a pasta `eveonline/` (o `sde.js` já vem gerado).
- **Cloudflare Pages**: aponte para a pasta; build command vazio.

---

## Gerar/atualizar o SDE

O `sde.js` (bundle do universo: tipos, sistemas, portais, regiões, estações) é **gerado** a
partir do **SDE oficial** da Fenris Creations. O script faz **download, extração e geração**
sozinho:

```bash
python3 build/gen_sde.py                 # baixa o build mais recente e gera sde.js
python3 build/gen_sde.py --sde-zip X.zip # usa um zip local
python3 build/gen_sde.py --no-names      # não resolve nomes de estação via ESI
```

Requer só **Python 3** (stdlib). Ele:

1. lê `https://developers.eveonline.com/static-data/tranquility/latest.jsonl`;
2. baixa `eve-online-static-data-<build>-jsonl.zip` (~99 MB, cacheado em `build/cache/`);
3. streama os `.jsonl` necessários **sem** descompactar tudo em disco;
4. resolve nomes de estações via ESI `/universe/names/` (público);
5. escreve `sde.js` (~2,7 MB).

---

## Estrutura

```
eveonline/
├── index.html          # shell + UI (CSS, abas, idiomas, legal)
├── app.js              # engine: ESI, IndexedDB, filtros, tabela, i18n
├── worker.js           # cálculo de arbitragem (Web Worker)
├── sde.js              # bundle do universo (GERADO — não editar)
├── build/
│   └── gen_sde.py      # baixa/extrai/gera o SDE
├── LICENSE             # licença do código (não substitui o DLA)
└── README.md
```

---

## Fontes de dados

| Fonte | O que vem | Onde |
|---|---|---|
| **ESI** (API pública) | ordens por região, histórico de preço, nomes (no build) | `https://esi.evetech.net/latest` |
| **Image Server** | ícones de tipos | `https://images.evetech.net` |
| **SDE** (estático oficial) | tipos, sistemas, portas, regiões, estações | `https://developers.eveonline.com/static-data` |
| **Dotlan** | links externos de mapa/corp (só navegação) | `https://evemaps.dotlan.net` |

Nenhuma chamada autenticada, chave de API ou SSO. Toda requisição à ESI identifica a
aplicação com `X-User-Agent: EVE-Market/1.0 (+https://github.com/AjaxFB/AjaxFB.github.io)`,
conforme as [Best Practices da ESI](https://developers.eveonline.com/docs/services/esi/best-practices/).
Endpoints usados e links oficiais estão na aba **Legal** do app.

---

## Conformidade (resumo)

- **Não-comercial** (DLA §1.13, §4.1/§4.3): sem cobrança, paywall ou tier pago.
- **Sem anúncios nem doação** por padrão (as formas do DLA §4.4 são opcionais).
- **Avisos de marca** no rodapé e na aba Legal; sem registrar IP da Fenris Creations (§7.5c).
- **Privacidade** (DLA §9.5): nada é enviado a servidores nossos.
- **Corporações**: sem acesso a dados de corp (sem SSO/scopes); sem centralização.

Links e citações oficiais: [EVE Developer License Agreement](https://developers.eveonline.com/license-agreement) ·
[Third Party Policies](https://support.eveonline.com/hc/en-us/articles/8564030965660-Third-Party-Policies) ·
[Content Creation Terms of Use](https://support.eveonline.com/hc/en-us/articles/8563917741084-EVE-Online-Content-Creation-Terms-of-Use) ·
[EULA](https://support.eveonline.com/hc/en-us/articles/8413329735580-EVE-Online-End-User-License-Agreement) ·
[Terms of Service](https://support.eveonline.com/hc/en-us/articles/8414770561948-EVE-Online-Terms-of-Service).

---

## Limitações

- Estruturas de jogador (`1xxxxxxxxxxxxx`) não têm nome público sem autenticação/docking —
  aparecem como `Structure <id>`.
- Regiões grandes (ex.: The Forge, ~407 páginas) demoram mais para coletar na primeira vez.
- `file://` não funciona; use uma origem http(s).
