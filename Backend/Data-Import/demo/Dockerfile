FROM curlimages/curl:8.5.0
WORKDIR /app
COPY omock.json /app/omock.json
COPY --chmod=755 upload-omock.sh /app/upload-omock.sh

ENV OVIS_PREPROCESSOR_URL="http://ovis-backend-mongodb-data-preprocessing:9000/omock"
ENV OVIS_OMOCK_FILE="/input/omock.json"

ENTRYPOINT []
CMD ["/bin/sh", "/app/upload-omock.sh"]
