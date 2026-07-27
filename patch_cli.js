const fs = require('fs');

let content = fs.readFileSync('src/cli/index.ts', 'utf8');

// Imports
content = content.replace(
  'import { runMap } from "./map.js";',
  'import { runMap } from "./map.js";\nimport { runProvenance } from "./provenance.js";\nimport { runAudit } from "./audit.js";'
);

// Switch
content = content.replace(
  '      case "clean":\n        return await runClean(commandArgs, io);',
  '      case "clean":\n        return await runClean(commandArgs, io);\n      case "provenance":\n        return await runProvenance(commandArgs, io);\n      case "audit":\n        return await runAudit(commandArgs, io);'
);

// Help
content = content.replace(
  '  cw clean                             Clean temporary files and rejected runs',
  '  cw clean                             Clean temporary files and rejected runs\n  cw provenance                        Manage AI provenance records\n  cw audit                             Manage cryptographic audit log'
);

fs.writeFileSync('src/cli/index.ts', content);
