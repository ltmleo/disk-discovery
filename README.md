# Disk Discovery

Abra pacotes e descubra os 500 maiores álbuns de todos os tempos (Rolling Stone, edição 2020).
Cada disco é uma carta, e a raridade vem da posição no ranking.

| Raridade | Posições | Chance por pacote |
| --- | --- | --- |
| ★★★★★ Lendário | 1–5 | 0,5% |
| ★★★★ Épico | 6–25 | 3,5% |
| ★★★ Raro | 26–100 | 9% |
| ★★ Incomum | 101–200 | 22% |
| ★ Comum | 201–500 | 65% |

Se uma raridade ainda não tem discos cadastrados, as chances são redistribuídas entre as outras (no MVP há 1 disco por raridade).

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

- `src/rarity.ts`, `src/draw.ts`: faixas de raridade e sorteio em duas etapas (raridade por peso, depois disco uniforme dentro dela). Funções puras, testadas.
- `src/collection.ts`: coleção no `localStorage`, versionada e tolerante a storage indisponível ou corrompido.
- `src/cover.ts`: capas pelo Cover Art Archive (hotlink, nenhuma imagem no repositório) e links do Spotify.
- `src/ui/*`: views sem framework. Rotas por hash (`#/`, `#/galeria`, `#/disco/:id`), então não é preciso o truque do `404.html` no Pages.
- `src/styles/card.css`: o JS só escreve `--mx/--my/--rx/--ry`. Cada raridade interpreta essas variáveis do seu jeito (foil na arte, reverse holo, moldura dourada).
