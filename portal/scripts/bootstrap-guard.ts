export function canBootstrap(existingSuperAdmins: number, force: boolean) {
  return existingSuperAdmins === 0 || force;
}
