# Codex Usage Monitor

App local para Windows que fica na bandeja, abre sem barra nativa no canto inferior direito do monitor ativo e mostra o uso restante de contas ChatGPT/Codex.

## Stack

- Electron + React + TypeScript
- Lê o uso direto dos logs locais do Codex (`~/.codex/sessions/**/rollout-*.jsonl`) — sem navegador, sem Cloudflare, sem captcha
- Vitest para provider/store/redaction/lock
- electron-builder + electron-updater para empacotamento Windows e auto-update via GitHub Releases

## Como funciona

O Codex (Desktop ou CLI) grava o consumo em disco a cada requisição, no evento `token_count` → `rate_limits` dos arquivos de sessão. O app lê o snapshot mais recente e o associa à conta ativa do `~/.codex/auth.json`. Trocou de conta no Codex? O `auth.json` muda e os novos snapshots entram na conta nova — o monitor vai acumulando o uso de cada conta conforme você usa.

Janela `primary` = limite de 5h, `secondary` = limite semanal. `remaining = 100 - used_percent`, e o reset vem de `resets_at`.

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

1. Use o Codex normalmente (Desktop ou CLI) na conta que quer monitorar.
2. Abra o app pela bandeja e clique em atualizar — ele lê o uso da conta ativa nos logs do Codex.
3. Para monitorar outra conta, troque de conta no Codex e use-a; o monitor passa a acumular o uso dela também.
4. Se uma conta nunca passa pelo Codex (só web), use o botão `Manual` como fallback.

## Segurança

- O app não armazena senha e não abre navegador.
- Leitura é somente local: lê o `auth.json` (id da conta/email) e os arquivos de sessão do Codex.
- Estado local fica no diretório `userData` do Electron para o app instalado.
- Logs passam por redaction de email, tokens, cookies e chaves.

## Observação importante

Por padrão o app lê de `~/.codex`. Se o seu Codex usa outro `CODEX_HOME`, ajuste a pasta na tela de configurações sem recompilar o app.
