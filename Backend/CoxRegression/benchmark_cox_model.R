# Run in the R service image: Rscript benchmark_cox_model.R [number_of_patients]
source("cox_model.R")
source("cox_request.R")
args <- commandArgs(trailingOnly = TRUE)
n <- if (length(args) > 0) as.integer(args[1]) else 100000L
stopifnot(is.finite(n), n > 0)
set.seed(42)
age <- sample(20:95, n, replace = TRUE)
event_time <- rexp(n, rate = exp(0.025 * (age - 60)) / 1000)
censor_time <- rexp(n, rate = 1 / 1500)
rows <- data.frame(time = pmin(event_time, censor_time), event = as.integer(event_time <= censor_time), age = age)
row_json <- jsonlite::toJSON(list(rows = rows, covariates = list("age")), digits = NA)
column_json <- jsonlite::toJSON(list(rows = as.list(rows), covariates = list("age")), digits = NA)
row_parse <- system.time(row_input <- jsonlite::fromJSON(row_json))[["elapsed"]]
column_parse <- system.time(column_input <- jsonlite::fromJSON(column_json))[["elapsed"]]
row_fit <- system.time(row_result <- fit_cox_model(row_input))[["elapsed"]]
column_fit <- system.time(column_result <- fit_cox_request(column_input))[["elapsed"]]
stopifnot(row_result$completeCases == n, column_result$completeCases == n)
stopifnot(isTRUE(all.equal(row_result, column_result, tolerance = 1e-10)))
cat(jsonlite::toJSON(list(
  patients = n,
  rowJsonBytes = nchar(row_json, type = "bytes"), columnJsonBytes = nchar(column_json, type = "bytes"),
  rowParseSeconds = row_parse, columnParseSeconds = column_parse,
  rowFitSeconds = row_fit, columnWorkerFitSeconds = column_fit,
  events = column_result$events, identicalResults = TRUE
), auto_unbox = TRUE, pretty = TRUE), "\n")
