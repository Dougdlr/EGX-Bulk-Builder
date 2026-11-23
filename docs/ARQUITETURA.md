# EGX Bulk Builder V14

Ferramenta web local para operar campanhas do **Meta Ads**: monta planilhas de importaÃ§Ã£o em massa, organiza cÃ³digos de criativos, edita/valida planilhas exportadas e controla as tarefas do dia â€” tudo organizado por **projeto**.

Roda 100% no navegador (Chrome ou Edge), sem servidor.

## Como abrir

- **Mais simples:** abra `index.html` no Chrome/Edge.
- **Recomendado** (habilita instalar como app e o modo offline completo): sirva a pasta localmente:

  ```powershell
  python "C:\Users\Douglas\Documents\EGX Workspace\egx-bulk-builder\serve.py"
  ```

  e acesse `http://localhost:8765/egx-bulk-builder/`. O `serve.py` é igual ao `python -m http.server`, mas manda o navegador sempre conferir se há versão nova — sem ele, o navegador pode continuar mostrando uma versão antiga do EGX depois de uma atualização.

Na primeira vez, clique em **Selecionar pasta do Workspace** e escolha a pasta onde os projetos devem ser gravados (ex.: `Documents\EGX Workspace`). Sem pasta, os dados ficam no navegador (IndexedDB).

## Estrutura do cÃ³digo

```
index.html                    pÃ¡gina (sÃ³ HTML; carrega CSS e JS abaixo)
css/
  base.css                    estilos principais
  theme.css, polish.css       tema, cores e acabamentos
  creator-texts.css           editor de textos dos anÃºncios
  name-suffix.css, tasks.css  sufixo de nome e Tarefas
  launcher.css                central de projetos
  app-shell.css               diÃ¡logos, formulÃ¡rios, indicador de salvamento, painel, atalhos
  bulk-editor.css             Editor de planilhas (3 painÃ©is)
  experience.css              barra superior, transiÃ§Ãµes, barra de atalhos, paleta (Ctrl K) e ajuda (?)
js/
  boot/pwa-manifest.js        manifesto PWA e service worker
  config/
    validation-models.js      modelos de validaÃ§Ã£o (ESC BID, ESC CBO, TADS ABO)
  core/
    helpers.js                constantes do Meta Ads (META, HEADERS) e utilidades
    storage.js                EGXStorage (camada Ãºnica de gravaÃ§Ã£o) + EGXModules
    dialog.js                 EGXDialog (substitui confirm/prompt/alert)
    validation.js             EGXValidation (usado pelo Criador e pelo Editor)
    shell.js                  abas, instalaÃ§Ã£o PWA, papel de parede
    workspace.js              projetos, painel, salvamento, backups, exportaÃ§Ãµes
  modules/
    creator.js                ðŸ“Š Criar campanhas
    extractor.js              ðŸ§¹ Organizar criativos
    bulk-editor/
      model.js                hierarquia campanha â†’ conjunto â†’ anÃºncio e aÃ§Ãµes (sem interface)
      ui.js                   ðŸ—‚ï¸ Editar planilha: Ã¡rvore, tabela por nÃ­vel, propriedades
    tasks.js                  ðŸ“ Tarefas do dia
  ui/
    cascade.js, appearance.js animaÃ§Ã£o de abertura e aparÃªncia
    motion.js                 indicador das abas, transiÃ§Ã£o entre seÃ§Ãµes, brilho nos cartÃµes, contagem animada
    shortcuts.js              atalhos de teclado (registro Ãºnico â†’ barra inferior, paleta e ajuda)
vendor/                       bibliotecas locais (modo offline)
  xlsx.full.min.js            SheetJS 0.20.3
  tailwind.css                Tailwind 3.4.17 compilado
  Inter.woff2                 fonte Inter
tailwind.config.js            usado sÃ³ para recompilar vendor/tailwind.css
```

### Como os mÃ³dulos salvam dados

Cada mÃ³dulo se registra com `EGXModules.register('chave', { exportData, importData, clear })` e avisa mudanÃ§as com `EGXModules.changed('chave')`. O `workspace.js` salva automaticamente (com atraso de 0,5 s, para nÃ£o gravar a cada tecla) usando o `EGXStorage`, que decide se grava **na pasta** ou **no navegador**.

Para levar o app a um servidor no futuro, basta trocar o interior do `storage.js` por chamadas a uma API â€” os mÃ³dulos nÃ£o mudam.

## Onde ficam os dados (pasta do Workspace)

