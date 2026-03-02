/**
 * Human-readable labels for field_status machine names.
 * Add/update entries here as new values are defined in Drupal.
 */
export const STATUS_LABELS: Record<string, string> = {
  available: 'original available',
  sold: 'original sold',
  print_available: 'print available',
  commission_open: 'commission open', 
};

export function resolveStatusLabel(key: string): string {
  return STATUS_LABELS[key] ?? key.replace(/_/g, ' ');
}
