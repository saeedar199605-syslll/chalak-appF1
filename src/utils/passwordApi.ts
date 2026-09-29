/** Delete obsolete credentials without ever reading their values. */
export function clearLegacyPasswordPersistence(): void {
  for (const storage of ['localStorage', 'sessionStorage'] as const) {
    try {
      window[storage].removeItem('pe_admin_password');
    } catch {
      // Storage may be unavailable or blocked; still try the other store.
    }
  }
}

export async function callPasswordApi(url: string, options: RequestInit): Promise<any> {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error('Network error');
  }

  if (!response.ok) {
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new Error('HTTP error');
    }
    if (
      data &&
      typeof data === 'object' &&
      !Array.isArray(data) &&
      'success' in data && data.success === false &&
      'error' in data && typeof data.error === 'string' &&
      data.error.trim().length > 0 &&
      data.error.length < 200 &&
      !/[<>\r\n]|\b(?:stack|trace|token|secret|authorization|bearer|api[ _-]?key)\b|\bpassword\s*[:=]/i.test(data.error)
    ) {
      throw new Error(data.error);
    }
    throw new Error('HTTP error');
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new Error('Invalid response');
  }

  // Handle empty body (empty string or undefined from response.json())
  if (data === undefined || data === '') {
    throw new Error('Invalid response');
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('Invalid response');
  }

  if (data.success !== true) {
    // Use safe server-provided error message if available and valid
    if (
      typeof data.error === 'string' &&
      data.error.trim().length > 0 &&
      data.error.length < 200 &&
      !/[<>\r\n]|\b(?:stack|trace|token|secret|authorization|bearer|api[ _-]?key)\b|\bpassword\s*[:=]/i.test(data.error)
    ) {
      throw new Error(data.error);
    }
    throw new Error('Operation failed');
  }

  return data;
}
