options(repos = c(CRAN = "https://cloud.r-project.org"))
install.packages("remotes")
remotes::install_version("jsonlite", version = "2.0.0", upgrade = "never")
remotes::install_version("survival", version = "3.8-11", upgrade = "never")
remotes::install_version("plumber", version = "1.3.3", upgrade = "never")

expected <- c(jsonlite = "2.0.0", survival = "3.8.11", plumber = "1.3.3")
installed <- vapply(names(expected), function(package) {
  as.character(utils::packageVersion(package))
}, character(1))
stopifnot(identical(installed, expected))
