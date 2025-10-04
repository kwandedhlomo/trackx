export function getFriendlyErrorMessage(error, fallback = "Something went wrong. Please try again.") {
  if (!error) return fallback;
  if (typeof error === "string") return error;

  const networkErrorMessage = "We couldn't reach the server. Please check your connection and try again.";

  const extractFromData = (data) => {
    if (!data) return null;
    if (typeof data === "string") return data;
    if (Array.isArray(data)) return data.join("\n");
    if (typeof data === "object") {
      if (data.detail) return extractFromData(data.detail);
      if (data.message) return extractFromData(data.message);
      if (data.error) return extractFromData(data.error);
      if (data.errors && Array.isArray(data.errors)) return data.errors.join("\n");
      const firstValue = Object.values(data)[0];
      if (typeof firstValue === "string") return firstValue;
      if (Array.isArray(firstValue)) return firstValue.join("\n");
    }
    return null;
  };

  if (error.response?.data) {
    const extracted = extractFromData(error.response.data);
    if (extracted) return extracted;
    if (error.response.status >= 500) {
      return "The server encountered an issue processing your request. Please try again later.";
    }
  }

  if (error.message) {
    if (error.message === "Network Error") return networkErrorMessage;
    return error.message;
  }

  return fallback;
}
