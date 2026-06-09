FROM node:20-alpine

WORKDIR /app

RUN mkdir -p /shared && chmod 777 /shared
COPY . .
RUN if [ -f package.json ]; then npm install; fi

ENV OVIS_PREPROCESSOR_URL="http://ovis-backend-mongodb-data-preprocessing:9000/omock"
ENV OVIS_OMOCK_FILE="/input/omock.json"

CMD ["sh", "-c", "if [ -f \"$OVIS_OMOCK_FILE\" ]; then echo \"Detected external omock.json at $OVIS_OMOCK_FILE; skipping generation...\"; else echo 'Generating ONKOSTAR omock.json from source...' && node mdbConnect.mjs all; fi; if [ -f \"$OVIS_OMOCK_FILE\" ]; then export OMOCK_TO_UPLOAD=\"$OVIS_OMOCK_FILE\"; else export OMOCK_TO_UPLOAD=/shared/omock.json; fi; echo 'Uploading ONKOSTAR omock.json to preprocessing service...' && node upload-omock.mjs && echo 'ONKOSTAR data imported (uploaded)'; tail -f /dev/null"]
