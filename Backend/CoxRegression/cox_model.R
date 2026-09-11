suppressPackageStartupMessages(library(survival))

cox_specs <- list(
  age = list(
    model = "ageGroup",
    type = "factor",
    levels = c("<40", "40-49", "50-59", "60-69", "70-79", "80+")
  ),
  gender = list(model = "gender", type = "factor", levels = c("female", "male", "diverse", "other")),
  uicc = list(model = "uicc", type = "factor", levels = c("I", "II", "III", "IV", "other")),
  tStage = list(model = "tStage", type = "factor", levels = c(paste0("T", 1:4), "other")),
  nStage = list(model = "nStage", type = "factor", levels = c(paste0("N", 0:3), "other")),
  mStage = list(model = "mStage", type = "factor", levels = c("M0", "M1", "other")),
  grading = list(
    model = "grading",
    type = "factor",
    levels = c("G1", "G2", "G3", "G4", "lowGrade", "intermediateGrade", "highGrade")
  ),
  ecog = list(model = "ecog", type = "factor", levels = c("0", "1", "2", "3-4")),
  diagnosisYear = list(model = "diagnosisYear", type = "factor", levels = character()),
  synchronousMetastasis = list(
    model = "synchronousMetastasis",
    type = "factor",
    levels = c("absent", "present")
  )
)

finite_or_null <- function(value) {
  value <- suppressWarnings(as.numeric(value)[1])
  if (length(value) == 0 || is.na(value) || !is.finite(value)) return(NULL)
  value
}

empty_model_result <- function(status, message, warnings = character()) {
  list(
    status = status,
    message = message,
    completeCases = 0L,
    events = 0L,
    censored = 0L,
    omittedCases = 0L,
    degreesOfFreedom = 0L,
    concordance = NULL,
    likelihoodRatioPValue = NULL,
    modelFormula = NULL,
    stratifiedByEntity = FALSE,
    coefficients = list(),
    phDiagnostics = list(),
    warnings = as.list(unique(warnings))
  )
}

ordered_factor <- function(values, preferred_levels) {
  values <- as.character(values)
  values[values == ""] <- NA_character_
  present <- unique(values[!is.na(values)])
  levels <- c(intersect(preferred_levels, present), sort(setdiff(present, preferred_levels)))
  factor(values, levels = levels)
}

age_group_factor <- function(values) {
  ages <- suppressWarnings(as.numeric(values))
  ages[!is.finite(ages) | ages < 0 | ages > 120] <- NA_real_
  preferred_levels <- c("<40", "40-49", "50-59", "60-69", "70-79", "80+")
  grouped <- cut(
    ages,
    breaks = c(-Inf, 40, 50, 60, 70, 80, Inf),
    right = FALSE,
    labels = preferred_levels
  )
  observed <- as.character(grouped)
  counts <- table(factor(observed, levels = preferred_levels))
  reference <- names(counts)[which.max(counts)]
  present <- preferred_levels[counts > 0]
  factor(observed, levels = c(reference, setdiff(present, reference)))
}

diagnosis_year_factor <- function(values) {
  years <- suppressWarnings(as.integer(values))
  years[!is.finite(years) | years < 1900 | years > 2100] <- NA_integer_
  observed <- as.character(years)
  present <- sort(unique(years[!is.na(years)]))
  if (length(present) == 0) return(factor(observed))
  counts <- table(factor(observed, levels = as.character(present)))
  reference <- names(counts)[which.max(counts)]
  factor(observed, levels = c(reference, setdiff(as.character(present), reference)))
}

prepare_model_data <- function(rows, covariates) {
  data <- as.data.frame(rows, stringsAsFactors = FALSE)
  required <- c("time", "event", covariates)
  missing_columns <- setdiff(required, names(data))
  if (length(missing_columns) > 0) {
    stop(sprintf("Missing Cox input column(s): %s", paste(missing_columns, collapse = ", ")))
  }

  data$time <- suppressWarnings(as.numeric(data$time))
  data$event <- suppressWarnings(as.integer(data$event))
  for (covariate in covariates) {
    spec <- cox_specs[[covariate]]
    if (covariate == "age") {
      data[[spec$model]] <- age_group_factor(data[[covariate]])
    } else if (covariate == "diagnosisYear") {
      data[[spec$model]] <- diagnosis_year_factor(data[[covariate]])
    } else {
      data[[spec$model]] <- ordered_factor(data[[covariate]], spec$levels)
    }
  }
  data
}

model_columns <- function(covariates) {
  vapply(covariates, function(covariate) cox_specs[[covariate]]$model, character(1))
}

usable_covariates <- function(data, covariates) {
  covariates[vapply(covariates, function(covariate) {
    values <- data[[cox_specs[[covariate]]$model]]
    length(unique(values[!is.na(values)])) >= 2
  }, logical(1))]
}

