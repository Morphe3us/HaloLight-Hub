export async function fetchBunnyJson(
  path: string,
  apiKey: string,
  management = false,
): Promise<Record<string, unknown>> {
  const base = management ? "https://api.bunny.net" : "https://video.bunnycdn.com";
  const response = await fetch(`${base}${path}`, {
    headers: { AccessKey: apiKey, accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Bunny API request failed (${response.status})`);
  }
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Bunny API returned an invalid response");
  }
  return data as Record<string, unknown>;
}

export async function getBunnyLibrarySecurity(libraryId: string) {
  const managementKey = process.env.BUNNY_API_KEY?.trim();
  if (!managementKey) return null;
  const library = await fetchBunnyJson(`/videolibrary/${encodeURIComponent(libraryId)}`, managementKey, true);
  // This allowlist deliberately excludes the library API and token signing keys.
  return {
    playerTokenAuthenticationEnabled: library.PlayerTokenAuthenticationEnabled === true,
    blockNoneReferrer: library.BlockNoneReferrer === true,
    allowedReferrers: Array.isArray(library.AllowedReferrers)
      ? library.AllowedReferrers.filter((value): value is string => typeof value === "string")
      : [],
    allowDirectPlay: typeof library.AllowDirectPlay === "boolean" ? library.AllowDirectPlay : null,
  };
}
