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

No MVP (1 disco por raridade) cada disco tem 20% de chance.

## Som

- Efeitos (rasgar, carta saindo, suspense, virada, fanfarra por raridade) são sintetizados com Web Audio, sem arquivos de áudio.
- Na revelação toca um trecho de 30s de `previewTrack`, vindo da API de busca do iTunes (JSONP). Na página do disco cada faixa tem ▶.
- O botão 🔊/🔇 no topo silencia tudo, e a escolha fica salva no navegador.

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

Inclua uma entrada em `src/data/albums.ts`. Campos opcionais:

- `mbid`: ID do *release group* no MusicBrainz. Sem ele, a capa é resolvida em tempo de execução pela API do MusicBrainz (no máximo 1 req/s) e fica em cache no `localStorage`.
- `spotifyId`: ID do álbum no Spotify. Sem ele, o botão abre uma busca no Spotify.

`id` é a chave da coleção salva no navegador: não altere depois de publicado.

## Arquitetura

- `src/rarity.ts`, `src/draw.ts`: faixas de raridade e sorteio uniforme. Funções puras, testadas.
- `src/collection.ts`: coleção no `localStorage`, versionada e tolerante a storage indisponível ou corrompido.
- `src/audio/`: `sfx.ts` (efeitos sintetizados), `preview.ts` (busca e player de prévias, um único `<audio>` compartilhado), `settings.ts` (mudo).
- `src/cover.ts`: capas pelo Cover Art Archive (hotlink, nenhuma imagem no repositório) e links do Spotify.
- `src/ui/*`: views sem framework. Rotas por hash (`#/`, `#/galeria`, `#/disco/:id`), então não é preciso o truque do `404.html` no Pages.
- `src/styles/card.css`: o JS só escreve `--mx/--my/--rx/--ry`. Cada raridade interpreta essas variáveis do seu jeito (foil na arte, reverse holo, moldura dourada).
