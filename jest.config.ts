import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  dir: './',
});

const config: Config = {
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

// sanitize-html resolves htmlparser2 v12, which is ESM only — no CJS build at
// all — so Jest cannot load it while node_modules is excluded from
// transformation. That makes sanitizeBlogHtml.ts untestable by default, and
// that file is the last thing standing between stored HTML and
// dangerouslySetInnerHTML on a public page, so it has to be testable.
//
// transformIgnorePatterns is an OR: a file is skipped if it matches ANY
// pattern, so appending an exception cannot override next/jest's own
// node_modules rule. The list has to be REPLACED after next/jest has built it,
// which is why this exports a function rather than the config object.
// sanitize-html plus its whole nested tree. Listed exhaustively rather than
// matched by prefix because the ESM-only packages sit under
// sanitize-html/node_modules/, which a single "allow sanitize-html" rule does
// not cover — the pattern is re-tested at each node_modules segment in a path.
const TRANSFORM_ALLOWLIST = [
  'sanitize-html',
  'htmlparser2',
  'domhandler',
  'domutils',
  'domelementtype',
  'dom-serializer',
  'entities',
  'parse-srcset',
  'is-plain-object',
  'deepmerge',
  'escape-string-regexp',
  'launder',
  // Kept from next/jest's defaults — ships untranspiled for the same reason.
  'geist',
];

export default async () => {
  const base = await createJestConfig(config)();

  return {
    ...base,
    transformIgnorePatterns: [
      // Windows and POSIX separators both, because next/jest rewrites its own
      // patterns for the host platform and this one has to survive either.
      `[\\\\/]node_modules[\\\\/](?!(${TRANSFORM_ALLOWLIST.join('|')})[\\\\/])`,
      '^.+\\.module\\.(css|sass|scss)$',
    ],
  };
};
