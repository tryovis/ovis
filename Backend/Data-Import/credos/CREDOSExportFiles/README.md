Put CREDOS `.txt` export files here for local source-compose development.

Docker image deployments should mount the export directory at `/input/CREDOSExportFiles` instead of baking patient export files into the image. Mounting an external `omock.json` through `OVIS_SITE_OMOCK_FILE` skips CREDOS generation.
