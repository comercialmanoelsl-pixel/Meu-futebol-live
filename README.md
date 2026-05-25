# DhuniorStats V39 Coverage Engine

Agora o projeto tem engines separadas:

- engines/coverage-engine.js
- engines/lineup-engine.js
- engines/stats-engine.js
- engines/form-engine.js

Novo endpoint:
- /api/coverage-match?game=<JSON>

Nova aba:
- Cobertura

O que muda:
- Detecta estado PREMATCH / LIVE / FINISHED
- Resolve IDs entre APIs
- Tenta SportMonks + API-Football para stats
- Tenta SportMonks + API-Football para lineups
- Busca últimos jogos por teamId/nome
- Mostra Coverage Score
- Mostra exatamente o que existe e o que não existe
- Não inventa formação, estatística ou escalação
