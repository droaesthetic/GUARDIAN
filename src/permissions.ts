import {
  GuildMember,
  PermissionFlagsBits,
  PermissionsBitField,
  Role
} from "discord.js";
import { GuildConfig } from "./types.js";

export function isGuildOwner(member: GuildMember): boolean {
  return member.guild.ownerId === member.id;
}

export function isBotManager(member: GuildMember, config: GuildConfig): boolean {
  return isGuildOwner(member) || config.managers.includes(member.id);
}

export function canManageManagers(member: GuildMember): boolean {
  return isGuildOwner(member);
}

export function isImmune(member: GuildMember, config: GuildConfig): boolean {
  return (
    member.user.bot ||
    isGuildOwner(member) ||
    config.immuneMemberIds.includes(member.id) ||
    member.roles.cache.some((role) => config.immuneRoleIds.includes(role.id))
  );
}

export function canGrantElevatedRoles(member: GuildMember, config: GuildConfig): boolean {
  return (
    isGuildOwner(member) ||
    config.roleGuard.allowedMemberIds.includes(member.id) ||
    member.roles.cache.some((role) => config.roleGuard.allowedRoleIds.includes(role.id))
  );
}

export function roleHasElevatedPermissions(role: Role, config: GuildConfig): boolean {
  const permissions = new PermissionsBitField(role.permissions);
  return config.roleGuard.elevatedPermissionNames.some((permission) => permissions.has(permission));
}

export function botCanModerate(target: GuildMember, actor: GuildMember): boolean {
  return actor.roles.highest.comparePositionTo(target.roles.highest) > 0 && target.moderatable;
}

export const ownerCommandDefaultPermission = PermissionFlagsBits.Administrator;
