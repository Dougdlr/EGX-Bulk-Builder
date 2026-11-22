# Changelog

## V14 — Reorganização e dados por projeto

**Estrutura**
- O HTML único (~320 KB) foi separado em `app/index.html`, `app/css/` e `app/js/` (`core`, `modules`, `ui`, `config`).
- Camada única de armazenamento (`js/core/storage.js`): grava na pasta do Workspace ou, sem pasta, no IndexedDB do navegador. Os módulos se registram em `EGXModules` e são salvos automaticamente.
- Validação extraída para `js/core/validation.js`; os modelos (ESC BID, ESC CBO, TADS ABO) ficam em `js/config/validation-models.js`.
- Modo offline real: SheetJS, Tailwind compilado e a fonte Inter em `app/vendor/`.
- V13.10 preservada na tag `v13.10-stable` e em `releases/v13.10/`.

**Dados**
- Editor em lote salvo no projeto (`bulkEditor.json`, com o arquivo original para manter as outras abas).
- Tarefas por projeto (em `data.json`). As tarefas da lista geral antiga podem ser importadas pela própria aba.
- Backups automáticos ao abrir o projeto (no máximo 1 por hora, mantém 20) e manuais, com restauração pelo painel.
- Histórico de exportações (`Exports/index.json`) e cópia das planilhas em `Exports/` quando há pasta vinculada.
- Projetos existentes na pasta do Workspace são detectados automaticamente (útil em outro computador).
- Migração automática dos dados que a V13 guardava no navegador. `data.json` passa a ter `schemaVersion: 2`; as chaves `campaignCreator` e `extractor` não mudaram.

**Funcionalidades**
- Criador valida a planilha antes de exportar (modelo detectado pelo nome da campanha).
- Botão **Abrir no Editor** após exportar, sem baixar e reimportar.
- Aviso de criativo **já usado** em exportações anteriores do projeto.
- Botão **Próx.** sugere o próximo número livre da campanha (`ABO#n`).
- Presets do Criador por projeto, além dos gerais.
- Extrator → **Enviar para o Criador** com 1 clique.
- Validação não acusa mais formato/posicionamento/CTA em campanhas de imagem.

**Interface**
- Painel com tarefas de hoje, planilha no Editor, exportações, backups e busca no projeto (`Ctrl+K`).
- Indicador de salvamento ("Salvo na pasta às…").
- Diálogos próprios no lugar de `confirm`/`prompt`.
- Atalhos: `Ctrl+1…5` (abas), `Ctrl+S` (salvar), `Ctrl+E` (exportar), `?` (lista de atalhos).
- Atividade registra só ações relevantes (não mais cada troca de aba).

**Atenção:** depois de abrir um projeto na V14, não volte a salvá-lo na V13.10 — ela regrava `data.json` sem as tarefas e sem a planilha do Editor.

## V13.10 — Base inicial do repositório

- Versão atual do EGX Bulk Builder registrada como ponto de partida.
- Arquivo HTML principal incluído em `app/`.
- A partir daqui, registrar cada mudança relevante por versão ou commit.
