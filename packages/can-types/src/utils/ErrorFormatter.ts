/**
 * Extract a detailed error message from various error formats (API errors, Error objects, etc.).
 *
 * For API client errors (ResponseError), `error.response` is the raw fetch `Response` - the same
 * response visible in the browser Network tab. We read its body so the device's own explanation
 * (e.g. "Invalid request, frames do not fit in period") surfaces to the user instead of a generic
 * message. Reading a fetch body is async, hence this function is async.
 */
export async function formatApiError(error: unknown): Promise<string> {
  let errorMsg = 'Unknown error';
  const errorObj = error as any;

  if (error instanceof Error) {
    errorMsg = error.message;

    // Check for HTTP response details (common in API client errors)
    if (errorObj.response) {
      const resp = errorObj.response;
      // Fold the status into the lead-in, replacing the generic client message
      // (e.g. "Response returned an error code") with the concrete HTTP status.
      errorMsg = `Response returned a HTTP ${resp.status || 'unknown'}${resp.statusText ? ` ${resp.statusText}` : ''} error code`;

      // resp is error.response (a fetch Response). Read its body - same content as the Network tab.
      let bodyText = '';
      if (typeof (resp as Response).clone === 'function' && typeof (resp as Response).text === 'function') {
        try {
          bodyText = (await (resp as Response).clone().text()).trim();
        } catch { /* body unreadable / already consumed - ignore */ }
      } else if (resp.data) {
        bodyText = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data, null, 2);
      }
      if (bodyText) errorMsg += `:\n\n${bodyText}`;
    }

    // Check for status code directly on error object
    if (errorObj.status) {
      errorMsg += `\n\nStatus: ${errorObj.status}`;
    }

    // Check for nested cause
    if (errorObj.cause) {
      errorMsg += `\n\nCause: ${String(errorObj.cause)}`;
    }
  } else if (typeof error === 'object' && error !== null) {
    // For non-Error objects, try to extract useful info
    if (errorObj.message) {
      errorMsg = errorObj.message;
    }
    if (errorObj.status || errorObj.statusCode) {
      errorMsg += `\n\nStatus: ${errorObj.status || errorObj.statusCode}`;
    }
    if (errorObj.statusText) {
      errorMsg += `\nStatus Text: ${errorObj.statusText}`;
    }
    // Include full object as JSON
    errorMsg += `\n\nFull error:\n${JSON.stringify(error, null, 2)}`;
  } else {
    errorMsg = String(error);
  }

  return errorMsg;
}
