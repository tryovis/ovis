FROM rocker/r-ver:4.5.1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libcurl4-openssl-dev \
        libicu-dev \
        libsodium-dev \
        libssl-dev \
        pkg-config \
        zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY install_packages.R ./
RUN Rscript install_packages.R

COPY cox_model.R cox_request.R plumber.R test_cox_model.R ./
RUN Rscript test_cox_model.R \
    && useradd --create-home --uid 10001 cox \
    && chown -R cox:cox /app

USER cox
EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --retries=6 --start-period=10s \
  CMD Rscript -e "connection <- url('http://localhost:8000/health'); payload <- paste(readLines(connection, warn = FALSE), collapse = ''); close(connection); stopifnot(grepl('ok', payload, fixed = TRUE))"

CMD ["R", "-e", "api <- plumber::plumb('/app/plumber.R'); api$run(host='0.0.0.0', port=8000)"]