complete_model_data <- function(data, covariates) {
  columns <- c("time", "event", model_columns(covariates))
  result <- data[stats::complete.cases(data[, columns, drop = FALSE]), , drop = FALSE]
  result <- result[is.finite(result$time) & result$time > 0 & result$event %in% c(0L, 1L), , drop = FALSE]
  droplevels(result)
}

degrees_of_freedom <- function(data, covariates) {
  sum(vapply(covariates, function(covariate) {
    spec <- cox_specs[[covariate]]
    if (spec$type == "continuous") return(1L)
    max(0L, nlevels(data[[spec$model]]) - 1L)
  }, integer(1)))
}

public_covariate_for_model_term <- function(term, covariates) {
  for (covariate in covariates) {
    if (startsWith(term, cox_specs[[covariate]]$model)) return(covariate)
  }
  term
}

coefficient_value <- function(matrix, row_name, preferred_columns) {
  if (is.null(matrix) || !(row_name %in% rownames(matrix))) return(NULL)
  column <- preferred_columns[preferred_columns %in% colnames(matrix)][1]
  if (length(column) == 0 || is.na(column)) return(NULL)
  finite_or_null(matrix[row_name, column])
}

build_coefficients <- function(fit_summary, model_data, covariates) {
  coefficient_matrix <- fit_summary$coefficients
  confidence_matrix <- fit_summary$conf.int
  coefficient_names <- rownames(coefficient_matrix)
  results <- list()

  for (covariate in covariates) {
    spec <- cox_specs[[covariate]]
    if (spec$type == "continuous") {
      term <- spec$model
      results[[length(results) + 1L]] <- list(
        covariate = covariate,
        term = term,
        level = NULL,
        reference = NULL,
        isReference = FALSE,
        hazardRatio = coefficient_value(coefficient_matrix, term, c("exp(coef)")),
        confidenceLow = coefficient_value(confidence_matrix, term, c("lower .95")),
        confidenceHigh = coefficient_value(confidence_matrix, term, c("upper .95")),
        standardError = coefficient_value(coefficient_matrix, term, c("robust se", "se(coef)")),
        pValue = coefficient_value(coefficient_matrix, term, c("Pr(>|z|)"))
      )
      next
    }

    levels <- levels(model_data[[spec$model]])
    if (length(levels) == 0) next
    reference <- levels[1]
    results[[length(results) + 1L]] <- list(
      covariate = covariate,
      term = paste0(spec$model, ":reference"),
      level = reference,
      reference = reference,
      isReference = TRUE,
      hazardRatio = 1,
      confidenceLow = NULL,
      confidenceHigh = NULL,
      standardError = NULL,
      pValue = NULL
    )

    terms <- coefficient_names[startsWith(coefficient_names, spec$model)]
    for (term in terms) {
      level <- substring(term, nchar(spec$model) + 1L)
      results[[length(results) + 1L]] <- list(
        covariate = covariate,
        term = term,
        level = level,
        reference = reference,
        isReference = FALSE,
        hazardRatio = coefficient_value(coefficient_matrix, term, c("exp(coef)")),
        confidenceLow = coefficient_value(confidence_matrix, term, c("lower .95")),
        confidenceHigh = coefficient_value(confidence_matrix, term, c("upper .95")),
        standardError = coefficient_value(coefficient_matrix, term, c("robust se", "se(coef)")),
        pValue = coefficient_value(coefficient_matrix, term, c("Pr(>|z|)"))
      )
    }
  }
  results
}

build_ph_diagnostics <- function(fit, covariates) {
  result <- tryCatch(survival::cox.zph(fit, terms = TRUE, global = TRUE), error = identity)
  if (inherits(result, "error")) {
    return(list(rows = list(), warning = paste("PH diagnostics failed:", conditionMessage(result))))
  }
  table <- result$table
  rows <- lapply(seq_len(nrow(table)), function(index) {
    term <- rownames(table)[index]
    is_global <- identical(term, "GLOBAL")
    list(
      term = if (is_global) "GLOBAL" else public_covariate_for_model_term(term, covariates),
      chiSquare = finite_or_null(table[index, "chisq"]),
      degreesOfFreedom = finite_or_null(table[index, "df"]),
      pValue = finite_or_null(table[index, "p"]),
      global = is_global
    )
  })
  violated <- vapply(rows, function(row) !is.null(row$pValue) && row$pValue < 0.05, logical(1))
  warning <- if (any(violated)) {
    "The proportional-hazards test is significant for at least one term; a constant hazard ratio may be inappropriate."
  } else {
    NULL
  }
  list(rows = rows, warning = warning)
}

