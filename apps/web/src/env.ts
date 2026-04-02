/**
 * True when running inside the Electron preload bridge, false in a regular browser.
 * The preload script sets window.nativeApi via contextBridge before any web-app
 * code executes, so this is reliable at module load time.
 */
export const isElectron =
  typeof window !== "undefined" &&
  (window.desktopBridge !== undefined || window.nativeApi !== undefined);

export const normalizeBasePath = (value: string | undefined): string => {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0 || trimmed === "/") {
    return "";
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, "");
  return withoutTrailingSlash === "/" ? "" : withoutTrailingSlash;
};

export const appBasePath = normalizeBasePath(import.meta.env.VITE_BASE_PATH);

export const withBasePath = (pathname: string): string => {
  const normalizedPathname = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (appBasePath.length === 0) {
    return normalizedPathname;
  }
  if (normalizedPathname === "/") {
    return `${appBasePath}/`;
  }
  return `${appBasePath}${normalizedPathname}`;
};
