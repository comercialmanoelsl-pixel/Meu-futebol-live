# DhuniorStats V36 Diagnóstico + Fallback

Incluído nesta versão:

## Diagnóstico correto
- Novo endpoint: `/api/debug-match?home=Corinthians&away=Atletico-MG&date=2026-05-24`
- Nova tela: `/diagnostico.html`
- Mostra qual API achou:
  - partida
  - estatísticas
  - eventos
  - escalações
  - jogadores
  - últimos jogos
  - notícias
  - odds

## Fallback inteligente
O diagnóstico consulta:
- API-Football
- SportMonks
- ESPN fallback
- NewsAPI
- Odds API

## Regra de credibilidade
- Se não veio da API, não mostra como certeza.
- Escalação provável só por notícia/contexto.
- Escalação oficial só quando API entregar.
- Formação só deve ser exibida se vier confirmada.

## Uso recomendado
1. Suba no Render.
2. Abra `/diagnostico.html`.
3. Teste uma partida que está falhando.
4. Veja exatamente qual API está retornando ou não cada bloco.

Build:
`npm install`

Start:
`npm start`
