#!/usr/bin/env node
import {fileURLToPath} from 'node:url';
import {register} from 'tsx/esm/api';

// Pin our tsconfig: as $EDITOR this runs from another project's cwd.
register({tsconfig: fileURLToPath(new URL('../tsconfig.json', import.meta.url))});
await import('../src/cli.tsx');
