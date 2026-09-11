# A separate fork allows the HTTP worker to terminate even a long-running native
# coxph/cox.zph call. setTimeLimit alone cannot reliably interrupt compiled code.
fit_cox_request <- function(input, fit = fit_cox_model) {
  now_ms <- function() as.numeric(Sys.time()) * 1000
  deadline <- suppressWarnings(as.numeric(input$deadlineUnixMs)[1])
  if (length(deadline) == 0 || !is.finite(deadline)) deadline <- now_ms() + 60000
  deadline <- min(deadline, now_ms() + 60000)
  timeout <- function() list(status = "TIMEOUT")
  if (now_ms() >= deadline) return(timeout())

  job <- parallel::mcparallel(fit(input), silent = TRUE)
  finished <- FALSE
  on.exit({
    if (!finished) {
      tools::pskill(job$pid, signal = 9L)
      suppressWarnings(parallel::mccollect(job, wait = TRUE))
    }
  }, add = TRUE)
  repeat {
    if (now_ms() >= deadline) return(timeout())
    result <- parallel::mccollect(job, wait = FALSE)
    if (!is.null(result)) {
      finished <- TRUE
      if (inherits(result[[1]], "try-error") || is.null(result[[1]])) {
        stop("Cox model worker failed.")
      }
      return(result[[1]])
    }
    Sys.sleep(min(0.02, max(0, (deadline - now_ms()) / 1000)))
  }
}
