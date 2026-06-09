FROM python:3.11-slim

WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /shared && chmod 777 /shared
COPY . .
RUN pip install --no-cache-dir -r requirements.txt

ENV OVIS_PREPROCESSOR_URL="http://ovis-backend-mongodb-data-preprocessing:9000/omock"
ENV OVIS_OMOCK_FILE="/input/omock.json"
ENV FHIR_SERVER_URL="http://bridgehead-ccp-blaze:8080/fhir"
ENV FHIR_USERNAME=""
ENV FHIR_PASSWORD=""
ENV ICD10_FILTER=""

CMD ["sh", "-c", "if [ -f \"$OVIS_OMOCK_FILE\" ]; then echo \"Detected external omock.json at $OVIS_OMOCK_FILE; skipping FHIR connectivity check and generation.\"; else echo \"Generating CCP omock.json from source (FHIR server: ${FHIR_SERVER_URL:-unset})...\" && python main.py; fi; if [ -f \"$OVIS_OMOCK_FILE\" ]; then OMOCK_TO_UPLOAD=\"$OVIS_OMOCK_FILE\"; else OMOCK_TO_UPLOAD=/shared/omock.json; fi; echo 'Uploading CCP omock.json to preprocessing service...' && i=0; until curl -sSf --noproxy ovis-backend-mongodb-data-preprocessing -X POST --data-binary @$OMOCK_TO_UPLOAD \"$OVIS_PREPROCESSOR_URL\" >/dev/null; do i=$((i+1)); if [ \"$i\" -ge 60 ]; then echo 'ERROR: Failed to upload CCP omock.json after 60 attempts'; exit 1; fi; echo \"Upload attempt $i failed; retrying in 2s...\"; sleep 2; done; echo 'CCP data imported (uploaded)'; tail -f /dev/null"]
