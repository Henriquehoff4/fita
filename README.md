# Fita

Baixe vídeos de redes sociais colando um link. App desktop para Windows, com modo simples e avançado, fila, histórico e atualização do yt-dlp com um clique.

## Instalar

Baixe na aba [Releases](https://github.com/Henriquehoff4/fita/releases). Para gerar os arquivos você mesmo:

```
npm install
npm run dist
```

Em `release/` ficam dois arquivos:

- `Fita Setup 1.0.0.exe`: instalador, cria atalho no menu Iniciar (na aba Releases o GitHub mostra como `Fita.Setup.1.0.0.exe`).
- `Fita-1.0.0-portatil.exe`: não instala nada, basta abrir.

O Windows pode mostrar o aviso do SmartScreen porque o app não tem assinatura digital. Clique em "Mais informações" e depois em "Executar assim mesmo".

## Rodar sem instalar

```
npm start
```

## Ferramentas

O app usa o yt-dlp, o ffmpeg e o Deno. Procura primeiro as cópias próprias, em `%APPDATA%\fita\bin`, e depois o PATH do Windows.

Sem yt-dlp ou ffmpeg, o app avisa e instala em Ajustes, conferindo o SHA-256 publicado junto do arquivo. O Deno, que o YouTube exige para liberar todas as qualidades, se instala com `winget install DenoLand.Deno`.

## Comandos de desenvolvimento

| Comando | O que faz |
| --- | --- |
| `npm run dev:ui` | Interface no navegador com dados de exemplo |
| `npm test` | Testes da lógica de formatos, argumentos, progresso e erros |
| `npm run test:e2e` | App real baixando vídeos reais, conferidos com ffprobe. Exige internet e ffprobe no PATH |
| `node tests/e2e/shots.mjs` | Capturas de todos os estados, teclado e pior caso |
| `node tests/e2e/sites.mjs` | Links públicos de outras plataformas |

## Estrutura

- `src/shared`: lógica pura. Normalização de formatos, presets, modo avançado, argumentos do yt-dlp, progresso e erros.
- `src/main`: processo principal. Ferramentas, fila, análise, histórico e IPC.
- `src/renderer`: interface em React.
- `tests`: testes unitários e de ponta a ponta.

## Dados locais

Ajustes, histórico e ferramentas ficam em `%APPDATA%\fita`. O histórico guarda título, link, miniatura e caminho do arquivo, e nada sai do seu PC. A opção "Usar login do navegador" vem desligada; ligada, o yt-dlp lê os cookies do navegador escolhido e os envia ao site do vídeo.

Baixe apenas o que você tem direito de usar.

## Licença

MIT. Veja `LICENSE`. O Fita não inclui yt-dlp nem ffmpeg: baixa essas ferramentas ao serem instaladas pelo app, e cada uma segue a sua própria licença (yt-dlp: Unlicense; build do ffmpeg usado: GPL).
