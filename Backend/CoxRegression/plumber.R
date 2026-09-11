source("/app/cox_model.R")
source("/app/cox_request.R")

#* Service health
#* @get /health
#* @serializer unboxedJSON
function() {
  list(status = "ok", package = "survival", version = as.character(utils::packageVersion("survival")))
}

#* Fit a whitelisted Cox proportional-hazards model
#* @post /fit
#* @serializer unboxedJSON
function(req, res) {
  input <- tryCatch(
    jsonlite::fromJSON(req$postBody, simplifyDataFrame = TRUE),
    error = identity
  )
  if (inherits(input, "error")) {
    res$status <- 400
    return(empty_model_result("ERROR", paste("Invalid JSON request:", conditionMessage(input))))
  }

  tryCatch(
    {
      result <- fit_cox_request(input)
      if (identical(result$status, "TIMEOUT")) {
        res$status <- 408
        return(empty_model_result("ERROR", "Cox regression timed out. Please narrow the cohort or try again later."))
      }
      result
    },
    error = function(condition) {
      res$status <- 422
      empty_model_result("ERROR", paste("Unexpected Cox service error:", conditionMessage(condition)))
    }
  )
}
