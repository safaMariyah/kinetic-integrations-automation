// Compatibility command: shared reader, selected environment and explicit target validation.
console.log('This readiness command now delegates to tools/cli.cjs quickship-readiness. It verifies company scope only.');
process.argv.splice(2, 0, 'quickship-readiness');
require('../tools/cli.cjs');