```
Projects/<projeto>/
  project.json                nome, datas, perfil
  data.json                   Criador, Extrator e Tarefas
  bulkEditor.json             planilha aberta no Editor (+ original para comparar e arquivo para manter abas)
  History/activity.json       atividades (atÃ© 200)
  Exports/index.json          histÃ³rico das planilhas exportadas
  Exports/*.xlsx              cÃ³pia de cada planilha exportada
Backups/<projeto>/*.json      backups (automÃ¡tico ao abrir, mÃ¡x. 1/h; mantÃ©m 20)
Templates/estruturas/*.json   templates de campanha do Editor (valem para todos os projetos)
```

`data.json` continua compatÃ­vel com a V13.10 (as chaves `campaignCreator` e `extractor` sÃ£o as mesmas). Dados antigos guardados no navegador pela V13 sÃ£o migrados automaticamente ao abrir o projeto.

## Criador de campanhas — layout V16

Organizado pelo que muda com mais frequência:

- **Barra da campanha** (topo, fixa): modo Catálogo/Imagem, nome (📅 data de hoje, 🏗️ montador em janelinha), tipo **CBO / ABO / BID** em botões, orçamento (mostra se é "na campanha" ou "em cada conjunto") e limite de lance, etapas. Ao rolar, fica compacta numa linha só.
- **Criativos** (centro): colar a lista (prefixos numa linha, resumo ao vivo, Processar dentro do cartão) e conferência (tabela cresce com a lista; ações raras no menu ⋯; barra de ações fixa no rodapé).
- **Oferta** (direita): preset, Público, Destino e Conta Meta. Seções completas começam recolhidas mostrando só o resumo; abrem sozinhas quando falta algo.
- Estilo em `css/creator-v2.css`; comportamento da barra/coluna em `js/modules/creator-sidebar.js`.

## Criador de campanhas (V15)

- **Resumo ao vivo** ao colar a lista: quantos anúncios, gêneros, repetidos, gênero duplo, já usados e prefixos ignorados; sem prefixo, sugere os encontrados ("Usar LFRAD").
- Cada **linha** é lida separadamente: uma linha de prefixo ignorado não mistura mais o gênero na linha de cima (continuações como "FEMININO" na linha de baixo seguem valendo).
- **Pendências clicáveis** na conferência (levam ao campo ou à linha) e **🧹 Remover repetidos** com Desfazer (`R`).
- **🌳 Como vai ficar no Meta:** prévia campanha → conjuntos → anúncios.
- **Presets por oferta** guardam também os prefixos; o Criador **sugere o preset** quando o nome da campanha ou o produto combina.
- **⧉ Variações** (`V`): gera a mesma campanha como CBO, ABO e/ou BID (`…_CBO#1_` → `…_ABO#1_`) numa planilha só, para revisar no Editor ou baixar.
- **Catálogo e Product Set ID não vão na planilha.** Testado na Meta: com eles preenchidos, o anúncio importa com a "Fonte dos anúncios" (mídia do catálogo) travada e sem catálogo selecionado. Sem eles, catálogo e conjunto de produtos são escolhidos normalmente no editor da Meta. Página (`o:`), Instagram (`x:`), Pixel (`tp:`) e beneficiário continuam no Criador — esses a Meta lê corretamente.
- **Offline:** `sw.js` guarda uma cópia do app (rede primeiro, sempre a versão mais nova).

## Editor de planilhas

Layout em 3 painÃ©is: **Ã¡rvore** (campanha â†’ conjunto â†’ anÃºncio) Â· **tabela do nÃ­vel** (Campanhas / Conjuntos / AnÃºncios) Â· **propriedades** do item focado.

