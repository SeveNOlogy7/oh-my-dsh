/**
 * Host half of the Oh-My-DSH browser asset.
 *
 * It renders nothing and registers nothing. Its whole purpose is to be a row
 * the Loader mounts directly, because the client-modules scan only composes
 * browser bundles for Loader entries it can resolve by package specifier. The
 * runtime row inside an agent preset is instantiated by the preset plugin, so
 * its package never appears in that scan; this row does.
 *
 * The 0.1.0 runtime shipped the rendering in the bundle root `dsh.client`
 * declaration, which never reached the browser: the live
 * `conversation.chat.commandview` slot reported no occupants after a restart.
 * Keeping the asset in its own package, with its own name, also avoids the
 * "package resolves from multiple active Loader sources" rejection that two
 * rows naming one package would trigger.
 */
export function apply() {}
