# EGX Bulk Builder

Ferramenta local para criação, organização, validação e edição em massa de campanhas e anúncios do Meta Ads, organizada por projeto.

## Versão atual

- **Versão:** V14
- **Tipo:** aplicação web local (HTML + CSS + JS, sem servidor e sem build)
- **Página principal:** `app/index.html`
- **Versão estável anterior:** V13.10 — tag `v13.10-stable` e arquivo em `releases/v13.10/`

## Como executar

1. Baixe ou clone este repositório.
2. Abra `app/index.html` no Chrome ou Edge.
3. Recomendado: sirva a pasta `app/` em localhost (habilita instalar como app e o modo offline completo):

   ```powershell
   python -m http.server 8765 --directory app
   ```

   e acesse `http://localhost:8765`.
4. Na central de projetos, clique em **Selecionar pasta do Workspace** e escolha a pasta onde os projetos serão gravados. Sem pasta, os dados ficam no navegador (IndexedDB).

## Estrutura

- `app/`: aplicação (`index.html`, `css/`, `js/`, `vendor/`).
- `docs/`: documentação — arquitetura (`ARQUITETURA.md`) e roadmap.
- `releases/`: versões estáveis anteriores.

Detalhes do código, de onde os dados são gravados e dos atalhos estão em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Desenvolvimento

O projeto está em desenvolvimento ativo. Consulte `CHANGELOG.md` para registrar mudanças e use commits pequenos e descritivos.

## Dados e privacidade

Não envie para este repositório dados pessoais, listas reais de campanhas, arquivos de clientes, pastas de projetos, tokens, credenciais ou dados de uso. O repositório deve conter código e documentação do software.
