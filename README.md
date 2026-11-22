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

Os 500 discos estão no jogo, então as chances acima são as reais.

## Som

- Abertura em clima de DJ: arrastar a faixa do pacote é um scratch ao vivo (a velocidade e a direção do dedo comandam o disco; parado, silêncio), o rasgo é um combo de scratch que cai num bumbo, a carta sobe com um rewind e assenta com a agulha caindo no vinil. O "disco" arranhado é um "ahh" sintetizado (dente de serra por formantes vocais), renderizado offline uma vez.
- Efeitos ( suspense com batimento cardíaco, impacto grave, fanfarra por raridade) são sintetizados com Web Audio, sem arquivos de áudio. Tudo passa por um compressor e por um reverb gerado no próprio navegador.
- Prévia: um selo "Prévia" ao lado do logo (em todas as páginas) leva a `/em-breve/`, que explica o que é a prévia (coleção só no navegador, textos em revisão) e lista o que vem por aí: amigos, coleção dos amigos, novas figurinhas (membros de banda, singles, artefatos) e notas e comentários (`src/ui/roadmap.ts`).
- Recorte do sorteio: um link discreto embaixo do pacote ("Sorteio: Todos ▾") abre as opções Todos, Top 10, Top 50, Top 100 e cada raridade. A escolha fica salva no navegador, o pacote ganha um selo com o recorte e os discos contam para a coleção normalmente (`src/pool.ts`).
- Abertura: a faixa descola aos poucos enquanto é arrastada e deixa vazar uma luz na cor da raridade; a carta sobe de dentro do pacote, o pacote cai, faíscas convergem para a carta (raro em diante) e a tela treme nas épicas e lendárias. Depois do suspense, a carta virada continua flutuando com a aura pulsando, e um fundo de mistério (drone, motivo sem resolução, brilho e batimento conforme a raridade) toca até o toque que revela; ele para sozinho se a pessoa sair da página, silencia com a aba escondida e segue o botão de som. No celular, vibra junto (Android). Tudo isso respeita "reduzir movimento", e a vibração segue o botão de som.
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

## Compartilhar (prévia no WhatsApp)

- Cada página compartilhável é um HTML estático com tags Open Graph próprias (`scripts/static-pages.ts`, que roda no `npm run build`). São elas: a home, `galeria/` e `disco/<id>/` (500 páginas). Os robôs de prévia não rodam JavaScript, então as tags precisam estar no HTML. Essas páginas também respondem 200 em vez de cair no `404.html`.
- `npm run og` (Playwright, depois do build) gera os cards 1200×630 em `dist/og/`: `site.jpg` e um por disco, com a capa, a moldura da raridade, o título e a posição. O modelo está em `scripts/og/template.html`. Os 500 cards levam ~30 s e ficam entre 80 e 100 KB cada.
- O botão **Compartilhar** (na revelação e na página do disco) abre o menu nativo do celular; no desktop, copia o link. O link leva `?espiar`, para quem receber ver o disco mesmo sem tê-lo tirado. O evento é `share` (`method`, `content_type`, `item_id`).
- O WhatsApp guarda a prévia de cada URL em cache. Se o card de um link mudar, a prévia antiga pode continuar aparecendo por um tempo.

## Analytics

O site faz parte do ecossistema ltmleo.github.io (skill `ltm-novo-site`): GA4 `G-714QFE3V9G` com `content_group: 'disk-discovery'` e a barra `<ltm-bar>`.

- **Páginas:** cada rota é um caminho real com título próprio. O GA registra o `page_view` sozinho, pela medição otimizada de mudanças de histórico; nenhum `page_view` é enviado manualmente. Discos ainda não tirados têm título neutro ("Disco bloqueado"), para não dar spoiler.
- **Eventos** (todos em `src/analytics.ts`, tipados):

| Evento | Quando | Parâmetros |
| --- | --- | --- |
| `open_pack` | pacote rasgado | `rarity`, `new_card`, `pool` (`all`, `top10`, `top50`, `top100` ou a raridade) |
| `select_pool` | recorte do sorteio trocado | `pool` |
| `reveal_card` | carta virada | `rarity`, `new_card` |
| `select_content` | página do disco aberta | `content_type`, `content_id`, `rarity`, `source` (`reveal`, `inspect`, `gallery`, `direct`, `back`) |
| `inspect_card` | carta ampliada na galeria | `content_id`, `rarity` |
| `play_preview` | prévia começou a tocar | `content_id`, `rarity`, `source` (`reveal`, `inspect`, `tracklist`) |
| `share` | link compartilhado | `method` (`web_share`, `copy`), `content_type`, `item_id` |
| `gallery_search` | busca estabilizada (1,2 s sem digitar) | `has_results` (o texto digitado **não** é enviado) |
| `toggle_spy` / `toggle_sound` | botões | `enabled` |
| `unlock_achievement` | 10, 25, 50, 100, 250 e 500 discos; primeiro de cada raridade | `achievement_id` |

