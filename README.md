# EGX Bulk Builder

Ferramenta local para criação, organização, validação e edição em massa de campanhas e anúncios do Meta Ads, organizada por projeto.

## Versão atual

- **Versão:** V16.5
- **Tipo:** aplicação web local (HTML + CSS + JS, sem servidor e sem build)
- **Página principal:** `app/index.html`
- **Versões anteriores:** V14 — tag `V14.0`; V13.10 — tag `v13.10-stable` e arquivo em `releases/v13.10/`

## Como executar

1. Baixe ou clone este repositório.
2. Abra `app/index.html` no Chrome ou Edge.
3. Recomendado: sirva em localhost com o `serve.py` (habilita instalar como app e o modo offline; avisa o navegador para sempre buscar a versão nova dos arquivos):

   ```powershell
   python app/serve.py
   ```

   e acesse `http://localhost:8765/app/`.
4. Na central de projetos, clique em **Selecionar pasta do Workspace** e escolha a pasta onde os projetos serão gravados. Sem pasta, os dados ficam no navegador (IndexedDB).

## Estrutura

- `app/`: aplicação (`index.html`, `css/`, `js/`, `vendor/`, `assets/`), `serve.py` (servidor local) e `sw.js` (modo offline).
- `docs/`: documentação — arquitetura (`ARQUITETURA.md`) e roadmap.
- `releases/`: versões estáveis anteriores.

Detalhes do código, de onde os dados são gravados e dos atalhos estão em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Desenvolvimento

O projeto está em desenvolvimento ativo. Consulte `CHANGELOG.md` para registrar mudanças e use commits pequenos e descritivos.

## Dados e privacidade

Não envie para este repositório dados pessoais, listas reais de campanhas, arquivos de clientes, pastas de projetos, tokens, credenciais ou dados de uso. O repositório deve conter código e documentação do software.
