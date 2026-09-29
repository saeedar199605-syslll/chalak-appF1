export type CloudState = Record<string, unknown>;

export const CLOUD_SYNC_KEYS = new Set([
  'pe_employees',
  'pe_criteria',
  'pe_profiles',
  'pe_evaluations',
  'pe_notifications',
  'pe_granular_permissions',
  'pe_archived_evaluations',
  'pe_active_period',
  'pe_workshop_targets',
  'pe_lattice_okrs',
  'pe_lattice_one_on_ones',
  'pe_lattice_kudos',
  'pe_lattice_pulse',
  'pe_locked_users',
  'pe_role_permissions',
  'pe_user_custom_permissions',
  'pe_manual_access_policy',
  'pe_reward_config',
  'pe_reward_batch_history',
  'pe_tickets',
  'pe_route_rules',
  'pe_kickidler_live',
  'pe_kickidler_records',
  'pe_kickidler_violations',
  'pe_supervisor_calendar_events',
  'pe_auto_archive_settings',
  'pe_system_logs',
  'pe_audit_logs',
  'pe_route_rules',
  'pe_delegations',
]);

export function isCloudSyncKey(key: string): boolean {
  return CLOUD_SYNC_KEYS.has(key);
}

export function sanitizeCloudState(input: unknown): CloudState {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const output: CloudState = {};
  for (const [key, value] of Object.entries(input)) {
    if (isCloudSyncKey(key)) output[key] = value;
  }
  return output;
}
