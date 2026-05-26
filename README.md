# DhuniorStats V47 Lineup + News Hardfix

Correção direta para o problema visto no print:

1. Escalação:
- Remove na prática o render antigo "Time não identificado" bagunçado.
- Sempre mostra mandante à esquerda e visitante à direita.
- Se a API não trouxer team_id confiável, o site NÃO mistura tudo em uma caixa só.
- Ele separa visualmente em duas colunas e mostra aviso de segurança.

2. Notícias:
- Bloqueia texto genérico como se fosse notícia.
- Se não tiver notícia real/confiável da SportMonks, mostra aviso limpo:
  "Nenhuma notícia confiável retornada".
- Não inventa notícia.

3. Endpoint:
- Mantém /api/match-center da V46.

Teste recomendado:
- Abrir Lanús x Mirassol
- Aba Escalações
- Deve aparecer em duas colunas, nunca mais em "Time não identificado" como lista única.