- **Perfil do jogador:** propriedade de usuário `collection_tier` (`0`, `1-9`, `10-49`, `50-199`, `200+`).
- **No painel do GA**, crie as dimensões personalizadas para ver os parâmetros nos relatórios. Com escopo de evento: `rarity`, `new_card`, `source`, `enabled`, `content_id`, `achievement_id` e `pool`. Com escopo de usuário: `collection_tier`.

## Galeria

- **Busca** por título, artista, ano, gravadora ou posição. Ignora acentos e maiúsculas, e todos os termos precisam bater. `42` busca a posição 42 ou o texto "42"; `#42` busca só a posição. `/` foca a busca e `Esc` limpa.
- **Sem spoiler:** fora do modo espiar, a busca mostra só os seus discos. Dos não descobertos, ela mostra só a quantidade e oferece um botão "espiar".
- **Desempenho:** as 500 cartas são montadas uma única vez; busca e filtros só alternam `hidden`.
- **Música:** abrir uma carta (o zoom) toca a prévia, como na revelação, e fechar para. O áudio começa a carregar quando o ponteiro passa sobre a carta, e o arquivo de prévias é baixado em segundo plano quando a galeria abre. Assim a música toca dentro do próprio clique, como exigem as regras de autoplay.

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

`npm run media` resolve, para cada disco, a capa e a prévia, e grava em `src/data/media.art.json` (capas, no pacote principal) e `src/data/media.previews.json` (prévias, baixadas em segundo plano quando o pacote aparece). A fonte principal é a discografia completa do artista no iTunes (`lookup`), que acerta o álbum original e lê a lista de faixas dele. Quando ela falha, o script usa a busca comum do iTunes e, por último, o MusicBrainz e o Cover Art Archive. Atrás do proxy dos ambientes Claude Code, rode com `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt npm run media`. O arquivo é versionado. O CI roda o script antes do build apenas para completar entradas que faltem. Os endereços das prévias podem mudar do lado da Apple. `npm run media -- --check-previews` testa cada um e refaz só os que quebraram. Na primeira checagem, em nov/2026, 491 de 491 estavam no ar. O workflow `refresh-media.yml` roda essa checagem todo mês (dia 3) e, se algo mudou, **abre um PR**; ele nunca faz push na `main`. Para isso, o repositório precisa da opção *Settings → Actions → General → Allow GitHub Actions to create and approve pull requests* ligada. Se as APIs estiverem fora do ar, o build segue e o site busca no navegador.

No navegador, a ordem é:

1. URLs resolvidas no build (sem nenhuma consulta).
2. URLs já resolvidas antes neste navegador (`localStorage`).
3. Consulta ao iTunes e depois ao MusicBrainz, com fila de prioridade: a carta sendo aberta passa na frente da galeria.

O próximo disco é sorteado quando o pacote aparece na tela. A capa (baixada e decodificada) e a prévia começam a carregar com prioridade alta enquanto o usuário rasga o pacote. Na galeria, as capas só carregam quando entram na tela.

## Arquitetura

- `src/rarity.ts`, `src/draw.ts`: faixas de raridade e sorteio uniforme. Funções puras, testadas.
- `src/collection.ts`: coleção no `localStorage`, versionada e tolerante a storage indisponível ou corrompido.
- `src/audio/`: `sfx.ts` (efeitos sintetizados), `preview.ts` (busca e player de prévias, um único `<audio>` compartilhado), `settings.ts` (mudo). Vibração em `src/ui/haptics.ts`.
- `src/cover.ts`: pipeline de capas (fontes, cache, pré-carregamento). `src/net/`: JSONP, fila com prioridade e regras de correspondência compartilhadas com o script de build.
- `src/ui/*`: views sem framework. `src/router.ts`: rotas reais (`/disk-discovery/`, `/galeria`, `/disco/<id>`) com History API. O build copia `index.html` para `404.html`, para que os links diretos funcionem no GitHub Pages. Links antigos com `#/` são convertidos antes do GA carregar.
- `src/styles/card.css`: o JS só escreve `--mx/--my/--rx/--ry`. Cada raridade interpreta essas variáveis do seu jeito (foil na arte, reverse holo, moldura dourada).
