FROM node:20-alpine

WORKDIR /app

RUN mkdir -p /shared /input/CREDOSExportFiles && chmod 777 /shared
COPY . .
RUN if [ -f package.json ]; then npm install; fi

ENV OVIS_PREPROCESSOR_URL="http://ovis-backend-mongodb-data-preprocessing:9000/omock"
ENV OVIS_OMOCK_FILE="/input/omock.json"
ENV CREDOS_EXPORT_DIR="/input/CREDOSExportFiles"
ENV CREDOS_OMOCK_OUTPUT="/shared/omock.json"

CMD ["./entrypoint.sh"]
