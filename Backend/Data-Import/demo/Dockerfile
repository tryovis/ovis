FROM curlimages/curl:8.5.0
WORKDIR /app
COPY omock.json /app/omock.json

ENV OVIS_PREPROCESSOR_URL="http://ovis-backend-mongodb-data-preprocessing:9000/omock"
ENV OVIS_OMOCK_FILE="/input/omock.json"

CMD ["sh", "-c", "if [ -f \"$OVIS_OMOCK_FILE\" ]; then OMOCK_TO_UPLOAD=\"$OVIS_OMOCK_FILE\"; echo \"Detected external omock.json at $OVIS_OMOCK_FILE; using it...\"; else OMOCK_TO_UPLOAD=/app/omock.json; echo 'Using bundled DEMO omock.json...'; fi; echo \"Sending omock.json to preprocessing service...\" && i=0; until curl -sSf --noproxy ovis-backend-mongodb-data-preprocessing -X POST --data-binary @$OMOCK_TO_UPLOAD \"$OVIS_PREPROCESSOR_URL\" >/dev/null; do i=$((i+1)); if [ \"$i\" -ge 60 ]; then echo 'ERROR: Failed to upload omock.json after 60 attempts'; exit 1; fi; echo \"Upload attempt $i failed; retrying in 2s...\"; sleep 2; done; echo 'DEMO data imported (uploaded)'; tail -f /dev/null"]
