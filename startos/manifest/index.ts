import { setupManifest } from '@start9labs/start-sdk'
import { long, nodeDescription, short } from './i18n'

export const manifest = setupManifest({
  id: 'shulcrum',
  title: 'Shulcrum',
  license: 'GPL-3.0-only',
  packageRepo: 'https://github.com/TwentyOneLife/shulcrum-startos',
  upstreamRepo: 'https://github.com/TwentyOneLife/Shulcrum',
  marketingUrl: 'https://github.com/TwentyOneLife/Shulcrum',
  donationUrl: null,
  description: { short, long },
  volumes: ['main'],
  images: {
    shulcrum: {
      source: {
        dockerBuild: {
          dockerfile: 'Dockerfile',
          workdir: '.',
        },
      },
      arch: ['x86_64', 'aarch64'],
    },
  },
  /**
   * One node, required, not a picklist.
   *
   * The template this package is modelled on offers several bitcoind flavors and picks one at
   * runtime. That generality is wrong here: `extended_headers` fixes the on-disk header record
   * size at 164 bytes and cannot be changed on an existing database, so a package that could be
   * repointed at an 80-byte chain would be a package that can invalidate its own index through a
   * setting. Declining the choice is what makes that setting safe rather than merely documented.
   *
   * A BLAKE2b build sideloaded over the official `bitcoind` id is a real configuration and is
   * deliberately not supported yet: supporting it means reintroducing the picklist, which should
   * follow demand rather than precede it.
   */
  dependencies: {
    'knots-blake2b': {
      description: nodeDescription,
      optional: false,
      metadata: {
        title: 'Bitcoin Knots (BLAKE2b) Companion',
        icon: 'https://raw.githubusercontent.com/paulscode/knots-blake2b-startos/main/dep-icon.png',
      },
    },
  },
})
