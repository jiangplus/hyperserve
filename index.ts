import { parseArgs } from "util";

process.title = 'hyperserve';

const { values: state, positionals } = parseArgs({
  args: Bun.argv,
  options: {
    port: {
      type: 'string',
      default: '3000',
      description: 'Port to listen on',
    },
    baseDir: {
      type: 'string',
      default: '.',
      description: 'Base directory to serve files from',
    },
    showDir: {
      type: 'boolean',
      default: false,
      description: 'Show directory listing',
    },
    autoIndex: {
      type: 'boolean',
      default: true,
      description: 'Enable directory listing',
    },
    cors: {
      type: 'boolean',
      default: false,
      description: 'Enable CORS',
    },
    tls: {
      type: 'boolean',
      default: false,
      description: 'Enable TLS',
    },
    tlsCert: {
      type: 'string',
      default: '',
      description: 'TLS certificate file',
    },
    tlsKey: {
      type: 'string',
      default: '',
      description: 'TLS key file',
    },
    noDotfiles: {
      type: 'boolean',
      default: false,
      description: 'Do not serve dotfiles',
    },
    proxy: {
      type: 'string',
      default: '',
      description: 'Fallback proxy to the given URL',
    },
    username: {
      type: 'string',
      default: '',
      description: 'Username for basic auth',
    },
    password: {
      type: 'string',
      default: '',
      description: 'Password for basic auth',
    },
    logpath: {
      type: 'string',
      description: 'Log file path',
    },
    userAgent: {
      type: 'string',
      default: '',
      description: 'User agent to use for requests',
    },
    help: {
      type: 'boolean',
      default: false,
      description: 'Show help',
    },
    version: {
      type: 'boolean',
      default: false,
      description: 'Show version',
    },
  },
  strict: true,
  allowPositionals: true,
});

console.log(state);

if (state.help) {
    const help = `
    Usage: hyperserve [options]
    Options:
    --port <port>
    --baseDir <dir>
    --showDir
    --autoIndex
    --cors
    --tls
    --tlsCert <file>
    --tlsKey <file>
    --noDotfiles
    --proxy <url>
    --username <username>
    --password <password>
    --userAgent <userAgent>
    --logpath <file>
    --help
    --version
    `;
  console.log(help);
  process.exit(0);
}

if (state.version) {
  console.log("0.1.0");
  process.exit(0);
}

const server = Bun.serve({
    port: state.port,
    fetch(request) {
      return new Response("Welcome to Bun!");
    },
  });

console.log(`Listening on localhost:${server.port}`);
