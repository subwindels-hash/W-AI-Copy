/**
 * Branded ID types. All model primary keys use these so you can't
 * accidentally pass a UserId to an OrganizationId parameter.
 */
export type Brand<T, B> = T & { readonly __brand: B };

export type UserId = Brand<string, "UserId">;
export type OrganizationId = Brand<string, "OrganizationId">;
export type WorkspaceId = Brand<string, "WorkspaceId">;
export type MembershipId = Brand<string, "MembershipId">;
export type InvitationId = Brand<string, "InvitationId">;

export const id = <B>(s: string): Brand<string, B> => s as Brand<string, B>;
