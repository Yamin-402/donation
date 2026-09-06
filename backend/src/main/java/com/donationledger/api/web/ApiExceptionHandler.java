package com.donationledger.api.web;

import com.donationledger.api.service.LedgerService.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {
  @ExceptionHandler(ApiException.class)
  ResponseEntity<Map<String, String>> handleApi(ApiException error) {
    return ResponseEntity.status(error.status()).body(Map.of("error", error.getMessage()));
  }

  @ExceptionHandler(DataIntegrityViolationException.class)
  ResponseEntity<Map<String, String>> handleConstraint() {
    return ResponseEntity.badRequest().body(Map.of("error", "That value is already in use."));
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<Map<String, String>> handleUnexpected(Exception error, HttpServletRequest request) {
    if (request.getRequestURI().startsWith("/api/")) {
      return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of("error", "A server error occurred."));
    }
    throw new RuntimeException(error);
  }
}
