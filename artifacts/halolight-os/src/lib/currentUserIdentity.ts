type ApiUserIdentity = {
  authId?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
};

type AuthUserIdentity = {
  id?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  username?: string | null;
};

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  const value = clean(email).toLowerCase();
  return !value || value.endsWith("@placeholder.com");
}

export function isPlaceholderDisplayName(
  fullName: string | null | undefined,
): boolean {
  const value = clean(fullName).toLowerCase();
  return !value || value === "user" || value === "user member";
}

function fullNameFromParts(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  return [clean(firstName), clean(lastName)].filter(Boolean).join(" ").trim();
}

function authEmail(authUser: AuthUserIdentity | null | undefined): string {
  return (
    clean(authUser?.email)
  );
}

function emailName(email: string): string {
  const localPart = email.split("@")[0] ?? "";
  return localPart
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function resolveCurrentUserIdentity(
  apiUser: ApiUserIdentity | null | undefined,
  authUser: AuthUserIdentity | null | undefined,
) {
  if (!apiUser?.authId || !authUser?.id || apiUser.authId !== authUser.id) {
    apiUser = null;
  }
  const apiFullName = clean(apiUser?.fullName);
  const apiPartsName = fullNameFromParts(apiUser?.firstName, apiUser?.lastName);
  const authFullName =
    clean(authUser?.fullName) ||
    fullNameFromParts(authUser?.firstName, authUser?.lastName) ||
    clean(authUser?.username);
  const email = !isPlaceholderEmail(apiUser?.email)
    ? clean(apiUser?.email)
    : authEmail(authUser);

  const displayName = !isPlaceholderDisplayName(apiFullName)
    ? apiFullName
    : !isPlaceholderDisplayName(apiPartsName)
      ? apiPartsName
      : !isPlaceholderDisplayName(authFullName)
        ? authFullName
        : emailName(email) || "User";

  const initialsSource = displayName !== "User" ? displayName : email;
  const initials =
    initialsSource
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U";

  return {
    displayName,
    email,
    initials,
  };
}
