# DhuniorStats V40 Lineup Safe + Audit Fix

Correções:
- Nunca mais divide escalação no meio sem saber o time do jogador.
- Se a API não identificar o time do jogador, o campo visual é bloqueado para evitar inversão.
- SportMonks lineups agora tentam mapear participant_id com participants.
- Auditor não quebra mais por causa do odds 403.
- Odds SportMonks removido do include geral; deve continuar usando ODDS_API_KEY separada.

Regra:
É melhor mostrar "não foi possível separar com segurança" do que mostrar escalação invertida.
