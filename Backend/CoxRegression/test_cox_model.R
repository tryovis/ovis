source("cox_model.R")

set.seed(42)
n <- 500
age <- stats::rnorm(n, mean = 62, sd = 10)
gender <- sample(c("female", "male"), n, replace = TRUE)
entity <- sample(c("C18", "C50"), n, replace = TRUE)
event_time <- stats::rexp(n, rate = exp(0.045 * (age - 62) + 0.3 * (gender == "male")) / 800)
censor_time <- stats::rexp(n, rate = 1 / 1100)
rows <- data.frame(
  time = pmin(event_time, censor_time),
  event = as.integer(event_time <= censor_time),
  age = age,
  gender = gender,
  entity = entity
)

result <- fit_cox_model(list(rows = rows, covariates = c("age", "gender")))
stopifnot(result$status %in% c("OK", "WARNING"))
stopifnot(result$completeCases == n)
stopifnot(result$events > 5)
stopifnot(!result$stratifiedByEntity)
stopifnot(!grepl("strata\\(entity\\)", result$modelFormula))
stopifnot(length(result$coefficients) >= 3)
age_results <- Filter(function(item) identical(item$covariate, "age"), result$coefficients)
stopifnot(length(age_results) >= 3)
stopifnot(sum(vapply(age_results, function(item) isTRUE(item$isReference), logical(1))) == 1)
stopifnot(all(vapply(
  age_results,
  function(item) item$level %in% c("<40", "40-49", "50-59", "60-69", "70-79", "80+"),
  logical(1)
)))

prepared_age <- prepare_model_data(rows, c("age"))$ageGroup
expected_reference <- names(which.max(table(as.character(prepared_age))))
actual_reference <- Filter(function(item) isTRUE(item$isReference), age_results)[[1]]$level
stopifnot(identical(actual_reference, expected_reference))

rows$diagnosisYear <- sample(2018:2022, n, replace = TRUE)
year_result <- fit_cox_model(list(rows = rows, covariates = c("diagnosisYear")))
year_levels <- vapply(year_result$coefficients, function(item) item$level, character(1))
stopifnot(identical(sort(unique(year_levels)), as.character(2018:2022)))
stopifnot(sum(vapply(year_result$coefficients, function(item) isTRUE(item$isReference), logical(1))) == 1)
year_reference <- Filter(function(item) isTRUE(item$isReference), year_result$coefficients)[[1]]$level
expected_year_reference <- names(which.max(table(as.character(rows$diagnosisYear))))
stopifnot(identical(year_reference, expected_year_reference))

small <- fit_cox_model(list(rows = rows[1:4, ], covariates = c("age")))
stopifnot(identical(small$status, "INSUFFICIENT_DATA"))

unsupported <- fit_cox_model(list(rows = rows, covariates = c("therapy")))
stopifnot(identical(unsupported$status, "ERROR"))

# The compact column JSON transport must preserve nulls, factors and every estimate.
rows$age[c(2, 15)] <- NA_real_
rows$gender[c(3, 17)] <- NA_character_
columns <- jsonlite::fromJSON(jsonlite::toJSON(as.list(rows), auto_unbox = FALSE, na = "null", digits = NA))
row_result <- fit_cox_model(list(rows = rows, covariates = c("age", "gender")))
column_result <- fit_cox_model(list(rows = columns, covariates = c("age", "gender")))
stopifnot(isTRUE(all.equal(row_result, column_result, tolerance = 1e-6)))

source("cox_request.R")
worker_result <- fit_cox_request(list(rows = rows, covariates = c("age", "gender")))
stopifnot(isTRUE(all.equal(worker_result, row_result)))
started <- proc.time()[["elapsed"]]
timed_out <- fit_cox_request(
  list(deadlineUnixMs = as.numeric(Sys.time()) * 1000 + 100),
  fit = function(input) { Sys.sleep(10); list(status = "OK") }
)
stopifnot(identical(timed_out$status, "TIMEOUT"))
stopifnot(proc.time()[["elapsed"]] - started < 2)
expired <- fit_cox_request(list(deadlineUnixMs = 1), fit = function(input) stop("Must not run"))
stopifnot(identical(expired$status, "TIMEOUT"))

message("Cox model, column transport and worker timeout tests passed")