- **Renomear:** duplo clique (Ã¡rvore ou tabela), `F2`, ou em lote â€” prefixo/sufixo, localizar e substituir, trocar a data `dd_mm_aa` ou modelo de nome (`{nome}`, `{n}`, `{data}`, `{campanha}`, `{conjunto}`). Renomear campanha/conjunto atualiza todas as linhas do grupo; nomes repetidos sÃ£o bloqueados.
- **Duplicar** qualquer nÃ­vel, N cÃ³pias, no mesmo lugar ou em outras campanhas/conjuntos; prÃ³ximo `#n` livre ou `_COPIA`; cÃ³pias saem sem IDs/datas e podem nascer pausadas.
- **Mover** anÃºncio â†’ conjunto e conjunto â†’ campanha (arrastando na Ã¡rvore ou pelo botÃ£o).
- **Ativar/Pausar** (pausar propaga para dentro), **orÃ§amento** por % / valor / dividir total, **ABO â†” CBO**, **dividir conjunto por gÃªnero**, **pÃºblico** (gÃªnero, idade, paÃ­ses), **textos** (com os modelos do Criador), **link/UTM**, **adicionar anÃºncios** (lista do Extrator), **templates de estrutura**.
- **ValidaÃ§Ã£o ao vivo** (ðŸ”´/ðŸŸ¡ na Ã¡rvore e na tabela; modelo automÃ¡tico pelo nome), **alteraÃ§Ãµes em relaÃ§Ã£o ao original** com o antes â†’ depois de cada campo, e **exportar** tudo / sÃ³ o que mudou / sÃ³ a seleÃ§Ã£o.
- Abrir planilhas do **histÃ³rico de exportaÃ§Ãµes** do projeto sem baixar.
- **Tipo de orÃ§amento (CBO / ABO / BID):** detectado pela planilha e comparado com o nome. CBO = orÃ§amento sÃ³ na campanha; ABO = orÃ§amento e estratÃ©gia sÃ³ nos conjuntos; BID = orÃ§amento na campanha + estratÃ©gia "Limite de lance (Bid cap)" marcada automaticamente e limite de lance (Bid Amount) por conjunto (ðŸŽ¯ Limite de lance para vÃ¡rios de uma vez). O Editor nÃ£o deixa preencher orÃ§amento/lance no nÃ­vel errado e acusa "orÃ§amento misto" (erro que a Meta recusa na importaÃ§Ã£o) com botÃ£o **Corrigir**.
- **Um tipo de orÃ§amento por nÃ­vel:** diÃ¡rio (Daily Budget) **ou** total (Lifetime Budget). Preencher um limpa o outro; os dois juntos sÃ£o acusados como erro (a Meta recusa: "Somente um tipo de orÃ§amento pode ser usado para cada campanha"). OrÃ§amento diÃ¡rio acima de R$ 10.000 gera aviso.
- **Nome do arquivo exportado** = nome atual da campanha + `_bulk` (editÃ¡vel no diÃ¡logo de exportaÃ§Ã£o); `_alterados` / `_selecao` sÃ³ quando exporta parte.
- Termos da Meta traduzidos no formato "PortuguÃªs (English)", ex.: *Limite de lance (Bid Amount)* â€” dicionÃ¡rio em `js/config/meta-labels.js`. Os valores gravados na planilha continuam em inglÃªs.
- Atalhos: `Ctrl Z` / `Ctrl Y`, `Ctrl D` duplicar, `F2` renomear, `Del` excluir, `Esc` limpar seleÃ§Ã£o, `Ctrl A` selecionar tudo.

## Atalhos

A **barra no rodapÃ©** mostra os atalhos da seÃ§Ã£o (e da etapa) em que vocÃª estÃ¡ â€” muda sozinha ao trocar de aba, ao passar do Passo 1 para o Passo 2 do Criador, ao abrir uma planilha ou ao selecionar itens no Editor. Cada atalho da barra tambÃ©m Ã© clicÃ¡vel. `Ctrl /` oculta/mostra a barra. Atalhos de uma letra sÃ³ valem com o cursor fora de campos de texto.

| Onde | Atalho | AÃ§Ã£o |
|---|---|---|
| Qualquer seÃ§Ã£o | `Alt 1â€¦5` (ou `Ctrl 1â€¦5`) | Ir para a seÃ§Ã£o (segure `Alt` para ver os nÃºmeros) |
| | `Ctrl â†` / `Ctrl â†’` | SeÃ§Ã£o anterior / prÃ³xima |
| | `Alt 0` | Central de projetos |
| | `Ctrl K` | Paleta de comandos (buscar e executar qualquer aÃ§Ã£o) |
| | `Ctrl S` | Salvar o projeto agora |
| | `?` | Folha com todos os atalhos |
| Central de projetos | `N` Â· `1â€¦9` Â· `E` Â· `W` | Novo projeto Â· abrir projeto Â· entrar sem projeto Â· pasta do workspace |
| VisÃ£o geral | `/` Â· `N` Â· `R` Â· `B` | Buscar Â· nova tarefa Â· atualizar Â· backup |
| Criar campanhas (entrada) | `Ctrl Enter` Â· `/` Â· `P` Â· `B` Â· `M` | Processar Â· colar lista Â· prefixos Â· construtor de nome Â· CatÃ¡logoâ‡„Imagem |
| Criar campanhas (conferÃªncia) | `Ctrl E` Â· `/` Â· `A` Â· `T` Â· `Ctrl Z` Â· `O` Â· `âŒ«` | Exportar Â· filtrar Â· adicionar anÃºncio Â· textos Â· desfazer Â· ordenar Â· voltar |
| Organizar criativos | `Ctrl Enter` Â· `/` Â· `C` Â· `Ctrl Shift Enter` Â· `D` Â· `X` | Extrair Â· colar Â· copiar Â· enviar ao Criador Â· detectar prefixos Â· limpar |
| Editar planilha | `Ctrl O` Â· `H` Â· `T` | Abrir arquivo Â· histÃ³rico Â· template (sem planilha) |
| | `1` `2` `3` Â· `/` Â· `F` Â· `P` Â· `C` Â· `Ctrl E` | NÃ­vel Â· buscar Â· filtrar Ã¡rvore Â· problemas Â· alteraÃ§Ãµes Â· exportar |
| Tarefas | `N` Â· `â†` `â†’` Â· `H` Â· `U` Â· `L` | Nova tarefa Â· trocar dia Â· hoje Â· urgente Â· levar pendentes |

