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

Hoje há 25 discos, 5 por raridade, então cada raridade sai em 20% dos pacotes. As chances acima valem quando a lista estiver completa.

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

1. Inclua a entrada no arquivo da raridade em `src/data/albums/` (`legendary.ts`, `epic.ts`, `rare.ts`, `uncommon.ts`, `common.ts`).
2. `previewTrack` precisa ser o título de uma faixa de `tracks`. É ela que toca na revelação.
3. Opcionais: `mbid` (MusicBrainz) e `spotifyId`. Sem `spotifyId`, o botão abre uma busca no Spotify.

`id` é a chave da coleção salva no navegador: não altere depois de publicado.

## Capas e prévias

`npm run media` resolve, para cada disco, a capa (iTunes, ou Cover Art Archive como alternativa) e a URL da prévia, e grava em `src/data/media.generated.json`. O arquivo não é versionado: o CI roda o script antes do build e guarda o resultado em cache, então só discos novos consultam as APIs. Se as APIs estiverem fora do ar, o build segue e o site busca no navegador.

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
