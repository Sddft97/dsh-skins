/**
 * One-click install of the delegated Wallpaper Engine plugin (issue #39).
 *
 * The install faces are shared with the delegated-skin rows and live in
 * plugin-install-faces.ts; this module keeps the wallpaper card's own names so
 * the pointer beside it, its test and any importer of the old path keep
 * working. Nothing here has its own behaviour.
 * @module @linxin666/dsh-client-ui-skin-center/external-wallpaper-install
 */

export {
  bridgeInstallFaces as bridgeWallpaperInstallFaces,
  getInstallFaces as getWallpaperInstallFaces,
  installPluginSpec,
  isInstallSpecValid,
  subscribeInstallFaces as subscribeWallpaperInstallFaces,
} from './plugin-install-faces.ts'

export type {
  FamilyPluginManagerService,
  InstallFaces as WallpaperInstallFaces,
  InstallOutcome,
  NativePluginManagerService,
  NativeRemoteResult,
  PluginNavigationService,
} from './plugin-install-faces.ts'
