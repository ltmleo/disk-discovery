# Disk Discovery

Abra pacotes e descubra os 500 maiores álbuns de todos os tempos (Rolling Stone, edição 2020).
Cada disco é uma carta, e a raridade vem da posição no ranking.

Todo disco tem a mesma chance de sair. A raridade vem só do tamanho de cada faixa do ranking:

| Raridade | Posições | Discos | Chance por pacote (lista completa) |
| --- | --- | --- | --- |
| ★★★★★ Lendário | 1–5 | 5 | 1% |
| ★★★★ Épico | 6–25 | 20 | 4% |
| ★★★ Raro | 26–100 | 75 | 15% |
| ★★ Incomum | 101–200 | 100 | 20% |
| ★ Comum | 201–500 | 300 | 60% |

Hoje há 50 discos (5 lendários, 8 épicos, 10 raros, 12 incomuns e 15 comuns). As chances por pacote são, nessa ordem, 10%, 16%, 20%, 24% e 30%. As chances da tabela valem quando a lista estiver completa. Para manter a raridade coerente, as próximas levas devem continuar trazendo mais comuns do que raros.

## Som

- Efeitos (rasgar, carta saindo, suspense, virada, fanfarra por raridade) são sintetizados com Web Audio, sem arquivos de áudio.
- Na revelação toca um trecho de 30s de `previewTrack`, vindo da API de busca do iTunes (JSONP). Na página do disco cada faixa tem ▶.
- O botão 🔊/🔇 no topo silencia tudo, e a escolha fica salva no navegador.

## Movimento das cartas

`src/ui/motion.ts` move as cartas com física de mola: inclinação, posição do brilho e "levantar" ao tocar.

- **Fontes de movimento, por prioridade:** ponteiro, varredura de brilho após a revelação, giroscópio do celular e balanço automático.
- **Só JS escreve variáveis CSS** (`--rx/--ry/--mx/--my/--dx/--dy/--hyp/--lift`). Holo, reflexo, paralaxe da capa e sombra são calculados no CSS de cada raridade.
- **Custo:** o loop de animação só roda enquanto algo se move, então cartas paradas na galeria não gastam processamento.
- **Giroscópio:** no iPhone a permissão é pedida no toque que revela a carta ou abre o zoom.
- **Galeria:** tocar numa carta faz ela voar ao centro girando. Esc ou "Fechar" devolvem a carta ao lugar. Ctrl/Cmd+clique abre a página direto.
- **Movimento reduzido:** quem ativou essa preferência no sistema não recebe nada disso.

## Modo espiar

Na galeria, o botão **👀 Espiar** mostra todos os discos, inclusive os que ainda não foram tirados (desbotados e com uma fita "ESPIANDO"). O modo só lê os dados: a coleção e os contadores não mudam. O estado fica na URL (`#/galeria?espiar`, `#/disco/<id>?espiar`). Sem o parâmetro, discos não tirados continuam bloqueados.

## Desenvolvimento

```bash
npm install
npm run dev     # servidor local
npm test        # vitest
npm run build   # typecheck + build em dist/
```

## Deploy (GitHub Pages)

O workflow `.github/workflows/deploy.yml` roda os testes, faz o build e publica em todo push na `main`.
Ative uma vez em **Settings → Pages → Source: GitHub Actions**.

## Adicionar discos

A lista completa da Rolling Stone (posição, artista, título, gravadora e ano) está em `scripts/data/rs2020.json`. Os 500 discos já estão no jogo.

Cada disco tem duas partes:

1. **Carta** (vai no pacote principal): uma entrada no arquivo da raridade em `src/data/albums/` (`legendary.ts` … `common.ts`). Obrigatórios: `id`, `rank`, `title`, `artist`, `year` e `label`. Opcionais: `genre`, `tagline` (texto editorial da carta), `previewTrack`, `mbid` e `spotifyId`.
2. **Conteúdo** (carregado sob demanda): `src/data/content/<id>.json`, com `tracks` sempre e `history` e `trivia` quando já escritos. Sem `history`, a página mostra "Resenha em breve".

`npm run import` adiciona os discos da lista que ainda não estão no jogo. Os dados de loja (gênero, faixas, capa e prévia) vêm da discografia do artista no iTunes, e a música da prévia é a faixa do álbum mais popular na loja. O script é idempotente e pode ser retomado. Nunca sobrescreve discos existentes.

**Escrever a resenha de um disco:** adicione `tagline` na carta e `history` e `trivia` no JSON. Notas por faixa entram em `tracks[].note`.

Os testes garantem que todo disco tem conteúdo, que não sobra conteúdo sem disco e que `previewTrack` está em `tracks`. `id` é a chave da coleção salva no navegador: não altere depois de publicado.

## Capas e prévias

`npm run media` resolve, para cada disco, a capa e a prévia. A fonte principal é a discografia completa do artista no iTunes (`lookup`), que acerta o álbum original e lê a lista de faixas dele. Quando ela falha, o script usa a busca comum do iTunes e, por último, o MusicBrainz e o Cover Art Archive. O resultado é gravado em `src/data/media.generated.json`. Atrás do proxy dos ambientes Claude Code, rode com `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt npm run media`. O arquivo é versionado. O CI roda o script antes do build apenas para completar entradas que faltem. Se as APIs estiverem fora do ar, o build segue e o site busca no navegador.

No navegador, a ordem é:

1. URLs resolvidas no build (sem nenhuma consulta).
2. URLs já resolvidas antes neste navegador (`localStorage`).
3. Consulta ao iTunes e depois ao MusicBrainz, com fila de prioridade: a carta sendo aberta passa na frente da galeria.

O próximo disco é sorteado quando o pacote aparece na tela. A capa (baixada e decodificada) e a prévia começam a carregar com prioridade alta enquanto o usuário rasga o pacote. Na galeria, as capas só carregam quando entram na tela.

## Arquitetura

- `src/rarity.ts`, `src/draw.ts`: faixas de raridade e sorteio uniforme. Funções puras, testadas.
- `src/collection.ts`: coleção no `localStorage`, versionada e tolerante a storage indisponível ou corrompido.
- `src/audio/`: `sfx.ts` (efeitos sintetizados), `preview.ts` (busca e player de prévias, um único `<audio>` compartilhado), `settings.ts` (mudo).
- `src/cover.ts`: pipeline de capas (fontes, cache, pré-carregamento). `src/net/`: JSONP, fila com prioridade e regras de correspondência compartilhadas com o script de build.
- `src/ui/*`: views sem framework. Rotas por hash (`#/`, `#/galeria`, `#/disco/:id`), então não é preciso o truque do `404.html` no Pages.
- `src/styles/card.css`: o JS só escreve `--mx/--my/--rx/--ry`. Cada raridade interpreta essas variáveis do seu jeito (foil na arte, reverse holo, moldura dourada).
