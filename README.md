# Codex Usage Monitor

App local para Windows que fica na bandeja, abre sem barra nativa no canto inferior direito do monitor ativo e mostra o uso restante de contas ChatGPT/Codex.

## Stack

- Electron + React + TypeScript
- Playwright conectado via CDP a um Chrome real, com perfil dedicado por conta
- Vitest para parser/store/redaction/lock
- electron-builder + electron-updater para empacotamento Windows e auto-update via GitHub Releases

## Rodar em desenvolvimento

```powershell
npm install
npm run dev
```

## Build e pacote local

```powershell
npm test
npm run typecheck
npm run build
npm run package
```

O pacote em modo diretório sai em `release/win-unpacked`.

Para gerar instalador NSIS:

```powershell
npm run dist
```

## Release e auto-update

O auto-update usa GitHub Releases do repositório público `ronydrop/codex-usage-monitor`.

1. Atualize `version` no `package.json`.
2. Crie uma tag no formato `vX.Y.Z`.
3. Publique a tag no GitHub.
4. O workflow `.github/workflows/release.yml` gera o instalador NSIS e publica os assets da release.

O app instalado verifica updates ao iniciar, repete a busca a cada 6 horas e permite buscar manualmente em Configurações ou no menu da bandeja.

## Fluxo de uso

1. Abra o app pela bandeja.
2. Em cada conta, clique no ícone de login.
3. Faça login manualmente no Chrome real aberto com perfil dedicado.
4. Resolva a verificação Cloudflare se aparecer.
5. Feche a janela dedicada de login.
6. Clique em atualizar na conta.
7. Se a página mudar ou a leitura falhar, use o botão `Manual` como fallback.

## Segurança

- O app não armazena senha.
- Cada conta usa um perfil Chrome dedicado separado.
- Estado local e perfis ficam no diretório `userData` do Electron para o app instalado.
- Logs passam por redaction de email, tokens, cookies e chaves.
- A automação é somente leitura: conecta ao Chrome real via CDP, abre a página de uso e extrai texto do DOM.
- O app não tenta resolver captcha automaticamente; ele abre uma janela Chrome dedicada sem automação para login/verificação manual.
- Depois de login ou captcha, feche a janela dedicada antes de atualizar para liberar o perfil da coleta.

## Observação importante

A URL padrão configurada é `https://chatgpt.com/codex/settings/usage`. Como a OpenAI pode alterar rotas/UI, a tela de configurações permite trocar a URL sem recompilar o app.
