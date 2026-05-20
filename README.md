# App PWA — AB SEM CALOTE

App leve, sem build, sem dependencias. Tudo HTML + CSS + JS puro.

## Como funciona

- 3 telas (Alertas / Processos / Novo).
- Auth simples por JWT (e-mail + senha unica configurada no workflow W05).
- Comunica com o n8n via webhooks (`/webhook/abscalote/...`).
- Push notifications via Web Push API + service worker.
- Cache offline da shell (funciona sem internet apos primeira abertura).

## Estrutura

```
app/
  index.html         <- HTML + estrutura das telas
  style.css          <- visual mobile-first + dark mode automatico
  app.js             <- logica, fetch da API, push
  service-worker.js  <- cache + push handler
  manifest.json      <- PWA manifest (instalavel "Add to Home Screen")
  icon-192.png       <- icone (CRIAR — usar logo ABADV)
  icon-512.png       <- idem
```

## Deploy (custo zero)

**Opcao recomendada — Cloudflare Pages:**
1. Criar conta em https://pages.cloudflare.com
2. Conectar com Git OU upload direto da pasta `app/_ready/` (gerada pelo inject_secrets.sh)
3. Cloudflare gera URL HTTPS automatica (necessario para PWA + service worker)
4. Dominio custom opcional: `abscalote.andrebeschizza.com.br` (CNAME)

**Opcao alternativa — GitHub Pages:**
1. Criar repo privado `abscalote-app`
2. Push da pasta `app/_ready/` para branch `main`
3. Settings -> Pages -> deploy from branch
4. URL: `https://<user>.github.io/abscalote-app/`

## Pre-deploy: injetar segredos

```bash
./scripts/inject_secrets.sh
# Gera workflows/_ready/*.json E app/_ready/*  (pendente — script atual so processa workflows)
# Para app: substituir manualmente __VAPID_PUBLIC_KEY__ em app.js antes do deploy
```

(Vou ampliar o `inject_secrets.sh` para incluir o app na proxima iteracao.)

## Instalacao na primeira vez (equipe)

**Android (Chrome):**
1. Abre a URL no Chrome.
2. Menu -> "Add to Home Screen" -> nome "AB Calote".
3. Icone aparece como app nativo.

**iOS (Safari, iOS 16.4+):**
1. Abre a URL no Safari.
2. Botao compartilhar -> "Add to Home Screen".
3. Para push notifications funcionarem, MEIO obrigatorio abrir pela home (nao pelo Safari).

## Primeira vez logando

- E-mail: o seu e-mail cadastrado na whitelist (financeiro1@ ou controladoria@).
- Senha: `abscalote2026` (MVP — sera trocada na V1 por senha individual).
- App pede permissao para push na primeira tela apos login. Aceita.

## Pendencias

- [ ] Icones PNG (192 e 512) — usar logo ABADV
- [ ] Endpoint POST /push/subscribe no W05 (registra subscription na Sheets)
- [ ] Atualizar `inject_secrets.sh` para processar app/ tambem
- [ ] Tela de detalhe do processo (botoes "Agendar Caixa", "Sacado")
- [ ] Senha individual por usuario (V1)
