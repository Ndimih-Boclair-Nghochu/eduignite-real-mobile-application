export function getApiErrorMessage(error: any, fallback = "Something went wrong. Please try again.") {
  if (!error) return fallback;

  if (error.code === "ERR_NETWORK" || !error.response) {
    return "Network error: unable to reach the server. Check your connection and try again.";
  }

  const status = error.response?.status;
  const data = error.response?.data;

  if (typeof data === "string") {
    const trimmed = data.trim();
    if (/invalid credentials/i.test(trimmed)) {
      return "Wrong password or matricule does not exist. Check both fields and try again.";
    }
    return trimmed.length > 280 ? fallback : trimmed || fallback;
  }

  if (data?.detail) {
    const detail = String(data.detail);
    if (/invalid credentials/i.test(detail)) {
      return "Wrong password or matricule does not exist. Check both fields and try again.";
    }
    return detail;
  }
  if (data?.message) return String(data.message);
  if (data?.error) return String(data.error);

  if (data && typeof data === "object") {
    if (Array.isArray(data.matricule) && data.matricule.length) return String(data.matricule[0]);
    if (typeof data.matricule === "string") return data.matricule;
    if (Array.isArray(data.password) && data.password.length) return String(data.password[0]);
    if (typeof data.password === "string") return data.password;

    const messages = Object.entries(data)
      .flatMap(([field, value]) => {
        if (Array.isArray(value)) return value.map((item) => `${field}: ${item}`);
        if (value && typeof value === "object") return `${field}: ${JSON.stringify(value)}`;
        return `${field}: ${value}`;
      })
      .filter(Boolean);

    if (messages.length) return messages.join(" | ");
  }

  if (status === 400) return "The request was rejected. Please check the required fields and try again.";
  if (status === 401) return "Authentication failed: wrong matricule or password.";
  if (status === 403) return "You are not allowed to carry out this operation.";
  if (status === 404) return "The requested record does not exist.";
  if (status >= 500) return "Server error: the backend failed while processing this request.";

  return error.message || fallback;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the selected image file."));
    reader.readAsDataURL(file);
  });
}