**App instalado Ã— navegador:** no EGX instalado como aplicativo, troque de seÃ§Ã£o com `Ctrl 1â€¦5` (lÃ¡ o Windows usa o Alt para o menu da janela). No navegador, use `Alt 1â€¦5` (lÃ¡ o Ctrl+nÃºmero troca a aba do Chrome). A barra de atalhos mostra automaticamente a combinaÃ§Ã£o certa. Trocar de seÃ§Ã£o tambÃ©m funciona com o **Alt direito (AltGr)** e no estilo Office: toque e solte `Alt`, depois aperte `0`â€“`5` (os nÃºmeros piscam nas abas por 3 s). No Criador, `Ctrl Shift E` abre a planilha gerada no Editor sem baixar e `Alt P` leva ao prÃ³ximo campo obrigatÃ³rio pendente.

**PÃ¡gina inicial:** a imagem padrÃ£o fica em `assets/home-wallpaper.jpg`. Em ðŸŽ¨ Temas â†’ "PÃ¡gina inicial" dÃ¡ para escolher Imagem EGX, uma imagem prÃ³pria (salva no navegador) ou nenhuma, e ajustar o escurecimento.

**Cache:** os CSS/JS sÃ£o carregados com `?v=â€¦` no `index.html`. Ao alterar algum arquivo, aumente esse nÃºmero para o navegador nÃ£o usar a versÃ£o antiga.

Os atalhos ficam num Ãºnico registro em `js/ui/shortcuts.js` (`SHORTCUTS`): a barra, a paleta e a folha de ajuda sÃ£o geradas dele.

## Recompilar o Tailwind (sÃ³ se adicionar classes novas)

```powershell
"@tailwind base;`n@tailwind components;`n@tailwind utilities;" | Out-File -Encoding utf8 $env:TEMP\tw.css
npx tailwindcss@3.4.17 -c tailwind.config.js -i $env:TEMP\tw.css -o vendor/tailwind.css --minify
```

## Novidades da V14

- CÃ³digo separado em arquivos por responsabilidade (antes: 1 HTML de 320 KB).
- Editor em lote e Tarefas agora sÃ£o salvos **por projeto** (antes o Editor se perdia e as Tarefas eram globais). Tarefas antigas podem ser importadas para o projeto pela prÃ³pria aba.
- Backups automÃ¡ticos e manuais, com restauraÃ§Ã£o pelo painel.
- Toda planilha exportada fica registrada (e copiada em `Exports/` com pasta vinculada).
- Criador valida a planilha antes de exportar (modelo detectado pelo nome da campanha) e permite **Abrir no Editor** sem baixar e reimportar.
- Aviso de **criativo jÃ¡ usado** em exportaÃ§Ãµes anteriores do projeto e botÃ£o **PrÃ³x.** para o nÃºmero livre da campanha (`ABO#n`).
- Presets do Criador por projeto (alÃ©m dos gerais).
- Extrator â†’ **Enviar para o Criador** com 1 clique.
- ValidaÃ§Ã£o corrigida para campanhas de imagem (nÃ£o acusa mais formato/posicionamento/CTA).
- Painel com tarefas do dia, exportaÃ§Ãµes, backups e busca; indicador de salvamento; diÃ¡logos prÃ³prios no lugar de `confirm/prompt`; atalhos de teclado.
- Modo offline real (bibliotecas e fonte em `vendor/`).