fit_cox_model <- function(input) {
  covariates <- unique(as.character(unlist(input$covariates, use.names = FALSE)))
  unsupported <- setdiff(covariates, names(cox_specs))
  if (length(covariates) == 0) {
    return(empty_model_result("ERROR", "At least one Cox covariate is required."))
  }
  if (length(unsupported) > 0) {
    return(empty_model_result(
      "ERROR",
      sprintf("Unsupported Cox covariate(s): %s", paste(unsupported, collapse = ", "))
    ))
  }
  if (is.null(input$rows) || length(input$rows) == 0) {
    return(empty_model_result("INSUFFICIENT_DATA", "The filtered cohort is empty."))
  }

  warnings <- character()
  data <- tryCatch(prepare_model_data(input$rows, covariates), error = identity)
  if (inherits(data, "error")) return(empty_model_result("ERROR", conditionMessage(data)))
  source_row_count <- nrow(data)

  usable <- usable_covariates(data, covariates)
  dropped <- setdiff(covariates, usable)
  if (length(dropped) > 0) {
    warnings <- c(
      warnings,
      sprintf("Dropped covariate(s) with fewer than two observed values: %s.", paste(dropped, collapse = ", "))
    )
  }
  if (length(usable) == 0) {
    result <- empty_model_result(
      "INSUFFICIENT_DATA",
      "No selected covariate has enough variation for a Cox model.",
      warnings
    )
    result$omittedCases <- as.integer(source_row_count)
    return(result)
  }

  repeat {
    model_data <- complete_model_data(data, usable)
    still_usable <- usable_covariates(model_data, usable)
    newly_dropped <- setdiff(usable, still_usable)
    if (length(newly_dropped) == 0) break
    warnings <- c(
      warnings,
      sprintf(
        "Dropped covariate(s) without variation in the complete-case cohort: %s.",
        paste(newly_dropped, collapse = ", ")
      )
    )
    usable <- still_usable
    if (length(usable) == 0) break
  }

  if (length(usable) == 0) {
    result <- empty_model_result(
      "INSUFFICIENT_DATA",
      "No selected covariate varies in the complete-case cohort.",
      warnings
    )
    result$omittedCases <- as.integer(source_row_count)
    return(result)
  }

  event_count <- sum(model_data$event == 1L)
  censored_count <- sum(model_data$event == 0L)
  df <- degrees_of_freedom(model_data, usable)
  if (nrow(model_data) < 10 || event_count < 5 || censored_count == 0 || event_count <= df) {
    result <- empty_model_result(
      "INSUFFICIENT_DATA",
      sprintf(
        "The complete-case cohort is too small for a stable model (%d patients, %d events, %d degrees of freedom).",
        nrow(model_data), event_count, df
      ),
      warnings
    )
    result$completeCases <- as.integer(nrow(model_data))
    result$events <- as.integer(event_count)
    result$censored <- as.integer(censored_count)
    result$omittedCases <- as.integer(source_row_count - nrow(model_data))
    result$degreesOfFreedom <- as.integer(df)
    return(result)
  }
  if (event_count / df < 10) {
    warnings <- c(
      warnings,
      sprintf("Only %.1f events are available per model degree of freedom; estimates may be unstable.", event_count / df)
    )
  }

  terms <- model_columns(usable)
  formula_text <- sprintf("Surv(time, event) ~ %s", paste(terms, collapse = " + "))
  formula <- stats::as.formula(formula_text)
  captured_warnings <- character()
  fit <- tryCatch(
    withCallingHandlers(
      survival::coxph(
        formula,
        data = model_data,
        ties = "efron",
        x = TRUE,
        y = TRUE,
        singular.ok = TRUE
      ),
      warning = function(condition) {
        captured_warnings <<- c(captured_warnings, conditionMessage(condition))
        invokeRestart("muffleWarning")
      }
    ),
    error = identity
  )
  if (inherits(fit, "error")) {
    result <- empty_model_result(
      "ERROR",
      paste("Cox model fitting failed:", conditionMessage(fit)),
      c(warnings, captured_warnings)
    )
    result$completeCases <- as.integer(nrow(model_data))
    result$events <- as.integer(event_count)
    result$censored <- as.integer(censored_count)
    result$omittedCases <- as.integer(source_row_count - nrow(model_data))
    result$degreesOfFreedom <- as.integer(df)
    return(result)
  }

  fit_summary <- summary(fit, conf.int = 0.95)
  if (any(is.na(stats::coef(fit)))) {
    warnings <- c(warnings, "At least one coefficient is not estimable because the model matrix is singular.")
  }
  ph <- build_ph_diagnostics(fit, usable)
  if (!is.null(ph$warning)) warnings <- c(warnings, ph$warning)
  warnings <- unique(c(warnings, captured_warnings))

  list(
    status = if (length(warnings) > 0) "WARNING" else "OK",
    message = NULL,
    completeCases = as.integer(nrow(model_data)),
    events = as.integer(event_count),
    censored = as.integer(censored_count),
    omittedCases = as.integer(source_row_count - nrow(model_data)),
    degreesOfFreedom = as.integer(df),
    concordance = finite_or_null(fit_summary$concordance[1]),
    likelihoodRatioPValue = finite_or_null(fit_summary$logtest[3]),
    modelFormula = formula_text,
    stratifiedByEntity = FALSE,
    coefficients = build_coefficients(fit_summary, model_data, usable),
    phDiagnostics = ph$rows,
    warnings = as.list(warnings)
  )
}
