export type ProjectAccessRole = 'owner' | 'member' | 'global_admin';

export interface ProjectCapabilities {
  canRead: boolean;
  canManageProject: boolean;
  canManageMembers: boolean;
  canWriteTasks: boolean;
}

// UI hints only. Database policies and RPCs remain the authorization authority.
export function projectCapabilities(role: ProjectAccessRole | null): ProjectCapabilities {
  switch (role) {
    case 'global_admin':
      return {
        canRead: true,
        canManageProject: true,
        canManageMembers: true,
        canWriteTasks: false,
      };
    case 'owner':
      return {
        canRead: true,
        canManageProject: true,
        canManageMembers: true,
        canWriteTasks: true,
      };
    case 'member':
      return {
        canRead: true,
        canManageProject: false,
        canManageMembers: false,
        canWriteTasks: true,
      };
    default:
      return {
        canRead: false,
        canManageProject: false,
        canManageMembers: false,
        canWriteTasks: false,
      };
  }
}
