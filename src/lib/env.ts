export type Env = {
  DRUPAL_BASE_URL: string;
  DRUPAL_API_BASE: string;
};

export function requireEnv(obj: any): Env {
  const DRUPAL_BASE_URL = obj?.DRUPAL_BASE_URL;
  const DRUPAL_API_BASE = obj?.DRUPAL_API_BASE;

  if (!DRUPAL_BASE_URL || !DRUPAL_API_BASE) {
    throw new Error(
      `Missing env. DRUPAL_BASE_URL=${String(DRUPAL_BASE_URL)} DRUPAL_API_BASE=${String(DRUPAL_API_BASE)}`
    );
  }
  return { DRUPAL_BASE_URL, DRUPAL_API_BASE };
}
