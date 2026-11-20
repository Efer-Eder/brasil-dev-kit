# Imagem da API pública. O bundle `dist-server/server.js` é gerado por
# `pnpm build` (sem dependências de runtime), então a imagem só copia um arquivo.
# Base fixada por digest: node 24.22.2 (alpine).
FROM node:24-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8795

WORKDIR /app
COPY --chown=root:root dist-server/server.js ./server.js

USER node
EXPOSE 8795

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8795/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# Heap limitado abaixo do limite de memória do container (ver docs/api.md).
CMD ["node", "--max-old-space-size=160", "server.js"]
