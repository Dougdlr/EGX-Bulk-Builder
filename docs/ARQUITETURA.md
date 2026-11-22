# Arquitetura — EGX Bulk Builder V14

Ferramenta web local para operar campanhas do **Meta Ads**: monta planilhas de importação em massa, organiza códigos de criativos, edita/valida planilhas exportadas e controla as tarefas do dia — tudo organizado por **projeto**.

Roda 100% no navegador (Chrome ou Edge), sem servidor.

## Como abrir

- **Mais simples:** abra `app/index.html` no Chrome/Edge.
- **Recomendado** (habilita instalar como app e o modo offline completo): sirva a pasta localmente:

  ```powershell
  python -m http.server 8765 --directory app
  ```

  e acesse `http://localhost:8765`.

Na primeira vez, clique em **Selecionar pasta do Workspace** e escolha a pasta onde os projetos devem ser gravados (ex.: `Documents\EGX Workspace`). Sem pasta, os dados ficam no navegador (IndexedDB).

## Estrutura do código (pasta `app/`)

```
index.html                    página (só HTML; carrega CSS e JS abaixo)
css/
  base.css                    estilos principais
  theme.css, polish.css       tema, cores e acabamentos
  creator-texts.css           editor de textos dos anúncios
  name-suffix.css, tasks.css  sufixo de nome e Tarefas
  launcher.css                central de projetos
  app-shell.css               diálogos, indicador de salvamento, painel, atalhos
js/
  boot/pwa-manifest.js        manifesto PWA e service worker
  config/
    validation-models.js      modelos de validação (ESC BID, ESC CBO, TADS ABO)
  core/
    helpers.js                constantes do Meta Ads (META, HEADERS) e utilidades
    storage.js                EGXStorage (camada única de gravação) + EGXModules
    dialog.js                 EGXDialog (substitui confirm/prompt/alert)
    validation.js             EGXValidation (usado pelo Criador e pelo Editor)
    shell.js                  abas, instalação PWA, papel de parede
    workspace.js              projetos, painel, salvamento, backups, exportações
  modules/
    creator.js                📊 Criar campanhas
    extractor.js              🧹 Organizar criativos
    bulk-editor.js            🗂️ Editar planilha
    tasks.js                  📝 Tarefas do dia
  ui/
    cascade.js, appearance.js animação de abertura e aparência
    shortcuts.js              atalhos de teclado
vendor/                       bibliotecas locais (modo offline)
  xlsx.full.min.js            SheetJS 0.20.3
  tailwind.css                Tailwind 3.4.17 compilado
  Inter.woff2                 fonte Inter
tailwind.config.js            usado só para recompilar vendor/tailwind.css
```

### Como os módulos salvam dados

Cada módulo se registra com `EGXModules.register('chave', { exportData, importData, clear })` e avisa mudanças com `EGXModules.changed('chave')`. O `workspace.js` salva automaticamente (com atraso de 0,5 s, para não gravar a cada tecla) usando o `EGXStorage`, que decide se grava **na pasta** ou **no navegador**.

Para levar o app a um servidor no futuro, basta trocar o interior do `storage.js` por chamadas a uma API — os módulos não mudam.

## Onde ficam os dados (pasta do Workspace)

```
Projects/<projeto>/
  project.json                nome, datas, perfil
  data.json                   Criador, Extrator e Tarefas
  bulkEditor.json             planilha aberta no Editor em lote (+ arquivo original)
  History/activity.json       atividades (até 200)
  Exports/index.json          histórico das planilhas exportadas
  Exports/*.xlsx              cópia de cada planilha exportada
Backups/<projeto>/*.json      backups (automático ao abrir, máx. 1/h; mantém 20)
```

`data.json` continua compatível com a V13.10 (as chaves `campaignCreator` e `extractor` são as mesmas). Dados antigos guardados no navegador pela V13 são migrados automaticamente ao abrir o projeto.

## Atalhos

| Atalho | Ação |
|---|---|
| `Ctrl 1…5` | Trocar de aba |
| `Ctrl S` | Salvar o projeto agora |
| `Ctrl E` | Exportar (Criador ou Editor) |
| `Ctrl K` | Buscar no projeto |
| `Ctrl Enter` | Processar a lista no Criador |
| `?` | Mostrar atalhos |

## Recompilar o Tailwind (só se adicionar classes novas)

Rode dentro de `app/`:

```powershell
"@tailwind base;`n@tailwind components;`n@tailwind utilities;" | Out-File -Encoding utf8 $env:TEMP\tw.css
npx tailwindcss@3.4.17 -c tailwind.config.js -i $env:TEMP\tw.css -o vendor/tailwind.css --minify
```

## Histórico de versões

Veja [CHANGELOG.md](../CHANGELOG.md).
